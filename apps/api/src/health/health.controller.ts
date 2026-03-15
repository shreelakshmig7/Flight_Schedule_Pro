/**
 * health.controller.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — Health check controller
 * -------------------------------------------------------------
 * Exposes GET /health for Azure Container Apps liveness probes and the
 * CI/CD deploy workflow health check. Returns { status: "ok" } when the
 * application is running and ready to serve requests.
 *
 * Key exports: HealthController
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

import { Controller, Get } from '@nestjs/common';

/** Shape returned by the health endpoint. */
export interface HealthResponse {
  status: 'ok';
}

@Controller('health')
export class HealthController {
  /**
   * Returns the application health status.
   *
   * @returns An object with status "ok" when the application is running
   */
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
