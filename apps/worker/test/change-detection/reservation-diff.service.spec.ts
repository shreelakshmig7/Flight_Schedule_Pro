/**
 * reservation-diff.service.spec.ts
 * ----------------------------------
 * Agentic Scheduler — FSP Integration — ReservationDiffService unit tests
 * -------------------------------------------------------------------------
 * Covers: deterministic hashing, deduplication, cancellation detection
 * (student-only), new-opening detection (aircraft+instructor), status-change
 * detection, maintenance-block filtering, and compound event emission.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-9 — Change Detection Engine
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { ReservationDiffService } from '../../src/change-detection/reservation-diff.service';
import type { FspReservation } from '@fsp-scheduler/shared-types';

/** Builds a minimal FspReservation for testing. */
function makeReservation(
  reservationId: string,
  overrides: Partial<FspReservation> = {},
): FspReservation {
  return {
    reservationId,
    operatorId: 'op1',
    startDateTime: '2026-03-15T10:00:00Z',
    endDateTime: '2026-03-15T11:00:00Z',
    status: 'CONFIRMED',
    studentId: 'student-1',
    instructorId: 'instr-1',
    aircraftId: 'acft-1',
    locationId: 'loc-1',
    ...overrides,
  };
}

describe('ReservationDiffService', () => {
  let service: ReservationDiffService;

  beforeEach(() => {
    service = new ReservationDiffService();
  });

  // ── computeHash ────────────────────────────────────────────────────────────

  it('computeHash returns the same value for identical inputs', () => {
    const reservations = [makeReservation('r1'), makeReservation('r2')];
    expect(service.computeHash(reservations)).toBe(service.computeHash(reservations));
  });

  it('computeHash is order-independent', () => {
    const a = makeReservation('r1');
    const b = makeReservation('r2');
    expect(service.computeHash([a, b])).toBe(service.computeHash([b, a]));
  });

  it('computeHash produces different values for different reservation sets', () => {
    const r1 = makeReservation('r1', { status: 'CONFIRMED' });
    const r2 = makeReservation('r1', { status: 'CANCELLED' });
    expect(service.computeHash([r1])).not.toBe(service.computeHash([r2]));
  });

  it('computeHash deduplicates before hashing (same as single entry)', () => {
    const r = makeReservation('r1');
    expect(service.computeHash([r, r])).toBe(service.computeHash([r]));
  });

  it('computeHash returns a 64-character hex string (SHA-256)', () => {
    const hash = service.computeHash([makeReservation('r1')]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── deduplicateById ────────────────────────────────────────────────────────

  it('deduplicateById keeps the first occurrence of duplicate reservationIds', () => {
    const r1a = makeReservation('r1', { status: 'CONFIRMED' });
    const r1b = makeReservation('r1', { status: 'CANCELLED' });
    const result = service.deduplicateById([r1a, r1b]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('CONFIRMED');
  });

  it('deduplicateById preserves all unique reservations', () => {
    const reservations = [
      makeReservation('r1'),
      makeReservation('r2'),
      makeReservation('r3'),
    ];
    expect(service.deduplicateById(reservations)).toHaveLength(3);
  });

  it('deduplicateById returns empty array for empty input', () => {
    expect(service.deduplicateById([])).toHaveLength(0);
  });

  // ── detectChanges — no changes ─────────────────────────────────────────────

  it('detectChanges returns empty array when prev and next are identical', () => {
    const reservations = [makeReservation('r1'), makeReservation('r2')];
    expect(service.detectChanges(reservations, reservations)).toHaveLength(0);
  });

  it('detectChanges returns empty array when both prev and next are empty', () => {
    expect(service.detectChanges([], [])).toHaveLength(0);
  });

  // ── detectChanges — CANCELLATION ──────────────────────────────────────────

  it('emits CANCELLATION when a student reservation disappears from next', () => {
    const prev = [makeReservation('r1', { studentId: 'student-1' })];
    const changes = service.detectChanges(prev, []);
    const cancellations = changes.filter(c => c.changeType === 'CANCELLATION');
    expect(cancellations).toHaveLength(1);
    expect(cancellations[0].reservationId).toBe('r1');
  });

  it('does NOT emit CANCELLATION for a maintenance block (no studentId)', () => {
    const prev = [
      makeReservation('r1', { studentId: null, instructorId: 'instr-1', aircraftId: 'acft-1' }),
    ];
    const changes = service.detectChanges(prev, []);
    expect(changes.filter(c => c.changeType === 'CANCELLATION')).toHaveLength(0);
  });

  it('emits CANCELLATION when a reservation status changes to a cancelled value', () => {
    const prev = [makeReservation('r1', { studentId: 'student-1', status: 'CONFIRMED' })];
    const next = [makeReservation('r1', { studentId: 'student-1', status: 'CANCELLED' })];
    const cancellations = service.detectChanges(prev, next).filter(
      c => c.changeType === 'CANCELLATION',
    );
    expect(cancellations).toHaveLength(1);
    expect(cancellations[0].reservationId).toBe('r1');
  });

  it('includes studentId in the rawDiff of a CANCELLATION event', () => {
    const prev = [makeReservation('r1', { studentId: 'student-42' })];
    const changes = service.detectChanges(prev, []);
    const cancellation = changes.find(c => c.changeType === 'CANCELLATION');
    expect(cancellation?.rawDiff).toMatchObject({ studentId: 'student-42' });
  });

  // ── detectChanges — NEW_OPENING ────────────────────────────────────────────

  it('emits NEW_OPENING when an aircraft+instructor reservation disappears', () => {
    const prev = [
      makeReservation('r1', {
        studentId: null,
        aircraftId: 'acft-1',
        instructorId: 'instr-1',
      }),
    ];
    const changes = service.detectChanges(prev, []);
    const openings = changes.filter(c => c.changeType === 'NEW_OPENING');
    expect(openings).toHaveLength(1);
    expect(openings[0].reservationId).toBe('r1');
  });

  it('does NOT emit NEW_OPENING when only an aircraft (no instructor) is freed', () => {
    const prev = [
      makeReservation('r1', { studentId: null, aircraftId: 'acft-1', instructorId: null }),
    ];
    const changes = service.detectChanges(prev, []);
    expect(changes.filter(c => c.changeType === 'NEW_OPENING')).toHaveLength(0);
  });

  it('includes freed slot details in NEW_OPENING rawDiff', () => {
    const prev = [
      makeReservation('r1', {
        startDateTime: '2026-03-15T10:00:00Z',
        endDateTime: '2026-03-15T11:00:00Z',
        locationId: 'loc-1',
        aircraftId: 'acft-1',
        instructorId: 'instr-1',
      }),
    ];
    const changes = service.detectChanges(prev, []);
    const opening = changes.find(c => c.changeType === 'NEW_OPENING');
    expect(opening?.rawDiff).toMatchObject({
      freedSlot: expect.objectContaining({
        aircraftId: 'acft-1',
        instructorId: 'instr-1',
      }),
    });
  });

  // ── detectChanges — compound (CANCELLATION + NEW_OPENING) ─────────────────

  it('emits both CANCELLATION and NEW_OPENING from the same student+aircraft+instructor reservation', () => {
    const prev = [
      makeReservation('r1', {
        studentId: 'student-1',
        aircraftId: 'acft-1',
        instructorId: 'instr-1',
      }),
    ];
    const changes = service.detectChanges(prev, []);
    const types = changes.map(c => c.changeType);
    expect(types).toContain('CANCELLATION');
    expect(types).toContain('NEW_OPENING');
  });

  // ── detectChanges — STATUS_CHANGE ─────────────────────────────────────────

  it('emits STATUS_CHANGE when status changes to a non-cancellation value', () => {
    const prev = [makeReservation('r1', { status: 'CONFIRMED' })];
    const next = [makeReservation('r1', { status: 'COMPLETED' })];
    const changes = service.detectChanges(prev, next);
    const statusChanges = changes.filter(c => c.changeType === 'STATUS_CHANGE');
    expect(statusChanges).toHaveLength(1);
    expect(statusChanges[0].rawDiff).toMatchObject({
      oldStatus: 'CONFIRMED',
      newStatus: 'COMPLETED',
    });
  });

  it('does NOT emit STATUS_CHANGE when status changes to a cancellation value (CANCELLATION wins)', () => {
    const prev = [makeReservation('r1', { studentId: 's1', status: 'CONFIRMED' })];
    const next = [makeReservation('r1', { studentId: 's1', status: 'CANCELLED' })];
    const changes = service.detectChanges(prev, next);
    expect(changes.filter(c => c.changeType === 'STATUS_CHANGE')).toHaveLength(0);
  });

  it('does NOT emit any change when a new reservation appears in next (only removals tracked)', () => {
    const next = [makeReservation('r1', { studentId: 's1' })];
    expect(service.detectChanges([], next)).toHaveLength(0);
  });
});
