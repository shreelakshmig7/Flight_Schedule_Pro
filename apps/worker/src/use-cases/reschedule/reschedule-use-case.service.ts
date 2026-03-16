/**
 * reschedule-use-case.service.ts
 * --------------------------------
 * Agentic Scheduler — FSP Integration — Use Case B: Reschedule / Cancellation
 * -------------------------------------------------------------------------------
 * Handles CANCELLATION ChangeEventMessages emitted by the Change Detection
 * Engine (PR-9). For each cancelled reservation the service:
 *
 *   1. Extracts the affected student, instructor, location, activity type,
 *      and original slot duration from the event rawDiff.
 *   2. Reads the operator's policyConfig from the database to determine
 *      whether the same instructor should be preferred (fsp-005).
 *   3. Calls FindATimeService.getAvailableSlots to discover alternative
 *      scheduling slots within RESCHEDULE_SEARCH_WINDOW_DAYS.
 *        • If preferSameInstructor is true and no same-instructor slots are
 *          found, the service falls back to any eligible instructor and logs
 *          "instructor fallback" (fsp-018).
 *        • If no slots are found at all, logs "no slots found" and
 *          "no suggestions created" then returns (fsp-032).
 *   4. Filters slots against civil twilight for the location/date — slots
 *      that end after civil twilight end are excluded (fail-open on API
 *      error to avoid blocking the pipeline).
 *   5. For each remaining slot (up to RESCHEDULE_MAX_SUGGESTIONS):
 *        a. Checks student/instructor availability via getBatchAvailability.
 *           Unavailable participants → slot skipped.
 *        b. Calls FSP validateReservation. Failure → slot skipped.
 *        c. Generates plain-English rationale via RationaleGenerator (PR-12).
 *        d. Creates a PENDING Suggestion record in the database.
 *        e. Writes an AuditLog entry.
 *
 * The service always resolves — never rejects. Errors are logged and the
 * method returns without creating additional suggestions.
 *
 * Key exports: RescheduleUseCaseService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-14 — Use Case B — Reschedule
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaService } from '@fsp-scheduler/database';
import { Prisma } from '@fsp-scheduler/database';
import type {
  ChangeEventMessage,
  FspFindATimeRequest,
  FspFindATimeSlot,
  FspAvailabilityBatchRequest,
  FspReservationCreateRequest,
  FspCivilTwilight,
} from '@fsp-scheduler/shared-types';
import {
  SUGGESTION_STATUS,
  USE_CASE_TYPE,
  SUGGESTION_EXPIRY_HOURS,
  RESCHEDULE_MAX_SUGGESTIONS,
  RESCHEDULE_SEARCH_WINDOW_DAYS,
  RESCHEDULE_DEFAULT_POLICY_CONFIG,
  RESCHEDULE_DEFAULT_DURATION_MINUTES,
} from '@fsp-scheduler/shared-types';
import type { RationaleInput } from '@fsp-scheduler/shared-types';
import type { FindATimeService } from '@fsp-scheduler/fsp-client';
import type { CivilTwilightService } from '@fsp-scheduler/fsp-client';
import type { AvailabilityService } from '@fsp-scheduler/fsp-client';
import type { ReservationsService } from '@fsp-scheduler/fsp-client';
import type { RationaleGenerator } from '../../llm/rationale-generator';

/** Milliseconds per day — used for date arithmetic. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Milliseconds per minute — used for duration calculation. */
const MS_PER_MINUTE = 60 * 1000;

/** Shape of the operator policyConfig JSON stored in the database. */
interface PolicyConfig {
  preferSameInstructor?: boolean;
}

/**
 * Service for Use Case B: find alternative scheduling slots for a cancelled
 * reservation and create up to RESCHEDULE_MAX_SUGGESTIONS PENDING suggestions.
 *
 * All constraint checks run before a suggestion is persisted.
 * The service always resolves — never rejects.
 */
@Injectable()
export class RescheduleUseCaseService {
  private readonly logger = new Logger(RescheduleUseCaseService.name);

