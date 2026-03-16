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
 *
 * State machine transitions (enforced at application layer):
 *   PENDING  → APPROVED  (operator approves; FSP validateOnly must pass)
 *   PENDING  → REJECTED  (operator manually rejects)
 *   PENDING  → EXPIRED   (expiry cron runs; expiresAt < now)
 *   APPROVED → CREATED   (use-case handler executes FSP reservation creation)
 *   CREATED  → SENT      (communication handler sends notification)
 *   SENT     → ACCEPTED  (guest/staff accepts the suggestion)
 *   *        → FAILED    (any terminal failure in the pipeline)
 */
export const SUGGESTION_STATUS = {
  PENDING: 'PENDING',
  /** Operator approved; FSP validateOnly passed; waiting for use-case handler execution. */
  APPROVED: 'APPROVED',
  CREATED: 'CREATED',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  /** Suggestion was not actioned before its expiresAt timestamp. */
  EXPIRED: 'EXPIRED',
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
  DISCOVERY: 'DISCOVERY',
  NEXT_LESSON: 'NEXT_LESSON',
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

// ── Authentication and token refresh constants ────────────────────────────────

/**
 * Number of minutes before token expiry at which the worker should proactively
 * refresh the FSP Bearer token to avoid mid-request expiry.
 */
export const TOKEN_REFRESH_BUFFER_MINUTES = 5;

/**
 * Default polling tier assigned to newly bootstrapped operators.
 * Can be upgraded to TIER1 by an administrator.
 */
export const OPERATOR_DEFAULT_POLLING_TIER = 'TIER2';

// ── FSP API rate-limit and retry constants ────────────────────────────────────

/**
 * Maximum number of FSP API calls allowed per minute according to the
 * subscription plan. Do not exceed this to avoid 429 responses.
 */
export const FSP_RATE_LIMIT_CALLS_PER_MINUTE = 60;

/**
 * Conservative per-minute call budget that stays safely below the hard cap.
 * Proactive throttling keeps the system well clear of 429 territory.
 */
export const FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE = 55;

/**
 * Pause duration in seconds applied after receiving a 429 response before
 * retrying any FSP API calls.
 */
export const FSP_RATE_LIMIT_PAUSE_SECONDS = 60;

/**
 * Maximum number of retry attempts for a single FSP API call on 5xx errors.
 */
export const FSP_MAX_RETRIES = 3;

/**
 * Backoff delay in milliseconds between successive retry attempts.
 * Index 0 = first retry, index 1 = second retry, index 2 = third retry.
 */
export const FSP_RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;

// ── Polling dispatcher constants ──────────────────────────────────────────────

/**
 * Polling interval in seconds for TIER1 operators.
 * TIER1: operator has a reservation in the next 24 hours or a recent cancellation.
 */
export const TIER1_POLL_INTERVAL_SECONDS = 60;

/**
 * Polling interval in seconds for TIER2 operators.
 * TIER2: operator has a reservation in the next 7 days.
 */
export const TIER2_POLL_INTERVAL_SECONDS = 300;

/**
 * Polling interval in seconds for TIER3 operators.
 * TIER3: operator has no reservations in the next 7 days.
 */
export const TIER3_POLL_INTERVAL_SECONDS = 900;

/**
 * TTL in seconds for raw FSP poll snapshots stored in RawSnapshotStore.
 * After this time, snapshots are evicted from the in-memory store.
 */
export const POLL_SNAPSHOT_TTL_SECONDS = 600;

/**
 * Hours ahead to look when determining if an operator qualifies for TIER1.
 * If any reservation is scheduled within this window, the operator is TIER1.
 */
export const TIER1_RECENT_HOURS = 24;

/**
 * Days ahead to look when determining if an operator qualifies for TIER2.
 * If any reservation is scheduled within this window (but not TIER1), the operator is TIER2.
 */
export const TIER2_LOOKAHEAD_DAYS = 7;

/**
 * Number of hours a recent cancellation keeps an operator in TIER1.
 * If a cancellation was detected within this window, the operator stays at TIER1.
 */
export const TIER1_CANCELLATION_RECENCY_HOURS = 2;

/**
 * Token bucket refill interval in milliseconds (60 seconds).
 */
export const TOKEN_BUCKET_REFILL_INTERVAL_MS = 60_000;

/**
 * Minimum remaining token count that triggers a low-water-mark warning log.
 */
export const TOKEN_BUCKET_LOW_WATER_MARK = 10;

/**
 * Poll interval in milliseconds used by the token bucket acquire() loop
 * while waiting for a token to become available or a pause to expire.
 */
export const TOKEN_BUCKET_POLL_INTERVAL_MS = 100;

// ── Priority Weight Engine constants ─────────────────────────────────────────

/**
 * Maximum days used to normalise the timeSinceLastFlight signal.
 * A student who has not flown for 90 or more days receives a score of 1.0.
 * Students who have flown within the last 90 days receive a proportional score.
 */
export const TIME_SINCE_LAST_FLIGHT_CAP_DAYS = 90;

/**
 * Maximum days used to normalise the timeUntilNextScheduledFlight signal.
 * A gap of 90 or more days until the next flight scores 1.0 (high priority).
 */
export const TIME_UNTIL_NEXT_FLIGHT_CAP_DAYS = 90;

/**
 * Neutral signal score assigned when a signal cannot be computed for a
 * candidate (e.g. no flight history, missing enrollment progress).
 * Using 0.5 ensures the student is neither boosted nor suppressed.
 */
export const PRIORITY_SIGNAL_NEUTRAL_SCORE = 0.5;

// ── LLM Rationale Generator constants ────────────────────────────────────────

/**
 * Anthropic model used by the LLM Rationale Generator.
 * Uses Claude Opus 4.6 for highest reasoning quality on scheduling decisions.
 */
export const LLM_ANTHROPIC_MODEL = 'claude-opus-4-6';

/**
 * Hard timeout in milliseconds for a single Anthropic API call.
 * If the call has not resolved within this window, the fallback template
 * is used and the suggestion is never blocked.
 */
export const LLM_TIMEOUT_MS = 10_000;

/**
 * Maximum tokens the LLM may generate for a rationale response.
 * Kept low to control cost — the output is a small JSON object.
 */
export const LLM_MAX_TOKENS = 500;

/**
 * Minimum character length of a valid LLM-generated rationale string.
 */
export const LLM_RATIONALE_MIN_CHARS = 50;

/**
 * Maximum character length of a valid LLM-generated rationale string.
 */
export const LLM_RATIONALE_MAX_CHARS = 400;

/**
 * LLM confidence threshold above which the override rule may fire.
 * If LLM confidence > this AND constraint pass rate < LLM_CONSTRAINT_PASS_RATE_THRESHOLD,
 * LLM confidence is replaced with LLM_FALLBACK_CONFIDENCE.
 */
export const LLM_CONFIDENCE_OVERRIDE_THRESHOLD = 0.8;

/**
 * Constraint pass-rate threshold for the confidence override rule.
 * Fewer than this fraction passing makes a high LLM confidence suspect.
 */
export const LLM_CONSTRAINT_PASS_RATE_THRESHOLD = 0.8;

/**
 * Deterministic confidence score assigned when LLM confidence is overridden
 * or the fallback template is used. Neutral — neither inflates nor suppresses priority.
 */
export const LLM_FALLBACK_CONFIDENCE = 0.5;

// ── Use Case A — Waitlist constants ───────────────────────────────────────────

/**
 * Maximum number of candidate students to attempt when filling a new opening.
 * If all attempts fail constraints or FSP validation, no suggestion is created.
 */
export const WAITLIST_MAX_CANDIDATES_TO_TRY = 3;

/**
 * Hours after creation before a PENDING suggestion automatically expires.
 * The expiry cron (PR-10) marks expired suggestions as EXPIRED.
 */
export const SUGGESTION_EXPIRY_HOURS = 24;

/**
 * Number of days of reservation history to fetch per candidate when
 * computing priority signals.
 */
export const WAITLIST_RESERVATION_LOOKBACK_DAYS = 365;

/**
 * Number of days ahead to search when fetching future reservations per candidate.
 */
export const WAITLIST_RESERVATION_LOOKAHEAD_DAYS = 90;

// ── Use Case B — Reschedule constants ────────────────────────────────────────

/**
 * Maximum number of PENDING suggestions to create per CANCELLATION event.
 * Each suggestion represents an alternative scheduling slot for the student.
 */
export const RESCHEDULE_MAX_SUGGESTIONS = 3;

/**
 * Number of calendar days ahead to search for alternative slots when
 * rescheduling a cancelled reservation.
 */
export const RESCHEDULE_SEARCH_WINDOW_DAYS = 30;

/**
 * Default operator rescheduling policy applied when an operator has not
 * stored a custom policyConfig in the database.
 */
export const RESCHEDULE_DEFAULT_POLICY_CONFIG = {
  /** When true, the agent first attempts slots with the original instructor. */
  preferSameInstructor: false,
} as const;

/**
 * Default duration in minutes used when originalStart/End are absent from
 * the CANCELLATION event rawDiff.
 */
export const RESCHEDULE_DEFAULT_DURATION_MINUTES = 60;

// ── Use Case C — Discovery constants ─────────────────────────────────────────

/**
 * Maximum number of PENDING suggestions to create per DISCOVERY_REQUEST event.
 * Each suggestion represents a candidate discovery flight slot for the prospect.
 */
export const DISCOVERY_MAX_SUGGESTIONS = 3;

/**
 * Default number of calendar days ahead to search for discovery flight slots
 * when the operator has not configured discoverySearchWindowDays in policyConfig.
 */
export const DISCOVERY_DEFAULT_SEARCH_WINDOW_DAYS = 14;

/**
 * Default duration in minutes for a discovery flight slot.
 * Used when the operator has not configured a specific duration.
 */
export const DISCOVERY_DEFAULT_DURATION_MINUTES = 60;

// ── Use Case D — Next Lesson constants ───────────────────────────────────────

/**
 * Maximum number of PENDING suggestions to create per next-lesson event.
 */
export const NEXT_LESSON_MAX_SUGGESTIONS = 3;

/**
 * Default number of calendar days ahead to search for next-lesson slots.
 */
export const NEXT_LESSON_SEARCH_WINDOW_DAYS = 14;

/**
 * Number of pending lessons at or above which the AutoSchedule solver is used
 * instead of Find-a-Time for the next-lesson use case.
 */
export const NEXT_LESSON_AUTO_SCHEDULE_THRESHOLD = 3;

/**
 * Default priority weight configuration applied when an operator has not
 * stored a custom configuration. Weights are non-negative and will be
 * normalised by the engine so they do not need to sum to 1.
 */
export const DEFAULT_PRIORITY_WEIGHTS = {
  /** Weight for the timeSinceLastFlight signal. */
  timeSinceLastFlight: 0.5,
  /** Weight for the timeUntilNextScheduledFlight signal. */
  timeUntilNextScheduledFlight: 0.3,
  /** Weight for the totalFlightHours signal. */
  totalFlightHours: 0.2,
  /**
   * Direction flag: false = fewer hours → higher score (student needs more
   * training); true = more hours → higher score (closer to checkride).
   */
  flightHoursHigherIsBetter: false,
  /** Operator-defined custom signal weights (signal key → weight). */
  customSignals: {} as Record<string, number>,
} as const;
