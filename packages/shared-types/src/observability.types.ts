/**
 * observability.types.ts
 * -----------
 * Agentic Scheduler — FSP Integration — Observability types and constants
 * -----------------------------------------------------------------------
 * Defines shared metric names, structured log formats, and distributed
 * tracing context types used across all three apps (api, worker, web).
 *
 * Key exports: MetricNames, StructuredLogEntry, TraceContext, and constants
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-23 — Azure Application Insights Integration
 */

/**
 * Metric names emitted from worker to Application Insights.
 * All metrics follow the naming convention: <domain>.<metric>
 */
export const METRIC_NAMES = {
  // Polling metrics
  POLLING_CALLS_PER_MINUTE: 'polling.calls_per_minute',
  POLLING_429_COUNT: 'polling.429_count',
  POLLING_QUEUE_DEPTH: 'polling.queue_depth',
  POLLING_TIER_DISTRIBUTION: 'polling.tier_distribution',

  // Change detection metrics
  DETECTION_CHANGES_PER_POLL: 'detection.changes_per_poll',
  DETECTION_CANCELLATIONS: 'detection.cancellations',
  DETECTION_NEW_OPENINGS: 'detection.new_openings',

  // Suggestions metrics
  SUGGESTIONS_CREATED: 'suggestions.created',
  SUGGESTIONS_APPROVED: 'suggestions.approved',
  SUGGESTIONS_REJECTED: 'suggestions.rejected',
  SUGGESTIONS_EXPIRED: 'suggestions.expired',
  SUGGESTIONS_ACCEPTANCE_RATE: 'suggestions.acceptance_rate',
  SUGGESTIONS_TIME_TO_FILL_SECONDS: 'suggestions.time_to_fill_seconds',

  // LLM metrics
  LLM_CALL_LATENCY_MS: 'llm.call_latency_ms',
  LLM_TOKEN_USAGE: 'llm.token_usage',

  // Notifications metrics
  NOTIFICATIONS_SENT: 'notifications.sent',
} as const;

export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];

/**
 * Structured log entry format.
 * Every log emitted includes these fields for traceability across services.
 */
export interface StructuredLogEntry {
  timestamp: string; // ISO 8601 format
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  operatorId: string; // FSP operator ID for multi-tenancy
  correlationId: string; // Distributed trace correlation ID
  service: 'api' | 'worker' | 'web'; // Which service emitted this log
  version: string; // Application version (from package.json or env)
  [key: string]: unknown; // Additional structured fields
}

/**
 * Distributed trace context for correlation across services.
 * Follows W3C Trace Context standard for telemetry propagation.
 */
export interface TraceContext {
  traceId: string; // Unique identifier for the entire trace
  spanId: string; // Identifier for this service's span
  parentSpanId?: string; // Parent span if this is a child span
  traceState?: string; // Vendor-specific trace state (for future use)
}

/**
 * Custom dimension applied to all metric emissions.
 * Helps filter and correlate metrics in Application Insights.
 */
export interface MetricDimensions {
  operatorId: string;
  correlationId: string;
  service: 'api' | 'worker' | 'web';
  tier?: string; // Polling tier if applicable
  environment?: string; // Environment name (dev, staging, prod)
}

/**
 * Alert thresholds as defined in PR-23.
 */
export const ALERT_THRESHOLDS = {
  POLLING_429_PER_HOUR: 3, // Alert if > 3 in an hour
  ACCEPTANCE_RATE_24H: 0.5, // Alert if < 0.5 (50%) in 24 hours
  LLM_LATENCY_P95_MS: 8000, // Alert if p95 > 8000ms
} as const;
