/**
 * discovery-use-case.service.ts
 * --------------------------------
 * Agentic Scheduler — FSP Integration — Use Case C: Discovery
 * -------------------------------------------------------------
 * Handles DISCOVERY_REQUEST ChangeEventMessages emitted by the Change
 * Detection Engine (PR-9). For each discovery prospect the service:
 *
 *   1. Reads the operator's policyConfig to obtain:
 *        • discoveryEligibleInstructorIds — instructors approved for discovery
 *        • discoveryEligibleAircraftIds   — aircraft approved for discovery
 *        • discoverySearchWindowDays      — date-range width when no dates given
 *   2. Early exits with a warning if no eligible aircraft are configured
 *      (a discovery flight cannot be scheduled without a suitable aircraft).
 *   3. Builds the date range from rawDiff.preferredDates (if provided) or
 *      falls back to today + discoverySearchWindowDays.
 *   4. Calls FindATimeService.getAvailableSlots with the eligible instructor
 *      and aircraft IDs so the FSP scheduler can filter at source.
 *   5. Filters returned slots to only those with an eligible instructor AND
 *      an eligible aircraft (defence against FSP returning unexpected results).
 *   6. Filters slots against civil twilight for the location:
 *        • slot.startDateTime >= civilTwilightBegin
 *        • slot.endDateTime   <= civilTwilightEnd
 *      Fail-open on API error (slot is allowed through) to avoid blocking
 *      the pipeline. Slots that start before sunrise are logged as
 *      "outside civil twilight" and excluded.
 *   7. For each remaining slot (up to DISCOVERY_MAX_SUGGESTIONS):
 *        a. Calls FSP validateReservation. Failure → slot skipped.
 *        b. Generates plain-English rationale via RationaleGenerator (PR-12).
 *        c. Creates a PENDING Suggestion record (useCaseType = DISCOVERY).
 *        d. Writes an AuditLog entry.
 *
 * The service always resolves — never rejects. Errors are logged and the
 * method returns without creating additional suggestions.
 *
 * Key exports: DiscoveryUseCaseService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-15 — Use Case C — Discovery
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaService } from '@fsp-scheduler/database';
import { Prisma } from '@fsp-scheduler/database';
import type {
  ChangeEventMessage,
  FspFindATimeRequest,
  FspFindATimeSlot,
  FspReservationCreateRequest,
  FspCivilTwilight,
} from '@fsp-scheduler/shared-types';
import {
  SUGGESTION_STATUS,
  USE_CASE_TYPE,
  SUGGESTION_EXPIRY_HOURS,
  DISCOVERY_MAX_SUGGESTIONS,
  DISCOVERY_DEFAULT_SEARCH_WINDOW_DAYS,
  DISCOVERY_DEFAULT_DURATION_MINUTES,
} from '@fsp-scheduler/shared-types';
import type { RationaleInput } from '@fsp-scheduler/shared-types';
import type { FindATimeService } from '@fsp-scheduler/fsp-client';
import type { CivilTwilightService } from '@fsp-scheduler/fsp-client';
import type { ReservationsService } from '@fsp-scheduler/fsp-client';
import type { RationaleGenerator } from '../../llm/rationale-generator';

/** Milliseconds per day — used for date arithmetic. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Shape of the operator policyConfig JSON relevant to discovery. */
interface DiscoveryPolicyConfig {
  discoveryEligibleInstructorIds?: string[];
  discoveryEligibleAircraftIds?: string[];
  discoverySearchWindowDays?: number;
}

/**
 * Service for Use Case C: find discovery flight slots for a prospect and
 * create up to DISCOVERY_MAX_SUGGESTIONS PENDING suggestions.
 *
 * All constraint checks run before a suggestion is persisted.
 * The service always resolves — never rejects.
 */
@Injectable()
export class DiscoveryUseCaseService {
  private readonly logger = new Logger(DiscoveryUseCaseService.name);

