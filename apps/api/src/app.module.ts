/**
 * app.module.ts
 * -------------
 * Agentic Scheduler — FSP Integration — Root NestJS application module
 * --------------------------------------------------------------------
 * The root module for the API application. Imports all feature modules
 * and registers global providers. Feature modules (auth, suggestions,
 * operators, audit, dashboard) are added in their respective PRs.
 *
 * Key exports: AppModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 * Updated: PR-5 — Prisma Schema and Database Migrations (added DatabaseModule)
 * Updated: PR-7 — Authentication and Multi-Tenant Middleware (added AuthModule,
 *           OperatorsModule, FspClientModule, APP_GUARD)
 * Updated: PR-10 — Suggestion State Machine (added SuggestionsModule)
 */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '@fsp-scheduler/database';
import { FspClientModule } from '@fsp-scheduler/fsp-client';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { FspAuthGuard } from './auth/fsp-auth.guard';
import { OperatorsModule } from './operators/operators.module';
import { SuggestionsModule } from './suggestions/suggestions.module';

@Module({
  imports: [
    DatabaseModule,
    FspClientModule,
    AuthModule,
    OperatorsModule,
    SuggestionsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: FspAuthGuard,
    },
  ],
})
export class AppModule {}
