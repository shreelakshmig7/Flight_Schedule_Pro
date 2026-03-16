/**
 * waitlist-use-case.service.spec.ts
 * -----------------------------------
 * Agentic Scheduler — FSP Integration — Use Case A (Waitlist) unit tests
 * -----------------------------------------------------------------------
 * Tests all paths through WaitlistUseCaseService.processNewOpening():
 *
 *   happy path         — top candidate available, squawk-free aircraft,
 *                        validateReservation passes → PENDING suggestion created
 *   fsp-002            — multiple candidates; student with longest flight gap ranks #1
 *   fsp-029            — top candidate unavailable → skip, create for next candidate
 *   fsp-030            — aircraft has open squawk → log exclusion, no suggestion
 *   fsp-031            — all 3 candidates fail validateReservation → no suggestion
 *   edge cases         — no students found, empty squawks treated as available
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-13 — Use Case A — Waitlist
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { WaitlistUseCaseService } from '../../src/use-cases/waitlist/waitlist-use-case.service';
import type { ChangeEventMessage } from '@fsp-scheduler/shared-types';
import {
  WAITLIST_MAX_CANDIDATES_TO_TRY,
  SUGGESTION_STATUS,
  USE_CASE_TYPE,
  SUGGESTION_EXPIRY_HOURS,
} from '@fsp-scheduler/shared-types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Base ChangeEventMessage for a NEW_OPENING event. */
const BASE_EVENT: ChangeEventMessage = {
  operatorId: 'test-operator-001',
  fspOperatorId: 1001,
  changeType: 'NEW_OPENING',
  reservationId: 'opening-slot-001',
  detectedAt: '2025-10-15T12:00:00Z',
  correlationId: 'corr-001',
  enqueuedAt: '2025-10-15T12:00:00Z',
  rawDiff: {
    slotStart: '2025-10-16T14:00:00Z',
    slotEnd: '2025-10-16T16:00:00Z',
    locationId: 'loc-001',
    aircraftId: 'ac-001',
    instructorId: 'usr-instr-001',
    activityTypeId: 'act-001',
  },
};

/** Student records returned by listStudents. */
const STUDENTS = [
  { studentId: 'usr-student-001', firstName: 'Tyler', lastName: 'Brooks', active: true },
  { studentId: 'usr-student-002', firstName: 'Devon', lastName: 'Carter', active: true },
  { studentId: 'usr-student-003', firstName: 'Sam', lastName: 'Kim', active: true },
];

const NOW = new Date('2025-10-15T12:00:00Z');

/** Reservations for a student who hasn't flown in 30 days (high priority). */
function makeReservations30DaysAgo(studentId: string): Record<string, unknown>[] {
  return [
    {
      reservationId: `res-${studentId}-1`,
      startDateTime: '2025-09-15T14:00:00Z',
      endDateTime: '2025-09-15T16:00:00Z',
      status: 'Confirmed',
      studentId,
    },
  ];
}


/** Enrollment progress: 20 of 40 hours completed. */
const ENROLLMENT_PROGRESS = { completedHours: 20, requiredHours: 40 };

/** Enrollment record: one active enrollment. */
function makeEnrollment(studentId: string): Record<string, unknown>[] {
  return [{ enrollmentId: `enroll-${studentId}`, studentId, status: 'active' }];
}

/** Build a mock Prisma service. */
function makeMockPrisma(): Record<string, unknown> {
  return {
    suggestion: {
      create: vi.fn().mockResolvedValue({
        id: 'sugg-001',
        status: SUGGESTION_STATUS.PENDING,
        useCaseType: USE_CASE_TYPE.NEW_OPENING,
        operatorId: 'test-operator-001',
        createdAt: NOW,
      }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-001' }),
    },
    operator: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'op-cuid',
        operatorId: 'test-operator-001',
        priorityWeights: null,
      }),
    },
  };
}