  /**
   * @param prisma               - Database client for Suggestion and AuditLog writes.
   * @param civilTwilightService - FSP client for civil twilight times at a location.
   * @param findATimeService     - FSP client for discovering available slots.
   * @param reservationsService  - FSP client for validateReservation.
   * @param rationaleGenerator   - LLM rationale generator (PR-12).
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly civilTwilightService: CivilTwilightService,
    private readonly findATimeService: FindATimeService,
    private readonly reservationsService: ReservationsService,
    private readonly rationaleGenerator: RationaleGenerator,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Processes a DISCOVERY_REQUEST change event and creates up to
   * DISCOVERY_MAX_SUGGESTIONS PENDING suggestions for the prospect.
   *
   * Always resolves — never rejects. Errors are logged and the method returns
   * without creating additional suggestions.
   *
   * @param event - ChangeEventMessage with changeType === 'DISCOVERY_REQUEST'.
   */
  public async processDiscoveryRequest(event: ChangeEventMessage): Promise<void> {
    const { operatorId, fspOperatorId, correlationId } = event;
    const rawDiff = event.rawDiff;

    const prospectId = (rawDiff.prospectId as string) ?? '';
    const locationId = rawDiff.locationId as string | undefined;
    const preferredDates = (rawDiff.preferredDates as string[]) ?? [];

    this.logger.log(
      `Processing DISCOVERY_REQUEST for operator ${operatorId}, prospect ${prospectId}`,
      { service: DiscoveryUseCaseService.name, operatorId, correlationId },
    );

    // ── Step 1: Read operator policyConfig from DB ────────────────────────────
    let policy: DiscoveryPolicyConfig = {};
    try {
      const operator = await this.prisma.operator.findUnique({
        where: { operatorId },
        select: { policyConfig: true },
      });
      if (operator?.policyConfig && typeof operator.policyConfig === 'object') {
        policy = operator.policyConfig as DiscoveryPolicyConfig;
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to read policyConfig for operator ${operatorId} — using defaults`,
        { service: DiscoveryUseCaseService.name, operatorId },
      );
    }

    const eligibleInstructorIds = policy.discoveryEligibleInstructorIds ?? [];
    const eligibleAircraftIds = policy.discoveryEligibleAircraftIds ?? [];
    const searchWindowDays = policy.discoverySearchWindowDays ?? DISCOVERY_DEFAULT_SEARCH_WINDOW_DAYS;

    // ── Step 2: Early exit if no eligible aircraft configured ─────────────────
    if (eligibleAircraftIds.length === 0) {
      this.logger.warn(
        `no eligible aircraft configured for discovery — no suggestions created`,
        { service: DiscoveryUseCaseService.name, operatorId },
      );
      return;
    }

    // ── Step 3: Build search date range ───────────────────────────────────────
    const now = new Date();
    let startDate: string;
    let endDate: string;

    if (preferredDates.length > 0) {
      const sorted = [...preferredDates].sort();
      startDate = sorted[0] ?? '';
      endDate = sorted[sorted.length - 1] ?? '';
    } else {
      startDate = now.toISOString().slice(0, 10);
      endDate = new Date(now.getTime() + searchWindowDays * MS_PER_DAY)
        .toISOString()
        .slice(0, 10);
    }

    // ── Step 4: Discover available slots via FindATimeService ─────────────────
    let slots: FspFindATimeSlot[] = [];
    try {
      const requestData: FspFindATimeRequest = {
        studentId: prospectId,
        startDate,
        endDate,
        durationMinutes: DISCOVERY_DEFAULT_DURATION_MINUTES,
        preferredAircraftIds: eligibleAircraftIds,
      };
      if (eligibleInstructorIds.length > 0) {
        requestData.preferredInstructorIds = eligibleInstructorIds;
      }
      const result = await this.findATimeService.getAvailableSlots(
        String(fspOperatorId),
        requestData,
      );
      if (result.success && result.data) {
        slots = result.data;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `FindATimeService failed for operator ${operatorId}: ${msg}`,
        { service: DiscoveryUseCaseService.name, operatorId },
      );
      return;
    }

    // ── Step 5: Filter by eligible instructor and aircraft ────────────────────
    slots = slots.filter((slot) => {
      const instructorOk =
        eligibleInstructorIds.length === 0 ||
        eligibleInstructorIds.includes(slot.instructorId ?? '');
      const aircraftOk = eligibleAircraftIds.includes(slot.aircraftId ?? '');
      return instructorOk && aircraftOk;
    });

    // ── Step 6: Civil twilight filter ─────────────────────────────────────────
    if (locationId) {
      slots = await this.filterByCivilTwilight(
        String(fspOperatorId),
        locationId,
        slots,
        operatorId,
      );
    }

    // ── Step 7: Validate and create suggestions (up to DISCOVERY_MAX_SUGGESTIONS) ──
    let created = 0;

    for (const slot of slots) {
      if (created >= DISCOVERY_MAX_SUGGESTIONS) break;

      // 7a. FSP validateReservation
      const validateRequest: FspReservationCreateRequest = {
        operatorId: String(fspOperatorId),
        startDateTime: slot.startDateTime,
        endDateTime: slot.endDateTime,
        ...(slot.instructorId ? { instructorId: slot.instructorId } : {}),
        ...(slot.aircraftId ? { aircraftId: slot.aircraftId } : {}),
        ...(locationId ? { locationId } : {}),
      };

      const validateResult = await this.reservationsService.validateReservation(
        String(fspOperatorId),
        validateRequest,
      );

      if (!validateResult.success) {
        this.logger.log(
          `Slot validation failed for ${slot.startDateTime} — skipping`,
          { service: DiscoveryUseCaseService.name, operatorId },
        );
        continue;
      }

      // 7b. Generate LLM rationale
      const constraintResults: Record<string, boolean> = {
        'Civil twilight': true,
        'Eligible instructor': true,
        'Eligible aircraft': true,
        'Validation passed': true,
      };

      const rationaleInput: RationaleInput = {
        student: {
          studentId: prospectId,
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

      // 7c. Create PENDING Suggestion
      const expiresAt = new Date(Date.now() + SUGGESTION_EXPIRY_HOURS * 60 * 60 * 1000);

      let suggestion: { id: string };
      try {
        suggestion = await this.prisma.suggestion.create({
          data: {
            operatorId,
            fspOperatorId,
            useCaseType: USE_CASE_TYPE.DISCOVERY,
            status: SUGGESTION_STATUS.PENDING,
            reservationId: event.reservationId,
            changeEventId: correlationId,
            candidatePayload: {
              prospectId,
              slotStart: slot.startDateTime,
              slotEnd: slot.endDateTime,
              instructorId: slot.instructorId ?? null,
              aircraftId: slot.aircraftId ?? null,
              locationId: locationId ?? null,
              validateRequest,
              constraintResults,
            } as unknown as Prisma.InputJsonValue,
            llmResponse: rationale.rationale,
            llmModel: 'claude-opus-4-6',
            expiresAt,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to persist suggestion for slot ${slot.startDateTime}: ${msg}`,
          { service: DiscoveryUseCaseService.name, operatorId },
        );
        continue;
      }

      // 7d. Write AuditLog
      await this.prisma.auditLog.create({
        data: {
          operatorId,
          correlationId: randomUUID(),
          service: DiscoveryUseCaseService.name,
          action: 'SUGGESTION_CREATED',
          entityType: 'Suggestion',
          entityId: suggestion.id,
          metadata: {
            changeType: 'DISCOVERY_REQUEST',
            prospectId,
            slotStart: slot.startDateTime,
            usedFallback: rationale.usedFallback,
          } as Prisma.InputJsonValue,
        },
      });

      created++;
      this.logger.log(
        `Created PENDING suggestion ${suggestion.id} for prospect ${prospectId} at ${slot.startDateTime}`,
        { service: DiscoveryUseCaseService.name, operatorId },
      );
    }

