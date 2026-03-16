/**
 * dashboard.module.ts
 * -------------------
 * Agentic Scheduler — FSP Integration — Dashboard NestJS module
 * ----------------------------------------------------------
 * Declares and exports DashboardService and DashboardController.
 * DatabaseModule is global so PrismaService is available without
 * explicitly importing it. FspClientModule provides aircraft and
 * schedule services. AuthModule provides TenantContext.
 *
 * Key exports: DashboardModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-24 — Operator Dashboard
 */

import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AuthModule } from '../auth/auth.module';
import { FspClientModule } from '@fsp-scheduler/fsp-client';

/**
 * NestJS module for dashboard metrics computation.
 * Imports AuthModule to make TenantContext available for injection
 * into DashboardController. FspClientModule provides aircraft and
 * schedule services for fleet and operational hour data.
 */
@Module({
  imports: [AuthModule, FspClientModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
