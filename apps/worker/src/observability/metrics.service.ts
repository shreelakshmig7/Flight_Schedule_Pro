/**
 * metrics.service.ts
 * -----------
 * Agentic Scheduler — FSP Integration — Custom metrics tracking service
 * -----------------------------------------------------------------------
 * Emits custom metrics to Application Insights from the worker service.
 * Provides high-level methods for tracking domain-specific metrics:
 * polling, change detection, suggestions, LLM, and notifications.
 *
 * Each metric is emitted with standard dimensions: operatorId, correlationId,
 * service name, and version. Metrics follow the naming convention defined
 * in @fsp-scheduler/shared-types.
 *
 * Key exports: MetricsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-23 — Azure Application Insights Integration
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  METRIC_NAMES,
  type MetricDimensions,
  type MetricName,
} from '@fsp-scheduler/shared-types';

/**
 * Service for emitting custom metrics to Application Insights.
 *
 * In a real implementation, this would use the Application Insights SDK
 * (e.g., @azure/monitor-opentelemetry). For now, it provides a structured
 * interface that logs metrics to console/file (later bound to App Insights).
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly appVersion = process.env.APP_VERSION || '0.1.0';

  /**
   * Emit a custom metric with dimensions.
   * In production, this would call the Application Insights SDK.
   */
  private emitMetric(
    name: MetricName,
    value: number,
    dimensions: MetricDimensions,
  ): void {
    const timestamp = new Date().toISOString();
    this.logger.log({
      type: 'METRIC',
      name,
      value,
      timestamp,
      ...dimensions,
      version: this.appVersion,
    });
  }

  // =========================================================================
  // Polling Metrics
  // =========================================================================

  /**
   * Track polling API calls per minute.
   * Emitted by PollingDispatcherService after each poll cycle.
   */
  trackPollingCallsPerMinute(
    callsPerMinute: number,
    operatorId: string,
    correlationId: string,
    tier?: string,
  ): void {
    const dimensions: MetricDimensions = {
      operatorId,
      correlationId,
      service: 'worker',
    };
    if (tier !== undefined) dimensions.tier = tier;
    this.emitMetric(
      METRIC_NAMES.POLLING_CALLS_PER_MINUTE,
      callsPerMinute,
      dimensions,
    );
  }

  /**
   * Track 429 (rate limit) responses from FSP API.
   * Used for alerting when > 3 per hour.
   */
  track429Count(
    count: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.POLLING_429_COUNT, count, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track pending jobs in the poll-jobs queue.
   * Helps diagnose queue congestion.
   */
  trackQueueDepth(
    depth: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.POLLING_QUEUE_DEPTH, depth, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track distribution of operators across polling tiers (TIER1, TIER2, TIER3).
   * Emitted by TierClassifierService during hourly recalculation.
   */
  trackTierDistribution(
    tier: string,
    operatorCount: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(
      METRIC_NAMES.POLLING_TIER_DISTRIBUTION,
      operatorCount,
      {
        operatorId,
        correlationId,
        service: 'worker',
        tier,
      },
    );
  }

  // =========================================================================
  // Change Detection Metrics
  // =========================================================================

  /**
   * Track number of changes detected per poll cycle.
   * Emitted by ChangeDetectionService.
   */
  trackChangesPerPoll(
    changeCount: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.DETECTION_CHANGES_PER_POLL, changeCount, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track number of flights cancelled (ChangeType.CANCELLATION).
   * Subset of changes_per_poll, used for analysis.
   */
  trackCancellations(
    count: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.DETECTION_CANCELLATIONS, count, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track number of new flight openings detected (ChangeType.NEW_OPENING).
   * Subset of changes_per_poll, used for analysis.
   */
  trackNewOpenings(
    count: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.DETECTION_NEW_OPENINGS, count, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  // =========================================================================
  // Suggestions Metrics
  // =========================================================================

  /**
   * Track number of suggestions created in a given time period.
   * Emitted by SuggestionsService when new suggestions are created.
   */
  trackSuggestionsCreated(
    count: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.SUGGESTIONS_CREATED, count, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track number of suggestions approved by operator/system.
   * Emitted when suggestion status transitions to ACCEPTED.
   */
  trackSuggestionsApproved(
    count: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.SUGGESTIONS_APPROVED, count, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track number of suggestions rejected by operator/system.
   * Emitted when suggestion status transitions to REJECTED.
   */
  trackSuggestionsRejected(
    count: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.SUGGESTIONS_REJECTED, count, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track number of suggestions expired (not acted on within TTL).
   * Emitted when suggestion status transitions to EXPIRED.
   */
  trackSuggestionsExpired(
    count: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.SUGGESTIONS_EXPIRED, count, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track suggestion acceptance rate over a time period (24h window).
   * Calculated as: approved / (approved + rejected + expired).
   * Used for alerting if < 0.5 (50%).
   */
  trackAcceptanceRate(
    rate: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.SUGGESTIONS_ACCEPTANCE_RATE, rate, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track average time (in seconds) from suggestion creation to acceptance.
   * Helps measure efficiency of suggestion system.
   */
  trackTimeToFillSeconds(
    seconds: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(
      METRIC_NAMES.SUGGESTIONS_TIME_TO_FILL_SECONDS,
      seconds,
      {
        operatorId,
        correlationId,
        service: 'worker',
      },
    );
  }

  // =========================================================================
  // LLM Metrics
  // =========================================================================

  /**
   * Track LLM API call latency in milliseconds.
   * Emitted by LlmService after each rationale generation call.
   * Used for alerting if p95 > 8000ms.
   */
  trackLlmCallLatency(
    latencyMs: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.LLM_CALL_LATENCY_MS, latencyMs, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  /**
   * Track token usage in LLM API calls (sum of prompt + completion tokens).
   * Helps estimate API costs and monitor usage patterns.
   */
  trackLlmTokenUsage(
    tokenCount: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.LLM_TOKEN_USAGE, tokenCount, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }

  // =========================================================================
  // Notifications Metrics
  // =========================================================================

  /**
   * Track number of notifications sent.
   * Emitted by NotificationsService when emails/SMS are dispatched.
   */
  trackNotificationsSent(
    count: number,
    operatorId: string,
    correlationId: string,
  ): void {
    this.emitMetric(METRIC_NAMES.NOTIFICATIONS_SENT, count, {
      operatorId,
      correlationId,
      service: 'worker',
    });
  }
}
