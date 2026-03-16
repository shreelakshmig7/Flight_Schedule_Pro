/**
 * reschedule-use-case.service.spec.ts
 * ------------------------------------
 * Agentic Scheduler — FSP Integration — Unit tests for RescheduleUseCaseService
 * -------------------------------------------------------------------------------
 * Tests cover the Reschedule use case (Use Case B — PR-14). The service handles
 * CANCELLATION ChangeEventMessages and finds up to RESCHEDULE_MAX_SUGGESTIONS
 * alternative slots for the affected student.
 *
 * Eval cases covered:
 *   fsp-004 — 3 slots found, all validate → 3 PENDING suggestions created
 *   fsp-005 — preferSameInstructor=true, same-instructor slots available → prioritised
 *   fsp-018 — preferSameInstructor=true, no same-instructor slots → instructor fallback
 *   fsp-032 — no slots found → log "no slots found" + "no suggestions created", 0 created
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-14 — Use Case B — Reschedule
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { RescheduleUseCaseService } from '../../src/use-cases/reschedule/reschedule-use-case.service';
import type { ChangeEventMessage } from '@fsp-scheduler/shared-types';

// ── Test fixtures ────────────────────────────────────────────────────────────

const OPERATOR_ID = 'test-operator-001';
const FSP_OPERATOR_ID = 1001;

/** Base CANCELLATION event with rawDiff containing cancelled reservation details. */
const BASE_EVENT: ChangeEventMessage = {
  operatorId: OPERATOR_ID,
  fspOperatorId: FSP_OPERATOR_ID,
  correlationId: 'corr-reschedule-001',
  enqueuedAt: '2026-03-15T10:00:00Z',
  changeType: 'CANCELLATION',
  reservationId: 'res-005',
  detectedAt: '2026-03-15T10:00:00Z',
  rawDiff: {
    studentId: 'usr-student-001',
    instructorId: 'usr-instr-001',
    locationId: 'loc-001',
    activityTypeId: 'act-001',
    originalStart: '2025-10-15T14:00:00Z',
    originalEnd: '2025-10-15T16:00:00Z',
  },
};

/** Three alternative slots returned by FindATimeService. */
const THREE_SLOTS = [
  { startDateTime: '2025-10-16T14:00:00Z', endDateTime: '2025-10-16T16:00:00Z', instructorId: 'usr-instr-001' },
  { startDateTime: '2025-10-17T14:00:00Z', endDateTime: '2025-10-17T16:00:00Z', instructorId: 'usr-instr-001' },
  { startDateTime: '2025-10-18T14:00:00Z', endDateTime: '2025-10-18T16:00:00Z', instructorId: 'usr-instr-001' },
];

const makeTwilight = (date: string): Record<string, string> => ({
  locationId: 'loc-001',
  date,
  civilTwilightBegin: `${date}T06:00:00Z`,
  civilTwilightEnd: `${date}T22:00:00Z`,
});

const TWILIGHT_BY_DATE: Record<string, ReturnType<typeof makeTwilight>> = {
  '2025-10-16': makeTwilight('2025-10-16'),
  '2025-10-17': makeTwilight('2025-10-17'),
  '2025-10-18': makeTwilight('2025-10-18'),
};

// ── Mock factory ─────────────────────────────────────────────────────────────

