/**
 * llm.module.ts
 * -------------
 * Agentic Scheduler — FSP Integration — Worker LLM NestJS module
 * --------------------------------------------------------------
 * Provides the RationaleGenerator and the Anthropic client to any
 * worker module that needs to generate scheduling rationales.
 *
 * The Anthropic client is provided under the ANTHROPIC_CLIENT token
 * so that tests can swap it with a mock without the full NestJS module.
 *
 * Reads ANTHROPIC_API_KEY from the environment via the default Anthropic
 * client constructor — the SDK will throw at instantiation time if the key
 * is not set, which surfaces the misconfiguration early on startup.
 *
 * Key exports: LlmModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-12 — LLM Rationale Generator
 */

import { Module } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { RationaleGenerator, ANTHROPIC_CLIENT } from './rationale-generator';

/**
 * NestJS module that provides the LLM Rationale Generator.
 * Import this module in any worker feature module (PR-13 through PR-16)
 * that requires suggestion rationale generation.
 */
@Module({
  providers: [
    {
      provide: ANTHROPIC_CLIENT,
      useFactory: (): Anthropic => new Anthropic(),
    },
    RationaleGenerator,
  ],
  exports: [RationaleGenerator],
})
export class LlmModule {}
