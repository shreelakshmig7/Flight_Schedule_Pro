/**
 * discovery-use-case.service.spec.ts
 * ------------------------------------
 * Agentic Scheduler — FSP Integration — Unit tests for DiscoveryUseCaseService
 * -------------------------------------------------------------------------------
 * Tests cover the Discovery use case (Use Case C — PR-15). The service handles
 * DISCOVERY_REQUEST ChangeEventMessages and finds up to DISCOVERY_MAX_SUGGESTIONS
 * civil-twilight-filtered slots for a discovery flight prospect.
 *
 * Eval cases covered:
 *   fsp-006 — 3 preferred dates, all within twilight, slots found → 3 PENDING suggestions
 *   fsp-007 — no preferred dates → search window used → 1+ PENDING suggestions
 *   fsp-019 — no eligible aircraft configured → log + return, 0 suggestions
 *   fsp-033 — all preferred dates outside civil twilight → log + return, 0 suggestions
 *   fsp-034 — slots returned with ineligible instructor → filtered out, only eligible used
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-15 — Use Case C — Discovery
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { DiscoveryUseCaseService } from '../../src/use-cases/discovery/discovery-use-case.service';
import type { ChangeEventMessage } from '@fsp-scheduler/shared-types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OPERATOR_ID = 'test-operator-001';
const FSP_OPERATOR_ID = 1001;

const POLICY_CONFIG = {
  discoveryEligibleInstructorIds: ['usr-instr-001', 'usr-instr-002'],
  discoveryEligibleAircraftIds: ['ac-001', 'ac-002'],
  discoverySearchWindowDays: 14,
};

/** Base DISCOVERY_REQUEST event with 3 preferred dates. */
const BASE_EVENT: ChangeEventMessage = {
  operatorId: OPERATOR_ID,
  fspOperatorId: FSP_OPERATOR_ID,
  correlationId: 'corr-discovery-001',
  enqueuedAt: '2026-03-15T10:00:00Z',
  changeType: 'DISCOVERY_REQUEST',
  reservationId: 'prospect-001',
  detectedAt: '2026-03-15T10:00:00Z',
  rawDiff: {
    prospectId: 'prospect-001',
    locationId: 'loc-001',
    preferredDates: ['2025-10-16', '2025-10-17', '2025-10-18'],
  },
};

const makeTwilight = (date: string): Record<string, string> => ({
  locationId: 'loc-001',
  date,
  civilTwilightBegin: `${date}T06:00:00Z`,
  civilTwilightEnd: `${date}T22:00:00Z`,
});

const GOOD_TWILIGHT: Record<string, ReturnType<typeof makeTwilight>> = {
  '2025-10-16': makeTwilight('2025-10-16'),
  '2025-10-17': makeTwilight('2025-10-17'),
  '2025-10-18': makeTwilight('2025-10-18'),
};

/** Slots returned by FindATimeService — one per preferred date, eligible instructors. */
const THREE_SLOTS = [
  { startDateTime: '2025-10-16T14:00:00Z', endDateTime: '2025-10-16T16:00:00Z', instructorId: 'usr-instr-001', aircraftId: 'ac-001' },
  { startDateTime: '2025-10-17T14:00:00Z', endDateTime: '2025-10-17T16:00:00Z', instructorId: 'usr-instr-002', aircraftId: 'ac-002' },
  { startDateTime: '2025-10-18T14:00:00Z', endDateTime: '2025-10-18T16:00:00Z', instructorId: 'usr-instr-001', aircraftId: 'ac-001' },
];

// ── Mock factory ─────────────────────────────────────────────────────────────