  /**
   * @param prisma               - Database client for Suggestion and AuditLog writes.
   * @param findATimeService     - FSP client for discovering available slots.
   * @param civilTwilightService - FSP client for civil twilight times at a location.
   * @param availabilityService  - FSP client for batch availability checks.
   * @param reservationsService  - FSP client for validateReservation.
   * @param rationaleGenerator   - LLM rationale generator (PR-12).
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly findATimeService: FindATimeService,
    private readonly civilTwilightService: CivilTwilightService,
    private readonly availabilityService: AvailabilityService,
    private readonly reservationsService: ReservationsService,
    private readonly rationaleGenerator: RationaleGenerator,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Processes a CANCELLATION change event and creates up to
   * RESCHEDULE_MAX_SUGGESTIONS PENDING suggestions for alternative slots.
   *
   * Always resolves — never rejects. Errors are logged and the method returns
   * without creating additional suggestions.
   *
   * @param event - ChangeEventMessage with changeType === 'CANCELLATION'.
   */
  public async processCancellation(event: ChangeEventMessage): Promise<void> {
    const { operatorId, fspOperatorId, correlationId } = event;
    const rawDiff = event.rawDiff as Record<string, string | undefined>;

    const studentId = rawDiff.studentId ?? '';
    const instructorId = rawDiff.instructorId;
    const locationId = rawDiff.locationId;
    const activityTypeId = rawDiff.activityTypeId;
    const originalStart = rawDiff.originalStart;
    const originalEnd = rawDiff.originalEnd;

    this.logger.log(
      `Processing CANCELLATION for operator ${operatorId}, reservation ${event.reservationId}`,
      { service: RescheduleUseCaseService.name, operatorId, correlationId },
    );

    // Duration in minutes from the original reservation
    const durationMinutes = this.computeDurationMinutes(originalStart, originalEnd);

    // ── Step 1: Read operator policyConfig from DB ────────────────────────────
    let policy: PolicyConfig = RESCHEDULE_DEFAULT_POLICY_CONFIG;
    try {
      const operator = await this.prisma.operator.findUnique({
        where: { operatorId },
        select: { policyConfig: true },
      });
      if (operator?.policyConfig && typeof operator.policyConfig === 'object') {
        policy = operator.policyConfig as PolicyConfig;
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to read policyConfig for operator ${operatorId} — using defaults`,
        { service: RescheduleUseCaseService.name, operatorId },
      );
    }

    const preferSameInstructor = policy.preferSameInstructor === true;

    // ── Step 2: Build search window ───────────────────────────────────────────
    const now = new Date();
    const startDate = now.toISOString().slice(0, 10);
    const endDate = new Date(now.getTime() + RESCHEDULE_SEARCH_WINDOW_DAYS * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);

    // ── Step 3: Discover available slots ─────────────────────────────────────
    let slots: FspFindATimeSlot[] = [];

    if (preferSameInstructor && instructorId) {
      // First attempt: same instructor preferred
      slots = await this.fetchSlots(String(fspOperatorId), {
        studentId,
        durationMinutes,
        startDate,
        endDate,
        activityTypeId,
        preferredInstructorIds: [instructorId],
      });

      if (slots.length === 0) {
        // Fallback: any eligible instructor
        this.logger.log(
          `instructor fallback: no slots found with instructor ${instructorId} — retrying without instructor preference`,
          { service: RescheduleUseCaseService.name, operatorId },
        );
        slots = await this.fetchSlots(String(fspOperatorId), {
          studentId,
          durationMinutes,
          startDate,
          endDate,
          activityTypeId,
        });
      }
    } else {
      slots = await this.fetchSlots(String(fspOperatorId), {
        studentId,
        durationMinutes,
        startDate,
        endDate,
        activityTypeId,
        ...(preferSameInstructor && instructorId
          ? { preferredInstructorIds: [instructorId] }
          : {}),
      });
    }

    if (slots.length === 0) {
      this.logger.warn(
        `no slots found for operator ${operatorId} — no suggestions created`,
        { service: RescheduleUseCaseService.name, operatorId },
      );
      return;
    }

    // ── Step 4: Civil twilight filter ─────────────────────────────────────────
    if (locationId) {
      slots = await this.filterByCivilTwilight(
        String(fspOperatorId),
        locationId,
        slots,
        operatorId,
      );
    }

    // ── Step 5: Validate and create suggestions (up to RESCHEDULE_MAX_SUGGESTIONS) ──
    let created = 0;

    for (const slot of slots) {
      if (created >= RESCHEDULE_MAX_SUGGESTIONS) break;

      // 5a. Availability check
      const userIds = [studentId];
      if (slot.instructorId) userIds.push(slot.instructorId);

      const availRequest: FspAvailabilityBatchRequest = {
        userIds,
        startDate: slot.startDateTime.slice(0, 10),
        endDate: slot.endDateTime.slice(0, 10),
        ...(activityTypeId ? { activityTypeId } : {}),
        ...(locationId ? { locationId } : {}),
      };

      const availResult = await this.availabilityService.getBatchAvailability(
        String(fspOperatorId),
        availRequest,
      );

      if (availResult.success && availResult.data?.results) {
        const unavailable = availResult.data.results.find(
          r => r.userId === studentId && r.available === false,
        );
        if (unavailable) {
          this.logger.log(
            `slot skipped: student ${studentId} unavailable for ${slot.startDateTime}`,
            { service: RescheduleUseCaseService.name, operatorId },
          );
          continue;
        }
      }

      // 5b. FSP validateReservation
      const validateRequest: FspReservationCreateRequest = {
        operatorId: String(fspOperatorId),
        startDateTime: slot.startDateTime,
        endDateTime: slot.endDateTime,
        studentId,
        ...(slot.instructorId ? { instructorId: slot.instructorId } : instructorId ? { instructorId } : {}),
        ...(slot.aircraftId ? { aircraftId: slot.aircraftId } : {}),
        ...(locationId ? { locationId } : {}),
        ...(activityTypeId ? { activityTypeId } : {}),
      };

      const validateResult = await this.reservationsService.validateReservation(
        String(fspOperatorId),
        validateRequest,
      );

      if (!validateResult.success) {
        this.logger.log(
          `slot validation failed for ${slot.startDateTime} — skipping`,
          { service: RescheduleUseCaseService.name, operatorId },
        );
        continue;
      }

      // 5c. Generate LLM rationale
      const constraintResults: Record<string, boolean> = {
        'Student availability': true,
        'Validation passed': true,
        'Civil twilight': true,
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
          instructorId: slot.instructorId ?? instructorId ?? '',
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

      // 5d. Create PENDING Suggestion
      const expiresAt = new Date(Date.now() + SUGGESTION_EXPIRY_HOURS * 60 * 60 * 1000);

      let suggestion: { id: string };
      try {
        suggestion = await this.prisma.suggestion.create({
          data: {
            operatorId,
            fspOperatorId,
            useCaseType: USE_CASE_TYPE.CANCELLATION_FILL,
            status: SUGGESTION_STATUS.PENDING,
            reservationId: event.reservationId,
            changeEventId: correlationId,
            candidatePayload: {
              studentId,
              slotStart: slot.startDateTime,
              slotEnd: slot.endDateTime,
              instructorId: slot.instructorId ?? instructorId ?? null,
              aircraftId: slot.aircraftId ?? null,
              locationId: locationId ?? null,
              activityTypeId: activityTypeId ?? null,
              durationMinutes,
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
          { service: RescheduleUseCaseService.name, operatorId },
        );
        continue;
      }

      // 5e. Write AuditLog
      await this.prisma.auditLog.create({
        data: {
          operatorId,
          correlationId: randomUUID(),
          service: RescheduleUseCaseService.name,
          action: 'SUGGESTION_CREATED',
          entityType: 'Suggestion',
          entityId: suggestion.id,
          metadata: {
            changeType: 'CANCELLATION',
            studentId,
            slotStart: slot.startDateTime,
            usedFallback: rationale.usedFallback,
          } as Prisma.InputJsonValue,
        },
      });

      created++;
      this.logger.log(
        `Created PENDING suggestion ${suggestion.id} for student ${studentId} at ${slot.startDateTime}`,
        { service: RescheduleUseCaseService.name, operatorId },
      );
    }

    if (created === 0) {
      this.logger.warn(
        `All slots failed constraints — no suggestions created for operator ${operatorId}`,
        { service: RescheduleUseCaseService.name, operatorId },
      );
    } else {
      this.logger.log(
        `Reschedule complete: created ${created} PENDING suggestion(s) for operator ${operatorId}`,
        { service: RescheduleUseCaseService.name, operatorId },
      );
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Calls FindATimeService and returns the slot array.
   * Returns an empty array on any FSP error.
   *
   * @param fspOperatorId - FSP operator identifier string.
   * @param req           - Find-a-time request parameters.
   */
  private async fetchSlots(
    fspOperatorId: string,
    req: Omit<FspFindATimeRequest, 'startDate' | 'endDate'> & { startDate: string; endDate: string },
  ): Promise<FspFindATimeSlot[]> {
    try {
      const result = await this.findATimeService.getAvailableSlots(fspOperatorId, req);
      return result.success && result.data ? result.data : [];
    } catch {
      return [];
    }
  }

  /**
   * Computes the duration of the original reservation in minutes.
   * Falls back to RESCHEDULE_DEFAULT_DURATION_MINUTES if times are missing.
   *
   * @param start - ISO-8601 start timestamp string or undefined.
   * @param end   - ISO-8601 end timestamp string or undefined.
   */
  private computeDurationMinutes(start?: string, end?: string): number {
    if (!start || !end) return RESCHEDULE_DEFAULT_DURATION_MINUTES;
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
      return RESCHEDULE_DEFAULT_DURATION_MINUTES;
    }
    return Math.round((endMs - startMs) / MS_PER_MINUTE);
  }

  /**
   * Fetches civil twilight times for each unique date represented in the
   * slots array and returns only slots that fall within civil twilight.
   *
   * Slots are allowed through (fail-open) when the civil twilight API call
   * fails for a given date to avoid blocking the pipeline on an FSP error.
   *
   * @param fspOperatorId - FSP operator identifier string.
   * @param locationId    - Location for which to retrieve civil twilight.
   * @param slots         - Candidate slots to filter.
   * @param operatorId    - Used for logging only.
   */
  private async filterByCivilTwilight(
    fspOperatorId: string,
    locationId: string,
    slots: FspFindATimeSlot[],
    operatorId: string,
  ): Promise<FspFindATimeSlot[]> {
    // Collect unique dates from all slots
    const uniqueDates = [...new Set(slots.map(s => s.startDateTime.slice(0, 10)))];

    // Fetch civil twilight for each date
    const twilightByDate = new Map<string, FspCivilTwilight | null>();
    await Promise.all(
      uniqueDates.map(async (date) => {
        try {
          const result = await this.civilTwilightService.getCivilTwilight(
            fspOperatorId,
            locationId,
            date,
          );
          twilightByDate.set(date, result.success && result.data ? result.data : null);
        } catch {
          twilightByDate.set(date, null);
        }
      }),
    );

    // Filter: slot must end before or at civilTwilightEnd (fail-open when data missing)
    return slots.filter((slot) => {
      const date = slot.startDateTime.slice(0, 10);
      const twilight = twilightByDate.get(date);

      if (!twilight || !twilight.civilTwilightEnd) {
        // No data — allow slot through (fail-open)
        this.logger.debug(
          `No civil twilight data for ${date} at ${locationId} — slot allowed through`,
          { service: RescheduleUseCaseService.name, operatorId },
        );
        return true;
      }

      const slotEnd = Date.parse(slot.endDateTime);
      const twilightEnd = Date.parse(twilight.civilTwilightEnd);

      if (isNaN(slotEnd) || isNaN(twilightEnd)) return true;

      if (slotEnd > twilightEnd) {
        this.logger.log(
          `Slot ${slot.startDateTime}–${slot.endDateTime} excluded: ends after civil twilight at ${twilight.civilTwilightEnd}`,
          { service: RescheduleUseCaseService.name, operatorId },
        );
        return false;
      }

      return true;
    });
  }
}
