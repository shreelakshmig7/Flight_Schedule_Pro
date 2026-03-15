/**
 * auth.module.ts
 * --------------
 * Agentic Scheduler — FSP Integration — Authentication NestJS module
 * ------------------------------------------------------------------
 * Declares and exports the TenantContext and FspAuthGuard providers.
 * FspAuthGuard is registered globally via APP_GUARD in app.module.ts;
 * TenantContext is request-scoped and injected into controllers.
 *
 * Key exports: AuthModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { Module } from '@nestjs/common';
import { TenantContext } from './tenant-context';
import { FspAuthGuard } from './fsp-auth.guard';

/**
 * NestJS module providing authentication infrastructure.
 * DatabaseModule is global so PrismaService is available without re-importing.
 * FspClientModule is global so OperatorsService and FSP_AUTH_CLIENT are available.
 */
@Module({
  providers: [TenantContext, FspAuthGuard],
  exports: [TenantContext, FspAuthGuard],
})
export class AuthModule {}
