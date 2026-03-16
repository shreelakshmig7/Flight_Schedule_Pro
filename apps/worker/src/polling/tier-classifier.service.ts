/**
 * tier-classifier.service.ts
 * --------------------------
 * Agentic Scheduler — FSP Integration — Hourly tier reclassification job
 * -----------------------------------------------------------------------
 * Runs every hour, inspects the raw reservation snapshot for each active
 * operator, determines the appropriate polling tier (TIER1/2/3), updates
 * the database when the tier has changed, and notifies the
 * PollingDispatcherService so it can reschedule at the new interval.
 *
 * Tier rules:
 *   TIER1 — reservation within next TIER1_RECENT_HOURS (24h) or recent cancellation
 *   TIER2 — reservation within next TIER2_LOOKAHEAD_DAYS (7d)
 *   TIER3 — no reservation within the next 7 days
 *
 * Key exports: TierClassifierService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@fsp-scheduler/database';
import {
  TIER1_RECENT_HOURS,
  TIER2_LOOKAHEAD_DAYS,
  POLLING_TIER,
} from '@fsp-scheduler/shared-types';
import type { FspReservation, PollingTier } from '@fsp-scheduler/shared-types';
import { RawSnapshotStore } from './raw-snapshot.store';
import { PollingDispatcherService } from './polling-dispatcher.service';

/** Cron expression: every hour at minute 0. */
const TIER_RECLASS_CRON = '0 * * * *';

/** MS in one hour. */
const ONE_HOUR_MS = 3_600_000;

/**
 * Hourly service that reclassifies operator polling tiers based on the
 * most recent raw FSP reservation snapshot stored in RawSnapshotStore.
 *
 * Operators with no snapshot default to TIER3 until they are polled.
 */
@Injectable()
export class TierClassifierService {
  private readonly logger = new Logger(TierClassifierService.name);

  /**
   * @param snapshotStore      - In-memory store of the most recent FSP poll results.
   * @param prisma             - Database client for reading and updating operators.
   * @param pollingDispatcher  - Dispatcher to notify when a tier changes.
   */
  constructor(
    private readonly snapshotStore: RawSnapshotStore,
    private readonly prisma: PrismaService,
    private readonly pollingDispatcher: PollingDispatcherService,
  ) {}

  // ── Scheduled job ──────────────────────────────────────────────────────────

  /**
   * Runs every hour. Reclassifies all active operators and persists changes.
   */
  @Cron(TIER_RECLASS_CRON)
  async handleReclassification(): Promise<void> {
    this.logger.log('Starting hourly tier reclassification', {
      service: TierClassifierService.name,
      operatorId: 'system',
      correlationId: 'tier-reclass',
    });

    await this.runClassification();
  }

  // ── Public API (also called in tests) ─────────────────────────────────────

  /**
   * Reclassifies all active operators and updates the database for those
   * whose tier has changed. Also notifies the PollingDispatcherService.
   */
  async runClassification(): Promise<void> {
    const operators = await this.prisma.operator.findMany({
      where: { isActive: true },
      select: {
        id: true,
        operatorId: true,
        fspOperatorId: true,
        pollingTier: true,
        isActive: true,
      },
    });

    this.logger.debug(`Reclassifying ${operators.length} active operators`);

    await Promise.all(
      operators.map((op) => this.reclassifyOperator(op)),
    );
  }

  /**
   * Classifies the polling tier for a set of reservations.
   * This is a pure function, exposed publicly for unit testing.
   *
   * @param reservations - Raw FSP reservation list from the latest poll.
   * @returns The appropriate PollingTier for this set of reservations.
   */
  classifyTier(reservations: FspReservation[]): PollingTier {
    if (reservations.length === 0) {
      return POLLING_TIER.TIER3;
    }

    const now = Date.now();
    const tier1Cutoff = now + TIER1_RECENT_HOURS * ONE_HOUR_MS;
    const tier2Cutoff = now + TIER2_LOOKAHEAD_DAYS * 24 * ONE_HOUR_MS;

    for (const reservation of reservations) {
      const start = new Date(reservation.startDateTime).getTime();
      if (!Number.isNaN(start) && start > now && start <= tier1Cutoff) {
        return POLLING_TIER.TIER1;
      }
    }

    for (const reservation of reservations) {
      const start = new Date(reservation.startDateTime).getTime();
      if (!Number.isNaN(start) && start > now && start <= tier2Cutoff) {
        return POLLING_TIER.TIER2;
      }
    }

    return POLLING_TIER.TIER3;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Reclassifies a single operator and updates DB + dispatcher if changed.
   */
  private async reclassifyOperator(op: {
    id: string;
    operatorId: string;
    fspOperatorId: number;
    pollingTier: string;
    isActive: boolean;
  }): Promise<void> {
    const snapshot = this.snapshotStore.get(op.operatorId);
    const reservations = snapshot ?? [];

    const newTier = this.classifyTier(reservations);
    const currentTier = op.pollingTier as PollingTier;

    if (newTier === currentTier) {
      return; // No change — skip DB write and rescheduling
    }

    this.logger.log(
      `Operator ${op.operatorId} tier changed: ${currentTier} → ${newTier}`,
    );

    await this.prisma.operator.update({
      where: { id: op.id },
      data: { pollingTier: newTier },
    });

    this.pollingDispatcher.reschedule(op.operatorId, newTier);
  }
}
