/**
 * tier-classifier.service.spec.ts
 * --------------------------------
 * Agentic Scheduler — FSP Integration — TierClassifierService unit tests
 * -----------------------------------------------------------------------
 * Covers: TIER1 promotion from snapshot, TIER2 detection, TIER3 fallback,
 * DB update on tier change, no update when tier is unchanged.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TierClassifierService } from '../../src/polling/tier-classifier.service';
import { RawSnapshotStore } from '../../src/polling/raw-snapshot.store';
import type { FspReservation } from '@fsp-scheduler/shared-types';

/** Builds a minimal FspReservation at a given startDateTime. */
function makeReservation(startDateTime: string, status = 'CONFIRMED'): FspReservation {
  return {
    reservationId: `r-${Math.random()}`,
    operatorId: 'op1',
    startDateTime,
    endDateTime: startDateTime,
    status,
  } as FspReservation;
}

/** Returns an ISO string offset from now by the given hours. */
function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

/** Returns an ISO string offset from now by the given days. */
function daysFromNow(d: number): string {
  return new Date(Date.now() + d * 86_400_000).toISOString();
}

describe('TierClassifierService', () => {
  let snapshotStore: RawSnapshotStore;
  let prisma: {
    operator: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let pollingDispatcher: {
    reschedule: ReturnType<typeof vi.fn>;
  };
  let service: TierClassifierService;

  beforeEach(() => {
    snapshotStore = new RawSnapshotStore();

    prisma = {
      operator: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };

    pollingDispatcher = {
      reschedule: vi.fn(),
    };

    service = new TierClassifierService(
      snapshotStore,
      prisma as never,
      pollingDispatcher as never,
    );
  });

  it('classifies operator as TIER1 when snapshot has reservation within 24 hours', async () => {
    const operatorId = 'op1';
    const operators = [
      { id: 'db-id-1', operatorId, fspOperatorId: 1, pollingTier: 'TIER2', isActive: true },
    ];

    prisma.operator.findMany.mockResolvedValue(operators);
    prisma.operator.update.mockResolvedValue(undefined);
    pollingDispatcher.reschedule.mockReturnValue(undefined);

    snapshotStore.set(operatorId, [makeReservation(hoursFromNow(12))]);

    await service.runClassification();

    expect(prisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pollingTier: 'TIER1' }),
      }),
    );
    expect(pollingDispatcher.reschedule).toHaveBeenCalledWith(operatorId, 'TIER1');
  });

  it('classifies operator as TIER2 when snapshot has reservation within 7 days (but not 24h)', async () => {
    const operatorId = 'op2';
    const operators = [
      { id: 'db-id-2', operatorId, fspOperatorId: 2, pollingTier: 'TIER3', isActive: true },
    ];

    prisma.operator.findMany.mockResolvedValue(operators);
    prisma.operator.update.mockResolvedValue(undefined);
    pollingDispatcher.reschedule.mockReturnValue(undefined);

    snapshotStore.set(operatorId, [makeReservation(daysFromNow(3))]);

    await service.runClassification();

    expect(prisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pollingTier: 'TIER2' }),
      }),
    );
    expect(pollingDispatcher.reschedule).toHaveBeenCalledWith(operatorId, 'TIER2');
  });

  it('classifies operator as TIER3 when snapshot has no upcoming reservations', async () => {
    const operatorId = 'op3';
    const operators = [
      { id: 'db-id-3', operatorId, fspOperatorId: 3, pollingTier: 'TIER2', isActive: true },
    ];

    prisma.operator.findMany.mockResolvedValue(operators);
    prisma.operator.update.mockResolvedValue(undefined);
    pollingDispatcher.reschedule.mockReturnValue(undefined);

    snapshotStore.set(operatorId, [makeReservation(daysFromNow(14))]);

    await service.runClassification();

    expect(prisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pollingTier: 'TIER3' }),
      }),
    );
  });

  it('defaults to TIER3 when no snapshot is available for the operator', async () => {
    const operatorId = 'op4';
    const operators = [
      { id: 'db-id-4', operatorId, fspOperatorId: 4, pollingTier: 'TIER1', isActive: true },
    ];

    prisma.operator.findMany.mockResolvedValue(operators);
    prisma.operator.update.mockResolvedValue(undefined);
    pollingDispatcher.reschedule.mockReturnValue(undefined);

    // No snapshot set for op4

    await service.runClassification();

    expect(prisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pollingTier: 'TIER3' }),
      }),
    );
  });

  it('does not update DB or reschedule when tier is unchanged', async () => {
    const operatorId = 'op5';
    const operators = [
      { id: 'db-id-5', operatorId, fspOperatorId: 5, pollingTier: 'TIER1', isActive: true },
    ];

    prisma.operator.findMany.mockResolvedValue(operators);
    snapshotStore.set(operatorId, [makeReservation(hoursFromNow(6))]);

    await service.runClassification();

    expect(prisma.operator.update).not.toHaveBeenCalled();
    expect(pollingDispatcher.reschedule).not.toHaveBeenCalled();
  });

  it('processes multiple operators independently', async () => {
    const operators = [
      { id: 'db-1', operatorId: 'opA', fspOperatorId: 10, pollingTier: 'TIER3', isActive: true },
      { id: 'db-2', operatorId: 'opB', fspOperatorId: 11, pollingTier: 'TIER3', isActive: true },
    ];

    prisma.operator.findMany.mockResolvedValue(operators);
    prisma.operator.update.mockResolvedValue(undefined);
    pollingDispatcher.reschedule.mockReturnValue(undefined);

    snapshotStore.set('opA', [makeReservation(hoursFromNow(1))]); // → TIER1
    snapshotStore.set('opB', [makeReservation(daysFromNow(4))]); // → TIER2

    await service.runClassification();

    const updateCalls = prisma.operator.update.mock.calls;
    const tiersUpdated = updateCalls.map(
      (c: Parameters<typeof prisma.operator.update>[]) =>
        (c[0] as Record<string, unknown>).data as Record<string, string>,
    );

    expect(tiersUpdated.some((d) => d.pollingTier === 'TIER1')).toBe(true);
    expect(tiersUpdated.some((d) => d.pollingTier === 'TIER2')).toBe(true);
  });

  it('classifiesTier returns TIER1 for reservation within 24 hours', () => {
    const reservations = [makeReservation(hoursFromNow(6))];
    expect(service.classifyTier(reservations)).toBe('TIER1');
  });

  it('classifiesTier returns TIER2 for reservation between 24h and 7d', () => {
    const reservations = [makeReservation(daysFromNow(2))];
    expect(service.classifyTier(reservations)).toBe('TIER2');
  });

  it('classifiesTier returns TIER3 for reservation beyond 7 days', () => {
    const reservations = [makeReservation(daysFromNow(10))];
    expect(service.classifyTier(reservations)).toBe('TIER3');
  });

  it('classifiesTier returns TIER3 for empty reservation list', () => {
    expect(service.classifyTier([])).toBe('TIER3');
  });
});
