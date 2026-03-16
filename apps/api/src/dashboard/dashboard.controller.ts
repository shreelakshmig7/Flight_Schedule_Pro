/**
 * dashboard.controller.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — Dashboard REST controller
 * ---------------------------------------------------------------
 * Handles dashboard metrics endpoint. Provides GET /dashboard/metrics
 * to retrieve all dashboard metrics for the authenticated operator.
 *
 * GET /dashboard/metrics — requires FSP bearer token, returns cached metrics
 *
 * Key exports: DashboardController
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-24 — Operator Dashboard
 */

import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { TenantContext } from '../auth/tenant-context';
import type { DashboardMetrics } from './dashboard.service';

/**
 * REST controller for dashboard metrics endpoints.
 * All routes are prefixed with /dashboard.
 */
@Controller('dashboard')
export class DashboardController {
  /**
   * @param dashboardService - Service handling dashboard metrics computation.
   * @param tenantContext    - Request-scoped tenant context (populated by guard).
   */
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Retrieves all dashboard metrics for the authenticated tenant.
   *
   * Requires a valid FSP Bearer token and x-operator-id header.
   * FspAuthGuard populates TenantContext before this handler is called.
   *
   * Metrics are cached for 5 minutes per operator. Results include:
   * - C_util: aircraft utilisation coefficient with 7-day trend
   * - Acceptance rate: approval percentage with previous period comparison
   * - Time to fill: average seconds from detection to booking
   * - Queue health: PENDING suggestion counts by use case type
   * - Weekly flight hours: this week vs previous week
   *
   * @returns Promise resolving to complete dashboard metrics.
   */
  @Get('metrics')
  public async getMetrics(): Promise<DashboardMetrics> {
    const tenantData = this.tenantContext.get();
    return this.dashboardService.getMetrics(tenantData);
  }
}
