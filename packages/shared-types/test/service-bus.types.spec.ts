/**
 * service-bus.types.spec.ts
 * -------------------------
 * Agentic Scheduler — FSP Integration — Service Bus type guard unit tests
 * ------------------------------------------------------------------------
 * Verifies the runtime type guards for Azure Service Bus message interfaces:
 * isPollJobMessage, isChangeEventMessage, and isSuggestionResultMessage.
 * Tests cover valid payloads and missing/invalid field cases.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import {
  isPollJobMessage,
  isChangeEventMessage,
  isSuggestionResultMessage,
} from '../src/service-bus.types';

// ---------------------------------------------------------------------------
// isPollJobMessage
// ---------------------------------------------------------------------------
describe('isPollJobMessage', () => {
  it('returns true for a valid PollJobMessage', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-abc',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      fspOperatorId: 42,
      tier: 'TIER1',
      scheduledAt: '2026-03-15T10:05:00.000Z',
    };
    expect(isPollJobMessage(msg)).toBe(true);
  });

  it('returns false when operatorId is missing', () => {
    const msg = {
      correlationId: 'corr-abc',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      fspOperatorId: 42,
      tier: 'TIER1',
      scheduledAt: '2026-03-15T10:05:00.000Z',
    };
    expect(isPollJobMessage(msg)).toBe(false);
  });

  it('returns false when tier is missing', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-abc',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      fspOperatorId: 42,
      scheduledAt: '2026-03-15T10:05:00.000Z',
    };
    expect(isPollJobMessage(msg)).toBe(false);
  });

  it('returns false when tier has an invalid value', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-abc',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      fspOperatorId: 42,
      tier: 'TIER4',
      scheduledAt: '2026-03-15T10:05:00.000Z',
    };
    expect(isPollJobMessage(msg)).toBe(false);
  });

  it('returns false for a non-object value', () => {
    expect(isPollJobMessage(null)).toBe(false);
    expect(isPollJobMessage('string')).toBe(false);
    expect(isPollJobMessage(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isChangeEventMessage
// ---------------------------------------------------------------------------
describe('isChangeEventMessage', () => {
  it('returns true for a valid ChangeEventMessage', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-def',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      fspOperatorId: 7,
      changeType: 'CANCELLATION',
      reservationId: 'res-999',
      detectedAt: '2026-03-15T09:59:00.000Z',
      rawDiff: { before: 'OPEN', after: 'CANCELLED' },
    };
    expect(isChangeEventMessage(msg)).toBe(true);
  });

  it('returns false when changeType is missing', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-def',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      fspOperatorId: 7,
      reservationId: 'res-999',
      detectedAt: '2026-03-15T09:59:00.000Z',
      rawDiff: {},
    };
    expect(isChangeEventMessage(msg)).toBe(false);
  });

  it('returns false when changeType has an invalid value', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-def',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      fspOperatorId: 7,
      changeType: 'UNKNOWN_TYPE',
      reservationId: 'res-999',
      detectedAt: '2026-03-15T09:59:00.000Z',
      rawDiff: {},
    };
    expect(isChangeEventMessage(msg)).toBe(false);
  });

  it('returns false for a non-object value', () => {
    expect(isChangeEventMessage(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSuggestionResultMessage
// ---------------------------------------------------------------------------
describe('isSuggestionResultMessage', () => {
  it('returns true for a valid SuggestionResultMessage (CREATED)', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-ghi',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      suggestionId: 'sug-001',
      useCaseType: 'FILL_GAP',
      status: 'CREATED',
      createdAt: '2026-03-15T10:00:01.000Z',
    };
    expect(isSuggestionResultMessage(msg)).toBe(true);
  });

  it('returns true for a valid SuggestionResultMessage (FAILED with errorMessage)', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-ghi',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      suggestionId: 'sug-002',
      useCaseType: 'FILL_GAP',
      status: 'FAILED',
      createdAt: '2026-03-15T10:00:01.000Z',
      errorMessage: 'LLM timeout',
    };
    expect(isSuggestionResultMessage(msg)).toBe(true);
  });

  it('returns false when status is missing', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-ghi',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      suggestionId: 'sug-001',
      useCaseType: 'FILL_GAP',
      createdAt: '2026-03-15T10:00:01.000Z',
    };
    expect(isSuggestionResultMessage(msg)).toBe(false);
  });

  it('returns false when status has an invalid value', () => {
    const msg = {
      operatorId: 'op-123',
      correlationId: 'corr-ghi',
      enqueuedAt: '2026-03-15T10:00:00.000Z',
      suggestionId: 'sug-001',
      useCaseType: 'FILL_GAP',
      status: 'PENDING',
      createdAt: '2026-03-15T10:00:01.000Z',
    };
    expect(isSuggestionResultMessage(msg)).toBe(false);
  });

  it('returns false for a non-object value', () => {
    expect(isSuggestionResultMessage([])).toBe(false);
  });
});
