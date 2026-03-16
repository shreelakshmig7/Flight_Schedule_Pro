/**
 * next-lesson-use-case.service.ts
 * ----------------------------------
 * Agentic Scheduler — FSP Integration — Use Case D: Schedule Next Lesson
 * -----------------------------------------------------------------------
 * Handles STATUS_CHANGE ChangeEventMessages where rawDiff.newStatus === 'COMPLETED',
 * triggering scheduling of the student's next pending lesson. Also exposes
 * scheduleNextLessonForStudent() for the hourly scan service.
 *
 * For each completed-lesson event the service:
 *
 *   1. Reads the operator's policyConfig to determine:
 *        • preferContinuityInstructor — whether to prefer the last instructor
 *   2. Calls EnrollmentService.getProgress to retrieve the student's milestone list.
 *   3. Counts pending (incomplete) milestones to choose a scheduling path:
 *        • < NEXT_LESSON_AUTO_SCHEDULE_THRESHOLD → Find-a-Time path
 *        • >= NEXT_LESSON_AUTO_SCHEDULE_THRESHOLD → AutoSchedule path
 *
 *   Find-a-Time path:
 *     a. Optionally calls EnrollmentService.getTrainingSessions to find the last
 *        instructor (preferContinuityInstructor=true, fsp-010).
 *     b. Calls FindATimeService.getAvailableSlots.
 *     c. Filters slots against civil twilight (fail-open on API error).
 *     d. For each slot (up to NEXT_LESSON_MAX_SUGGESTIONS):
 *          i.  Calls validateReservation — failure → skip.
 *          ii. Generates LLM rationale.
 *          iii.Creates PENDING suggestion (useCaseType=NEXT_LESSON).
 *          iv. Writes AuditLog.
 *
 *   AutoSchedule path:
 *     a. Calls AutoScheduleService.execute with studentIds and enrollmentIds.
 *     b. Deduplicates returned events by eventId.
 *     c. Creates up to NEXT_LESSON_MAX_SUGGESTIONS PENDING suggestions.
 *
 * The service always resolves — never rejects. Errors are logged and the
 * method returns without creating additional suggestions.
 *
 * Key exports: NextLessonUseCaseService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-16 — Use Case D — Schedule Next Lesson on Completion
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaService } from '@fsp-scheduler/database';
import { Prisma } from '@fsp-scheduler/database';
import type {
  ChangeEventMessage,
  FspEnrollmentProgress,
  FspFindATimeSlot,
  FspCivilTwilight,
  FspSchedulableEvent,
  FspReservationCreateRequest,
} from '@fsp-scheduler/shared-types';
import {
  SUGGESTION_STATUS,
  USE_CASE_TYPE,
  SUGGESTION_EXPIRY_HOURS,
  NEXT_LESSON_MAX_SUGGESTIONS,
  NEXT_LESSON_SEARCH_WINDOW_DAYS,
  NEXT_LESSON_AUTO_SCHEDULE_THRESHOLD,
} from '@fsp-scheduler/shared-types';
import type { RationaleInput } from '@fsp-scheduler/shared-types';
import type { EnrollmentService } from '@fsp-scheduler/fsp-client';
import type { AvailabilityService } from '@fsp-scheduler/fsp-client';
import type { FindATimeService } from '@fsp-scheduler/fsp-client';
import type { AutoScheduleService } from '@fsp-scheduler/fsp-client';
import type { CivilTwilightService } from '@fsp-scheduler/fsp-client';
import type { ReservationsService } from '@fsp-scheduler/fsp-client';
import type { RationaleGenerator } from '../../llm/rationale-generator';

/** Milliseconds per day — used for date arithmetic. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Shape of policyConfig relevant to the next-lesson use case. */
interface NextLessonPolicyConfig {
  preferContinuityInstructor?: boolean;
}

/** Parameters for scheduling a next lesson for a specific student. */
export interface ScheduleNextLessonParams {
  operatorId: string;
  fspOperatorId: number;
  studentId: string;
  enrollmentId: string;
  locationId?: string | null;
  correlationId?: string;
}

/**
 * Service for Use Case D: determine and schedule the student's next lesson
 * after a lesson completion event.
 *
 * All constraint checks run before a suggestion is persisted.
 * The service always resolves — never rejects.
 */
@Injectable()
export class NextLessonUseCaseService {
  private readonly logger = new Logger(NextLessonUseCaseService.name);

