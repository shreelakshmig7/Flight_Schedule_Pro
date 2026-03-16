/**
 * change-event.consumer.ts
 * -------------------------
 * Agentic Scheduler — FSP Integration — Change-events queue consumer
 * ------------------------------------------------------------------
 * Subscribes to the `change-events` Azure Service Bus queue and routes
 * each received message to the appropriate use-case handler based on
 * the `changeType` field:
 *
 *   NEW_OPENING       → WaitlistUseCaseService.processNewOpening()
 *   CANCELLATION      → RescheduleUseCaseService.processCancellation()
 *   DISCOVERY_REQUEST → DiscoveryUseCaseService.processDiscoveryRequest()
 *   STATUS_CHANGE     → NextLessonUseCaseService.processLessonCompletion() (newStatus=COMPLETED)
 *
 * Flow per message:
 *   1. Validate the message body as a ChangeEventMessage.
 *   2. Route to the appropriate handler.
 *   3. On success: complete the message (Service Bus removes it from queue).
 *   4. On error: log and complete (message is dead-lettered by Service Bus
 *      after maxDeliveryCount attempts).
 *
 * Key exports: ChangeEventConsumer
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-13 — Use Case A — Waitlist
 * Updated: PR-14 — Use Case B — Reschedule (added CANCELLATION routing)
 * Updated: PR-15 — Use Case C — Discovery (added DISCOVERY_REQUEST routing)
 * Updated: PR-16 — Use Case D — Next Lesson (STATUS_CHANGE → NextLessonUseCaseService)
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus';
import {
  isChangeEventMessage,
  QUEUE_NAMES,
} from '@fsp-scheduler/shared-types';
import { ServiceBusService } from '../service-bus/service-bus.service';
import { WaitlistUseCaseService } from './waitlist/waitlist-use-case.service';
import { RescheduleUseCaseService } from './reschedule/reschedule-use-case.service';
import { DiscoveryUseCaseService } from './discovery/discovery-use-case.service';
import { NextLessonUseCaseService } from './next-lesson/next-lesson-use-case.service';

/**
 * Consumes messages from the change-events Service Bus queue and dispatches
 * them to the appropriate use-case handler.
 *
 * NEW_OPENING       → WaitlistUseCaseService
 * CANCELLATION      → RescheduleUseCaseService
 * DISCOVERY_REQUEST → DiscoveryUseCaseService
 * STATUS_CHANGE     → NextLessonUseCaseService (newStatus=COMPLETED; others logged and discarded)
 */
@Injectable()
export class ChangeEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChangeEventConsumer.name);
  private receiver: ServiceBusReceiver | null = null;

  /**
   * @param serviceBusService          - Owns the Azure Service Bus client.
   * @param waitlistUseCaseService     - Handler for NEW_OPENING events.
   * @param rescheduleUseCaseService   - Handler for CANCELLATION events.
   * @param discoveryUseCaseService    - Handler for DISCOVERY_REQUEST events.
   * @param nextLessonUseCaseService   - Handler for STATUS_CHANGE (COMPLETED) events.
   */
  constructor(
    private readonly serviceBusService: ServiceBusService,
    private readonly waitlistUseCaseService: WaitlistUseCaseService,
    private readonly rescheduleUseCaseService: RescheduleUseCaseService,
    private readonly discoveryUseCaseService: DiscoveryUseCaseService,
    private readonly nextLessonUseCaseService: NextLessonUseCaseService,
  ) {}

  /** Subscribes to the change-events queue when the module initialises. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async onModuleInit(): Promise<void> {
    this.receiver = this.serviceBusService.createReceiver(QUEUE_NAMES.CHANGE_EVENTS);

    // eslint-disable-next-line @typescript-eslint/require-await
    this.receiver.subscribe({
      processMessage: (msg) => this.processMessage(msg),
      // eslint-disable-next-line @typescript-eslint/require-await
      processError: async (args) => {
        this.logger.error(
          `Error from change-events receiver: ${args.error.message}`,
          { service: ChangeEventConsumer.name, errorSource: args.errorSource },
        );
      },
    });

    this.logger.log('ChangeEventConsumer subscribed to change-events queue');
  }

  /** Closes the receiver when the module is destroyed (graceful shutdown). */
  async onModuleDestroy(): Promise<void> {
    if (this.receiver) {
      await this.receiver.close();
      this.receiver = null;
    }
  }

  // ── Private: message handler ────────────────────────────────────────────────

  /**
   * Processes a single ChangeEventMessage from the queue.
   *
   * Validates the message, routes by changeType, then completes the
   * Service Bus message. On any error the message is completed (not
   * abandoned) so Service Bus dead-letters it after maxDeliveryCount.
   *
   * @param msg - Raw Service Bus received message.
   */
  private async processMessage(msg: ServiceBusReceivedMessage): Promise<void> {
    const body = msg.body as unknown;

    if (!isChangeEventMessage(body)) {
      this.logger.warn(
        `Received non-ChangeEventMessage on change-events queue — completing`,
        { service: ChangeEventConsumer.name, deliveryCount: msg.deliveryCount },
      );
      await this.receiver?.completeMessage(msg);
      return;
    }

    this.logger.log(
      `Received ${body.changeType} event for operator ${body.operatorId}`,
      {
        service: ChangeEventConsumer.name,
        operatorId: body.operatorId,
        correlationId: body.correlationId,
        changeType: body.changeType,
      },
    );

    try {
      switch (body.changeType) {
        case 'NEW_OPENING':
          await this.waitlistUseCaseService.processNewOpening(body);
          break;

        case 'CANCELLATION':
          await this.rescheduleUseCaseService.processCancellation(body);
          break;

        case 'DISCOVERY_REQUEST':
          await this.discoveryUseCaseService.processDiscoveryRequest(body);
          break;

        case 'STATUS_CHANGE':
          await this.nextLessonUseCaseService.processLessonCompletion(body);
          break;

        default:
          this.logger.warn(
            `Unknown changeType received: ${(body as { changeType: string }).changeType}`,
          );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error processing ${body.changeType} event: ${message}`,
        { service: ChangeEventConsumer.name, operatorId: body.operatorId },
      );
    } finally {
      await this.receiver?.completeMessage(msg);
    }
  }
}
