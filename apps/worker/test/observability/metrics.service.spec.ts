/**
 * metrics.service.spec.ts
 * -----------
 * Agentic Scheduler — FSP Integration — MetricsService unit tests
 * ---------------------------------------------------------------
 * Tests the custom metrics tracking service. Verifies that all metric
 * methods correctly emit metrics with proper dimensions and values.
 *
 * Coverage includes:
 * - Polling metrics (calls per minute, 429 count, queue depth, tier distribution)
 * - Change detection metrics (changes per poll, cancellations, new openings)
 * - Suggestions metrics (created, approved, rejected, expired, acceptance rate, time to fill)
 * - LLM metrics (call latency, token usage)
 * - Notifications metrics (sent)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-23 — Azure Application Insights Integration
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { MetricsService } from '../../src/observability/metrics.service';
import { METRIC_NAMES } from '@fsp-scheduler/shared-types';

describe('MetricsService', () => {
  let service: MetricsService;
  let loggerLogSpy: ReturnType<typeof vi.spyOn>;

  const operatorId = 'op-uuid-123';
  const correlationId = 'trace-abc-def';

  beforeEach(() => {
    service = new MetricsService();
    loggerLogSpy = vi.spyOn(Logger.prototype, 'log');
  });

  // =========================================================================
  // Polling Metrics
  // =========================================================================

  describe('polling metrics', () => {
    it('should track polling calls per minute', () => {
      service.trackPollingCallsPerMinute(5, operatorId, correlationId, 'TIER2');

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.POLLING_CALLS_PER_MINUTE,
          value: 5,
          operatorId,
          correlationId,
          service: 'worker',
          tier: 'TIER2',
        }),
      );
    });

    it('should track 429 count', () => {
      service.track429Count(2, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.POLLING_429_COUNT,
          value: 2,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track queue depth', () => {
      service.trackQueueDepth(42, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.POLLING_QUEUE_DEPTH,
          value: 42,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track tier distribution', () => {
      service.trackTierDistribution(
        'TIER1',
        10,
        operatorId,
        correlationId,
      );

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.POLLING_TIER_DISTRIBUTION,
          value: 10,
          operatorId,
          correlationId,
          service: 'worker',
          tier: 'TIER1',
        }),
      );
    });
  });

  // =========================================================================
  // Change Detection Metrics
  // =========================================================================

  describe('change detection metrics', () => {
    it('should track changes per poll', () => {
      service.trackChangesPerPoll(3, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.DETECTION_CHANGES_PER_POLL,
          value: 3,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track cancellations', () => {
      service.trackCancellations(1, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.DETECTION_CANCELLATIONS,
          value: 1,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track new openings', () => {
      service.trackNewOpenings(2, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.DETECTION_NEW_OPENINGS,
          value: 2,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });
  });

  // =========================================================================
  // Suggestions Metrics
  // =========================================================================

  describe('suggestions metrics', () => {
    it('should track suggestions created', () => {
      service.trackSuggestionsCreated(5, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.SUGGESTIONS_CREATED,
          value: 5,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track suggestions approved', () => {
      service.trackSuggestionsApproved(3, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.SUGGESTIONS_APPROVED,
          value: 3,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track suggestions rejected', () => {
      service.trackSuggestionsRejected(1, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.SUGGESTIONS_REJECTED,
          value: 1,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track suggestions expired', () => {
      service.trackSuggestionsExpired(1, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.SUGGESTIONS_EXPIRED,
          value: 1,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track acceptance rate', () => {
      service.trackAcceptanceRate(0.85, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.SUGGESTIONS_ACCEPTANCE_RATE,
          value: 0.85,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track time to fill seconds', () => {
      service.trackTimeToFillSeconds(1200, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.SUGGESTIONS_TIME_TO_FILL_SECONDS,
          value: 1200,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });
  });

  // =========================================================================
  // LLM Metrics
  // =========================================================================

  describe('LLM metrics', () => {
    it('should track LLM call latency', () => {
      service.trackLlmCallLatency(3500, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.LLM_CALL_LATENCY_MS,
          value: 3500,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });

    it('should track LLM token usage', () => {
      service.trackLlmTokenUsage(450, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.LLM_TOKEN_USAGE,
          value: 450,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });
  });

  // =========================================================================
  // Notifications Metrics
  // =========================================================================

  describe('notifications metrics', () => {
    it('should track notifications sent', () => {
      service.trackNotificationsSent(2, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'METRIC',
          name: METRIC_NAMES.NOTIFICATIONS_SENT,
          value: 2,
          operatorId,
          correlationId,
          service: 'worker',
        }),
      );
    });
  });

  // =========================================================================
  // Common tests
  // =========================================================================

  describe('common behavior', () => {
    it('should include app version in all metrics', () => {
      service.trackPollingCallsPerMinute(5, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          version: expect.any(String),
        }),
      );
    });

    it('should include timestamp in ISO 8601 format', () => {
      service.trackPollingCallsPerMinute(5, operatorId, correlationId);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      );
    });
  });
});
