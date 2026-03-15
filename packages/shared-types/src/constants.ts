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
 *              SERVICE_BUS_NAMESPACE_ENV_KEY
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
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
