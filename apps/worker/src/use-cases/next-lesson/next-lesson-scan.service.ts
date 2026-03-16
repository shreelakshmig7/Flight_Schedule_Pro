/**
 * next-lesson-scan.service.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — Next Lesson hourly scan
 * --------------------------------------------------------------
 * Runs an hourly cron job that discovers students with schedulable
 * pending lessons (via SchedulableEventsService) and triggers the
 * NextLessonUseCaseService for those who do not already have a
 * PENDING next-lesson suggestion (idempotency check).
 *
 * Flow per execution:
 *   1. Load all active operators from the database.
 *   2. For each operator, call SchedulableEventsService.getSchedulableEvents
 *      to retrieve students with pending unscheduled lessons.
 *   3. For each schedulable event, check whether a PENDING NEXT_LESSON
 *      suggestion already exists for that student (fsp-020 idempotency).
 *      If one exists: log "duplicate skipped" and continue.
 *   4. Otherwise, call NextLessonUseCaseService.scheduleNextLessonForStudent.
 *
 * Errors from any FSP API call are caught and logged; processing continues
 * for other operators and events.
 *
 * Key exports: NextLessonScanService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-16 — Use Case D — Schedule Next Lesson on Completion
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { PrismaService } from '@fsp-scheduler/database';
import { SUGGESTION_STATUS, USE_CASE_TYPE } from '@fsp-scheduler/shared-types';
import type { SchedulableEventsService } from '@fsp-scheduler/fsp-client';
import type { NextLessonUseCaseService } from './next-lesson-use-case.service';

/**
 * Hourly scan service that proactively schedules next lessons for students
 * whose most recent lesson has been completed.
 *
 * Idempotency: if a PENDING NEXT_LESSON suggestion already exists for a
 * student, the scan skips that student and logs "duplicate skipped".
 */
@Injectable()
export class NextLessonScanService {
  readonly logger = new Logger(NextLessonScanService.name);

  /**
   * @param prisma                   - Database client for operator lookups and suggestion checks.
   * @param schedulableEventsService - FSP client for discovering schedulable events.
   * @param nextLessonUseCaseService - Use-case service that creates suggestions.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulableEventsService: SchedulableEventsService,
    private readonly nextLessonUseCaseService: NextLessonUseCaseService,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Runs the hourly scan across all active operators.
   * Decorated with @Cron to fire at the top of every hour.
   *
   * Always resolves — never rejects.
   */
  @Cron(CronExpression.EVERY_HOUR)
  public async runHourlyScan(): Promise<void> {
    this.logger.log('NextLessonScanService: hourly scan started');

    // Load all active operators
    let operators: { operatorId: string; fspOperatorId: number }[];
    try {
      operators = await this.prisma.operator.findMany({
        select: { operatorId: true, fspOperatorId: true },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to load operators: ${msg}`, {
        service: NextLessonScanService.name,
      });
      return;
    }

    for (const operator of operators) {
      await this.scanOperator(operator.operatorId, operator.fspOperatorId);
    }

    this.logger.log('NextLessonScanService: hourly scan completed');
  }

  // ── Private: per-operator scan ──────────────────────────────────────────────

  /**
   * Processes all schedulable events for a single operator.
   * Errors are caught per-operator so that a failure for one operator
   * does not prevent processing of others.
   *
   * @param operatorId    - Internal operator ID string.
   * @param fspOperatorId - Numeric FSP operator identifier.
   */
  private async scanOperator(operatorId: string, fspOperatorId: number): Promise<void> {
    const fspOpStr = String(fspOperatorId);

    let events: { eventId: string; studentId?: string | null; enrollmentId?: string | null; locationId?: string | null }[];

    try {
      const result = await this.schedulableEventsService.getSchedulableEvents(fspOpStr, {
        pendingLessons: true,
      });

      if (!result.success || !result.data) {
        this.logger.warn(
          `SchedulableEventsService failed for operator ${operatorId}: ${result.error ?? 'unknown error'}`,
          { service: NextLessonScanService.name, operatorId },
        );
        return;
      }

      events = result.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `SchedulableEventsService threw for operator ${operatorId}: ${msg}`,
        { service: NextLessonScanService.name, operatorId },
      );
      return;
    }

    for (const event of events) {
      const studentId = event.studentId ?? null;
      const enrollmentId = event.enrollmentId ?? null;

      if (!studentId || !enrollmentId) {
        this.logger.debug(
          `Skipping event ${event.eventId} — missing studentId or enrollmentId`,
          { service: NextLessonScanService.name, operatorId },
        );
        continue;
      }

      // ── Idempotency check (fsp-020) ───────────────────────────────────────
      let existingSuggestion: { id: string } | null = null;
      try {
        existingSuggestion = await this.prisma.suggestion.findFirst({
          where: {
            operatorId,
            status: SUGGESTION_STATUS.PENDING,
            useCaseType: USE_CASE_TYPE.NEXT_LESSON,
          },
          select: { id: true },
        });
      } catch {
        // If idempotency check fails, proceed to create — better to create than silently skip
      }

      if (existingSuggestion) {
        this.logger.warn(
          `duplicate skipped — PENDING NEXT_LESSON suggestion already exists for student ${studentId} (operator ${operatorId})`,
          { service: NextLessonScanService.name, operatorId, studentId },
        );
        continue;
      }

      // ── Schedule the next lesson ───────────────────────────────────────────
      try {
        await this.nextLessonUseCaseService.scheduleNextLessonForStudent({
          operatorId,
          fspOperatorId,
          studentId,
          enrollmentId,
          locationId: event.locationId,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `scheduleNextLessonForStudent threw for student ${studentId}: ${msg}`,
          { service: NextLessonScanService.name, operatorId, studentId },
        );
      }
    }
  }
}
