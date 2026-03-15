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
 * Updated: PR-7 — Authentication and Multi-Tenant Middleware (added WorkerAuthModule,
 *           FspClientModule)
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@fsp-scheduler/database';
import { FspClientModule } from '@fsp-scheduler/fsp-client';
import { ServiceBusModule } from './service-bus/service-bus.module';
import { WorkerAuthModule } from './auth/worker-auth.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    FspClientModule,
    ServiceBusModule,
    WorkerAuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
