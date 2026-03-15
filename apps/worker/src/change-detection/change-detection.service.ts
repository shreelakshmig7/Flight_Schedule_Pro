/**
 * change-detection.service.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — Change detection orchestrator
 * -------------------------------------------------------------------
 * Consumes a fresh FSP reservations snapshot, determines whether any changes
 * have occurred since the last poll, and emits typed `ChangeEventMessage`
 * records onto the `change-events` Azure Service Bus queue.
 *
 * Flow per call to processSnapshot()
 * ────────────────────────────────────
 *   1. Deduplicate the incoming reservations by reservationId.
 *   2. Compute a deterministic SHA-256 hash of the deduplicated, sorted list.
 *   3. Load the operator's stored lastPollHash from the database.
 *   4. Update operator.lastPolledAt (always — every successful poll counts).
 *   5. If the hash is unchanged → return early (no events emitted).
 *   6. Run the diff against the previously seen snapshot passed by the caller.
 *   7. For each detected change:
 *      a. Persist a DiscoveryProspect row (status = PENDING) in the database.
 *      b. Publish a ChangeEventMessage to the change-events queue.
 *   8. Update operator.lastPollHash to the new hash.
 *
 * The rawDiff stored in DiscoveryProspect and sent in the ChangeEventMessage
 * carries enough context for use-case handlers to act without additional FSP
 * calls. rawDiff is never written to logs.
 *
 * Key exports: ChangeDetectionService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-9 — Change Detection Engine
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaService } from '@fsp-scheduler/database';
import { Prisma } from '@fsp-scheduler/database';
import {
  DISCOVERY_STATUS,
} from '@fsp-scheduler/shared-types';
import type { FspReservation, ChangeEventMessage } from '@fsp-scheduler/shared-types';
import { ReservationDiffService } from './reservation-diff.service';
import type { DetectedChange } from './reservation-diff.service';
import type { ChangeEventPublisher } from '../service-bus/publishers/change-event.publisher';

/**
 * Orchestrates change detection for a single FSP operator poll result.
 *
 * Called by PollJobConsumer after every successful FSP reservation list
 * response. Stateless between calls — all state is stored in the database
 * (lastPollHash, lastPolledAt) or in RawSnapshotStore (previous reservations
 * are passed in by the caller).
 */
@Injectable()
export class ChangeDetectionService {
  private readonly logger = new Logger(ChangeDetectionService.name);

  /**
   * @param diffService          - Pure diff utility for computing hashes and detecting changes.
   * @param prisma               - Database client for reading and updating operator state.
   * @param changeEventPublisher - Publisher for the change-events Service Bus queue.
   */
  constructor(
    private readonly diffService: ReservationDiffService,
    private readonly prisma: PrismaService,
    private readonly changeEventPublisher: ChangeEventPublisher,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Processes a fresh FSP reservations snapshot for one operator.
   *
   * Compares the new snapshot against the previous one (provided by the
   * caller from RawSnapshotStore) and emits change events when differences
   * are detected. Always updates `operator.lastPolledAt`.
   *
   * @param operatorId           - String tenant identifier.
   * @param fspOperatorId        - Numeric FSP operator ID.
   * @param previousReservations - Snapshot from the previous poll (empty on first poll).
   * @param newReservations      - Fresh reservations list from the current poll.
   */
  async processSnapshot(
    operatorId: string,
    fspOperatorId: number,
    previousReservations: FspReservation[],
    newReservations: FspReservation[],
  ): Promise<void> {
    // 1. Deduplicate and hash the incoming snapshot
    const dedupedReservations = this.diffService.deduplicateById(newReservations);
    const newHash = this.diffService.computeHash(dedupedReservations);

    // 2. Load operator's current hash from DB
    const operator = await this.prisma.operator.findUnique({
      where: { operatorId },
      select: { id: true, lastPollHash: true },
    });

    // 3. Always update lastPolledAt
    await this.prisma.operator.update({
      where: { operatorId },
      data: { lastPolledAt: new Date() },
    });

    // 4. Hash unchanged → nothing more to do
    if (operator?.lastPollHash === newHash) {
      this.logger.debug(
        `No changes detected for operator ${operatorId} — hash unchanged`,
      );
      return;
    }

    this.logger.log(
      `Hash changed for operator ${operatorId} — running diff`,
      {
        service: ChangeDetectionService.name,
        operatorId,
        correlationId: 'change-detection',
      },
    );

    // 5. Run diff: compare previous snapshot against freshly deduped new one
    const changes = this.diffService.detectChanges(
      previousReservations,
      dedupedReservations,
    );

    this.logger.log(
      `Detected ${changes.length} change(s) for operator ${operatorId}`,
      {
        service: ChangeDetectionService.name,
        operatorId,
        correlationId: 'change-detection',
      },
    );

    // 6. Persist and publish each change
    const detectedAt = new Date().toISOString();
    await Promise.all(
      changes.map((change) =>
        this.publishChange(operatorId, fspOperatorId, change, detectedAt),
      ),
    );

    // 7. Update lastPollHash
    await this.prisma.operator.update({
      where: { operatorId },
      data: { lastPollHash: newHash },
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Persists a DiscoveryProspect record and publishes a ChangeEventMessage
   * for a single detected change.
   *
   * @param operatorId    - String tenant identifier.
   * @param fspOperatorId - Numeric FSP operator ID.
   * @param change        - The detected change to persist and publish.
   * @param detectedAt    - ISO-8601 timestamp of detection.
   */
  private async publishChange(
    operatorId: string,
    fspOperatorId: number,
    change: DetectedChange,
    detectedAt: string,
  ): Promise<void> {
    // Persist discovery prospect for audit and use-case handler processing
    await this.prisma.discoveryProspect.create({
      data: {
        operatorId,
        fspOperatorId,
        reservationId: change.reservationId,
        changeType: change.changeType,
        detectedAt: new Date(detectedAt),
        status: DISCOVERY_STATUS.PENDING,
        rawDiff: change.rawDiff as Prisma.InputJsonValue,
      },
    });

    // Publish change event to Service Bus queue
    const message: ChangeEventMessage = {
      operatorId,
      fspOperatorId,
      changeType: change.changeType,
      reservationId: change.reservationId,
      detectedAt,
      rawDiff: change.rawDiff,
      correlationId: randomUUID(),
      enqueuedAt: new Date().toISOString(),
    };

    await this.changeEventPublisher.publishChangeEvent(message);

    this.logger.debug(
      `Published ${change.changeType} for reservation ${change.reservationId} (operator ${operatorId})`,
    );
  }
}
