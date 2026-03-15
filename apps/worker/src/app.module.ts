/**
 * app.module.ts
 * -------------
 * Agentic Scheduler — FSP Integration — Root NestJS worker module
 * ---------------------------------------------------------------
 * The root module for the worker application. Imports all worker feature
 * modules including polling, detection, suggestion engine, LLM, and
 * notifications. Worker-specific modules are added in their respective PRs.
 *
 * Key exports: AppModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
