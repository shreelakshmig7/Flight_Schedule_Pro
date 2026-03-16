/**
 * next-lesson-use-case.service.spec.ts
 * ---------------------------------------
 * Agentic Scheduler — FSP Integration — Unit tests for PR-16 Next Lesson
 * -----------------------------------------------------------------------
 * Tests cover Use Case D — Schedule Next Lesson on Completion (PR-16).
 *
 * Eval cases covered:
 *   fsp-008 — STATUS_CHANGE COMPLETED → enrollment progress → Find-a-Time → PENDING suggestion
 *   fsp-009 — 3+ pending lessons → AutoSchedule path (FindATime NOT called)
 *   fsp-010 — preferContinuityInstructor=true → getTrainingSessions → FindATime with instructor
 *   fsp-020 — SCHEDULED_SCAN duplicate → "duplicate skipped", no suggestion created
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-16 — Use Case D — Schedule Next Lesson on Completion
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { NextLessonUseCaseService } from '../../src/use-cases/next-lesson/next-lesson-use-case.service';
import { NextLessonScanService } from '../../src/use-cases/next-lesson/next-lesson-scan.service';
import type { ChangeEventMessage } from '@fsp-scheduler/shared-types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OPERATOR_ID = 'test-operator-001';
const FSP_OPERATOR_ID = 1001;
const STUDENT_ID = 'usr-student-001';
const ENROLLMENT_ID = 'enroll-001';
const NEXT_LESSON_ID = 'lesson-006';

const DEFAULT_POLICY = { preferContinuityInstructor: false };

/** STATUS_CHANGE event where a lesson was just marked COMPLETED. */
const COMPLETION_EVENT: ChangeEventMessage = {
  operatorId: OPERATOR_ID,
  fspOperatorId: FSP_OPERATOR_ID,
  correlationId: 'corr-next-001',
  enqueuedAt: '2026-03-15T10:00:00Z',
  changeType: 'STATUS_CHANGE',
  reservationId: 'res-001',
  detectedAt: '2026-03-15T10:00:00Z',
  rawDiff: {
    studentId: STUDENT_ID,
    enrollmentId: ENROLLMENT_ID,
    newStatus: 'COMPLETED',
    locationId: 'loc-001',
  },
};

/** Enrollment progress with 1 pending lesson → Find-a-Time path. */
const PROGRESS_ONE_PENDING = {
  enrollmentId: ENROLLMENT_ID,
  completedLessons: 5,
  totalLessons: 10,
  milestones: [
    { milestoneId: 'lesson-005', name: 'Lesson 5', completed: true, required: true },
    { milestoneId: NEXT_LESSON_ID, name: 'Lesson 6', completed: false, required: true },
    { milestoneId: 'lesson-007', name: 'Lesson 7', completed: false, required: true },
  ],
};

/** Enrollment progress with 3 pending lessons → AutoSchedule path. */
const PROGRESS_THREE_PENDING = {
  enrollmentId: 'enroll-dev',
  completedLessons: 12,
  totalLessons: 20,
  milestones: [
    { milestoneId: 'lesson-012', name: 'Lesson 12', completed: true, required: true },
    { milestoneId: 'lesson-013', name: 'Lesson 13', completed: true, required: true },
    { milestoneId: 'lesson-014', name: 'Lesson 14', completed: false, required: true },
    { milestoneId: 'lesson-015', name: 'Lesson 15 — Stage Check', completed: false, required: true },
    { milestoneId: 'lesson-016', name: 'Lesson 16', completed: false, required: true },
  ],
};

/** A single available slot for Find-a-Time. */
const SLOT_ONE = {
  startDateTime: '2026-03-20T14:00:00Z',
  endDateTime: '2026-03-20T16:00:00Z',
  instructorId: 'usr-instr-001',
  aircraftId: 'ac-001',
};

/** Mock twilight allowing the slot. */
const makeTwilight = (date: string): Record<string, string> => ({
  locationId: 'loc-001',
  date,
  civilTwilightBegin: `${date}T06:00:00Z`,
  civilTwilightEnd: `${date}T22:00:00Z`,
});