function makeService(overrides: {
  slots?: typeof THREE_SLOTS;
  policyConfig?: typeof POLICY_CONFIG | null;
  twilight?: Record<string, ReturnType<typeof makeTwilight>> | null;
  validateSuccess?: boolean;
} = {}): Record<string, unknown> {
  const {
    slots = THREE_SLOTS,
    policyConfig = POLICY_CONFIG,
    twilight = GOOD_TWILIGHT,
    validateSuccess = true,
  } = overrides;

  const prisma = {
    operator: {
      findUnique: vi.fn().mockResolvedValue({ policyConfig: policyConfig ?? null }),
    },
    suggestion: {
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        const s = { id: `sug-${Math.random().toString(36).slice(2)}`, ...args.data };
        createdSuggestions.push(s);
        return Promise.resolve(s);
      }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-001' }) },
  };

  const createdSuggestions: Record<string, unknown>[] = [];

  const civilTwilightService = {
    getCivilTwilight: vi.fn().mockImplementation(
      (_op: string, _loc: string, date: string) => {
        if (!twilight) return Promise.resolve({ success: false, error: 'no data' });
        const tw = twilight[date];
        return tw
          ? Promise.resolve({ success: true, data: tw })
          : Promise.resolve({ success: false, error: 'no data' });
      },
    ),
  };

  const findATimeService = {
    getAvailableSlots: vi.fn().mockResolvedValue({ success: true, data: slots }),
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
      rationale: 'A suitable discovery flight slot has been identified for the prospect.',
      confidence: 0.82,
      usedFallback: false,
    }),
  };

  const service = new DiscoveryUseCaseService(
    prisma as never,
    civilTwilightService as never,
    findATimeService as never,
    reservationsService as never,
    rationaleGenerator as never,
  );

  return {
    service,
    prisma,
    civilTwilightService,
    findATimeService,
    reservationsService,
    rationaleGenerator,
    createdSuggestions,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DiscoveryUseCaseService', () => {
  // ── fsp-006: Happy path — 3 preferred dates, all daylight → 3 PENDING suggestions ──

  describe('fsp-006: happy path — preferred dates within civil twilight', () => {
    it('creates 3 PENDING suggestions when 3 slots pass all constraints', async () => {
      const { service, createdSuggestions } = makeService();

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(createdSuggestions).toHaveLength(3);
      for (const s of createdSuggestions) {
        expect(s.status).toBe('PENDING');
        expect(s.operatorId).toBe(OPERATOR_ID);
      }
    });

    it('sets useCaseType to DISCOVERY on each suggestion', async () => {
      const { service, createdSuggestions } = makeService();

      await service.processDiscoveryRequest(BASE_EVENT);

      for (const s of createdSuggestions) {
        expect(s.useCaseType).toBe('DISCOVERY');
      }
    });

    it('stores prospectId in each suggestion candidatePayload', async () => {
      const { service, createdSuggestions } = makeService();

      await service.processDiscoveryRequest(BASE_EVENT);

      for (const s of createdSuggestions) {
        const payload = s.candidatePayload as { prospectId: string };
        expect(payload.prospectId).toBe('prospect-001');
      }
    });

    it('calls getCivilTwilight for each preferred date', async () => {
      const { service, civilTwilightService } = makeService();

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(civilTwilightService.getCivilTwilight).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID), 'loc-001', '2025-10-16',
      );
      expect(civilTwilightService.getCivilTwilight).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID), 'loc-001', '2025-10-17',
      );
      expect(civilTwilightService.getCivilTwilight).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID), 'loc-001', '2025-10-18',
      );
    });

    it('calls FindATimeService with eligible instructorIds and aircraftIds', async () => {
      const { service, findATimeService } = makeService();

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(findATimeService.getAvailableSlots).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        expect.objectContaining({
          preferredInstructorIds: ['usr-instr-001', 'usr-instr-002'],
          preferredAircraftIds: ['ac-001', 'ac-002'],
        }),
      );
    });

    it('calls validateReservation for each valid slot', async () => {
      const { service, reservationsService } = makeService();

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(reservationsService.validateReservation).toHaveBeenCalledTimes(3);
    });

    it('generates LLM rationale for each created suggestion', async () => {
      const { service, rationaleGenerator } = makeService();

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(rationaleGenerator.generateRationale).toHaveBeenCalledTimes(3);
    });

    it('writes an AuditLog for each suggestion', async () => {
      const { service, prisma } = makeService();

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
    });

    it('only uses slots with eligible aircraft (not ac-003)', async () => {
      const slotsWithIneligible = [
        ...THREE_SLOTS,
        { startDateTime: '2025-10-19T14:00:00Z', endDateTime: '2025-10-19T16:00:00Z', instructorId: 'usr-instr-001', aircraftId: 'ac-003' },
      ];
      const twilight = { ...GOOD_TWILIGHT, '2025-10-19': makeTwilight('2025-10-19') };
      const { service, createdSuggestions } = makeService({ slots: slotsWithIneligible, twilight });

      await service.processDiscoveryRequest(BASE_EVENT);

      // ac-003 is not in eligible list → at most 3 from eligible slots
      for (const s of createdSuggestions) {
        const payload = s.candidatePayload as { aircraftId: string };
        expect(payload.aircraftId).not.toBe('ac-003');
      }
    });
  });

  // ── fsp-007: No preferred dates → use search window ──────────────────────────

  describe('fsp-007: no preferred dates → use search window', () => {
    it('still calls FindATimeService when preferredDates is empty', async () => {
      const { service, findATimeService } = makeService({ slots: [THREE_SLOTS[0]], twilight: { '2025-10-16': makeTwilight('2025-10-16') } });

      const noPreferredDatesEvent: ChangeEventMessage = {
        ...BASE_EVENT,
        rawDiff: {
          prospectId: 'prospect-002',
          locationId: 'loc-001',
          preferredDates: [],
        },
      };

      await service.processDiscoveryRequest(noPreferredDatesEvent);

      expect(findATimeService.getAvailableSlots).toHaveBeenCalled();
    });

    it('creates PENDING suggestions from search window slots', async () => {
      const { service, createdSuggestions } = makeService({
        slots: [THREE_SLOTS[0]],
        twilight: { '2025-10-16': makeTwilight('2025-10-16') },
      });

      const noPreferredDatesEvent: ChangeEventMessage = {
        ...BASE_EVENT,
        rawDiff: { prospectId: 'prospect-002', locationId: 'loc-001', preferredDates: [] },
      };

      await service.processDiscoveryRequest(noPreferredDatesEvent);

      expect(createdSuggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('uses discoverySearchWindowDays from policyConfig for the date range', async () => {
      const { service, findATimeService } = makeService({
        slots: [THREE_SLOTS[0]],
        twilight: { '2025-10-16': makeTwilight('2025-10-16') },
      });

      const event: ChangeEventMessage = {
        ...BASE_EVENT,
        rawDiff: { prospectId: 'prospect-002', locationId: 'loc-001', preferredDates: [] },
      };

      await service.processDiscoveryRequest(event);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callArgs = (findATimeService.getAvailableSlots as any).mock.calls[0][1] as Record<string, unknown>;
      // endDate should be approx 14 days after startDate
      const start = new Date(callArgs.startDate as string);
      const end = new Date(callArgs.endDate as string);
      const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(14);
    });
  });

  // ── fsp-019: No eligible aircraft → log + return, 0 suggestions ──────────────

  describe('fsp-019: no eligible aircraft configured', () => {
    it('logs "no eligible aircraft" when discoveryEligibleAircraftIds is empty', async () => {
      const { service } = makeService({
        policyConfig: { ...POLICY_CONFIG, discoveryEligibleAircraftIds: [] },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      await service.processDiscoveryRequest(BASE_EVENT);

      const warnMessages = warnSpy.mock.calls.map(c => String(c[0]));
      expect(warnMessages.some(m => m.includes('no eligible aircraft'))).toBe(true);
    });

    it('logs "no suggestions created" when no eligible aircraft', async () => {
      const { service } = makeService({
        policyConfig: { ...POLICY_CONFIG, discoveryEligibleAircraftIds: [] },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      await service.processDiscoveryRequest(BASE_EVENT);

      const warnMessages = warnSpy.mock.calls.map(c => String(c[0]));
      expect(warnMessages.some(m => m.includes('no suggestions created'))).toBe(true);
    });

    it('creates 0 suggestions and skips FindATimeService when no eligible aircraft', async () => {
      const { service, prisma, findATimeService } = makeService({
        policyConfig: { ...POLICY_CONFIG, discoveryEligibleAircraftIds: [] },
      });

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(prisma.suggestion.create).not.toHaveBeenCalled();
      expect(findATimeService.getAvailableSlots).not.toHaveBeenCalled();
    });
  });

  // ── fsp-033: All preferred dates outside civil twilight ───────────────────────

  describe('fsp-033: preferred dates outside civil twilight', () => {
    it('logs "outside civil twilight" when all dates fall outside twilight window', async () => {
      // Twilight ends at 13:00, but slots are at 14:00–16:00
      const nightTwilight = {
        '2025-10-16': { locationId: 'loc-001', date: '2025-10-16', civilTwilightBegin: '2025-10-16T06:00:00Z', civilTwilightEnd: '2025-10-16T13:00:00Z' },
        '2025-10-17': { locationId: 'loc-001', date: '2025-10-17', civilTwilightBegin: '2025-10-17T06:00:00Z', civilTwilightEnd: '2025-10-17T13:00:00Z' },
        '2025-10-18': { locationId: 'loc-001', date: '2025-10-18', civilTwilightBegin: '2025-10-18T06:00:00Z', civilTwilightEnd: '2025-10-18T13:00:00Z' },
      };

      // Slots starting after twilight ends
      const nightSlots = [
        { startDateTime: '2025-10-16T03:00:00Z', endDateTime: '2025-10-16T05:00:00Z', instructorId: 'usr-instr-001', aircraftId: 'ac-001' },
      ];

      // Preferred dates that are "before sunrise" (03:00 UTC)
      const earlyEvent: ChangeEventMessage = {
        ...BASE_EVENT,
        rawDiff: {
          prospectId: 'prospect-004',
          locationId: 'loc-001',
          preferredDates: ['2025-10-16'],
          preferredTimeUtc: '03:00',
        },
      };

      const { service } = makeService({
        slots: nightSlots,
        twilight: nightTwilight,
        policyConfig: { ...POLICY_CONFIG, discoveryEligibleInstructorIds: ['usr-instr-001'], discoveryEligibleAircraftIds: ['ac-001'] },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      await service.processDiscoveryRequest(earlyEvent);

      const warnMessages = warnSpy.mock.calls.map(c => String(c[0]));
      expect(warnMessages.some(m => m.includes('outside civil twilight') || m.includes('daylight constraint'))).toBe(true);
    });

    it('creates 0 suggestions when all slots fall outside civil twilight', async () => {
      const nightTwilight = {
        '2025-10-16': { locationId: 'loc-001', date: '2025-10-16', civilTwilightBegin: '2025-10-16T06:00:00Z', civilTwilightEnd: '2025-10-16T13:00:00Z' },
        '2025-10-17': { locationId: 'loc-001', date: '2025-10-17', civilTwilightBegin: '2025-10-17T06:00:00Z', civilTwilightEnd: '2025-10-17T13:00:00Z' },
        '2025-10-18': { locationId: 'loc-001', date: '2025-10-18', civilTwilightBegin: '2025-10-18T06:00:00Z', civilTwilightEnd: '2025-10-18T13:00:00Z' },
      };

      const { service, prisma } = makeService({ twilight: nightTwilight });

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('does not call validateReservation when all slots outside twilight', async () => {
      const nightTwilight = {
        '2025-10-16': { locationId: 'loc-001', date: '2025-10-16', civilTwilightBegin: '2025-10-16T06:00:00Z', civilTwilightEnd: '2025-10-16T13:00:00Z' },
        '2025-10-17': { locationId: 'loc-001', date: '2025-10-17', civilTwilightBegin: '2025-10-17T06:00:00Z', civilTwilightEnd: '2025-10-17T13:00:00Z' },
        '2025-10-18': { locationId: 'loc-001', date: '2025-10-18', civilTwilightBegin: '2025-10-18T06:00:00Z', civilTwilightEnd: '2025-10-18T13:00:00Z' },
      };

      const { service, reservationsService } = makeService({ twilight: nightTwilight });

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(reservationsService.validateReservation).not.toHaveBeenCalled();
    });
  });

  // ── fsp-034: Ineligible instructor in returned slots → filtered out ────────────

  describe('fsp-034: eligible instructor filtering', () => {
    it('filters out slots with ineligible instructors', async () => {
      // Mix of eligible (usr-instr-002) and ineligible (usr-instr-001) in policyConfig
      const policyOnlyInstr002 = {
        ...POLICY_CONFIG,
        discoveryEligibleInstructorIds: ['usr-instr-002'],
      };
      // Slots: one with usr-instr-001 (ineligible), one with usr-instr-002 (eligible)
      const mixedSlots = [
        { startDateTime: '2025-10-16T14:00:00Z', endDateTime: '2025-10-16T16:00:00Z', instructorId: 'usr-instr-001', aircraftId: 'ac-001' }, // ineligible
        { startDateTime: '2025-10-17T14:00:00Z', endDateTime: '2025-10-17T16:00:00Z', instructorId: 'usr-instr-002', aircraftId: 'ac-001' }, // eligible
      ];

      const { service, createdSuggestions } = makeService({
        slots: mixedSlots,
        policyConfig: policyOnlyInstr002,
      });

      await service.processDiscoveryRequest(BASE_EVENT);

      // Only the eligible slot should create a suggestion
      expect(createdSuggestions).toHaveLength(1);
      const payload = createdSuggestions[0].candidatePayload as { instructorId: string };
      expect(payload.instructorId).toBe('usr-instr-002');
    });

    it('does not include ineligible instructor (usr-instr-001) in suggestions when only usr-instr-002 eligible', async () => {
      const policyOnlyInstr002 = {
        ...POLICY_CONFIG,
        discoveryEligibleInstructorIds: ['usr-instr-002'],
      };

      const { service, createdSuggestions } = makeService({
        slots: THREE_SLOTS, // includes usr-instr-001 slots
        policyConfig: policyOnlyInstr002,
      });

      await service.processDiscoveryRequest(BASE_EVENT);

      for (const s of createdSuggestions) {
        const payload = s.candidatePayload as { instructorId: string };
        expect(payload.instructorId).not.toBe('usr-instr-001');
      }
    });
  });

  // ── validateReservation filtering ─────────────────────────────────────────────

  describe('validateReservation filtering', () => {
    it('skips slots that fail validateReservation', async () => {
      const { service, prisma } = makeService({ validateSuccess: false });

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('creates suggestions only for slots that pass validation', async () => {
      const reservationsService = {
        validateReservation: vi.fn()
          .mockResolvedValueOnce({ success: true, data: { valid: true } })
          .mockResolvedValue({ success: false, error: 'conflict' }),
      };

      const createdSuggestions: Record<string, unknown>[] = [];
      const prisma = {
        operator: { findUnique: vi.fn().mockResolvedValue({ policyConfig: POLICY_CONFIG }) },
        suggestion: {
          create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
            const s = { id: 'sug-x', ...args.data };
            createdSuggestions.push(s);
            return Promise.resolve(s);
          }),
        },
        auditLog: { create: vi.fn().mockResolvedValue({ id: 'a' }) },
      };

      const svc = new DiscoveryUseCaseService(
        prisma as never,
        { getCivilTwilight: vi.fn().mockImplementation((_op: string, _loc: string, date: string) => Promise.resolve({ success: true, data: makeTwilight(date) })) } as never,
        { getAvailableSlots: vi.fn().mockResolvedValue({ success: true, data: THREE_SLOTS }) } as never,
        reservationsService as never,
        { generateRationale: vi.fn().mockResolvedValue({ rationale: 'A suitable discovery flight slot has been identified.', confidence: 0.8, usedFallback: false }) } as never,
      );

      await svc.processDiscoveryRequest(BASE_EVENT);

      expect(createdSuggestions).toHaveLength(1);
    });
  });

  // ── DISCOVERY_MAX_SUGGESTIONS cap ────────────────────────────────────────────

  describe('suggestion cap', () => {
    it('creates at most 3 suggestions even if more valid slots exist', async () => {
      const fiveSlots = Array.from({ length: 5 }, (_, i) => ({
        startDateTime: `2025-10-${16 + i}T14:00:00Z`,
        endDateTime: `2025-10-${16 + i}T16:00:00Z`,
        instructorId: 'usr-instr-001',
        aircraftId: 'ac-001',
      }));
      const twilight: Record<string, ReturnType<typeof makeTwilight>> = {};
      for (const slot of fiveSlots) {
        twilight[slot.startDateTime.slice(0, 10)] = makeTwilight(slot.startDateTime.slice(0, 10));
      }

      const { service, createdSuggestions } = makeService({ slots: fiveSlots, twilight });

      await service.processDiscoveryRequest(BASE_EVENT);

      expect(createdSuggestions).toHaveLength(3);
    });
  });

  // ── Graceful error handling ─────────────────────────────────────────────────

  describe('graceful error handling', () => {
    it('resolves without throwing when FindATimeService throws', async () => {
      const svc = new DiscoveryUseCaseService(
        {
          operator: { findUnique: vi.fn().mockResolvedValue({ policyConfig: POLICY_CONFIG }) },
          suggestion: { create: vi.fn() },
          auditLog: { create: vi.fn() },
        } as never,
        { getCivilTwilight: vi.fn().mockImplementation((_op: string, _loc: string, date: string) => Promise.resolve({ success: true, data: makeTwilight(date) })) } as never,
        { getAvailableSlots: vi.fn().mockRejectedValue(new Error('FSP timeout')) } as never,
        { validateReservation: vi.fn() } as never,
        { generateRationale: vi.fn() } as never,
      );

      await expect(svc.processDiscoveryRequest(BASE_EVENT)).resolves.toBeUndefined();
    });

    it('resolves without throwing when suggestion.create throws', async () => {
      const { service, prisma } = makeService();
      prisma.suggestion.create = vi.fn().mockRejectedValue(new Error('DB error'));

      await expect(service.processDiscoveryRequest(BASE_EVENT)).resolves.toBeUndefined();
    });
  });
});
