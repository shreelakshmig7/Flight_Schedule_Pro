/**
 * next-lesson.module.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — Use Case D (Next Lesson) NestJS module
 * ------------------------------------------------------------------------------
 * Wires together all components required for the Next Lesson use case:
 *   - NextLessonUseCaseService — core business logic for STATUS_CHANGE events
 *   - NextLessonScanService    — hourly cron scan for proactive scheduling
 *
 * Imports:
 *   - LlmModule    — provides RationaleGenerator
 *   - ScheduleModule is assumed to be imported in the root AppModule, enabling
 *     the @Cron decorator used by NextLessonScanService.
 *
 * All FSP service classes (EnrollmentService, AutoScheduleService,
 * FindATimeService, etc.) and PrismaService are provided globally by
 * FspClientModule and DatabaseModule (imported in AppModule).
 *
 * Key exports: NextLessonModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-16 — Use Case D — Schedule Next Lesson on Completion
 */

import { Module } from '@nestjs/common';
import { LlmModule } from '../../llm/llm.module';
import { NextLessonUseCaseService } from './next-lesson-use-case.service';
import { NextLessonScanService } from './next-lesson-scan.service';

/**
 * Feature module for Use Case D — Next Lesson.
 *
 * Registers the NextLessonUseCaseService and NextLessonScanService.
 * FSP clients are available globally via FspClientModule, and
 * PrismaService via DatabaseModule.
 */
@Module({
  imports: [LlmModule],
  providers: [NextLessonUseCaseService, NextLessonScanService],
  exports: [NextLessonUseCaseService],
})
export class NextLessonModule {}
