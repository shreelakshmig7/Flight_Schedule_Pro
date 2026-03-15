/**
 * constants.ts
 * ------------
 * Agentic Scheduler — FSP Integration — Shared constants for all packages
 * ------------------------------------------------------------------------
 * Centralises all magic values used across the monorepo so that no package
 * ever hard-codes queue names, TTLs, or environment variable keys. Consuming
 * packages import from @fsp-scheduler/shared-types.
 *
 * Key exports: QUEUE_NAMES, DEAD_LETTER_MAX_DELIVERY_COUNT,
 *              DEAD_LETTER_SWEEP_INTERVAL_MINUTES, MESSAGE_TTL_MS,
 *              SERVICE_BUS_NAMESPACE_ENV_KEY,
 *              SUGGESTION_STATUS, USE_CASE_TYPE, POLLING_TIER,
 *              DISCOVERY_STATUS, COMMUNICATION_CHANNEL, COMMUNICATION_STATUS
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 * Updated: PR-5 — Prisma Schema and Database Migrations (added DB constants)
 */

/**
 * Azure Service Bus queue name constants.
 * Use these instead of inline string literals to prevent typos and enable
 * refactoring without text-search across the codebase.
 */
export const QUEUE_NAMES = {
  POLL_JOBS: 'poll-jobs',
  CHANGE_EVENTS: 'change-events',
  SUGGESTION_RESULTS: 'suggestion-results',
} as const;

/**
 * Maximum number of delivery attempts before a message is moved to the
 * dead-letter sub-queue by Azure Service Bus.
 */
export const DEAD_LETTER_MAX_DELIVERY_COUNT = 5;

/**
 * How frequently (in minutes) the dead-letter sweeper cron job runs.
 */
export const DEAD_LETTER_SWEEP_INTERVAL_MINUTES = 15;

/**
 * Message time-to-live values in milliseconds, keyed by queue name.
 * After this duration, un-consumed messages are dead-lettered.
 */
export const MESSAGE_TTL_MS = {
  /** 5 minutes — poll jobs must be processed promptly or discarded */
  POLL_JOBS: 5 * 60 * 1000,
  /** 30 minutes — change events should be acted on quickly */
  CHANGE_EVENTS: 30 * 60 * 1000,
  /** 60 minutes — suggestion results can wait up to an hour */
  SUGGESTION_RESULTS: 60 * 60 * 1000,
} as const;

/**
 * Environment variable key that holds the Azure Service Bus namespace FQDN.
 * Example value: "my-namespace.servicebus.windows.net"
 */
export const SERVICE_BUS_NAMESPACE_ENV_KEY = 'AZURE_SERVICE_BUS_NAMESPACE';

// ── Database entity status / type constants ──────────────────────────────────

/**
 * Possible lifecycle states for a Suggestion entity.
 * Maps 1-to-1 with the `status` column in the `suggestions` table.
 */
export const SUGGESTION_STATUS = {
  PENDING: 'PENDING',
  CREATED: 'CREATED',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
} as const;

/** Union type derived from SUGGESTION_STATUS values. */
export type SuggestionStatus = typeof SUGGESTION_STATUS[keyof typeof SUGGESTION_STATUS];

/**
 * Scheduler use-case categories that drive LLM prompt selection.
 * Maps 1-to-1 with the `useCaseType` column in the `suggestions` table.
 */
export const USE_CASE_TYPE = {
  CANCELLATION_FILL: 'CANCELLATION_FILL',
  NEW_OPENING: 'NEW_OPENING',
  WAITLIST_FILL: 'WAITLIST_FILL',
} as const;

/** Union type derived from USE_CASE_TYPE values. */
export type UseCaseType = typeof USE_CASE_TYPE[keyof typeof USE_CASE_TYPE];

/**
 * Operator polling frequency tiers.
 * Maps 1-to-1 with the `pollingTier` column in the `operators` table.
 * TIER1 = highest frequency, TIER3 = lowest frequency.
 */
export const POLLING_TIER = {
  TIER1: 'TIER1',
  TIER2: 'TIER2',
  TIER3: 'TIER3',
} as const;

/** Union type derived from POLLING_TIER values. */
export type PollingTier = typeof POLLING_TIER[keyof typeof POLLING_TIER];

/**
 * Processing states for a DiscoveryProspect entity.
 * Maps 1-to-1 with the `status` column in the `discovery_prospects` table.
 */
export const DISCOVERY_STATUS = {
  PENDING: 'PENDING',
  PROCESSED: 'PROCESSED',
  SKIPPED: 'SKIPPED',
} as const;

/**
 * Outbound communication channels available for guest/staff messages.
 * Maps 1-to-1 with the `channel` column in the `communications` table.
 */
export const COMMUNICATION_CHANNEL = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
} as const;

/**
 * Delivery lifecycle states for a Communication entity.
 * Maps 1-to-1 with the `status` column in the `communications` table.
 */
export const COMMUNICATION_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  BOUNCED: 'BOUNCED',
} as const;
