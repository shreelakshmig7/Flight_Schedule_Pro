/**
 * health.controller.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — Health check controller
 * -------------------------------------------------------------
 * Exposes GET /health for Azure Container Apps liveness probes and the
 * CI/CD deploy workflow health check. Returns { status: "ok" } when the
 * application is running and ready to serve requests.
 * Decorated with @Public() so FspAuthGuard does not require a bearer token.
 *
 * Key exports: HealthController
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 * Updated: PR-7 — Authentication and Multi-Tenant Middleware (added @Public())
 */

import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

/** Shape returned by the health endpoint. */
export interface HealthResponse {
  status: 'ok';
}

@Public()
@Controller('health')
export class HealthController {
  /**
   * Returns the application health status.
   * Accessible without authentication — used by Azure Container Apps probes.
   *
   * @returns An object with status "ok" when the application is running
   */
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