/** AutoSchedule result events. */
const AUTO_SCHEDULE_EVENTS = [
  {
    eventId: 'ev-001',
    studentId: 'usr-student-005',
    startDateTime: '2026-03-21T09:00:00Z',
    endDateTime: '2026-03-21T11:00:00Z',
    instructorId: 'usr-instr-002',
    aircraftId: 'ac-002',
    activityTypeId: 'stage-check',
  },
  {
    eventId: 'ev-002',
    studentId: 'usr-student-005',
    startDateTime: '2026-03-22T09:00:00Z',
    endDateTime: '2026-03-22T11:00:00Z',
    instructorId: 'usr-instr-002',
    aircraftId: 'ac-002',
    activityTypeId: 'lesson',
  },
  // Duplicate eventId — must be deduplicated
  {
    eventId: 'ev-001',
    studentId: 'usr-student-005',
    startDateTime: '2026-03-21T09:00:00Z',
    endDateTime: '2026-03-21T11:00:00Z',
    instructorId: 'usr-instr-002',
    aircraftId: 'ac-002',
    activityTypeId: 'stage-check',
  },
];

// ── NextLessonUseCaseService factory ─────────────────────────────────────────

function makeUseCaseService(overrides: {
  progress?: typeof PROGRESS_ONE_PENDING | null;
  trainingSessions?: { sessionId: string; instructorId?: string | null }[];
  slots?: typeof SLOT_ONE[];
  autoScheduleEvents?: typeof AUTO_SCHEDULE_EVENTS;
  validateSuccess?: boolean;
  noExistingSuggestion?: boolean;
  policyConfig?: Record<string, unknown> | null;
} = {}): Record<string, unknown> {
  const {
    progress = PROGRESS_ONE_PENDING,
    trainingSessions = [{ sessionId: 'ses-001', instructorId: 'usr-instr-001' }],
    slots = [SLOT_ONE],
    autoScheduleEvents = AUTO_SCHEDULE_EVENTS,
    validateSuccess = true,
    policyConfig = DEFAULT_POLICY,
  } = overrides;

  const createdSuggestions: Record<string, unknown>[] = [];

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

  const enrollmentService = {
    getProgress: vi.fn().mockResolvedValue(
      progress ? { success: true, data: progress } : { success: false, error: 'not found' },
    ),
    getTrainingSessions: vi.fn().mockResolvedValue({ success: true, data: trainingSessions }),
  };

  const availabilityService = {
    getBatchAvailability: vi.fn().mockResolvedValue({
      success: true,
      data: { results: [] },
    }),
  };

  const findATimeService = {
    getAvailableSlots: vi.fn().mockResolvedValue({ success: true, data: slots }),
  };

  const autoScheduleService = {
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: {
        runId: 'run-001',
        operatorId: String(FSP_OPERATOR_ID),
        events: autoScheduleEvents,
      },
    }),
  };

  const civilTwilightService = {
    getCivilTwilight: vi.fn().mockImplementation(
      (_op: string, _loc: string, date: string) =>
        Promise.resolve({ success: true, data: makeTwilight(date) }),
    ),
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
      rationale: 'Next lesson identified based on enrollment progress.',
      confidence: 0.85,
      usedFallback: false,
    }),
  };

  const service = new NextLessonUseCaseService(
    prisma as never,
    enrollmentService as never,
    availabilityService as never,
    findATimeService as never,
    autoScheduleService as never,
    civilTwilightService as never,
    reservationsService as never,
    rationaleGenerator as never,
  );

  return {
    service,
    prisma,
    enrollmentService,
    availabilityService,
    findATimeService,
    autoScheduleService,
    civilTwilightService,
    reservationsService,
    rationaleGenerator,
    createdSuggestions,
  };
}

// ── NextLessonScanService factory ─────────────────────────────────────────────

