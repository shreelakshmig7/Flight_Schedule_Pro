/**
 * operators.controller.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — Operators REST controller
 * --------------------------------------------------------------
 * Handles operator bootstrap and configuration retrieval endpoints.
 * POST /operators/bootstrap is public (no auth required).
 * GET /operators/me requires a valid FSP bearer token.
 *
 * Key exports: OperatorsController
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { OperatorsService } from './operators.service';
import { TenantContext } from '../auth/tenant-context';
import { Public } from '../auth/public.decorator';
import type {
  OperatorBootstrapRequest,
  OperatorConfigResponse,
} from '@fsp-scheduler/shared-types';

/**
 * REST controller for operator lifecycle and configuration endpoints.
 * All routes are prefixed with /operators.
 */
@Controller('operators')
export class OperatorsController {
  /**
   * @param operatorsService - Service handling operator business logic.
   * @param tenantContext    - Request-scoped tenant context (populated by guard).
   */
  constructor(
    private readonly operatorsService: OperatorsService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Bootstraps an operator in the local database.
   *
   * This endpoint is public and must be called before any protected endpoints.
   * Idempotent — safe to call multiple times with the same fspOperatorId.
   *
   * @param req - Bootstrap request body.
   * @returns The operator configuration after upsert.
   */
  @Public()
  @Post('bootstrap')
  @HttpCode(HttpStatus.OK)
  public async bootstrap(
    @Body() req: OperatorBootstrapRequest,
  ): Promise<OperatorConfigResponse> {
    return this.operatorsService.bootstrap(req);
  }

  /**
   * Returns the operator configuration for the authenticated tenant.
   *
   * Requires a valid FSP Bearer token and x-operator-id header.
   * FspAuthGuard populates TenantContext before this handler is called.
   *
   * @returns The operator config for the current authenticated tenant.
   */
  @Get('me')
  public async getMyConfig(): Promise<OperatorConfigResponse> {
    const tenantData = this.tenantContext.get();
    return this.operatorsService.getMyConfig(tenantData);
  }
}
