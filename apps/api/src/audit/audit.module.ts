/**
 * audit.module.ts
 * ---------------
 * Agentic Scheduler — FSP Integration — Audit NestJS module
 * ----------------------------------------------------------
 * Declares and exports AuditService and AuditController.
 * DatabaseModule is global so PrismaService is available without
 * explicitly importing it here. AuthModule provides TenantContext.
 *
 * Key exports: AuditModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-22 — Immutable Audit Log
 */

import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * NestJS module for audit log querying and archival.
 * Imports AuthModule to make TenantContext available for injection
 * into AuditController.
 */
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