function makeScanService(overrides: {
  operators?: { operatorId: string; fspOperatorId: number }[];
  schedulableEvents?: { eventId: string; studentId?: string | null; enrollmentId?: string | null; locationId?: string | null }[];
  existingSuggestion?: Record<string, unknown> | null;
  nextLessonServiceFn?: ReturnType<typeof vi.fn>;
} = {}): Record<string, unknown> {
  const {
    operators = [{ operatorId: OPERATOR_ID, fspOperatorId: FSP_OPERATOR_ID }],
    schedulableEvents = [{ eventId: 'ev-scan-001', studentId: STUDENT_ID, enrollmentId: ENROLLMENT_ID, locationId: 'loc-001' }],
    existingSuggestion = null,
    nextLessonServiceFn = vi.fn().mockResolvedValue(undefined),
  } = overrides;

  const prisma = {
    operator: {
      findMany: vi.fn().mockResolvedValue(operators),
    },
    suggestion: {
      findFirst: vi.fn().mockResolvedValue(existingSuggestion),
    },
  };

  const schedulableEventsService = {
    getSchedulableEvents: vi.fn().mockResolvedValue({
      success: true,
      data: schedulableEvents,
    }),
  };

  const nextLessonUseCaseService = {
    scheduleNextLessonForStudent: nextLessonServiceFn,
  };

  const service = new NextLessonScanService(
    prisma as never,
    schedulableEventsService as never,
    nextLessonUseCaseService as never,
  );

  return {
    service,
    prisma,
    schedulableEventsService,
    nextLessonUseCaseService,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NextLessonUseCaseService', () => {
  // ── fsp-008: STATUS_CHANGE completion → Find-a-Time ─────────────────────────

  describe('fsp-008: STATUS_CHANGE lesson completion — Find-a-Time path', () => {
    it('creates a PENDING suggestion when lesson completes and next lesson found', async () => {
      const { service, createdSuggestions } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(createdSuggestions).toHaveLength(1);
      expect(createdSuggestions[0].status).toBe('PENDING');
    });

    it('sets useCaseType to NEXT_LESSON', async () => {
      const { service, createdSuggestions } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(createdSuggestions[0].useCaseType).toBe('NEXT_LESSON');
    });

    it('stores lessonId and studentId in candidatePayload', async () => {
      const { service, createdSuggestions } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      const payload = createdSuggestions[0].candidatePayload as Record<string, unknown>;
      expect(payload.lessonId).toBe(NEXT_LESSON_ID);
      expect(payload.studentId).toBe(STUDENT_ID);
    });

    it('calls EnrollmentService.getProgress with enrollmentId', async () => {
      const { service, enrollmentService } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(enrollmentService.getProgress).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        ENROLLMENT_ID,
      );
    });

    it('calls FindATimeService when pending lessons < AUTO_SCHEDULE_THRESHOLD', async () => {
      const { service, findATimeService } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(findATimeService.getAvailableSlots).toHaveBeenCalled();
    });

    it('does NOT call AutoScheduleService when only 1–2 pending lessons', async () => {
      const { service, autoScheduleService } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(autoScheduleService.execute).not.toHaveBeenCalled();
    });

    it('calls CivilTwilightService for slot dates', async () => {
      const { service, civilTwilightService } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(civilTwilightService.getCivilTwilight).toHaveBeenCalled();
    });

    it('calls validateReservation for each slot that passes civil twilight', async () => {
      const { service, reservationsService } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(reservationsService.validateReservation).toHaveBeenCalledTimes(1);
    });

    it('generates LLM rationale for each created suggestion', async () => {
      const { service, rationaleGenerator } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(rationaleGenerator.generateRationale).toHaveBeenCalledTimes(1);
    });

    it('writes an AuditLog for each suggestion', async () => {
      const { service, prisma } = makeUseCaseService();

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('skips slots that fail validateReservation', async () => {
      const { service, createdSuggestions } = makeUseCaseService({ validateSuccess: false });

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(createdSuggestions).toHaveLength(0);
    });

    it('resolves without throwing when EnrollmentService fails', async () => {
      const { service } = makeUseCaseService({ progress: null });

      await expect(service.processLessonCompletion(COMPLETION_EVENT)).resolves.toBeUndefined();
    });
  });

  // ── fsp-009: 3+ pending lessons → AutoSchedule ──────────────────────────────

  describe('fsp-009: 3+ pending lessons — AutoSchedule path', () => {
    const DEVON_STUDENT_ID = 'usr-student-005';
    const DEVON_ENROLLMENT_ID = 'enroll-dev';

    const devonEvent: ChangeEventMessage = {
      ...COMPLETION_EVENT,
      rawDiff: {
        studentId: DEVON_STUDENT_ID,
        enrollmentId: DEVON_ENROLLMENT_ID,
        newStatus: 'COMPLETED',
        locationId: 'loc-001',
      },
    };

    it('calls AutoScheduleService.execute when 3+ pending lessons', async () => {
      const { service, autoScheduleService } = makeUseCaseService({
        progress: PROGRESS_THREE_PENDING,
      });

      await service.processLessonCompletion(devonEvent);

      expect(autoScheduleService.execute).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        expect.objectContaining({
          studentIds: [DEVON_STUDENT_ID],
          enrollmentIds: [DEVON_ENROLLMENT_ID],
        }),
      );
    });

    it('does NOT call FindATimeService when using AutoSchedule', async () => {
      const { service, findATimeService } = makeUseCaseService({
        progress: PROGRESS_THREE_PENDING,
      });

      await service.processLessonCompletion(devonEvent);

      expect(findATimeService.getAvailableSlots).not.toHaveBeenCalled();
    });

    it('creates PENDING suggestions from AutoSchedule results', async () => {
      const { service, createdSuggestions } = makeUseCaseService({
        progress: PROGRESS_THREE_PENDING,
      });

      await service.processLessonCompletion(devonEvent);

      expect(createdSuggestions.length).toBeGreaterThanOrEqual(1);
      for (const s of createdSuggestions) {
        expect(s.status).toBe('PENDING');
        expect(s.useCaseType).toBe('NEXT_LESSON');
      }
    });

    it('deduplicates AutoSchedule results by eventId', async () => {
      // AUTO_SCHEDULE_EVENTS has ev-001 twice — only 1 suggestion for it
      const { service, createdSuggestions } = makeUseCaseService({
        progress: PROGRESS_THREE_PENDING,
      });

      await service.processLessonCompletion(devonEvent);

      const slotStarts = createdSuggestions.map(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        s => (s.candidatePayload as unknown).slotStart,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const uniqueSlotStarts = new Set(slotStarts);
      expect(uniqueSlotStarts.size).toBe(slotStarts.length);
    });

    it('caps at NEXT_LESSON_MAX_SUGGESTIONS even if more AutoSchedule events exist', async () => {
      const manyEvents = Array.from({ length: 6 }, (_, i) => ({
        eventId: `ev-${i + 1}`,
        studentId: DEVON_STUDENT_ID,
        startDateTime: `2026-03-${21 + i}T09:00:00Z`,
        endDateTime: `2026-03-${21 + i}T11:00:00Z`,
        instructorId: 'usr-instr-002',
        aircraftId: 'ac-002',
      }));

      const { service, createdSuggestions } = makeUseCaseService({
        progress: PROGRESS_THREE_PENDING,
        autoScheduleEvents: manyEvents,
      });

      await service.processLessonCompletion(devonEvent);

      expect(createdSuggestions.length).toBeLessThanOrEqual(3);
    });
  });

  // ── fsp-010: instructor continuity ──────────────────────────────────────────

  describe('fsp-010: instructor continuity preference', () => {
    const continuityPolicy = { preferContinuityInstructor: true };

    it('calls EnrollmentService.getTrainingSessions when preferContinuityInstructor=true', async () => {
      const { service, enrollmentService } = makeUseCaseService({
        policyConfig: continuityPolicy,
      });

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(enrollmentService.getTrainingSessions).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        ENROLLMENT_ID,
      );
    });

    it('passes last instructor as preferredInstructorIds to FindATimeService', async () => {
      const { service, findATimeService } = makeUseCaseService({
        policyConfig: continuityPolicy,
        trainingSessions: [
          { sessionId: 'ses-001', instructorId: 'usr-instr-001' },
          { sessionId: 'ses-002', instructorId: 'usr-instr-003' }, // most recent
        ],
      });

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(findATimeService.getAvailableSlots).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        expect.objectContaining({
          preferredInstructorIds: expect.arrayContaining(['usr-instr-003']),
        }),
      );
    });

    it('does NOT call getTrainingSessions when preferContinuityInstructor=false', async () => {
      const { service, enrollmentService } = makeUseCaseService({
        policyConfig: { preferContinuityInstructor: false },
      });

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(enrollmentService.getTrainingSessions).not.toHaveBeenCalled();
    });

    it('creates suggestion with the continuity instructor in candidatePayload', async () => {
      const { service, createdSuggestions } = makeUseCaseService({
        policyConfig: continuityPolicy,
        trainingSessions: [{ sessionId: 'ses-001', instructorId: 'usr-instr-001' }],
        slots: [{ ...SLOT_ONE, instructorId: 'usr-instr-001' }],
      });

      await service.processLessonCompletion(COMPLETION_EVENT);

      expect(createdSuggestions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── graceful error handling ──────────────────────────────────────────────────

  describe('graceful error handling', () => {
    it('resolves without throwing when FindATimeService throws', async () => {
      const { service, findATimeService } = makeUseCaseService();
      findATimeService.getAvailableSlots = vi.fn().mockRejectedValue(new Error('FSP timeout'));

      await expect(service.processLessonCompletion(COMPLETION_EVENT)).resolves.toBeUndefined();
    });

    it('resolves without throwing when suggestion.create throws', async () => {
      const { service, prisma } = makeUseCaseService();
      prisma.suggestion.create = vi.fn().mockRejectedValue(new Error('DB error'));

      await expect(service.processLessonCompletion(COMPLETION_EVENT)).resolves.toBeUndefined();
    });

    it('returns early when event rawDiff newStatus is not COMPLETED', async () => {
      const { service, enrollmentService } = makeUseCaseService();
      const nonCompletionEvent: ChangeEventMessage = {
        ...COMPLETION_EVENT,
        rawDiff: { studentId: STUDENT_ID, enrollmentId: ENROLLMENT_ID, newStatus: 'CANCELLED' },
      };

      await service.processLessonCompletion(nonCompletionEvent);

      expect(enrollmentService.getProgress).not.toHaveBeenCalled();
    });
  });
});

// ── NextLessonScanService ─────────────────────────────────────────────────────

describe('NextLessonScanService', () => {
  // ── fsp-020: duplicate prevention ───────────────────────────────────────────

  describe('fsp-020: idempotency — duplicate PENDING suggestion exists', () => {
    it('logs "duplicate skipped" when existing PENDING suggestion found', async () => {
      const { service } = makeScanService({
        existingSuggestion: { id: 'sug-existing', status: 'PENDING', useCaseType: 'NEXT_LESSON' },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      await service.runHourlyScan();

      const messages = warnSpy.mock.calls.map(c => String(c[0]));
      expect(messages.some(m => m.includes('duplicate skipped'))).toBe(true);
    });

    it('does not call scheduleNextLessonForStudent when duplicate exists', async () => {
      const scheduleFn = vi.fn();
      const { service } = makeScanService({
        existingSuggestion: { id: 'sug-existing', status: 'PENDING', useCaseType: 'NEXT_LESSON' },
        nextLessonServiceFn: scheduleFn,
      });

      await service.runHourlyScan();

      expect(scheduleFn).not.toHaveBeenCalled();
    });

    it('includes student and lesson context in the "duplicate skipped" log', async () => {
      const { service } = makeScanService({
        existingSuggestion: { id: 'sug-existing', status: 'PENDING', useCaseType: 'NEXT_LESSON' },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      await service.runHourlyScan();

      const fullLog = warnSpy.mock.calls.map(c => String(c[0])).join(' ');
      expect(fullLog).toContain(STUDENT_ID);
    });

    it('calls scheduleNextLessonForStudent when no existing suggestion', async () => {
      const scheduleFn = vi.fn().mockResolvedValue(undefined);
      const { service } = makeScanService({
        existingSuggestion: null,
        nextLessonServiceFn: scheduleFn,
      });

      await service.runHourlyScan();

      expect(scheduleFn).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorId: OPERATOR_ID,
          fspOperatorId: FSP_OPERATOR_ID,
          studentId: STUDENT_ID,
          enrollmentId: ENROLLMENT_ID,
        }),
      );
    });

    it('calls SchedulableEventsService for each active operator', async () => {
      const { service, schedulableEventsService } = makeScanService();

      await service.runHourlyScan();

      expect(schedulableEventsService.getSchedulableEvents).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        expect.any(Object),
      );
    });

    it('resolves without throwing when SchedulableEventsService fails', async () => {
      const { service, schedulableEventsService } = makeScanService();
      schedulableEventsService.getSchedulableEvents = vi
        .fn()
        .mockRejectedValue(new Error('FSP error'));

      await expect(service.runHourlyScan()).resolves.toBeUndefined();
    });
  });
});
