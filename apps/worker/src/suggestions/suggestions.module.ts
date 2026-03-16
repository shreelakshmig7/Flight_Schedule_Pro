/**
 * suggestions.module.ts
 * ---------------------
 * Agentic Scheduler — FSP Integration — Worker Suggestions NestJS module
 * -----------------------------------------------------------------------
 * Declares and exports the PriorityWeightEngine. Use-case handler modules
 * (PR-13 through PR-16) import this module to access the engine.
 *
 * Key exports: SuggestionsModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-11 — Priority Weight Engine
 */

import { Module } from '@nestjs/common';
import { PriorityWeightEngine } from './priority-weight.engine';

/**
 * NestJS module that provides the PriorityWeightEngine to other worker modules.
 * Import this module in any worker feature module that needs to score candidates.
 */
@Module({
  providers: [PriorityWeightEngine],
  exports: [PriorityWeightEngine],
})
export class SuggestionsModule {}
