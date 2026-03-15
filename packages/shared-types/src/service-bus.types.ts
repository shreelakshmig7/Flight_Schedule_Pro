/**
 * service-bus.types.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — Azure Service Bus message interfaces
 * ---------------------------------------------------------------------------
 * Defines the typed message contracts for all three Azure Service Bus queues:
 * poll-jobs, change-events, and suggestion-results. Each interface extends
 * BaseMessage which carries the tenant operatorId and correlationId required
 * for distributed tracing and tenant isolation.
 *
 * Key exports: BaseMessage, PollJobMessage, ChangeEventMessage,
 *              SuggestionResultMessage, isPollJobMessage,
 *              isChangeEventMessage, isSuggestionResultMessage
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

// ---------------------------------------------------------------------------
// Base interface
// ---------------------------------------------------------------------------

/**
 * Fields present on every Service Bus message regardless of queue.
 * operatorId enables tenant isolation; correlationId enables tracing.
 */
export interface BaseMessage {
  /** Tenant identifier — must be present for every message. */
  operatorId: string;
  /** Distributed tracing correlation identifier. */
  correlationId: string;
  /** ISO-8601 timestamp when the message was enqueued. */
  enqueuedAt: string;
}

// ---------------------------------------------------------------------------
// Poll Jobs queue message
// ---------------------------------------------------------------------------

/** Polling tier that controls how frequently an operator is polled. */
export type PollingTier = 'TIER1' | 'TIER2' | 'TIER3';

/**
 * Message sent to the poll-jobs queue to schedule a polling cycle
 * for a given FSP operator.
 */
export interface PollJobMessage extends BaseMessage {
  /** Numeric FSP operator identifier used to call the FSP API. */
  fspOperatorId: number;
  /** Polling tier that determines scheduling priority. */
  tier: PollingTier;
  /** ISO-8601 timestamp when this job was scheduled for execution. */
  scheduledAt: string;
}

// ---------------------------------------------------------------------------
// Change Events queue message
// ---------------------------------------------------------------------------

/** Types of reservation changes that can be detected by the worker. */
export type ChangeType = 'CANCELLATION' | 'NEW_OPENING' | 'STATUS_CHANGE';

/**
 * Message sent to the change-events queue when the poller detects a
 * modification to a reservation or availability slot.
 */
export interface ChangeEventMessage extends BaseMessage {
  /** Numeric FSP operator identifier the change belongs to. */
  fspOperatorId: number;
  /** Categorised type of the detected change. */
  changeType: ChangeType;
  /** FSP reservation identifier that changed. */
  reservationId: string;
  /** ISO-8601 timestamp when the change was detected by the worker. */
  detectedAt: string;
  /**
   * Structured diff of the changed fields.
   * Never logged in plain text — contains PII / business-sensitive data.
   */
  rawDiff: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Suggestion Results queue message
// ---------------------------------------------------------------------------

/** Terminal status of a suggestion after the LLM pipeline ran. */
export type SuggestionStatus = 'CREATED' | 'FAILED';

/**
 * Message sent to the suggestion-results queue once the LLM suggestion
 * pipeline has finished, whether successfully or not.
 */
export interface SuggestionResultMessage extends BaseMessage {
  /** Identifier of the created or attempted suggestion. */
  suggestionId: string;
  /** Use-case type string (e.g. "FILL_GAP", "PROMOTE_OPENING"). */
  useCaseType: string;
  /** Terminal status of the suggestion pipeline run. */
  status: SuggestionStatus;
  /** ISO-8601 timestamp when the suggestion record was created or attempted. */
  createdAt: string;
  /** Human-readable error description — only present when status is FAILED. */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

/**
 * Returns true if value is a plain object with string keys present.
 *
 * @param value - The value to inspect
 * @returns True when value is a non-null object (not an array)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks that the base fields required by every Service Bus message are
 * present and have the correct types.
 *
 * @param obj - A plain object to check
 * @returns True when operatorId, correlationId, and enqueuedAt are strings
 */
function hasBaseFields(obj: Record<string, unknown>): boolean {
  return (
    typeof obj['operatorId'] === 'string' &&
    typeof obj['correlationId'] === 'string' &&
    typeof obj['enqueuedAt'] === 'string'
  );
}

/** Valid polling tier values. */
const VALID_TIERS: ReadonlyArray<PollingTier> = ['TIER1', 'TIER2', 'TIER3'];

/**
 * Type guard for PollJobMessage.
 * Checks that all required fields exist and have the expected types.
 *
 * @param value - The unknown value to check
 * @returns True when value satisfies the PollJobMessage interface
 */
export function isPollJobMessage(value: unknown): value is PollJobMessage {
  if (!isPlainObject(value)) return false;
  if (!hasBaseFields(value)) return false;
  if (typeof value['fspOperatorId'] !== 'number') return false;
  if (typeof value['scheduledAt'] !== 'string') return false;
  if (!VALID_TIERS.includes(value['tier'] as PollingTier)) return false;
  return true;
}

/** Valid change type values. */
const VALID_CHANGE_TYPES: ReadonlyArray<ChangeType> = [
  'CANCELLATION',
  'NEW_OPENING',
  'STATUS_CHANGE',
];

/**
 * Type guard for ChangeEventMessage.
 * Checks that all required fields exist and have the expected types.
 *
 * @param value - The unknown value to check
 * @returns True when value satisfies the ChangeEventMessage interface
 */
export function isChangeEventMessage(value: unknown): value is ChangeEventMessage {
  if (!isPlainObject(value)) return false;
  if (!hasBaseFields(value)) return false;
  if (typeof value['fspOperatorId'] !== 'number') return false;
  if (!VALID_CHANGE_TYPES.includes(value['changeType'] as ChangeType)) return false;
  if (typeof value['reservationId'] !== 'string') return false;
  if (typeof value['detectedAt'] !== 'string') return false;
  if (!isPlainObject(value['rawDiff'])) return false;
  return true;
}

/** Valid suggestion status values. */
const VALID_SUGGESTION_STATUSES: ReadonlyArray<SuggestionStatus> = ['CREATED', 'FAILED'];

/**
 * Type guard for SuggestionResultMessage.
 * Checks that all required fields exist and have the expected types.
 *
 * @param value - The unknown value to check
 * @returns True when value satisfies the SuggestionResultMessage interface
 */
export function isSuggestionResultMessage(value: unknown): value is SuggestionResultMessage {
  if (!isPlainObject(value)) return false;
  if (!hasBaseFields(value)) return false;
  if (typeof value['suggestionId'] !== 'string') return false;
  if (typeof value['useCaseType'] !== 'string') return false;
  if (!VALID_SUGGESTION_STATUSES.includes(value['status'] as SuggestionStatus)) return false;
  if (typeof value['createdAt'] !== 'string') return false;
  if (
    value['errorMessage'] !== undefined &&
    typeof value['errorMessage'] !== 'string'
  ) {
    return false;
  }
  return true;
}