/** Build a mock StudentsService. */
function makeMockStudents(students = STUDENTS): Record<string, unknown> {
  return { listStudents: vi.fn().mockResolvedValue({ success: true, data: students }) };
}

/** Build a mock ReservationsService. */
function makeMockReservations(
  reservationsByStudent: Record<string, object[]> = {},
  validateSuccess = true,
): Record<string, unknown> {
  return {
    getReservationsForPerson: vi.fn().mockImplementation(
      (_opId: string, studentId: string) => {
        const resos = reservationsByStudent[studentId] ?? makeReservations30DaysAgo(studentId);
        return Promise.resolve({ success: true, data: resos });
      },
    ),
    validateReservation: vi.fn().mockResolvedValue(
      validateSuccess
        ? { success: true, data: {} }
        : { success: false, error: 'Conflict', data: null },
    ),
  };
}

/** Build a mock EnrollmentService. */
function makeMockEnrollment(): Record<string, unknown> {
  return {
    getEnrollments: vi.fn().mockImplementation((_opId: string, studentId: string) =>
      Promise.resolve({ success: true, data: makeEnrollment(studentId) }),
    ),
    getProgress: vi.fn().mockResolvedValue({
      success: true,
      data: {
        enrollmentId: 'enroll-1',
        completedHours: ENROLLMENT_PROGRESS.completedHours,
        requiredHours: ENROLLMENT_PROGRESS.requiredHours,
      },
    }),
  };
}

/** Build a mock AircraftService with clean squawks (no open write-ups). */
function makeMockAircraft(hasOpenSquawk = false): Record<string, unknown> {
  return {
    getSquawks: vi.fn().mockResolvedValue({
      success: true,
      data: hasOpenSquawk
        ? [{ squawkId: 'sq-1', aircraftId: 'ac-003', description: 'Oil leak', resolvedAt: null }]
        : [],
    }),
  };
}

/** Build a mock AvailabilityService where all students are available. */
function makeMockAvailability(availableStudentIds: string[] | 'all' = 'all'): Record<string, unknown> {
  return {
    getBatchAvailability: vi.fn().mockImplementation(
      (_opId: string, req: { userIds: string[] }) => {
        const results = req.userIds.map((uid: string) => ({
          userId: uid,
          date: '2025-10-16',
          available:
            availableStudentIds === 'all' || availableStudentIds.includes(uid),
        }));
        return Promise.resolve({ success: true, data: { results } });
      },
    ),
  };
}

/** Build a mock RationaleGenerator. */
function makeMockRationaleGenerator(): Record<string, unknown> {
  return {
    generateRationale: vi.fn().mockResolvedValue({
      rationale: 'Tyler Brooks was selected because he has the highest priority score.',
      confidence: 0.87,
      constraintsSatisfied: ['Student available', 'Aircraft available', 'Validation passed'],
      usedFallback: false,
      confidenceOverridden: false,
    }),
  };
}

/** Build a mock PriorityWeightEngine that scores students in array order. */
function makeMockEngine(studentIds: string[] = STUDENTS.map(s => s.studentId)): Record<string, unknown> {
  return {
    scoreCandidates: vi.fn().mockReturnValue(
      studentIds.map((id, idx) => ({
        studentId: id,
        score: 1.0 - idx * 0.1,
        signals: { timeSinceLastFlight: 0.9 - idx * 0.1 },
      })),
    ),
    getDefaultConfig: vi.fn().mockReturnValue({
      timeSinceLastFlight: 0.5,
      timeUntilNextScheduledFlight: 0.3,
      totalFlightHours: 0.2,
      flightHoursHigherIsBetter: false,
      customSignals: {},
    }),
  };
}

