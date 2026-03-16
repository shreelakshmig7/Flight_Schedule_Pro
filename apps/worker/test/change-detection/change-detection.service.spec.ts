/**
 * change-detection.service.spec.ts
 * ----------------------------------
 * Agentic Scheduler — FSP Integration — ChangeDetectionService unit tests
 * -------------------------------------------------------------------------
 * Covers: hash-unchanged early exit, first-poll (no previous hash),
 * DiscoveryProspect creation, ChangeEventMessage publication, lastPollHash
 * update, lastPolledAt update, deduplication of incoming reservations, and
 * correct no-op when hash is unchanged.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-9 — Change Detection Engine
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectionService } from '../../src/change-detection/change-detection.service';
import { ReservationDiffService } from '../../src/change-detection/reservation-diff.service';
import type { FspReservation } from '@fsp-scheduler/shared-types';
import type { PrismaService } from '@fsp-scheduler/database';
import type { ChangeEventPublisher } from '../../src/service-bus/publishers/change-event.publisher';

/** Builds a minimal FspReservation. */
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

describe('ChangeDetectionService', () => {
  let diffService: ReservationDiffService;
  let prisma: {
    operator: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    discoveryProspect: {
      create: ReturnType<typeof vi.fn>;
    };
  };
  let changeEventPublisher: { publishChangeEvent: ReturnType<typeof vi.fn> };
  let service: ChangeDetectionService;

  beforeEach(() => {
    diffService = new ReservationDiffService();

    prisma = {
      operator: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
      discoveryProspect: {
        create: vi.fn().mockResolvedValue({ id: 'dp-1' }),
      },
    };

    changeEventPublisher = {
      publishChangeEvent: vi.fn().mockResolvedValue(undefined),
    };

    service = new ChangeDetectionService(
      diffService,
      prisma as unknown as PrismaService,
      changeEventPublisher as unknown as ChangeEventPublisher,
    );
  });

  // ── lastPolledAt always updated ────────────────────────────────────────────

  it('updates lastPolledAt on every call regardless of hash change', async () => {
    const reservations = [makeReservation('r1')];
    const hash = diffService.computeHash(reservations);
    // Hash matches existing — no change should be detected
    prisma.operator.findUnique.mockResolvedValue({
      id: 'db-1',
      lastPollHash: hash,
    });

    await service.processSnapshot('op1', 1, [], reservations);

    expect(prisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { operatorId: 'op1' },
        data: expect.objectContaining({ lastPolledAt: expect.any(Date) }),
      }),
    );
  });

  // ── hash unchanged — early exit ────────────────────────────────────────────

  it('does not publish any events when the hash is unchanged', async () => {
    const reservations = [makeReservation('r1')];
    const hash = diffService.computeHash(reservations);
    prisma.operator.findUnique.mockResolvedValue({ id: 'db-1', lastPollHash: hash });

    await service.processSnapshot('op1', 1, reservations, reservations);

    expect(changeEventPublisher.publishChangeEvent).not.toHaveBeenCalled();
    expect(prisma.discoveryProspect.create).not.toHaveBeenCalled();
  });

  it('does not update lastPollHash when the hash is unchanged', async () => {
    const reservations = [makeReservation('r1')];
    const hash = diffService.computeHash(reservations);
    prisma.operator.findUnique.mockResolvedValue({ id: 'db-1', lastPollHash: hash });

    await service.processSnapshot('op1', 1, reservations, reservations);

    // Only lastPolledAt update should fire; no lastPollHash update
    const updateCalls = prisma.operator.update.mock.calls as Array<[{ data: Record<string, unknown> }]>;
    const hashUpdateCalls = updateCalls.filter(
      ([args]) => 'lastPollHash' in args.data,
    );
    expect(hashUpdateCalls).toHaveLength(0);
  });

  // ── first poll (no previous hash) ─────────────────────────────────────────

  it('runs change detection on first poll when there is no previous hash', async () => {
    prisma.operator.findUnique.mockResolvedValue({ id: 'db-1', lastPollHash: null });
    const newReservations = [makeReservation('r1', { studentId: 's1' })];

    // No previous reservations (first poll) → r1 appears new but we only track removals,
    // so no changes. The hash update IS expected though.
    await service.processSnapshot('op1', 1, [], newReservations);

    expect(prisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastPollHash: expect.any(String) }),
      }),
    );
  });

  // ── change detection when hash differs ────────────────────────────────────

  it('publishes a ChangeEventMessage for each detected change', async () => {
    prisma.operator.findUnique.mockResolvedValue({ id: 'db-1', lastPollHash: 'old-hash' });

    const prev = [makeReservation('r1', { studentId: 's1' })];
    const next: FspReservation[] = []; // r1 cancelled → CANCELLATION + NEW_OPENING

    await service.processSnapshot('op1', 1, prev, next);

    // CANCELLATION + NEW_OPENING both emitted
    expect(changeEventPublisher.publishChangeEvent).toHaveBeenCalledTimes(2);
  });

  it('creates a DiscoveryProspect record for each detected change', async () => {
    prisma.operator.findUnique.mockResolvedValue({ id: 'db-1', lastPollHash: 'old-hash' });
    const prev = [makeReservation('r1', { studentId: 's1' })];

    await service.processSnapshot('op1', 1, prev, []);

    expect(prisma.discoveryProspect.create).toHaveBeenCalledTimes(2);
    expect(prisma.discoveryProspect.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operatorId: 'op1',
          fspOperatorId: 1,
          reservationId: 'r1',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('updates lastPollHash in DB when hash has changed', async () => {
    prisma.operator.findUnique.mockResolvedValue({ id: 'db-1', lastPollHash: 'old-hash' });
    const newReservations = [makeReservation('r1')];
    const expectedHash = diffService.computeHash(newReservations);

    await service.processSnapshot('op1', 1, [], newReservations);

    expect(prisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastPollHash: expectedHash }),
      }),
    );
  });

  // ── deduplication ─────────────────────────────────────────────────────────

  it('deduplicates incoming reservations before computing the hash', async () => {
    prisma.operator.findUnique.mockResolvedValue({ id: 'db-1', lastPollHash: null });

    const r1 = makeReservation('r1');
    const r1Dupe = makeReservation('r1'); // same id
    const expectedHash = diffService.computeHash([r1]); // single entry

    await service.processSnapshot('op1', 1, [], [r1, r1Dupe]);

    expect(prisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastPollHash: expectedHash }),
      }),
    );
  });

  // ── ChangeEventMessage content ─────────────────────────────────────────────

  it('includes operatorId, fspOperatorId, reservationId and changeType in each ChangeEventMessage', async () => {
    prisma.operator.findUnique.mockResolvedValue({ id: 'db-1', lastPollHash: 'old' });
    const prev = [makeReservation('r1', { studentId: 's1', aircraftId: null, instructorId: null })];

    await service.processSnapshot('op1', 1, prev, []);

    expect(changeEventPublisher.publishChangeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'op1',
        fspOperatorId: 1,
        reservationId: 'r1',
        changeType: 'CANCELLATION',
      }),
    );
  });
});
