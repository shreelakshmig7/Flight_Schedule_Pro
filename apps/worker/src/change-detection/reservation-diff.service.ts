/**
 * reservation-diff.service.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — Pure reservation diff utility
 * -------------------------------------------------------------------
 * Stateless service responsible for three operations:
 *   1. computeHash   — deterministic SHA-256 of a sorted, deduplicated
 *                       reservations array for change detection.
 *   2. deduplicateById — removes duplicate FSP reservations by reservationId,
 *                         keeping the first occurrence (defensive against
 *                         duplicate entries in FSP API responses).
 *   3. detectChanges — compares previous vs next reservation snapshots and
 *                       returns a typed list of DetectedChange records.
 *
 * Change detection rules
 * ──────────────────────
 *   CANCELLATION : A reservation that was present in `prev` is absent from
 *                  `next` (or its status indicates cancellation) AND the
 *                  reservation had a `studentId` assigned. Maintenance blocks
 *                  (no studentId) never produce CANCELLATION events.
 *
 *   NEW_OPENING  : A reservation that was present in `prev` is absent from
 *                  `next` (or cancelled) AND had both `aircraftId` AND
 *                  `instructorId` assigned, meaning a resource combination
 *                  is now available. The rawDiff includes the freed slot.
 *
 *   STATUS_CHANGE: A reservation present in both `prev` and `next` whose
 *                  `status` field changed to a non-cancellation value.
 *
 * A single cancelled student+aircraft+instructor reservation emits both a
 * CANCELLATION and a NEW_OPENING, so that both use-case handlers can react.
 *
 * Key exports: DetectedChange, ReservationDiffService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-9 — Change Detection Engine
 */

import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { FspReservation, ChangeType } from '@fsp-scheduler/shared-types';

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * A single change detected between two consecutive reservation snapshots.
 * The `rawDiff` carries enough context for the use-case handler to act without
 * making additional FSP API calls.
 */
export interface DetectedChange {
  /** Category of the detected change. */
  changeType: ChangeType;
  /** FSP reservation ID that triggered the change event. */
  reservationId: string;
  /**
   * Structured diff payload. Never logged in plain text — may contain PII.
   * The exact shape depends on `changeType`.
   */
  rawDiff: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when a reservation status string indicates a cancellation.
 * Case-insensitive substring match covers 'CANCELLED', 'Cancelled', etc.
 *
 * @param status - The status value from a FspReservation record.
 */
function isCancelledStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status.toLowerCase().includes('cancel');
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Stateless diff utility — all methods are pure functions.
 * Injected as a NestJS provider so that it can be mocked in unit tests.
 */
@Injectable()
export class ReservationDiffService {
  // ── Hash ─────────────────────────────────────────────────────────────────

  /**
   * Computes a deterministic SHA-256 hex hash of a reservations list.
   *
   * Steps:
   *   1. Deduplicate entries by `reservationId` (defensive against FSP duplicates).
   *   2. Sort by `reservationId` so that response-order changes do not trigger
   *      false-positive change detection.
   *   3. Serialize to JSON and hash with SHA-256.
   *
   * @param reservations - Raw list of FSP reservations from the latest poll.
   * @returns 64-character lowercase hex SHA-256 digest.
   */
  computeHash(reservations: FspReservation[]): string {
    const unique = this.deduplicateById(reservations);
    const sorted = [...unique].sort((a, b) =>
      a.reservationId.localeCompare(b.reservationId),
    );
    return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
  }

  // ── Deduplication ────────────────────────────────────────────────────────

  /**
   * Removes duplicate entries from a reservations list, keeping only the
   * first occurrence of each `reservationId`.
   *
   * @param reservations - Raw (potentially duplicated) FSP reservation list.
   * @returns Deduplicated list preserving original order.
   */
  deduplicateById(reservations: FspReservation[]): FspReservation[] {
    const seen = new Set<string>();
    return reservations.filter((r) => {
      if (seen.has(r.reservationId)) return false;
      seen.add(r.reservationId);
      return true;
    });
  }

  // ── Diff ─────────────────────────────────────────────────────────────────

  /**
   * Compares two consecutive reservation snapshots and returns all detected
   * changes as typed `DetectedChange` records.
   *
   * Neither input list needs to be deduplicated first — the method builds
   * internal Maps keyed by `reservationId` before processing.
   *
   * @param prev - Reservation list from the previous poll.
   * @param next - Reservation list from the current poll.
   * @returns Array of detected changes (may be empty).
   */
  detectChanges(
    prev: FspReservation[],
    next: FspReservation[],
  ): DetectedChange[] {
    const changes: DetectedChange[] = [];

    const prevMap = new Map(prev.map((r) => [r.reservationId, r]));
    const nextMap = new Map(next.map((r) => [r.reservationId, r]));

    for (const [id, prevRes] of prevMap) {
      const nextRes = nextMap.get(id);

      // Reservation is absent from next, or its status changed to cancelled
      const isFreed =
        !nextRes || isCancelledStatus(nextRes.status);

      if (isFreed) {
        // CANCELLATION — only for student reservations
        if (prevRes.studentId) {
          changes.push({
            changeType: 'CANCELLATION',
            reservationId: id,
            rawDiff: {
              previous: prevRes,
              next: nextRes ?? null,
              studentId: prevRes.studentId,
            },
          });
        }

        // NEW_OPENING — only when both aircraft and instructor are freed
        if (prevRes.aircraftId && prevRes.instructorId) {
          changes.push({
            changeType: 'NEW_OPENING',
            reservationId: id,
            rawDiff: {
              freedSlot: {
                startDateTime: prevRes.startDateTime,
                endDateTime: prevRes.endDateTime,
                locationId: prevRes.locationId ?? null,
                aircraftId: prevRes.aircraftId,
                instructorId: prevRes.instructorId,
              },
              source: prevRes,
            },
          });
        }

        // Skip STATUS_CHANGE — the reservation was removed or cancelled
        continue;
      }

      // STATUS_CHANGE — reservation present in both, status changed to non-cancelled value
      if (nextRes && prevRes.status !== nextRes.status) {
        changes.push({
          changeType: 'STATUS_CHANGE',
          reservationId: id,
          rawDiff: {
            previous: prevRes,
            next: nextRes,
            oldStatus: prevRes.status,
            newStatus: nextRes.status,
          },
        });
      }
    }

    return changes;
  }
}
