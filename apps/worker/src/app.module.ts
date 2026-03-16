/**
 * app.module.ts
 * -------------
 * Agentic Scheduler — FSP Integration — Root NestJS worker module
 * ---------------------------------------------------------------
 * The root module for the worker application. Imports all worker feature
 * modules including polling, detection, suggestion engine, LLM, and
 * notifications. Worker-specific modules are added in their respective PRs.
 *
 * Key exports: AppModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology (added ServiceBusModule, ScheduleModule)
 * Updated: PR-5 — Prisma Schema and Database Migrations (added DatabaseModule)
 * Updated: PR-7 — Authentication and Multi-Tenant Middleware (added WorkerAuthModule, FspClientModule)
 * Updated: PR-8 — Rate-Limited Polling Dispatcher (added PollingModule)
 * Updated: PR-9 — Change Detection Engine (added ChangeDetectionModule)
 * Updated: PR-11 — Priority Weight Engine (added SuggestionsModule)
 * Updated: PR-12 — LLM Rationale Generator (added LlmModule)
 * Updated: PR-14 — Use Case B Reschedule (replaced WaitlistModule with UseCasesModule)
 * Updated: PR-17 — Email Notifications (added NotificationsModule)
 * Updated: PR-23 — Azure Application Insights Integration (added ObservabilityModule)
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@fsp-scheduler/database';
import { FspClientModule } from '@fsp-scheduler/fsp-client';
import { ServiceBusModule } from './service-bus/service-bus.module';
import { WorkerAuthModule } from './auth/worker-auth.module';
import { PollingModule } from './polling/polling.module';
import { ChangeDetectionModule } from './change-detection/change-detection.module';
import { SuggestionsModule } from './suggestions/suggestions.module';
import { LlmModule } from './llm/llm.module';
import { UseCasesModule } from './use-cases/use-cases.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    FspClientModule,
    ServiceBusModule,
    WorkerAuthModule,
    PollingModule,
    ChangeDetectionModule,
    SuggestionsModule,
    LlmModule,
    UseCasesModule,
    NotificationsModule,
    ObservabilityModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
