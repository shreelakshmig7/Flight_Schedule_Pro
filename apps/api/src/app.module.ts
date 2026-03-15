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
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@fsp-scheduler/database';
import { HealthController } from './health/health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