  /**
   * @param prisma               - Database client for Suggestion and AuditLog writes.
   * @param enrollmentService    - FSP client for enrollment progress and training sessions.
   * @param availabilityService  - FSP client for batch availability checks.
   * @param findATimeService     - FSP client for discovering available slots.
   * @param autoScheduleService  - FSP client for the auto-scheduler.
   * @param civilTwilightService - FSP client for civil twilight times at a location.
   * @param reservationsService  - FSP client for validateReservation.
   * @param rationaleGenerator   - LLM rationale generator (PR-12).
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollmentService: EnrollmentService,
    private readonly availabilityService: AvailabilityService,
    private readonly findATimeService: FindATimeService,
    private readonly autoScheduleService: AutoScheduleService,
    private readonly civilTwilightService: CivilTwilightService,
    private readonly reservationsService: ReservationsService,
    private readonly rationaleGenerator: RationaleGenerator,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Processes a STATUS_CHANGE event where rawDiff.newStatus === 'COMPLETED'.
   * Non-COMPLETED events are logged and ignored.
   *
   * Always resolves — never rejects.
   *
   * @param event - ChangeEventMessage with changeType === 'STATUS_CHANGE'.
   */
  public async processLessonCompletion(event: ChangeEventMessage): Promise<void> {
    const rawDiff = event.rawDiff as Record<string, unknown>;
    const newStatus = rawDiff.newStatus as string | undefined;

    if (newStatus !== 'COMPLETED') {
      this.logger.debug(
        `STATUS_CHANGE event with newStatus=${String(newStatus)} — not COMPLETED, skipping`,
        { service: NextLessonUseCaseService.name, operatorId: event.operatorId },
      );
      return;
    }

    const studentId = rawDiff.studentId as string;
    const enrollmentId = rawDiff.enrollmentId as string;
    const locationId = rawDiff.locationId as string | undefined;

    await this.scheduleNextLessonForStudent({
      operatorId: event.operatorId,
      fspOperatorId: event.fspOperatorId,
      studentId,
      enrollmentId,
      locationId,
      correlationId: event.correlationId,
    });
  }

  /**
   * Identifies and schedules the next pending lesson for a student.
   * Used both by processLessonCompletion() and by NextLessonScanService.
   *
   * Always resolves — never rejects.
   *
   * @param params - Student and operator context for scheduling.
   */
  public async scheduleNextLessonForStudent(params: ScheduleNextLessonParams): Promise<void> {
    const { operatorId, fspOperatorId, studentId, enrollmentId, locationId } = params;
    const fspOpStr = String(fspOperatorId);
    const correlationId = params.correlationId ?? randomUUID();

    this.logger.log(
      `Scheduling next lesson for student ${studentId} in enrollment ${enrollmentId}`,
      { service: NextLessonUseCaseService.name, operatorId, correlationId },
    );

    // ── Step 1: Read operator policyConfig ─────────────────────────────────────
    let policy: NextLessonPolicyConfig = {};
    try {
      const operator = await this.prisma.operator.findUnique({
        where: { operatorId },
        select: { policyConfig: true },
      });
      if (operator?.policyConfig && typeof operator.policyConfig === 'object') {
        policy = operator.policyConfig as NextLessonPolicyConfig;
      }
    } catch {
      this.logger.warn(
        `Failed to read policyConfig for operator ${operatorId} — using defaults`,
        { service: NextLessonUseCaseService.name, operatorId },
      );
    }

    // ── Step 2: Fetch enrollment progress ──────────────────────────────────────
    let progress: FspEnrollmentProgress;
    try {
      const result = await this.enrollmentService.getProgress(fspOpStr, enrollmentId);
      if (!result.success || !result.data) {
        this.logger.warn(
          `Failed to get enrollment progress for ${enrollmentId}: ${result.error ?? 'unknown error'}`,
          { service: NextLessonUseCaseService.name, operatorId },
        );
        return;
      }
      progress = result.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `EnrollmentService.getProgress threw for enrollment ${enrollmentId}: ${msg}`,
        { service: NextLessonUseCaseService.name, operatorId },
      );
      return;
    }

    // ── Step 3: Identify pending milestones and choose path ────────────────────
    const milestones = progress.milestones ?? [];
    const pendingMilestones = milestones.filter((m) => m.completed !== true);
    const pendingCount = pendingMilestones.length;

    if (pendingCount === 0) {
      this.logger.log(
        `No pending lessons for student ${studentId} in enrollment ${enrollmentId} — skipping`,
        { service: NextLessonUseCaseService.name, operatorId },
      );
      return;
    }

    // First incomplete milestone is the next lesson to schedule
    const nextMilestone = pendingMilestones[0];
    const nextLessonId = nextMilestone.milestoneId;

