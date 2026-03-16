/**
 * operators.module.ts
 * -------------------
 * Agentic Scheduler — FSP Integration — Operators NestJS module
 * ------------------------------------------------------------
 * Declares and exports OperatorsService and OperatorsController.
 * DatabaseModule is global so PrismaService is available without
 * explicitly importing it here. AuthModule provides TenantContext.
 *
 * Key exports: OperatorsModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { Module } from '@nestjs/common';
import { OperatorsService } from './operators.service';
import { OperatorsController } from './operators.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * NestJS module for operator lifecycle management.
 * Imports AuthModule to make TenantContext available for injection
 * into OperatorsController.
 */
@Module({
  imports: [AuthModule],
  controllers: [OperatorsController],
  providers: [OperatorsService],
  exports: [OperatorsService],
})
export class OperatorsModule {}
