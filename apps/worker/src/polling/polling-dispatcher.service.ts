/**
 * polling-dispatcher.service.ts
 * ------------------------------
 * Agentic Scheduler — FSP Integration — Polling dispatcher
 * ---------------------------------------------------------
 * Manages per-operator polling timers. On startup, loads all active
 * operators from the database and registers a repeating timer for each
 * at the interval appropriate for their polling tier. When a timer fires,
 * it publishes a PollJobMessage to the poll-jobs Service Bus queue.
 *
 * Implements duplicate-prevention: if a job is already in-flight for an
 * operator, the next timer tick is skipped. Supports incremental
 * registration and deregistration so new operators added via the bootstrap
 * endpoint are polled within one interval without a worker restart.
 *
 * Key exports: PollingDispatcherService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '@fsp-scheduler/database';
import {
  TIER1_POLL_INTERVAL_SECONDS,
  TIER2_POLL_INTERVAL_SECONDS,
  TIER3_POLL_INTERVAL_SECONDS,
} from '@fsp-scheduler/shared-types';
import type { PollingTier, PollJobMessage } from '@fsp-scheduler/shared-types';
import { PollJobPublisher } from '../service-bus/publishers/poll-job.publisher';
import { randomUUID } from 'crypto';

/** Poll interval in milliseconds per tier. */
const TIER_INTERVAL_MS: Record<PollingTier, number> = {
  TIER1: TIER1_POLL_INTERVAL_SECONDS * 1000,
  TIER2: TIER2_POLL_INTERVAL_SECONDS * 1000,
  TIER3: TIER3_POLL_INTERVAL_SECONDS * 1000,
};

/** State held per registered operator. */
interface OperatorState {
  fspOperatorId: number;
  tier: PollingTier;
  timer: ReturnType<typeof setInterval> | null;
  /** True while a PollJobMessage publish is in progress — prevents duplicate enqueue. */
  inFlight: boolean;
}

/**
 * Schedules and dispatches FSP poll jobs for all active operator tenants.
 *
 * On startup (onModuleInit), reads the full active operator list from the
 * database and sets up a repeating interval per operator. Each interval
 * tick publishes one PollJobMessage to the poll-jobs queue.
 *
 * The service handles operators being added (register) or removed
 * (unregister) at runtime without a restart. Tier changes are handled
 * by reschedule(), which clears the old interval and sets a new one.
 */
