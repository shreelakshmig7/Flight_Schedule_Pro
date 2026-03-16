/**
 * poll-job.consumer.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — Poll-jobs queue consumer
 * --------------------------------------------------------------
 * Reads PollJobMessages from the poll-jobs Azure Service Bus queue.
 * For each message:
 *   1. Retrieves the FSP bearer token for the operator from TokenStore.
 *   2. Sets the bearer token on the shared FSP HTTP client.
 *   3. Awaits a token from the TokenBucket before calling FSP.
 *   4. Calls ReservationsService.listReservations() against the FSP API.
 *   5. On success: stores the raw response in RawSnapshotStore, then calls
 *      ChangeDetectionService to detect and publish change events.
 *   6. On 429: pauses the token bucket for 60 s, re-enqueues the job,
 *      and completes the original message.
 *   7. On other errors: logs and completes the message (dead-lettered
 *      by Service Bus after maxDeliveryCount attempts).
 *
 * Key exports: PollJobConsumer
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 * Updated: PR-9 — Change Detection Engine (added ChangeDetectionService integration)
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import type { ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus';
import {
  isPollJobMessage,
  QUEUE_NAMES,
} from '@fsp-scheduler/shared-types';
import type {
  PollJobMessage,
  ServiceResult,
  FspReservationListResponse,
} from '@fsp-scheduler/shared-types';
import { FSP_CORE_CLIENT, ReservationsService } from '@fsp-scheduler/fsp-client';
import type { FspHttpClient } from '@fsp-scheduler/fsp-client';
import { ServiceBusService } from '../service-bus/service-bus.service';
import { PollJobPublisher } from '../service-bus/publishers/poll-job.publisher';
import { TokenBucket } from './token-bucket';
import { RawSnapshotStore } from './raw-snapshot.store';
import { TokenStore } from '../auth/token-store';
import { ChangeDetectionService } from '../change-detection/change-detection.service';
import { randomUUID } from 'crypto';

/** FSP error code for rate-limit responses. */
const FSP_RATE_LIMIT_CODE = '429';

/**
 * Consumes PollJobMessages from the poll-jobs queue and executes FSP
 * reservation list calls within the token bucket budget.
 *
 * After every successful FSP poll, passes the previous and new reservation
 * snapshots to ChangeDetectionService to detect and publish change events.
 */
@Injectable()
export class PollJobConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PollJobConsumer.name);
  private receiver: ServiceBusReceiver | null = null;

  /**
   * @param tokenBucket              - Shared rate-limit token bucket.
   * @param snapshotStore            - In-memory store for raw FSP poll results.
   * @param reservationsService      - FSP client service for reservation queries.
   * @param coreClient               - Raw FSP HTTP client for per-call token injection.
   * @param pollJobPublisher         - Publisher for re-enqueuing 429-failed jobs.
   * @param tokenStore               - Per-operator FSP bearer token store.
   * @param changeDetectionService   - Change detection orchestrator.
   */
  constructor(
    private readonly tokenBucket: TokenBucket,
    private readonly snapshotStore: RawSnapshotStore,
    private readonly reservationsService: ReservationsService,
    @Inject(FSP_CORE_CLIENT) private readonly coreClient: FspHttpClient,
    private readonly pollJobPublisher: PollJobPublisher,
    private readonly tokenStore: TokenStore,
    private readonly changeDetectionService: ChangeDetectionService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Placeholder — actual consumption is started by startConsuming(). */
  onModuleInit(): void {}

  /** Closes the Service Bus receiver on module destroy. */
  async onModuleDestroy(): Promise<void> {
    if (this.receiver) {
      await this.receiver.close();
      this.receiver = null;
    }
  }

  /**
   * Attaches the Service Bus receiver and begins streaming messages.
   *
   * @param serviceBusService - The shared Service Bus client wrapper.
   */
  startConsuming(serviceBusService: ServiceBusService): void {
    this.receiver = serviceBusService.createReceiver(QUEUE_NAMES.POLL_JOBS);

    this.receiver.subscribe({
      processMessage: async (sbMessage: ServiceBusReceivedMessage) => {
        const body = sbMessage.body as unknown;

        if (!isPollJobMessage(body)) {
          this.logger.warn('Received malformed PollJobMessage — abandoning');
          await this.receiver!.abandonMessage(sbMessage);
          return;
        }

        await this.tokenBucket.acquire();
        await this.processMessage(body);
        await this.receiver!.completeMessage(sbMessage);
      },
      processError: (err) => {
        this.logger.error(`Service Bus error on poll-jobs queue: ${String(err.error)}`);
        return Promise.resolve();
      },
    });

    this.logger.log('PollJobConsumer started — listening on poll-jobs queue');
  }

  // ── Message processing (public for unit tests) ─────────────────────────────

  /**
   * Processes a single PollJobMessage: sets bearer token, calls FSP,
   * stores result or handles 429/errors. On success, passes the previous
   * and new snapshots to ChangeDetectionService.
   *
   * @param message - The parsed PollJobMessage.
   */
  async processMessage(message: PollJobMessage): Promise<void> {
    const { operatorId, fspOperatorId } = message;

    // 1. Retrieve bearer token
    const bearerToken = this.tokenStore.getToken(fspOperatorId);
    if (!bearerToken) {
      this.logger.warn(
        `No bearer token for fspOperatorId=${fspOperatorId} — skipping poll`,
      );
      return;
    }

    // 2. Inject token into FSP HTTP client
    this.coreClient.setBearerToken(bearerToken);

    this.logger.debug(
      `Polling FSP for operator ${operatorId} (fspId=${fspOperatorId})`,
    );

    // 3. Call FSP — URL uses the numeric fspOperatorId as a string
    const result: ServiceResult<FspReservationListResponse> =
      await this.reservationsService.listReservations(String(fspOperatorId), {});

    // 4. Handle success
    if (result.success) {
      const reservations = result.data.reservations ?? [];

      // Capture previous snapshot before overwriting
      const previousReservations = this.snapshotStore.get(operatorId) ?? [];

      // Update snapshot store with new data
      this.snapshotStore.set(operatorId, reservations);

      // Run change detection (compare previous vs new snapshot)
      await this.changeDetectionService.processSnapshot(
        operatorId,
        fspOperatorId,
        previousReservations,
        reservations,
      );

      this.logger.debug(
        `Poll successful for operator ${operatorId} — ${reservations.length} reservations`,
      );
      return;
    }

    // 5. Handle 429
    if (this.is429Error(result)) {
      this.logger.error(
        `FSP 429 for operator ${operatorId} — pausing bucket and re-enqueuing`,
      );
      this.tokenBucket.pause();
      await this.pollJobPublisher.publishPollJob({
        ...message,
        correlationId: randomUUID(),
        enqueuedAt: new Date().toISOString(),
        scheduledAt: new Date().toISOString(),
      });
      return;
    }

    // 6. Non-429 error
    this.logger.warn(`FSP poll failed for operator ${operatorId}: ${result.error}`);
  }

  /**
   * Returns true when a failed ServiceResult indicates an FSP 429 error.
   *
   * @param result - Any ServiceResult.
   */
  is429Error(result: ServiceResult<unknown>): boolean {
    if (result.success) return false;
    return (result.fspErrors ?? []).some((e) => e.code === FSP_RATE_LIMIT_CODE);
  }
}
