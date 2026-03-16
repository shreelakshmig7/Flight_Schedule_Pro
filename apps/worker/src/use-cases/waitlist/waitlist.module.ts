/**
 * waitlist.module.ts
 * ------------------
 * Agentic Scheduler — FSP Integration — Use Case A (Waitlist) NestJS module
 * --------------------------------------------------------------------------
 * Wires together all components required for the Waitlist use case:
 *   - WaitlistUseCaseService — core business logic for NEW_OPENING events
 *
 * Imports:
 *   - SuggestionsModule — provides PriorityWeightEngine
 *   - LlmModule         — provides RationaleGenerator
 *
 * All FSP service classes (StudentsService, ReservationsService, etc.) are
 * provided globally by FspClientModule (already imported in AppModule).
 *
 * The ChangeEventConsumer is now provided by UseCasesModule (PR-14) which
 * imports this module and supplies the shared queue consumer.
 *
 * Key exports: WaitlistModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-13 — Use Case A — Waitlist
 * Updated: PR-14 — Use Case B — Reschedule (moved ChangeEventConsumer to UseCasesModule)
 */

import { Module } from '@nestjs/common';
import { SuggestionsModule } from '../../suggestions/suggestions.module';
import { LlmModule } from '../../llm/llm.module';
import { WaitlistUseCaseService } from './waitlist-use-case.service';

/**
 * Feature module for Use Case A — Waitlist / New Opening.
 *
 * Registers the WaitlistUseCaseService. FSP clients are available globally
 * via FspClientModule, and PrismaService via DatabaseModule.
 */
@Module({
  imports: [SuggestionsModule, LlmModule],
  providers: [WaitlistUseCaseService],
  exports: [WaitlistUseCaseService],
})
export class WaitlistModule {}
