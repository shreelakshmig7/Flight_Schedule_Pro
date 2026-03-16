/**
 * raw-snapshot.store.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — In-memory raw FSP snapshot store
 * -----------------------------------------------------------------------
 * Stores the most recent raw FSP reservations list per operator in memory
 * with a TTL of POLL_SNAPSHOT_TTL_SECONDS. Snapshots are consumed by the
 * change detection engine (PR 9) to diff against the previous poll result.
 *
 * Data is NOT persisted to PostgreSQL — a worker restart requires the next
 * poll to re-populate the store before change detection can run.
 *
 * The clock function is injectable for deterministic unit testing.
 *
 * Key exports: RawSnapshotStore
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { POLL_SNAPSHOT_TTL_SECONDS } from '@fsp-scheduler/shared-types';
import type { FspReservation } from '@fsp-scheduler/shared-types';

/** DI injection token for the clock function — used in tests. */
export const RAW_SNAPSHOT_CLOCK = 'RAW_SNAPSHOT_CLOCK';

/** Internal record shape stored per operator. */
interface SnapshotRecord {
  reservations: FspReservation[];
  capturedAt: number;
}

/**
 * In-memory store for raw FSP poll snapshots.
 *
 * Each entry lives for POLL_SNAPSHOT_TTL_SECONDS before being evicted.
 * Expired entries are removed lazily on access (get/has/getAll) and
 * eagerly on set.
 */
@Injectable()
export class RawSnapshotStore {
  private readonly logger = new Logger(RawSnapshotStore.name);
  private readonly store = new Map<string, SnapshotRecord>();
  private readonly clock: () => number;
  private readonly ttlMs: number = POLL_SNAPSHOT_TTL_SECONDS * 1000;

  /**
   * @param clockFn - Optional injectable clock function (defaults to Date.now).
   */
  constructor(
    @Optional() @Inject(RAW_SNAPSHOT_CLOCK) clockFn?: () => number,
  ) {
    this.clock = clockFn ?? (() => Date.now());
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Stores or replaces the reservation snapshot for an operator.
   * Resets the TTL on every write.
   *
   * @param operatorId   - The string operator identifier.
   * @param reservations - The raw FSP reservation list from the latest poll.
   */
  set(operatorId: string, reservations: FspReservation[]): void {
    this.store.set(operatorId, {
      reservations,
      capturedAt: this.clock(),
    });

    this.logger.debug(
      `Snapshot stored for operatorId=${operatorId} count=${reservations.length}`,
    );
  }

  /**
   * Returns the reservation list for an operator, or null if absent or expired.
   *
   * @param operatorId - The string operator identifier.
   */
  get(operatorId: string): FspReservation[] | null {
    const record = this.store.get(operatorId);
    if (!record) return null;

    if (this.isExpired(record)) {
      this.store.delete(operatorId);
      return null;
    }

    return record.reservations;
  }

  /**
   * Returns true when a non-expired snapshot exists for the operator.
   *
   * @param operatorId - The string operator identifier.
   */
  has(operatorId: string): boolean {
    return this.get(operatorId) !== null;
  }

  /**
   * Removes the snapshot for an operator. No-op if not present.
   *
   * @param operatorId - The string operator identifier.
   */
  delete(operatorId: string): void {
    this.store.delete(operatorId);
  }

  /**
   * Returns a Map of all non-expired snapshots keyed by operatorId.
   * Expired entries are evicted during this traversal.
   */
  getAll(): Map<string, FspReservation[]> {
    const result = new Map<string, FspReservation[]>();

    for (const [operatorId, record] of this.store.entries()) {
      if (this.isExpired(record)) {
        this.store.delete(operatorId);
        continue;
      }
      result.set(operatorId, record.reservations);
    }

    return result;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Returns true when the snapshot has exceeded its TTL.
   */
  private isExpired(record: SnapshotRecord): boolean {
    return this.clock() - record.capturedAt >= this.ttlMs;
  }
}
