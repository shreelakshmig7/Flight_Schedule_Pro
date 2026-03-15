/**
 * index.ts
 * --------
 * Agentic Scheduler — FSP Integration — shared-types package entry point
 * -----------------------------------------------------------------------
 * Re-exports all shared TypeScript types, interfaces, enums, and constants
 * used across apps/api, apps/worker, and apps/web. This package has zero
 * runtime dependencies — it contains types and constants only.
 *
 * Key exports: All types, enums, constants defined in sub-modules.
 *              See individual files for details.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

/** Package identifier — used in bootstrap tests. */
export const PACKAGE_NAME = '@fsp-scheduler/shared-types';

// PR-4: Service Bus queue topology constants and message types
export * from './constants';
export * from './service-bus.types';

// Type and constant modules are added in subsequent PRs:
// PR-5: Database entity types, enums (SuggestionStatus, UseCaseType, etc.)
// PR-6: FSP API request/response types
// PR-8+: Scheduling constants (polling tiers, rate limits, LLM config, etc.)
