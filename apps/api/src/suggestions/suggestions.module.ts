/**
 * suggestions.module.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — Suggestions NestJS feature module
 * ------------------------------------------------------------------------
 * Wires together SuggestionsController, SuggestionsService, and the
 * SuggestionResultPublisher. Also imports ScheduleModule to enable the
 * @Cron expiry job inside SuggestionsService.
 *
 * Dependencies provided by global modules (no explicit import needed here):
 *   - DatabaseModule  → PrismaService
 *   - FspClientModule → ReservationsService (injected into SuggestionsService)
 *
 * Key exports: SuggestionsModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-10 — Suggestion State Machine
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';
import { SuggestionResultPublisher } from './suggestion-result.publisher';
import { AuthModule } from '../auth/auth.module';

/**
 * Feature module that provides the suggestion lifecycle endpoints and the
 * background expiry cron job. Registers ScheduleModule so that the
 * @Cron decorator on SuggestionsService.expireSuggestions() is picked up.
 */
@Module({
  imports: [
    // Required for @Cron decorator in SuggestionsService
    ScheduleModule.forRoot(),
    // Provides TenantContext (REQUEST-scoped) used by the controller
    AuthModule,
  ],
  controllers: [SuggestionsController],
  providers: [
    SuggestionsService,
    SuggestionResultPublisher,
  ],
  exports: [SuggestionsService],
})
export class SuggestionsModule {}
