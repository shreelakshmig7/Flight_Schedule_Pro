/**
 * waitlist.module.ts
 * ------------------
 * Agentic Scheduler — FSP Integration — Use Case A (Waitlist) NestJS module
 * --------------------------------------------------------------------------
 * Wires together all components required for the Waitlist use case:
 *   - WaitlistUseCaseService — core business logic for NEW_OPENING events
 *   - ChangeEventConsumer    — Service Bus consumer routing events to handlers
 *
 * Imports:
 *   - ServiceBusModule  — provides ServiceBusService for the consumer
 *   - SuggestionsModule — provides PriorityWeightEngine
 *   - LlmModule         — provides RationaleGenerator
 *
 * All FSP service classes (StudentsService, ReservationsService, etc.) are
 * provided globally by FspClientModule (already imported in AppModule).
 *
 * Key exports: WaitlistModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-13 — Use Case A — Waitlist
 */

import { Module } from '@nestjs/common';
import { ServiceBusModule } from '../../service-bus/service-bus.module';
import { SuggestionsModule } from '../../suggestions/suggestions.module';
import { LlmModule } from '../../llm/llm.module';
import { WaitlistUseCaseService } from './waitlist-use-case.service';
import { ChangeEventConsumer } from './change-event.consumer';

/**
 * Feature module for Use Case A — Waitlist / New Opening.
 *
 * Registers the ChangeEventConsumer (subscribes on module init) and the
 * WaitlistUseCaseService. Both depend on FSP services available globally
 * via the FspClientModule and PrismaService via DatabaseModule.
 */
@Module({
  imports: [ServiceBusModule, SuggestionsModule, LlmModule],
  providers: [WaitlistUseCaseService, ChangeEventConsumer],
})
export class WaitlistModule {}
