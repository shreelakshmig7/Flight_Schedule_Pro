/**
 * observability.module.ts
 * -----------
 * Agentic Scheduler — FSP Integration — API observability module
 * ---------------------------------------------------------------
 * NestJS module that provides observability services for the API:
 * - RequestLoggerInterceptor: structured logging of all HTTP requests
 *
 * This module is imported by AppModule and registers the interceptor
 * globally so it applies to all routes.
 *
 * Key exports: APP_INTERCEPTOR provider
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-23 — Azure Application Insights Integration
 */

import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestLoggerInterceptor } from './request-logger.interceptor';

/**
 * Feature module for observability in the API.
 * Registers the RequestLoggerInterceptor globally.
 */
@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggerInterceptor,
    },
  ],
})
export class ObservabilityModule {}