function makeService(overrides: {
  slots?: typeof THREE_SLOTS;
  sameInstructorSlots?: typeof THREE_SLOTS | null;
  policyConfig?: { preferSameInstructor?: boolean } | null;
  available?: boolean;
  validateSuccess?: boolean;
  civilTwilight?: Record<string, ReturnType<typeof makeTwilight>> | null;
} = {}): Record<string, unknown> {
  const {
    slots = THREE_SLOTS,
    sameInstructorSlots,
    policyConfig = null,
    available = true,
    validateSuccess = true,
    civilTwilight = TWILIGHT_BY_DATE,
  } = overrides;

  // findATimeService: if sameInstructorSlots defined, first call returns those,
  // second call (fallback) returns slots.
  let findATimeCallCount = 0;
  const findATimeService = {
    getAvailableSlots: vi.fn().mockImplementation(() => {
      findATimeCallCount++;
      if (sameInstructorSlots !== undefined) {
        if (findATimeCallCount === 1) {
          return Promise.resolve({ success: true, data: sameInstructorSlots ?? [] });
        }
        return Promise.resolve({ success: true, data: slots });
      }
      return Promise.resolve({ success: true, data: slots });
    }),
  };

  const civilTwilightService = {
    getCivilTwilight: vi.fn().mockImplementation(
      (_opId: string, _locId: string, date: string) => {
        if (!civilTwilight) return Promise.resolve({ success: false, error: 'no twilight data' });
        const tw = civilTwilight[date];
        return tw
          ? Promise.resolve({ success: true, data: tw })
          : Promise.resolve({ success: false, error: 'no twilight data' });
      },
    ),
  };

  const availabilityService = {
    getBatchAvailability: vi.fn().mockResolvedValue({
      success: true,
      data: { results: [{ userId: 'usr-student-001', available }] },
    }),
  };

  const reservationsService = {
    validateReservation: vi.fn().mockResolvedValue(
      validateSuccess
        ? { success: true, data: { valid: true } }
        : { success: false, error: 'validation failed' },
    ),
  };

  const rationaleGenerator = {
    generateRationale: vi.fn().mockResolvedValue({
      rationale: 'A suitable alternative slot has been found within the rescheduling window.',
      confidence: 0.85,
      usedFallback: false,
    }),
  };

  const createdSuggestions: Record<string, unknown>[] = [];
  let suggestionIdCounter = 0;
  const prisma = {
    operator: {
      findUnique: vi.fn().mockResolvedValue({ policyConfig: policyConfig ?? null }),
    },
    suggestion: {
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        suggestionIdCounter++;
        const suggestion = { id: `sug-${suggestionIdCounter}`, ...args.data };
        createdSuggestions.push(suggestion);
        return Promise.resolve(suggestion);
      }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-001' }),
    },
  };

  const service = new RescheduleUseCaseService(
    prisma as never,
    findATimeService as never,
    civilTwilightService as never,
    availabilityService as never,
    reservationsService as never,
    rationaleGenerator as never,
  );

  return {
    service,
    prisma,
    findATimeService,
    civilTwilightService,
    availabilityService,
    reservationsService,
    rationaleGenerator,
    createdSuggestions,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RescheduleUseCaseService', () => {
  // ── fsp-004: Happy path — 3 slots found, all validate → 3 PENDING suggestions ──

  describe('fsp-004: happy path', () => {
    it('creates 3 PENDING suggestions when 3 alternative slots are found and all validate', async () => {
      const { service, prisma, createdSuggestions } = makeService({ slots: THREE_SLOTS });

      await service.processCancellation(BASE_EVENT);

      expect(prisma.suggestion.create).toHaveBeenCalledTimes(3);
      expect(createdSuggestions).toHaveLength(3);
      for (const s of createdSuggestions) {
        expect(s.status).toBe('PENDING');
        expect(s.operatorId).toBe(OPERATOR_ID);
      }
    });

    it('sets useCaseType to CANCELLATION_FILL on each suggestion', async () => {
      const { service, createdSuggestions } = makeService({ slots: THREE_SLOTS });

      await service.processCancellation(BASE_EVENT);

      for (const s of createdSuggestions) {
        expect(s.useCaseType).toBe('CANCELLATION_FILL');
      }
    });

    it('writes an AuditLog for each suggestion created', async () => {
      const { service, prisma } = makeService({ slots: THREE_SLOTS });

      await service.processCancellation(BASE_EVENT);

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
    });

    it('calls FindATimeService.getAvailableSlots with studentId and durationMinutes', async () => {
      const { service, findATimeService } = makeService({ slots: THREE_SLOTS });

      await service.processCancellation(BASE_EVENT);

      expect(findATimeService.getAvailableSlots).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        expect.objectContaining({
          studentId: 'usr-student-001',
          durationMinutes: 120, // 2h from 14:00 to 16:00
        }),
      );
    });

    it('calls CivilTwilightService for each unique slot date', async () => {
      const { service, civilTwilightService } = makeService({ slots: THREE_SLOTS });

      await service.processCancellation(BASE_EVENT);

      // Three slots on different dates → 3 civil twilight calls
      expect(civilTwilightService.getCivilTwilight).toHaveBeenCalledTimes(3);
      expect(civilTwilightService.getCivilTwilight).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID), 'loc-001', '2025-10-16',
      );
    });

    it('calls validateReservation for each slot that passes availability', async () => {
      const { service, reservationsService } = makeService({ slots: THREE_SLOTS });

      await service.processCancellation(BASE_EVENT);

      expect(reservationsService.validateReservation).toHaveBeenCalledTimes(3);
    });

    it('includes the studentId in each suggestion candidatePayload', async () => {
      const { service, createdSuggestions } = makeService({ slots: THREE_SLOTS });

      await service.processCancellation(BASE_EVENT);

      for (const s of createdSuggestions) {
        const payload = s.candidatePayload as { studentId: string };
        expect(payload.studentId).toBe('usr-student-001');
      }
    });

    it('generates LLM rationale for each created suggestion', async () => {
      const { service, rationaleGenerator } = makeService({ slots: THREE_SLOTS });

      await service.processCancellation(BASE_EVENT);

      expect(rationaleGenerator.generateRationale).toHaveBeenCalledTimes(3);
    });

    it('stores the rationale in each suggestion llmResponse field', async () => {
      const { service, createdSuggestions } = makeService({ slots: THREE_SLOTS });

      await service.processCancellation(BASE_EVENT);

      for (const s of createdSuggestions) {
        expect(String(s.llmResponse)).toMatch(/suitable alternative/i);
      }
    });
  });

  // ── fsp-005: preferSameInstructor=true, same instructor slots available ──

  describe('fsp-005: preferSameInstructor=true — same instructor slots available', () => {
    it('passes preferredInstructorIds to getAvailableSlots when preferSameInstructor is true', async () => {
      const { service, findATimeService } = makeService({
        policyConfig: { preferSameInstructor: true },
        sameInstructorSlots: THREE_SLOTS,
        slots: THREE_SLOTS,
      });

      await service.processCancellation(BASE_EVENT);

      expect(findATimeService.getAvailableSlots).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        expect.objectContaining({
          preferredInstructorIds: ['usr-instr-001'],
        }),
      );
    });

    it('creates suggestions from same-instructor slots without needing fallback', async () => {
      const { service, findATimeService, createdSuggestions } = makeService({
        policyConfig: { preferSameInstructor: true },
        sameInstructorSlots: THREE_SLOTS,
        slots: THREE_SLOTS,
      });

      await service.processCancellation(BASE_EVENT);

      // Only one call to FindATimeService (no fallback needed)
      expect(findATimeService.getAvailableSlots).toHaveBeenCalledTimes(1);
      expect(createdSuggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('each suggestion candidatePayload contains the original instructorId', async () => {
      const { service, createdSuggestions } = makeService({
        policyConfig: { preferSameInstructor: true },
        sameInstructorSlots: THREE_SLOTS,
        slots: THREE_SLOTS,
      });

      await service.processCancellation(BASE_EVENT);

      for (const s of createdSuggestions) {
        const payload = s.candidatePayload as { instructorId: string };
        expect(payload.instructorId).toBe('usr-instr-001');
      }
    });
  });

  // ── fsp-018: preferSameInstructor=true, no same-instructor slots → fallback ──

  describe('fsp-018: preferSameInstructor=true — no same-instructor slots → instructor fallback', () => {
    it('calls getAvailableSlots twice: first with instructor, then without (fallback)', async () => {
      const { service, findATimeService } = makeService({
        policyConfig: { preferSameInstructor: true },
        sameInstructorSlots: [], // no same-instructor slots
        slots: THREE_SLOTS,
      });

      await service.processCancellation(BASE_EVENT);

      expect(findATimeService.getAvailableSlots).toHaveBeenCalledTimes(2);
      // First call had preferredInstructorIds
      expect(findATimeService.getAvailableSlots).toHaveBeenNthCalledWith(
        1,
        String(FSP_OPERATOR_ID),
        expect.objectContaining({ preferredInstructorIds: ['usr-instr-001'] }),
      );
      // Second call (fallback) does not have preferredInstructorIds
      const secondCallArgs = findATimeService.getAvailableSlots.mock.calls[1][1] as Record<string, unknown>;
      expect(secondCallArgs).not.toHaveProperty('preferredInstructorIds');
    });

    it('still creates PENDING suggestions from the fallback slots', async () => {
      const { service, createdSuggestions } = makeService({
        policyConfig: { preferSameInstructor: true },
        sameInstructorSlots: [],
        slots: THREE_SLOTS,
      });

      await service.processCancellation(BASE_EVENT);

      expect(createdSuggestions.length).toBeGreaterThanOrEqual(1);
      for (const s of createdSuggestions) {
        expect(s.status).toBe('PENDING');
      }
    });

    it('does not log "no suggestions created" when fallback slots are found', async () => {
      const { service } = makeService({
        policyConfig: { preferSameInstructor: true },
        sameInstructorSlots: [],
        slots: THREE_SLOTS,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      await service.processCancellation(BASE_EVENT);

      const warnMessages = warnSpy.mock.calls.map(c => String(c[0]));
      expect(warnMessages.some(m => m.includes('no suggestions created'))).toBe(false);
    });
  });

  // ── fsp-032: No slots available ──────────────────────────────────────────────

  describe('fsp-032: no alternative slots found', () => {
    it('logs "no slots found" when FindATimeService returns empty array', async () => {
      const { service } = makeService({ slots: [] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      await service.processCancellation(BASE_EVENT);

      const warnMessages = warnSpy.mock.calls.map(c => String(c[0]));
      expect(warnMessages.some(m => m.includes('no slots found'))).toBe(true);
    });

    it('logs "no suggestions created" when no slots available', async () => {
      const { service } = makeService({ slots: [] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      await service.processCancellation(BASE_EVENT);

      const warnMessages = warnSpy.mock.calls.map(c => String(c[0]));
      expect(warnMessages.some(m => m.includes('no suggestions created'))).toBe(true);
    });

    it('does not create any suggestions when no slots available', async () => {
      const { service, prisma } = makeService({ slots: [] });

      await service.processCancellation(BASE_EVENT);

      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('does not call civil twilight service when no slots are found', async () => {
      const { service, civilTwilightService } = makeService({ slots: [] });

      await service.processCancellation(BASE_EVENT);

      expect(civilTwilightService.getCivilTwilight).not.toHaveBeenCalled();
    });

    it('does not call validateReservation when no slots available', async () => {
      const { service, reservationsService } = makeService({ slots: [] });

      await service.processCancellation(BASE_EVENT);

      expect(reservationsService.validateReservation).not.toHaveBeenCalled();
    });
  });

  // ── Availability constraint ─────────────────────────────────────────────────

  describe('availability filtering', () => {
    it('skips all slots when the student is unavailable for all → 0 suggestions', async () => {
      const { service, prisma } = makeService({
        slots: THREE_SLOTS,
        available: false,
      });

      await service.processCancellation(BASE_EVENT);

      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('creates one suggestion when single slot has student available', async () => {
      const { service, createdSuggestions } = makeService({
        slots: [THREE_SLOTS[0]],
        available: true,
      });

      await service.processCancellation(BASE_EVENT);

      expect(createdSuggestions).toHaveLength(1);
    });
  });

  // ── Validation constraint ───────────────────────────────────────────────────

  describe('validateReservation filtering', () => {
    it('skips slots that fail FSP validateReservation', async () => {
      const { service, prisma } = makeService({
        slots: THREE_SLOTS,
        validateSuccess: false,
      });

      await service.processCancellation(BASE_EVENT);

      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('creates a suggestion only for slots that pass validation', async () => {
      const reservationsService = {
        validateReservation: vi.fn()
          .mockResolvedValueOnce({ success: true, data: { valid: true } })
          .mockResolvedValue({ success: false, error: 'slot conflict' }),
      };

      const createdSuggestions: Record<string, unknown>[] = [];
      const prisma = {
        operator: { findUnique: vi.fn().mockResolvedValue({ policyConfig: null }) },
        suggestion: {
          create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
            const s = { id: 'sug-1', ...args.data };
            createdSuggestions.push(s);
            return Promise.resolve(s);
          }),
        },
        auditLog: { create: vi.fn().mockResolvedValue({ id: 'a-1' }) },
      };

      const svc = new RescheduleUseCaseService(
        prisma as never,
        { getAvailableSlots: vi.fn().mockResolvedValue({ success: true, data: THREE_SLOTS }) } as never,
        {
          getCivilTwilight: vi.fn().mockImplementation(
            (_op: string, _loc: string, date: string) =>
              Promise.resolve({ success: true, data: makeTwilight(date) }),
          ),
        } as never,
        {
          getBatchAvailability: vi.fn().mockResolvedValue({
            success: true,
            data: { results: [{ userId: 'usr-student-001', available: true }] },
          }),
        } as never,
        reservationsService as never,
        {
          generateRationale: vi.fn().mockResolvedValue({
            rationale: 'A suitable alternative slot has been identified.',
            confidence: 0.8,
            usedFallback: false,
          }),
        } as never,
      );

      await svc.processCancellation(BASE_EVENT);

      expect(createdSuggestions).toHaveLength(1);
    });
  });

  // ── Civil twilight filtering ────────────────────────────────────────────────

  describe('civil twilight filtering', () => {
    it('excludes slots that end after civil twilight end time', async () => {
      // Slot at 14:00–16:00 UTC, but twilight ends at 13:00 UTC → excluded
      const nightTwilight: Record<string, ReturnType<typeof makeTwilight>> = {
        '2025-10-16': { locationId: 'loc-001', date: '2025-10-16', civilTwilightBegin: '2025-10-16T06:00:00Z', civilTwilightEnd: '2025-10-16T13:00:00Z' },
        '2025-10-17': { locationId: 'loc-001', date: '2025-10-17', civilTwilightBegin: '2025-10-17T06:00:00Z', civilTwilightEnd: '2025-10-17T13:00:00Z' },
        '2025-10-18': { locationId: 'loc-001', date: '2025-10-18', civilTwilightBegin: '2025-10-18T06:00:00Z', civilTwilightEnd: '2025-10-18T13:00:00Z' },
      };

      const { service, prisma } = makeService({
        slots: THREE_SLOTS,
        civilTwilight: nightTwilight,
      });

      await service.processCancellation(BASE_EVENT);

      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('includes slots that end within civil twilight', async () => {
      const { service, createdSuggestions } = makeService({
        slots: [THREE_SLOTS[0]],
        civilTwilight: { '2025-10-16': makeTwilight('2025-10-16') },
      });

      await service.processCancellation(BASE_EVENT);

      expect(createdSuggestions).toHaveLength(1);
    });

    it('allows slots through when civil twilight data is unavailable (fail-open)', async () => {
      const { service, createdSuggestions } = makeService({
        slots: [THREE_SLOTS[0]],
        civilTwilight: null,
      });

      await service.processCancellation(BASE_EVENT);

      // Should still create suggestion (fail-open on twilight error)
      expect(createdSuggestions).toHaveLength(1);
    });
  });

  // ── Graceful error handling ─────────────────────────────────────────────────

  describe('graceful error handling', () => {
    it('resolves without throwing when FindATimeService throws', async () => {
      const svc = new RescheduleUseCaseService(
        {
          operator: { findUnique: vi.fn().mockResolvedValue({ policyConfig: null }) },
          suggestion: { create: vi.fn() },
          auditLog: { create: vi.fn() },
        } as never,
        { getAvailableSlots: vi.fn().mockRejectedValue(new Error('FSP timeout')) } as never,
        { getCivilTwilight: vi.fn() } as never,
        { getBatchAvailability: vi.fn() } as never,
        { validateReservation: vi.fn() } as never,
        { generateRationale: vi.fn() } as never,
      );

      await expect(svc.processCancellation(BASE_EVENT)).resolves.toBeUndefined();
    });

    it('resolves without throwing when prisma.suggestion.create throws', async () => {
      const { service, prisma } = makeService({ slots: [THREE_SLOTS[0]] });
      prisma.suggestion.create = vi.fn().mockRejectedValue(new Error('DB error'));

      await expect(service.processCancellation(BASE_EVENT)).resolves.toBeUndefined();
    });

    it('resolves without throwing when event rawDiff is empty', async () => {
      const { service } = makeService({ slots: [] });

      const emptyRawDiffEvent = { ...BASE_EVENT, rawDiff: {} };

      await expect(service.processCancellation(emptyRawDiffEvent as never)).resolves.toBeUndefined();
    });
  });

  // ── DB operator policyConfig lookup ──────────────────────────────────────────

  describe('operator policyConfig lookup', () => {
    it('reads policyConfig from operator DB record', async () => {
      const { service, prisma } = makeService({
        policyConfig: { preferSameInstructor: false },
        slots: THREE_SLOTS,
      });

      await service.processCancellation(BASE_EVENT);

      expect(prisma.operator.findUnique).toHaveBeenCalledWith({
        where: { operatorId: OPERATOR_ID },
        select: { policyConfig: true },
      });
    });

    it('uses RESCHEDULE_DEFAULT_POLICY_CONFIG when operator policyConfig is null', async () => {
      const { service, findATimeService } = makeService({
        policyConfig: null,
        slots: THREE_SLOTS,
      });

      await service.processCancellation(BASE_EVENT);

      // Default preferSameInstructor=false → no preferredInstructorIds in call
      const callArgs = findATimeService.getAvailableSlots.mock.calls[0][1] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty('preferredInstructorIds');
    });
  });

  // ── RESCHEDULE_MAX_SUGGESTIONS cap ───────────────────────────────────────────

  describe('suggestion cap', () => {
    it('creates at most RESCHEDULE_MAX_SUGGESTIONS (3) suggestions even if more slots exist', async () => {
      const fiveSlots = [
        { startDateTime: '2025-10-16T14:00:00Z', endDateTime: '2025-10-16T16:00:00Z', instructorId: 'usr-instr-001' },
        { startDateTime: '2025-10-17T14:00:00Z', endDateTime: '2025-10-17T16:00:00Z', instructorId: 'usr-instr-001' },
        { startDateTime: '2025-10-18T14:00:00Z', endDateTime: '2025-10-18T16:00:00Z', instructorId: 'usr-instr-001' },
        { startDateTime: '2025-10-19T14:00:00Z', endDateTime: '2025-10-19T16:00:00Z', instructorId: 'usr-instr-001' },
        { startDateTime: '2025-10-20T14:00:00Z', endDateTime: '2025-10-20T16:00:00Z', instructorId: 'usr-instr-001' },
      ];
      const twilight: Record<string, ReturnType<typeof makeTwilight>> = {};
      for (const slot of fiveSlots) {
        const date = slot.startDateTime.slice(0, 10);
        twilight[date] = makeTwilight(date);
      }

      const { service, createdSuggestions } = makeService({
        slots: fiveSlots,
        civilTwilight: twilight,
      });

      await service.processCancellation(BASE_EVENT);

      expect(createdSuggestions).toHaveLength(3);
    });
  });

  // ── durationMinutes calculation ───────────────────────────────────────────────

  describe('durationMinutes calculation', () => {
    it('calculates correct durationMinutes from originalStart and originalEnd', async () => {
      const { service, findATimeService } = makeService({ slots: THREE_SLOTS });

      // BASE_EVENT has 14:00 to 16:00 = 120 minutes
      await service.processCancellation(BASE_EVENT);

      expect(findATimeService.getAvailableSlots).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        expect.objectContaining({ durationMinutes: 120 }),
      );
    });

    it('defaults to 60 minutes when originalStart/End are missing from rawDiff', async () => {
      const { service, findATimeService } = makeService({ slots: [] });

      const noTimesEvent = {
        ...BASE_EVENT,
        rawDiff: { studentId: 'usr-student-001', locationId: 'loc-001', activityTypeId: 'act-001' },
      };

      await service.processCancellation(noTimesEvent as never);

      expect(findATimeService.getAvailableSlots).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        expect.objectContaining({ durationMinutes: 60 }),
      );
    });
  });
});
