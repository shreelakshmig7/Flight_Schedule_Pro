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
// Note: `SuggestionStatus` and `PollingTier` are defined in both ./constants
// (broader DB enums) and ./service-bus.types (narrower message types). We
// re-export the DB versions from ./constants and the SB-specific types from
// service-bus.types explicitly to avoid TS2308 ambiguity errors.
export * from './constants';
export {
  BaseMessage,
  PollJobMessage,
  ChangeEventMessage,
  SuggestionResultMessage,
  isPollJobMessage,
  isChangeEventMessage,
  isSuggestionResultMessage,
  ChangeType,
} from './service-bus.types';

// PR-6: FSP API request/response types
export * from './fsp.types';