/** Instantiate WaitlistUseCaseService with provided mocks. */
function makeService(overrides: {
  students?: ReturnType<typeof makeMockStudents>;
  reservations?: ReturnType<typeof makeMockReservations>;
  enrollment?: ReturnType<typeof makeMockEnrollment>;
  aircraft?: ReturnType<typeof makeMockAircraft>;
  availability?: ReturnType<typeof makeMockAvailability>;
  rationale?: ReturnType<typeof makeMockRationaleGenerator>;
  engine?: ReturnType<typeof makeMockEngine>;
  prisma?: ReturnType<typeof makeMockPrisma>;
} = {}): Record<string, unknown> {
  const prisma = overrides.prisma ?? makeMockPrisma();
  const studentsService = overrides.students ?? makeMockStudents();
  const reservationsService = overrides.reservations ?? makeMockReservations();
  const enrollmentService = overrides.enrollment ?? makeMockEnrollment();
  const aircraftService = overrides.aircraft ?? makeMockAircraft();
  const availabilityService = overrides.availability ?? makeMockAvailability();
  const rationaleGenerator = overrides.rationale ?? makeMockRationaleGenerator();
  const priorityWeightEngine = overrides.engine ?? makeMockEngine();

  const service = new WaitlistUseCaseService(
    prisma as never,
    studentsService as never,
    reservationsService as never,
    enrollmentService as never,
    aircraftService as never,
    availabilityService as never,
    rationaleGenerator as never,
    priorityWeightEngine as never,
  );
  return {
    service,
    prisma,
    studentsService,
    reservationsService,
    enrollmentService,
    aircraftService,
    availabilityService,
    rationaleGenerator,
    priorityWeightEngine,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('WaitlistUseCaseService', () => {

  // ── Happy path ────────────────────────────────────────────────────────────

  describe('happy path — valid opening, top candidate selected', () => {
    it('creates a PENDING suggestion in the database', async () => {
      const { service, prisma } = makeService();
      await service.processNewOpening(BASE_EVENT);
      expect(prisma.suggestion.create).toHaveBeenCalledOnce();
      const arg = prisma.suggestion.create.mock.calls[0][0];
      expect(arg.data.status).toBe(SUGGESTION_STATUS.PENDING);
    });

    it('suggestion has useCaseType NEW_OPENING', async () => {
      const { service, prisma } = makeService();
      await service.processNewOpening(BASE_EVENT);
      const arg = prisma.suggestion.create.mock.calls[0][0];
      expect(arg.data.useCaseType).toBe(USE_CASE_TYPE.NEW_OPENING);
    });

    it('suggestion is for the top-ranked candidate', async () => {
      const { service, prisma } = makeService();
      await service.processNewOpening(BASE_EVENT);
      const arg = prisma.suggestion.create.mock.calls[0][0];
      // Top candidate from engine is usr-student-001
      const payload = arg.data.candidatePayload as Record<string, unknown>;
      expect(payload.studentId).toBe('usr-student-001');
    });

    it('suggestion expiresAt is approximately SUGGESTION_EXPIRY_HOURS in the future', async () => {
      const { service, prisma } = makeService();
      const before = Date.now();
      await service.processNewOpening(BASE_EVENT);
      const after = Date.now();
      const arg = prisma.suggestion.create.mock.calls[0][0];
      const expiresAt: Date = arg.data.expiresAt;
      const expectedMin = before + SUGGESTION_EXPIRY_HOURS * 60 * 60 * 1000 - 5000;
      const expectedMax = after + SUGGESTION_EXPIRY_HOURS * 60 * 60 * 1000 + 5000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('rationale is stored on the suggestion', async () => {
      const { service, prisma } = makeService();
      await service.processNewOpening(BASE_EVENT);
      const arg = prisma.suggestion.create.mock.calls[0][0];
      expect(arg.data.llmResponse).toBeTruthy();
    });

    it('calls FSP validateReservation exactly once on success', async () => {
      const { service, reservationsService } = makeService();
      await service.processNewOpening(BASE_EVENT);
      expect(reservationsService.validateReservation).toHaveBeenCalledOnce();
    });

    it('checks aircraft squawks before iterating candidates', async () => {
      const { service, aircraftService } = makeService();
      await service.processNewOpening(BASE_EVENT);
      expect(aircraftService.getSquawks).toHaveBeenCalledOnce();
    });

    it('writes an AuditLog entry on success', async () => {
      const { service, prisma } = makeService();
      await service.processNewOpening(BASE_EVENT);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('scores candidates using PriorityWeightEngine', async () => {
      const { service, priorityWeightEngine } = makeService();
      await service.processNewOpening(BASE_EVENT);
      expect(priorityWeightEngine.scoreCandidates).toHaveBeenCalledOnce();
    });

    it('calls RationaleGenerator with sanitised input (no raw FSP objects)', async () => {
      const { service, rationaleGenerator } = makeService();
      await service.processNewOpening(BASE_EVENT);
      expect(rationaleGenerator.generateRationale).toHaveBeenCalledOnce();
      const rationaleInput = rationaleGenerator.generateRationale.mock.calls[0][0];
      // Must be a structured RationaleInput, not a raw FSP response object
      expect(rationaleInput).toHaveProperty('student');
      expect(rationaleInput).toHaveProperty('proposedSlot');
      expect(rationaleInput).toHaveProperty('constraintResults');
    });
  });

  // ── fsp-002 — candidate ranking ────────────────────────────────────────────

  describe('[fsp-002] multiple candidates — highest priority wins', () => {
    it('selects the student ranked #1 by PriorityWeightEngine', async () => {
      // Engine returns usr-student-005 as top (38 days since last flight)
      const engine = makeMockEngine(['usr-student-005', 'usr-student-001', 'usr-student-003']);
      const students = makeMockStudents([
        { studentId: 'usr-student-001', firstName: 'Tyler', lastName: 'Brooks', active: true },
        { studentId: 'usr-student-005', firstName: 'Devon', lastName: 'Carter', active: true },
        { studentId: 'usr-student-003', firstName: 'Sam', lastName: 'Kim', active: true },
      ]);
      const { service, prisma } = makeService({ engine, students });
      await service.processNewOpening(BASE_EVENT);
      const arg = prisma.suggestion.create.mock.calls[0][0];
      const payload = arg.data.candidatePayload as Record<string, unknown>;
      expect(payload.studentId).toBe('usr-student-005');
    });
  });

  // ── fsp-029 — availability constraint ─────────────────────────────────────

  describe('[fsp-029] top candidate unavailable — skip and try next', () => {
    it('does NOT create suggestion for unavailable top candidate', async () => {
      const topStudentId = 'usr-student-001';
      const availability = makeMockAvailability(['usr-student-002', 'usr-student-003']);
      const { service, prisma } = makeService({ availability });
      await service.processNewOpening(BASE_EVENT);
      const arg = prisma.suggestion.create.mock.calls[0][0];
      const payload = arg.data.candidatePayload as Record<string, unknown>;
      expect(payload.studentId).not.toBe(topStudentId);
    });

    it('creates suggestion for the second-ranked candidate', async () => {
      const availability = makeMockAvailability(['usr-student-002', 'usr-student-003']);
      const { service, prisma } = makeService({ availability });
      await service.processNewOpening(BASE_EVENT);
      const arg = prisma.suggestion.create.mock.calls[0][0];
      const payload = arg.data.candidatePayload as Record<string, unknown>;
      expect(payload.studentId).toBe('usr-student-002');
    });

    it('creates exactly one PENDING suggestion', async () => {
      const availability = makeMockAvailability(['usr-student-002', 'usr-student-003']);
      const { service, prisma } = makeService({ availability });
      await service.processNewOpening(BASE_EVENT);
      expect(prisma.suggestion.create).toHaveBeenCalledOnce();
    });
  });

  // ── fsp-030 — open squawk ─────────────────────────────────────────────────

  describe('[fsp-030] aircraft has open squawk — no suggestion', () => {
    it('does not create any suggestion', async () => {
      const aircraft = makeMockAircraft(true);
      const { service, prisma } = makeService({ aircraft });
      await service.processNewOpening(BASE_EVENT);
      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('does not call StudentsService after detecting open squawk', async () => {
      const aircraft = makeMockAircraft(true);
      const { service, studentsService } = makeService({ aircraft });
      await service.processNewOpening(BASE_EVENT);
      expect(studentsService.listStudents).not.toHaveBeenCalled();
    });

    it('checks squawks before fetching students', async () => {
      const aircraft = makeMockAircraft(true);
      const callOrder: string[] = [];
      // eslint-disable-next-line @typescript-eslint/require-await
      aircraft.getSquawks = vi.fn().mockImplementation(async () => {
        callOrder.push('squawks');
        return { success: true, data: [{ squawkId: 'sq-1', resolvedAt: null }] };
      });
      const students = makeMockStudents();
      // eslint-disable-next-line @typescript-eslint/require-await
      students.listStudents = vi.fn().mockImplementation(async () => {
        callOrder.push('students');
        return { success: true, data: STUDENTS };
      });
      const { service } = makeService({ aircraft, students });
      await service.processNewOpening(BASE_EVENT);
      expect(callOrder).not.toContain('students');
      expect(callOrder).toContain('squawks');
    });
  });

  // ── fsp-031 — all validations fail ────────────────────────────────────────

  describe('[fsp-031] all candidates fail validateReservation — no suggestion', () => {
    it('does not create any suggestion when all 3 candidates fail validation', async () => {
      const reservations = makeMockReservations({}, false); // validateSuccess = false
      const { service, prisma } = makeService({ reservations });
      await service.processNewOpening(BASE_EVENT);
      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('attempts exactly WAITLIST_MAX_CANDIDATES_TO_TRY candidates', async () => {
      const reservations = makeMockReservations({}, false);
      const { service, reservationsService } = makeService({ reservations });
      await service.processNewOpening(BASE_EVENT);
      expect(reservationsService.validateReservation).toHaveBeenCalledTimes(WAITLIST_MAX_CANDIDATES_TO_TRY);
    });

    it('does not call RationaleGenerator when all candidates fail', async () => {
      const reservations = makeMockReservations({}, false);
      const { service, rationaleGenerator } = makeService({ reservations });
      await service.processNewOpening(BASE_EVENT);
      expect(rationaleGenerator.generateRationale).not.toHaveBeenCalled();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('no students found → does not create any suggestion', async () => {
      const students = makeMockStudents([]);
      const engine = makeMockEngine([]);
      // Engine returns empty list for empty candidates
      engine.scoreCandidates = vi.fn().mockReturnValue([]);
      const { service, prisma } = makeService({ students, engine });
      await service.processNewOpening(BASE_EVENT);
      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('handles missing aircraftId in rawDiff gracefully (no squawk check)', async () => {
      const eventWithoutAircraft: ChangeEventMessage = {
        ...BASE_EVENT,
        rawDiff: { slotStart: '2025-10-16T14:00:00Z', slotEnd: '2025-10-16T16:00:00Z' },
      };
      const { service, aircraftService, prisma } = makeService();
      await service.processNewOpening(eventWithoutAircraft);
      expect(aircraftService.getSquawks).not.toHaveBeenCalled();
      // Should still create suggestion if everything else passes
      expect(prisma.suggestion.create).toHaveBeenCalledOnce();
    });

    it('does not throw when StudentsService returns error — returns early', async () => {
      const students = { listStudents: vi.fn().mockResolvedValue({ success: false, error: 'API error', data: null }) };
      const { service, prisma } = makeService({ students });
      await expect(service.processNewOpening(BASE_EVENT)).resolves.not.toThrow();
      expect(prisma.suggestion.create).not.toHaveBeenCalled();
    });

    it('stores operatorId on the suggestion for tenant isolation', async () => {
      const { service, prisma } = makeService();
      await service.processNewOpening(BASE_EVENT);
      const arg = prisma.suggestion.create.mock.calls[0][0];
      expect(arg.data.operatorId).toBe('test-operator-001');
    });
  });
});