    this.logger.log(
      `Next lesson for student ${studentId}: ${nextLessonId} (${pendingCount} pending)`,
      { service: NextLessonUseCaseService.name, operatorId },
    );

    if (pendingCount >= NEXT_LESSON_AUTO_SCHEDULE_THRESHOLD) {
      // ── AutoSchedule path ─────────────────────────────────────────────────
      await this.handleAutoSchedulePath(
        operatorId,
        fspOpStr,
        studentId,
        enrollmentId,
        nextLessonId,
        correlationId,
      );
    } else {
      // ── Find-a-Time path ─────────────────────────────────────────────────
      await this.handleFindATimePath(
        operatorId,
        fspOpStr,
        studentId,
        enrollmentId,
        nextLessonId,
        locationId,
        policy,
        correlationId,
      );
    }
  }

  // ── Private: Find-a-Time path ───────────────────────────────────────────────

  /**
   * Uses FindATimeService to find available slots for the next lesson.
   *
   * @param operatorId   - Internal operator ID string.
   * @param fspOpStr     - FSP operator ID string.
   * @param studentId    - Student identifier.
   * @param enrollmentId - Enrollment identifier.
   * @param nextLessonId - Milestone ID of the next lesson.
   * @param locationId   - Optional location for civil twilight filtering.
   * @param policy       - Operator policy config.
   * @param correlationId - Event correlation identifier.
   */
  private async handleFindATimePath(
    operatorId: string,
    fspOpStr: string,
    studentId: string,
    enrollmentId: string,
    nextLessonId: string,
    locationId: string | null | undefined,
    policy: NextLessonPolicyConfig,
    correlationId: string,
  ): Promise<void> {
    // Optionally resolve preferred instructor for continuity (fsp-010)
    let preferredInstructorIds: string[] | undefined;

    if (policy.preferContinuityInstructor) {
      try {
        const sessionsResult = await this.enrollmentService.getTrainingSessions(
          fspOpStr,
          enrollmentId,
        );
        if (sessionsResult.success && sessionsResult.data && sessionsResult.data.length > 0) {
          const lastSession = sessionsResult.data[sessionsResult.data.length - 1];
          if (lastSession.instructorId) {
            preferredInstructorIds = [lastSession.instructorId];
            this.logger.log(
              `Instructor continuity: preferring ${lastSession.instructorId} for student ${studentId}`,
              { service: NextLessonUseCaseService.name, operatorId },
            );
          }
        }
      } catch {
        this.logger.warn(
          `Failed to fetch training sessions for continuity — proceeding without preference`,
          { service: NextLessonUseCaseService.name, operatorId },
        );
      }
    }

    // Build search date range
    const now = new Date();
    const startDate = now.toISOString().slice(0, 10);
    const endDate = new Date(now.getTime() + NEXT_LESSON_SEARCH_WINDOW_DAYS * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);

    // Discover available slots
    let slots: FspFindATimeSlot[] = [];
    try {
      const result = await this.findATimeService.getAvailableSlots(fspOpStr, {
        startDate,
        endDate,
        ...(preferredInstructorIds ? { preferredInstructorIds } : {}),
      });
      if (result.success && result.data) {
        slots = result.data;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `FindATimeService failed for operator ${operatorId}: ${msg}`,
        { service: NextLessonUseCaseService.name, operatorId },
      );
      return;
    }

    // Filter by civil twilight
    if (locationId) {
      slots = await this.filterByCivilTwilight(fspOpStr, locationId, slots, operatorId);
    }

    // Validate and create suggestions
    let created = 0;

    for (const slot of slots) {
      if (created >= NEXT_LESSON_MAX_SUGGESTIONS) break;

      // FSP validateReservation
      const validateRequest: FspReservationCreateRequest = {
        operatorId: fspOpStr,
        startDateTime: slot.startDateTime,
        endDateTime: slot.endDateTime,
        ...(slot.instructorId ? { instructorId: slot.instructorId } : {}),
        ...(slot.aircraftId ? { aircraftId: slot.aircraftId } : {}),
        ...(locationId ? { locationId } : {}),
      };

      let validateResult: { success: boolean };
      try {
        validateResult = await this.reservationsService.validateReservation(
          fspOpStr,
          validateRequest,
        );
      } catch {
        continue;
      }

      if (!validateResult.success) {
        this.logger.log(
          `Slot validation failed for ${slot.startDateTime} — skipping`,
          { service: NextLessonUseCaseService.name, operatorId },
        );
        continue;
      }

      // Generate LLM rationale
      const constraintResults: Record<string, boolean> = {
        'Civil twilight': true,
        'Validation passed': true,
      };

      const rationaleInput: RationaleInput = {
        student: {
          studentId,
          firstName: '',
          lastName: '',
          completedHours: 0,
          requiredHours: 0,
        },
        proposedSlot: {
          slotStart: slot.startDateTime,
          slotEnd: slot.endDateTime,
          instructorId: slot.instructorId ?? '',
          aircraftId: slot.aircraftId ?? '',
          locationId: locationId ?? '',
        },
        constraintResults,
        priorityScore: slot.score ?? 0.5,
        prioritySignalBreakdown: {},
        operatorContext: { operatorName: operatorId },
        candidateCount: slots.length,
        topRank: created === 0,
      };

      const rationale = await this.rationaleGenerator.generateRationale(rationaleInput);

      // Create PENDING suggestion
      const expiresAt = new Date(Date.now() + SUGGESTION_EXPIRY_HOURS * 60 * 60 * 1000);

      let suggestion: { id: string };
      try {
        suggestion = await this.prisma.suggestion.create({
          data: {
            operatorId,
            fspOperatorId: Number(fspOpStr),
            useCaseType: USE_CASE_TYPE.NEXT_LESSON,
            status: SUGGESTION_STATUS.PENDING,
            changeEventId: correlationId,
            candidatePayload: {
              lessonId: nextLessonId,
              studentId,
              enrollmentId,
              slotStart: slot.startDateTime,
              slotEnd: slot.endDateTime,
              instructorId: slot.instructorId ?? null,
              aircraftId: slot.aircraftId ?? null,
              locationId: locationId ?? null,
              validateRequest,
              constraintResults,
            } as Prisma.InputJsonValue,
            llmResponse: rationale.rationale,
            llmModel: 'claude-opus-4-6',
            expiresAt,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to persist suggestion for slot ${slot.startDateTime}: ${msg}`,
          { service: NextLessonUseCaseService.name, operatorId },
        );
        continue;
      }

      // Write AuditLog
      await this.prisma.auditLog.create({
        data: {
          operatorId,
          correlationId: randomUUID(),
          service: NextLessonUseCaseService.name,
          action: 'SUGGESTION_CREATED',
          entityType: 'Suggestion',
          entityId: suggestion.id,
          metadata: {
            changeType: 'STATUS_CHANGE',
            lessonId: nextLessonId,
            studentId,
            slotStart: slot.startDateTime,
            usedFallback: rationale.usedFallback,
          } as Prisma.InputJsonValue,
        },
      });

      created++;
      this.logger.log(
        `Created PENDING suggestion ${suggestion.id} for student ${studentId}, lesson ${nextLessonId} at ${slot.startDateTime}`,
        { service: NextLessonUseCaseService.name, operatorId },
      );
    }

    if (created === 0) {
      this.logger.warn(
        `no suggestions created for student ${studentId}, lesson ${nextLessonId} (operator ${operatorId})`,
        { service: NextLessonUseCaseService.name, operatorId },
      );
    }
  }

  // ── Private: AutoSchedule path ──────────────────────────────────────────────

  /**
   * Uses AutoScheduleService to schedule the student when they have 3+ pending lessons.
   * Deduplicates returned events by eventId before creating suggestions.
   *
   * @param operatorId   - Internal operator ID string.
   * @param fspOpStr     - FSP operator ID string.
   * @param studentId    - Student identifier.
   * @param enrollmentId - Enrollment identifier.
   * @param nextLessonId - Milestone ID of the next lesson.
   * @param correlationId - Event correlation identifier.
   */
  private async handleAutoSchedulePath(
    operatorId: string,
    fspOpStr: string,
    studentId: string,
    enrollmentId: string,
    nextLessonId: string,
    correlationId: string,
  ): Promise<void> {
    let events: FspSchedulableEvent[] = [];
    try {
      const result = await this.autoScheduleService.execute(fspOpStr, {
        studentIds: [studentId],
        enrollmentIds: [enrollmentId],
      });

      if (result.success && result.data?.events) {
        events = result.data.events;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `AutoScheduleService.execute failed for operator ${operatorId}: ${msg}`,
        { service: NextLessonUseCaseService.name, operatorId },
      );
      return;
    }

    // Deduplicate by eventId
    const seenEventIds = new Set<string>();
    const uniqueEvents: FspSchedulableEvent[] = [];
    for (const event of events) {
      if (!seenEventIds.has(event.eventId)) {
        seenEventIds.add(event.eventId);
        uniqueEvents.push(event);
      }
    }

    // Cap at NEXT_LESSON_MAX_SUGGESTIONS
    const capped = uniqueEvents.slice(0, NEXT_LESSON_MAX_SUGGESTIONS);

    let created = 0;
    for (const event of capped) {
      const expiresAt = new Date(Date.now() + SUGGESTION_EXPIRY_HOURS * 60 * 60 * 1000);

      let suggestion: { id: string };
      try {
        suggestion = await this.prisma.suggestion.create({
          data: {
            operatorId,
            fspOperatorId: Number(fspOpStr),
            useCaseType: USE_CASE_TYPE.NEXT_LESSON,
            status: SUGGESTION_STATUS.PENDING,
            changeEventId: correlationId,
            candidatePayload: {
              lessonId: nextLessonId,
              studentId,
              enrollmentId,
              slotStart: event.startDateTime ?? null,
              slotEnd: event.endDateTime ?? null,
              instructorId: event.instructorId ?? null,
              aircraftId: event.aircraftId ?? null,
              autoScheduleEventId: event.eventId,
            } as Prisma.InputJsonValue,
            llmModel: 'claude-opus-4-6',
            expiresAt,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to persist auto-schedule suggestion for event ${event.eventId}: ${msg}`,
          { service: NextLessonUseCaseService.name, operatorId },
        );
        continue;
      }

      await this.prisma.auditLog.create({
        data: {
          operatorId,
          correlationId: randomUUID(),
          service: NextLessonUseCaseService.name,
          action: 'SUGGESTION_CREATED',
          entityType: 'Suggestion',
          entityId: suggestion.id,
          metadata: {
            changeType: 'STATUS_CHANGE',
            path: 'AutoSchedule',
            studentId,
            autoScheduleEventId: event.eventId,
          } as Prisma.InputJsonValue,
        },
      });

      created++;
      this.logger.log(
        `Created PENDING auto-schedule suggestion ${suggestion.id} for student ${studentId} (event ${event.eventId})`,
        { service: NextLessonUseCaseService.name, operatorId },
      );
    }

    this.logger.log(
      `AutoSchedule complete: created ${created} PENDING suggestion(s) for student ${studentId} (operator ${operatorId})`,
      { service: NextLessonUseCaseService.name, operatorId },
    );
  }

  // ── Private: civil twilight filter ─────────────────────────────────────────

  /**
   * Fetches civil twilight times for each unique date in the slots array and
   * returns only slots where:
   *   slot.startDateTime >= civilTwilightBegin
   *   slot.endDateTime   <= civilTwilightEnd
   *
   * Fail-open: if the civil twilight API call fails for a date, the slot is
   * allowed through.
   */
  private async filterByCivilTwilight(
    fspOpStr: string,
    locationId: string,
    slots: FspFindATimeSlot[],
    operatorId: string,
  ): Promise<FspFindATimeSlot[]> {
    const uniqueDates = [...new Set(slots.map((s) => s.startDateTime.slice(0, 10)))];

    const twilightByDate = new Map<string, FspCivilTwilight | null>();
    await Promise.all(
      uniqueDates.map(async (date) => {
        try {
          const result = await this.civilTwilightService.getCivilTwilight(
            fspOpStr,
            locationId,
            date,
          );
          twilightByDate.set(date, result.success && result.data ? result.data : null);
        } catch {
          twilightByDate.set(date, null);
        }
      }),
    );

    return slots.filter((slot) => {
      const date = slot.startDateTime.slice(0, 10);
      const twilight = twilightByDate.get(date);

      if (!twilight || !twilight.civilTwilightBegin || !twilight.civilTwilightEnd) {
        return true; // fail-open
      }

      const slotStart = Date.parse(slot.startDateTime);
      const slotEnd = Date.parse(slot.endDateTime);
      const twilightBegin = Date.parse(twilight.civilTwilightBegin);
      const twilightEnd = Date.parse(twilight.civilTwilightEnd);

      if (isNaN(slotStart) || isNaN(slotEnd) || isNaN(twilightBegin) || isNaN(twilightEnd)) {
        return true;
      }

      const withinDaylight = slotStart >= twilightBegin && slotEnd <= twilightEnd;

      if (!withinDaylight) {
        this.logger.warn(
          `Slot ${slot.startDateTime}–${slot.endDateTime} excluded: outside civil twilight window`,
          { service: NextLessonUseCaseService.name, operatorId },
        );
      }

      return withinDaylight;
    });
  }
}
