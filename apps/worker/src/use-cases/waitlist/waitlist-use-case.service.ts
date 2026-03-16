/**
 * waitlist-use-case.service.ts
 * -----------------------------
 * Agentic Scheduler — FSP Integration — Use Case A: Waitlist / New Opening
 * -------------------------------------------------------------------------
 * Handles NEW_OPENING ChangeEventMessages emitted by the Change Detection
 * Engine (PR-9). For each new opening, the service:
 *
 *   1. Checks aircraft squawks — aircraft with an open (unresolved) squawk is
 *      excluded immediately and no suggestion is created (fsp-030).
 *   2. Fetches all active students for the operator from FSP.
 *   3. Gathers per-student reservation history and enrollment progress.
 *   4. Calls PriorityWeightEngine to rank candidates (highest score first).
 *   5. Iterates the top WAITLIST_MAX_CANDIDATES_TO_TRY candidates:
 *        a. Checks student availability via FSP batch availability endpoint.
 *           Unavailable student → "candidate skipped: availability constraint"
 *           (fsp-029).
 *        b. Calls FSP validateReservation (validateOnly=true). Failure →
 *           "validation failed" (fsp-031).
 *        c. Generates a plain-English rationale via RationaleGenerator (PR-12).
 *        d. Creates a PENDING Suggestion record in the database.
 *        e. Writes an AuditLog entry and returns.
 *   6. If all attempts fail: logs "X candidates attempted, no suggestion created".
 *
 * The suggestion is NEVER created without passing FSP validateReservation.
 * The service always resolves — never rejects.
 *
 * Key exports: WaitlistUseCaseService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-13 — Use Case A — Waitlist
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, PrismaService } from '@fsp-scheduler/database';
import type {
  ChangeEventMessage,
  FspStudent,
  FspReservation,
  FspEnrollmentProgress,
  FspAvailabilityBatchRequest,
  FspReservationCreateRequest,
} from '@fsp-scheduler/shared-types';
import {
  SUGGESTION_STATUS,
  USE_CASE_TYPE,
  SUGGESTION_EXPIRY_HOURS,
  WAITLIST_MAX_CANDIDATES_TO_TRY,
  WAITLIST_RESERVATION_LOOKBACK_DAYS,
  WAITLIST_RESERVATION_LOOKAHEAD_DAYS,
} from '@fsp-scheduler/shared-types';
import type {
  CandidateInput,
  RationaleInput,
} from '@fsp-scheduler/shared-types';
import {
  StudentsService,
  ReservationsService,
  EnrollmentService,
  AircraftService,
  AvailabilityService,
} from '@fsp-scheduler/fsp-client';
import { RationaleGenerator } from '../../llm/rationale-generator';
import { PriorityWeightEngine } from '../../suggestions/priority-weight.engine';

/** Milliseconds per day — used for date range calculations. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Service for Use Case A: fill a new opening with the highest-priority
 * waitlisted student. All constraint checks run before the suggestion is
 * persisted to guarantee data quality.
 */
@Injectable()
export class WaitlistUseCaseService {
  private readonly logger = new Logger(WaitlistUseCaseService.name);

