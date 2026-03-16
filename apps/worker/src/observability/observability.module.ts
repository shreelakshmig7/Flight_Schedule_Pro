/**
 * observability.module.ts
 * -----------
 * Agentic Scheduler — FSP Integration — Worker observability module
 * ------------------------------------------------------------------
 * NestJS module that provides observability services for the worker:
 * - MetricsService: emit custom metrics to Application Insights
 * - TraceContextService: manage distributed trace context
 *
 * This module is imported by AppModule and exports both services
 * for injection into feature modules.
 *
 * Key exports: MetricsService, TraceContextService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-23 — Azure Application Insights Integration
 */

import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { TraceContextService } from './trace-context.service';

/**
 * Feature module for observability.
 * Exports both services so they can be injected in other worker modules.
 */
@Module({
  providers: [MetricsService, TraceContextService],
  exports: [MetricsService, TraceContextService],
})
export class ObservabilityModule {}
