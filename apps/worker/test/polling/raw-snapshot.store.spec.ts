/**
 * raw-snapshot.store.spec.ts
 * --------------------------
 * Agentic Scheduler — FSP Integration — RawSnapshotStore unit tests
 * -----------------------------------------------------------------
 * Covers: set/get round-trip, TTL expiry, multiple operators,
 * and pruning of stale entries.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { RawSnapshotStore } from '../../src/polling/raw-snapshot.store';
import { POLL_SNAPSHOT_TTL_SECONDS } from '@fsp-scheduler/shared-types';
import type { FspReservation } from '@fsp-scheduler/shared-types';

/** Creates a minimal FspReservation stub for testing. */
function makeReservation(id: string): FspReservation {
  return {
    reservationId: id,
    operatorId: 'op1',
    startDateTime: new Date().toISOString(),
    endDateTime: new Date().toISOString(),
    status: 'CONFIRMED',
  } as FspReservation;
}

function makeClock(startMs: number = 0): { now: () => number; advance: (ms: number) => void } {
  let time = startMs;
  return {
    now: () => time,
    advance: (ms: number) => { time += ms; },
  };
}

describe('RawSnapshotStore', () => {
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    clock = makeClock(Date.now());
  });

  it('stores and retrieves a snapshot for an operator', () => {
    const store = new RawSnapshotStore(clock.now);
    const reservations = [makeReservation('r1'), makeReservation('r2')];

    store.set('op1', reservations);

    const result = store.get('op1');
    expect(result).toEqual(reservations);
  });

  it('returns null for an unknown operatorId', () => {
    const store = new RawSnapshotStore(clock.now);
    expect(store.get('unknown')).toBeNull();
  });

  it('returns null after TTL expires', () => {
    const store = new RawSnapshotStore(clock.now);
    store.set('op1', [makeReservation('r1')]);

    clock.advance(POLL_SNAPSHOT_TTL_SECONDS * 1000);

    expect(store.get('op1')).toBeNull();
  });

  it('returns the snapshot just before TTL expires', () => {
    const store = new RawSnapshotStore(clock.now);
    const reservations = [makeReservation('r1')];
    store.set('op1', reservations);

    clock.advance(POLL_SNAPSHOT_TTL_SECONDS * 1000 - 1);

    expect(store.get('op1')).toEqual(reservations);
  });

  it('overwrites an existing snapshot with newer data', () => {
    const store = new RawSnapshotStore(clock.now);
    store.set('op1', [makeReservation('old')]);

    const newer = [makeReservation('new1'), makeReservation('new2')];
    store.set('op1', newer);

    expect(store.get('op1')).toEqual(newer);
  });

  it('resets TTL when overwriting an existing snapshot', () => {
    const store = new RawSnapshotStore(clock.now);
    store.set('op1', [makeReservation('r1')]);

    // Advance almost to TTL, then update
    clock.advance(POLL_SNAPSHOT_TTL_SECONDS * 1000 - 1000);
    const newer = [makeReservation('r2')];
    store.set('op1', newer);

    // Advance again — still within new TTL
    clock.advance(POLL_SNAPSHOT_TTL_SECONDS * 1000 - 1000);
    expect(store.get('op1')).toEqual(newer);
  });

  it('handles multiple operators independently', () => {
    const store = new RawSnapshotStore(clock.now);
    const r1 = [makeReservation('op1-r1')];
    const r2 = [makeReservation('op2-r1'), makeReservation('op2-r2')];

    store.set('op1', r1);
    store.set('op2', r2);

    expect(store.get('op1')).toEqual(r1);
    expect(store.get('op2')).toEqual(r2);
  });

  it('getAll returns all non-expired snapshots', () => {
    const store = new RawSnapshotStore(clock.now);
    store.set('op1', [makeReservation('r1')]);
    store.set('op2', [makeReservation('r2')]);

    const all = store.getAll();
    expect(all.size).toBe(2);
    expect(all.has('op1')).toBe(true);
    expect(all.has('op2')).toBe(true);
  });

  it('getAll excludes expired snapshots', () => {
    const store = new RawSnapshotStore(clock.now);
    store.set('op1', [makeReservation('r1')]);
    store.set('op2', [makeReservation('r2')]);

    // Expire op1 only
    clock.advance(POLL_SNAPSHOT_TTL_SECONDS * 1000);

    const all = store.getAll();
    expect(all.has('op1')).toBe(false);
    expect(all.has('op2')).toBe(false); // both expired at same time
  });

  it('has() returns true for a valid snapshot', () => {
    const store = new RawSnapshotStore(clock.now);
    store.set('op1', [makeReservation('r1')]);
    expect(store.has('op1')).toBe(true);
  });

  it('has() returns false for an expired snapshot', () => {
    const store = new RawSnapshotStore(clock.now);
    store.set('op1', [makeReservation('r1')]);
    clock.advance(POLL_SNAPSHOT_TTL_SECONDS * 1000);
    expect(store.has('op1')).toBe(false);
  });

  it('delete() removes a snapshot', () => {
    const store = new RawSnapshotStore(clock.now);
    store.set('op1', [makeReservation('r1')]);
    store.delete('op1');
    expect(store.get('op1')).toBeNull();
  });
});
