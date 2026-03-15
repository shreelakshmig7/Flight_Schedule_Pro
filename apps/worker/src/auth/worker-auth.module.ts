/**
 * worker-auth.module.ts
 * ---------------------
 * Agentic Scheduler — FSP Integration — Worker authentication NestJS module
 * -------------------------------------------------------------------------
 * Provides TokenStore and TokenRefreshService for the worker application.
 * DatabaseModule is global so PrismaService is available automatically.
 * FspClientModule is global so AuthService is available automatically.
 * ScheduleModule must be imported at the root AppModule (already done in PR-4).
 *
 * Key exports: WorkerAuthModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { Module } from '@nestjs/common';
import { TokenStore } from './token-store';
import { TokenRefreshService } from './token-refresh.service';

/**
 * NestJS module that provides token management for the worker.
 * DatabaseModule and FspClientModule are global, so their providers
 * are injected automatically without explicit imports here.
 */
@Module({
  providers: [TokenStore, TokenRefreshService],
  exports: [TokenStore, TokenRefreshService],
})
export class WorkerAuthModule {}