    if (created === 0) {
      this.logger.warn(
        `no suggestions created for discovery prospect ${prospectId} (operator ${operatorId})`,
        { service: DiscoveryUseCaseService.name, operatorId },
      );
    } else {
      this.logger.log(
        `Discovery complete: created ${created} PENDING suggestion(s) for operator ${operatorId}`,
        { service: DiscoveryUseCaseService.name, operatorId },
      );
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Fetches civil twilight times for each unique date in the slots array and
   * returns only slots that fall entirely within civil twilight:
   *   slot.startDateTime >= civilTwilightBegin
   *   slot.endDateTime   <= civilTwilightEnd
   *
   * Fail-open: if the civil twilight API call fails for a date, the slot is
   * allowed through to avoid blocking the pipeline on an FSP error.
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
    const uniqueDates = [...new Set(slots.map((s) => s.startDateTime.slice(0, 10)))];

    // Fetch civil twilight for each unique date
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

    // Filter: slot must start at or after twilightBegin AND end at or before twilightEnd
    return slots.filter((slot) => {
      const date = slot.startDateTime.slice(0, 10);
      const twilight = twilightByDate.get(date);

      if (!twilight || !twilight.civilTwilightBegin || !twilight.civilTwilightEnd) {
        // No data — allow slot through (fail-open)
        this.logger.debug(
          `No civil twilight data for ${date} at ${locationId} — slot allowed through`,
          { service: DiscoveryUseCaseService.name, operatorId },
        );
        return true;
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
          `Slot ${slot.startDateTime}–${slot.endDateTime} excluded: outside civil twilight window (${twilight.civilTwilightBegin}–${twilight.civilTwilightEnd})`,
          { service: DiscoveryUseCaseService.name, operatorId },
        );
        return false;
      }

      return true;
    });
  }
}
