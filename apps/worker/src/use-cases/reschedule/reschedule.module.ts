/**
 * reschedule.module.ts
 * ---------------------
 * Agentic Scheduler — FSP Integration — Use Case B (Reschedule) NestJS module
 * ------------------------------------------------------------------------------
 * Wires together all components required for the Reschedule use case:
 *   - RescheduleUseCaseService — core business logic for CANCELLATION events
 *
 * Imports:
 *   - LlmModule — provides RationaleGenerator
 *
 * All FSP service classes (FindATimeService, CivilTwilightService,
 * AvailabilityService, ReservationsService) are provided globally by
 * FspClientModule (already imported in AppModule).
 *
 * Key exports: RescheduleModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-14 — Use Case B — Reschedule
 */

import { Module } from '@nestjs/common';
import { LlmModule } from '../../llm/llm.module';
import { RescheduleUseCaseService } from './reschedule-use-case.service';

/**
 * Feature module for Use Case B — Reschedule / Cancellation.
 *
 * Registers the RescheduleUseCaseService. FSP clients are available globally
 * via FspClientModule, and PrismaService via DatabaseModule.
 */
@Module({
  imports: [LlmModule],
  providers: [RescheduleUseCaseService],
  exports: [RescheduleUseCaseService],
})
export class RescheduleModule {}