@Injectable()
export class PollingDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PollingDispatcherService.name);

  /** Live operator state map, keyed by string operatorId. */
  private readonly operators = new Map<string, OperatorState>();

  /**
   * @param pollJobPublisher - Publisher for the poll-jobs queue.
   * @param prisma           - Database client for loading operators on init.
   */
  constructor(
    private readonly pollJobPublisher: PollJobPublisher,
    private readonly prisma: PrismaService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Loads all active operators from the database and registers a polling
   * timer for each. Called automatically by NestJS on module initialisation.
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('PollingDispatcherService initialising — loading operators', {
      service: PollingDispatcherService.name,
      operatorId: 'system',
      correlationId: 'init',
    });

    const operators = await this.prisma.operator.findMany({
      where: { isActive: true },
      select: {
        operatorId: true,
        fspOperatorId: true,
        pollingTier: true,
      },
    });

    for (const op of operators) {
      this.register(op.operatorId, op.fspOperatorId, op.pollingTier as PollingTier);
    }

    this.logger.log(
      `PollingDispatcherService ready — registered ${operators.length} operators`,
      { service: PollingDispatcherService.name, operatorId: 'system', correlationId: 'init' },
    );
  }

  /**
   * Clears all polling timers. Called automatically by NestJS on shutdown.
   */
  onModuleDestroy(): void {
    this.logger.log('PollingDispatcherService shutting down — clearing all timers', {
      service: PollingDispatcherService.name,
      operatorId: 'system',
      correlationId: 'shutdown',
    });

    for (const [operatorId, state] of this.operators.entries()) {
      this.clearTimer(operatorId, state);
    }

    this.operators.clear();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Registers a new operator and starts its polling timer.
   * If the operator is already registered, this is a no-op.
   *
   * @param operatorId    - String tenant identifier.
   * @param fspOperatorId - Numeric FSP operator ID used in API calls.
   * @param tier          - Initial polling tier.
   */
  register(operatorId: string, fspOperatorId: number, tier: PollingTier): void {
    if (this.operators.has(operatorId)) {
      this.logger.debug(`Operator ${operatorId} already registered — skipping`);
      return;
    }

    const state: OperatorState = {
      fspOperatorId,
      tier,
      timer: null,
      inFlight: false,
    };

    this.operators.set(operatorId, state);
    this.startTimer(operatorId, state);

    this.logger.debug(
      `Registered operator ${operatorId} (fspId=${fspOperatorId}) on tier ${tier}`,
    );
  }

  /**
   * Removes an operator and clears its polling timer.
   * No-op if the operator is not registered.
   *
   * @param operatorId - String tenant identifier.
   */
  unregister(operatorId: string): void {
    const state = this.operators.get(operatorId);
    if (!state) return;

    this.clearTimer(operatorId, state);
    this.operators.delete(operatorId);

    this.logger.debug(`Unregistered operator ${operatorId}`);
  }

  /**
   * Changes the polling tier for a registered operator.
   * Clears the existing timer and starts a new one at the new interval.
   * No-op if the operator is not registered.
   *
   * @param operatorId - String tenant identifier.
   * @param newTier    - The new polling tier.
   */
  reschedule(operatorId: string, newTier: PollingTier): void {
    const state = this.operators.get(operatorId);
    if (!state) {
      this.logger.warn(
        `reschedule called for unknown operatorId=${operatorId} — ignoring`,
      );
      return;
    }

    if (state.tier === newTier) return;

    this.logger.log(
      `Rescheduling operator ${operatorId}: ${state.tier} → ${newTier}`,
    );

    this.clearTimer(operatorId, state);
    state.tier = newTier;
    this.startTimer(operatorId, state);
  }

  /**
   * Returns all currently registered operator IDs.
   * Used in tests to verify registration state.
   */
  getRegisteredOperatorIds(): string[] {
    return Array.from(this.operators.keys());
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Starts a repeating interval timer for the given operator.
   */
  private startTimer(operatorId: string, state: OperatorState): void {
    const intervalMs = TIER_INTERVAL_MS[state.tier];

    state.timer = setInterval(() => {
      void this.dispatchPollJob(operatorId, state);
    }, intervalMs);
  }

  /**
   * Clears the interval timer for the given operator.
   */
  private clearTimer(operatorId: string, state: OperatorState): void {
    if (state.timer !== null) {
      clearInterval(state.timer);
      state.timer = null;
    }

    void operatorId; // suppress unused-var lint
  }

  /**
   * Publishes a PollJobMessage for the given operator.
   * Sets inFlight to prevent duplicate enqueue within the same interval.
   */
  private async dispatchPollJob(operatorId: string, state: OperatorState): Promise<void> {
    if (state.inFlight) {
      this.logger.debug(
        `Skipping poll dispatch for operator ${operatorId} — previous job still in-flight`,
      );
      return;
    }

    state.inFlight = true;

    try {
      const message: PollJobMessage = {
        operatorId,
        fspOperatorId: state.fspOperatorId,
        tier: state.tier,
        correlationId: randomUUID(),
        enqueuedAt: new Date().toISOString(),
        scheduledAt: new Date().toISOString(),
      };

      await this.pollJobPublisher.publishPollJob(message);

      this.logger.debug(
        `Published PollJobMessage for operator ${operatorId} tier=${state.tier}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to publish PollJobMessage for operator ${operatorId}: ${String(err)}`,
      );
    } finally {
      state.inFlight = false;
    }
  }
}