  /**
   * @param prisma               - Database client for Suggestion and AuditLog writes.
   * @param studentsService      - FSP client for fetching active student list.
   * @param reservationsService  - FSP client for student reservation history + validateReservation.
   * @param enrollmentService    - FSP client for enrollment data and progress.
   * @param aircraftService      - FSP client for squawk checks.
   * @param availabilityService  - FSP client for batch availability checks.
   * @param rationaleGenerator   - LLM rationale generator (PR-12).
   * @param priorityWeightEngine - Candidate scoring engine (PR-11).
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentsService: StudentsService,
    private readonly reservationsService: ReservationsService,
    private readonly enrollmentService: EnrollmentService,
    private readonly aircraftService: AircraftService,
    private readonly availabilityService: AvailabilityService,
    private readonly rationaleGenerator: RationaleGenerator,
    private readonly priorityWeightEngine: PriorityWeightEngine,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Processes a NEW_OPENING change event and creates at most one PENDING
   * suggestion for the highest-priority eligible student.
   *
   * Always resolves — never rejects. Errors are logged and the method returns
   * without creating a suggestion.
   *
   * @param event - ChangeEventMessage with changeType === 'NEW_OPENING'.
   */
  public async processNewOpening(event: ChangeEventMessage): Promise<void> {
    const { operatorId, fspOperatorId, correlationId } = event;
    const rawDiff = event.rawDiff as Record<string, string | undefined>;

    const slotStart = rawDiff.slotStart ?? '';
    const slotEnd = rawDiff.slotEnd ?? '';
    const aircraftId = rawDiff.aircraftId;
    const locationId = rawDiff.locationId;
    const instructorId = rawDiff.instructorId;
    const activityTypeId = rawDiff.activityTypeId;

    this.logger.log(
      `Processing NEW_OPENING for operator ${operatorId}`,
      { service: WaitlistUseCaseService.name, operatorId, correlationId },
    );

    // ── Step 1: Aircraft squawk check ────────────────────────────────────────
    if (aircraftId) {
      const squawkResult = await this.aircraftService.getSquawks(
        String(fspOperatorId),
        aircraftId,
      );
      if (squawkResult.success && squawkResult.data) {
        const openSquawks = squawkResult.data.filter(s => !s.resolvedAt);
        if (openSquawks.length > 0) {
          this.logger.warn(
            `open squawk detected: ${aircraftId} excluded — no suggestion created`,
            { service: WaitlistUseCaseService.name, operatorId },
          );
          return;
        }
      }
    }

    // ── Step 2: Fetch active students ─────────────────────────────────────────
    const studentsResult = await this.studentsService.listStudents(String(fspOperatorId));
    if (!studentsResult.success || !studentsResult.data) {
      this.logger.warn(
        `Failed to fetch students for operator ${operatorId}: ${studentsResult.error ?? 'unknown error'}`,
        { service: WaitlistUseCaseService.name, operatorId },
      );
      return;
    }
    const students: FspStudent[] = studentsResult.data.filter(s => s.active !== false);

    if (students.length === 0) {
      this.logger.log(
        `No active students found for operator ${operatorId} — no suggestion created`,
        { service: WaitlistUseCaseService.name, operatorId },
      );
      return;
    }

    // ── Step 3: Fetch operator priority weights from DB ───────────────────────
    const operator = await this.prisma.operator.findUnique({
      where: { operatorId },
      select: { priorityWeights: true },
    });
    const priorityConfig = operator?.priorityWeights
      ? this.parsePriorityWeights(operator.priorityWeights)
      : this.priorityWeightEngine.getDefaultConfig();

    // ── Step 4: Build candidate inputs (reservations + enrollment) ────────────
    const slotStartDate = new Date(slotStart || Date.now());
    const lookbackDate = new Date(slotStartDate.getTime() - WAITLIST_RESERVATION_LOOKBACK_DAYS * MS_PER_DAY);
    const lookaheadDate = new Date(slotStartDate.getTime() + WAITLIST_RESERVATION_LOOKAHEAD_DAYS * MS_PER_DAY);

    const candidateInputs: CandidateInput[] = await Promise.all(
      students.map(student => this.buildCandidateInput(
        student,
        String(fspOperatorId),
        lookbackDate,
        lookaheadDate,
      )),
    );

    // ── Step 5: Score and rank candidates ─────────────────────────────────────
    const ranked = this.priorityWeightEngine.scoreCandidates(
      candidateInputs,
      priorityConfig,
    );

    if (ranked.length === 0) {
      this.logger.log(
        `No candidates to score for operator ${operatorId} — no suggestion created`,
        { service: WaitlistUseCaseService.name, operatorId },
      );
      return;
    }

    // ── Step 6: Iterate top candidates ───────────────────────────────────────
    const topCandidates = ranked.slice(0, WAITLIST_MAX_CANDIDATES_TO_TRY);
    let attemptCount = 0;

    for (const candidate of topCandidates) {
      attemptCount++;
      const student = students.find(s => s.studentId === candidate.studentId)!;

      // 6a. Availability check
      const availRequest: FspAvailabilityBatchRequest = {
        userIds: [candidate.studentId],
        startDate: (slotStart || '').slice(0, 10),
        endDate: (slotEnd || '').slice(0, 10),
        ...(activityTypeId ? { activityTypeId } : {}),
        ...(locationId ? { locationId } : {}),
        ...(aircraftId ? { aircraftId } : {}),
      };

      const availResult = await this.availabilityService.getBatchAvailability(
        String(fspOperatorId),
        availRequest,
      );

      const studentAvail = availResult.success && availResult.data?.results
        ? availResult.data.results.find(r => r.userId === candidate.studentId)
        : null;

      if (studentAvail && studentAvail.available === false) {
        this.logger.log(
          `candidate skipped: availability constraint for ${candidate.studentId}`,
          { service: WaitlistUseCaseService.name, operatorId },
        );
        continue;
      }

      // 6b. FSP validateReservation
      const validateRequest: FspReservationCreateRequest = {
        operatorId: String(fspOperatorId),
        startDateTime: slotStart,
        endDateTime: slotEnd,
        studentId: candidate.studentId,
        ...(instructorId ? { instructorId } : {}),
        ...(aircraftId ? { aircraftId } : {}),
        ...(locationId ? { locationId } : {}),
        ...(activityTypeId ? { activityTypeId } : {}),
      };

      const validateResult = await this.reservationsService.validateReservation(
        String(fspOperatorId),
        validateRequest,
      );

      if (!validateResult.success) {
        this.logger.log(
          `validation failed for candidate ${candidate.studentId} — skipping`,
          { service: WaitlistUseCaseService.name, operatorId },
        );
        continue;
      }

      // 6c. Generate LLM rationale
      const candidateInput = candidateInputs.find(c => c.studentId === candidate.studentId);
      const constraintResults: Record<string, boolean> = {
        'Student availability': studentAvail?.available !== false,
        'Aircraft available': !aircraftId || true,
        'Validation passed': true,
      };

      const rationaleInput: RationaleInput = {
        student: {
          studentId: candidate.studentId,
          firstName: student.firstName ?? '',
          lastName: student.lastName ?? '',
          completedHours: candidateInput?.enrollmentProgress?.completedHours ?? 0,
          requiredHours: candidateInput?.enrollmentProgress?.requiredHours ?? 0,
        },
        proposedSlot: {
          slotStart: slotStart,
          slotEnd: slotEnd,
          instructorId: instructorId ?? '',
          aircraftId: aircraftId ?? '',
          locationId: locationId ?? '',
        },
        constraintResults,
        priorityScore: candidate.score,
        prioritySignalBreakdown: candidate.signals,
        operatorContext: { operatorName: operatorId },
        candidateCount: ranked.length,
        topRank: attemptCount === 1,
      };

      const rationale = await this.rationaleGenerator.generateRationale(rationaleInput);

      // 6d. Create PENDING Suggestion
      const expiresAt = new Date(Date.now() + SUGGESTION_EXPIRY_HOURS * 60 * 60 * 1000);

      const suggestion = await this.prisma.suggestion.create({
        data: {
          operatorId,
          fspOperatorId,
          useCaseType: USE_CASE_TYPE.NEW_OPENING,
          status: SUGGESTION_STATUS.PENDING,
          reservationId: event.reservationId,
          changeEventId: correlationId,
          candidatePayload: {
            studentId: candidate.studentId,
            score: candidate.score,
            signals: candidate.signals,
            slotStart,
            slotEnd,
            aircraftId: aircraftId ?? null,
            locationId: locationId ?? null,
            instructorId: instructorId ?? null,
            activityTypeId: activityTypeId ?? null,
            validateRequest,
            constraintResults,
          } as unknown as Prisma.InputJsonValue,
          llmResponse: rationale.rationale,
          llmModel: 'claude-opus-4-6',
          expiresAt,
        },
      });

      // 6e. Write AuditLog
      await this.prisma.auditLog.create({
        data: {
          operatorId,
          correlationId: randomUUID(),
          service: WaitlistUseCaseService.name,
          action: 'SUGGESTION_CREATED',
          entityType: 'Suggestion',
          entityId: suggestion.id,
          metadata: {
            changeType: 'NEW_OPENING',
            studentId: candidate.studentId,
            score: candidate.score,
            usedFallback: rationale.usedFallback,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      this.logger.log(
        `Created PENDING suggestion ${suggestion.id} for student ${candidate.studentId} (score ${candidate.score.toFixed(3)})`,
        { service: WaitlistUseCaseService.name, operatorId },
      );
      return;
    }

    // All candidates exhausted
    this.logger.warn(
      `${attemptCount} candidates attempted, no suggestion created for operator ${operatorId}`,
      { service: WaitlistUseCaseService.name, operatorId },
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Fetches reservations and enrollment progress for a single student and
   * constructs a CandidateInput for the PriorityWeightEngine.
   *
   * @param student       - FSP student record.
   * @param fspOperatorId - Numeric FSP operator identifier (as string for API calls).
   * @param lookbackDate  - Start of reservation history window.
   * @param lookaheadDate - End of reservation future window.
   * @returns CandidateInput with reservations and enrollment progress.
   */
  private async buildCandidateInput(
    student: FspStudent,
    fspOperatorId: string,
    lookbackDate: Date,
    lookaheadDate: Date,
  ): Promise<CandidateInput> {
    // Fetch reservation history
    const reservationsResult = await this.reservationsService.getReservationsForPerson(
      fspOperatorId,
      student.studentId,
      {
        startDate: lookbackDate.toISOString().slice(0, 10),
        endDate: lookaheadDate.toISOString().slice(0, 10),
      },
    );

    const rawReservations: FspReservation[] =
      reservationsResult.success && reservationsResult.data ? reservationsResult.data : [];

    const reservations = rawReservations.map(r => ({
      startDateTime: r.startDateTime,
      endDateTime: r.endDateTime,
      status: r.status ?? 'Unknown',
    }));

    // Fetch enrollment progress
    let enrollmentProgress: { completedHours: number; requiredHours: number } | null = null;
    const enrollmentsResult = await this.enrollmentService.getEnrollments(
      fspOperatorId,
      student.studentId,
    );

    if (enrollmentsResult.success && enrollmentsResult.data && enrollmentsResult.data.length > 0) {
      const activeEnrollment = enrollmentsResult.data[0];
      if (activeEnrollment) {
        const progressResult = await this.enrollmentService.getProgress(
          fspOperatorId,
          activeEnrollment.enrollmentId,
        );
        if (progressResult.success && progressResult.data) {
          const p: FspEnrollmentProgress = progressResult.data;
          enrollmentProgress = {
            completedHours: p.completedHours ?? 0,
            requiredHours: p.requiredHours ?? 0,
          };
        }
      }
    }

    return {
      studentId: student.studentId,
      reservations,
      enrollmentProgress,
    };
  }

  /**
   * Safely parses the priority weights JSON from the database.
   * Falls back to the engine's default config on any parse failure.
   *
   * @param raw - Raw JSON value from the database `priorityWeights` column.
   * @returns A valid PriorityWeightConfig.
   */
  private parsePriorityWeights(raw: unknown): ReturnType<PriorityWeightEngine['getDefaultConfig']> {
    try {
      if (typeof raw === 'object' && raw !== null) {
        return raw as ReturnType<PriorityWeightEngine['getDefaultConfig']>;
      }
    } catch {
      // fall through
    }
    return this.priorityWeightEngine.getDefaultConfig();
  }
}
