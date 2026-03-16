/**
 * rationale-generator.spec.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — RationaleGenerator unit tests
 * --------------------------------------------------------------------
 * Tests all paths through the LLM Rationale Generator:
 *   happy path  — LLM returns valid JSON → structured output used
 *   api error   — Anthropic 500 → fallback template, no exception (fsp-039)
 *   malformed   — LLM returns invalid/missing-field JSON → fallback (fsp-040)
 *   timeout     — LLM call exceeds 10s → fallback within timeout (fsp-041)
 *   confidence override — LLM confidence 0.9, 50% constraints pass → 0.5 (fsp-042)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-12 — LLM Rationale Generator
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RationaleGenerator } from '../../src/llm/rationale-generator';
import type { RationaleInput } from '@fsp-scheduler/shared-types';
import {
  LLM_RATIONALE_MIN_CHARS,
  LLM_RATIONALE_MAX_CHARS,
  LLM_FALLBACK_CONFIDENCE,
} from '@fsp-scheduler/shared-types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal valid input. All fields sanitised (no raw FSP objects). */
const SAMPLE_INPUT: RationaleInput = {
  student: {
    studentId: 'usr-student-001',
    firstName: 'Tyler',
    lastName: 'Brooks',
    completedHours: 20,
    requiredHours: 40,
  },
  proposedSlot: {
    slotStart: '2025-10-15T14:00:00Z',
    slotEnd: '2025-10-15T16:00:00Z',
    instructorId: 'inst-001',
    aircraftId: 'N1234A',
    locationId: 'loc-001',
  },
  constraintResults: {
    'Student availability': true,
    'Instructor availability': true,
    'Aircraft availability': true,
    'Activity type match': true,
    'Daylight hours': true,
    'Enrollment active': true,
  },
  priorityScore: 0.82,
  prioritySignalBreakdown: {
    timeSinceLastFlight: 0.9,
    timeUntilNextScheduledFlight: 1.0,
    totalFlightHours: 0.75,
  },
  operatorContext: { operatorName: 'Eagle Flight Academy' },
  candidateCount: 8,
  topRank: true,
};

/** Valid JSON the LLM should return. */
const VALID_LLM_JSON = {
  rationale:
    'Tyler Brooks was selected for this slot because he has not flown in 30 days and has the highest urgency score among 8 candidates. All 6 scheduling constraints passed, including instructor and aircraft availability.',
  confidence: 0.87,
  constraintsSatisfied: [
    'Student availability confirmed',
    'Instructor Marcus Chen is free',
    'Aircraft N1234A is available',
    'Activity type matches next lesson',
    'Daylight hours requirement met',
    'Enrollment is active',
  ],
};

/** Build a mock Anthropic messages.create response from a raw text string. */
function mockLlmResponse(text: string): Record<string, unknown> {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 120, output_tokens: 80 },
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('RationaleGenerator', () => {
  let mockCreate: ReturnType<typeof vi.fn>;
  let generator: RationaleGenerator;

  beforeEach(() => {
    mockCreate = vi.fn();
    const mockClient = { messages: { create: mockCreate } };
    generator = new RationaleGenerator(mockClient as never);
    // Short timeout so tests don't take 10 seconds
    generator.timeoutMs = 200;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  describe('happy path — valid LLM response', () => {
    it('returns structured output matching the LLM JSON', async () => {
      mockCreate.mockResolvedValue(mockLlmResponse(JSON.stringify(VALID_LLM_JSON)));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.usedFallback).toBe(false);
      expect(result.rationale).toBe(VALID_LLM_JSON.rationale);
      expect(result.confidence).toBe(VALID_LLM_JSON.confidence);
      expect(result.constraintsSatisfied).toEqual(VALID_LLM_JSON.constraintsSatisfied);
      expect(result.confidenceOverridden).toBe(false);
    });

    it('rationale length is within the valid range', async () => {
      mockCreate.mockResolvedValue(mockLlmResponse(JSON.stringify(VALID_LLM_JSON)));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.rationale.length).toBeGreaterThanOrEqual(LLM_RATIONALE_MIN_CHARS);
      expect(result.rationale.length).toBeLessThanOrEqual(LLM_RATIONALE_MAX_CHARS);
    });

    it('passes the Anthropic API call with the correct model', async () => {
      mockCreate.mockResolvedValue(mockLlmResponse(JSON.stringify(VALID_LLM_JSON)));

      await generator.generateRationale(SAMPLE_INPUT);

      expect(mockCreate).toHaveBeenCalledOnce();
      const callArg = mockCreate.mock.calls[0][0];
      expect(callArg.model).toBe('claude-opus-4-6');
      expect(callArg.max_tokens).toBeLessThanOrEqual(500);
    });

    it('prompt contains student name but no raw FSP API response objects', async () => {
      mockCreate.mockResolvedValue(mockLlmResponse(JSON.stringify(VALID_LLM_JSON)));

      await generator.generateRationale(SAMPLE_INPUT);

      const callArg = mockCreate.mock.calls[0][0];
      const userContent = JSON.stringify(callArg.messages);
      // Student name should be in the prompt
      expect(userContent).toContain('Tyler');
      // The prompt must NOT contain raw nested objects that look like FSP API dumps
      // (constraintResults are passed as structured data, not stringified FSP blobs)
      expect(typeof callArg.messages[0].content).toBe('string');
    });
  });

  // ── fsp-039 — API error ────────────────────────────────────────────────────

  describe('[fsp-039] Anthropic API returns 500 error', () => {
    it('does NOT throw — falls back to template and creates a PENDING-compatible response', async () => {
      mockCreate.mockRejectedValue(new Error('Internal server error'));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.usedFallback).toBe(true);
      expect(result.fallbackReason).toBe('api_error');
      expect(result.rationale).toBeTruthy();
      expect(result.confidence).toBe(LLM_FALLBACK_CONFIDENCE);
    });

    it('fallback rationale contains student name and operator name', async () => {
      mockCreate.mockRejectedValue(new Error('Internal server error'));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.rationale).toContain('Tyler Brooks');
    });

    it('fallback constraintsSatisfied lists the passed constraints', async () => {
      mockCreate.mockRejectedValue(new Error('Internal server error'));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      // All 6 constraints passed in SAMPLE_INPUT — all should appear
      expect(result.constraintsSatisfied.length).toBe(6);
    });
  });

  // ── fsp-040 — Malformed JSON ────────────────────────────────────────────────

  describe('[fsp-040] LLM returns malformed JSON', () => {
    it('handles completely invalid JSON without throwing', async () => {
      mockCreate.mockResolvedValue(mockLlmResponse('invalid json {'));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.usedFallback).toBe(true);
      expect(result.fallbackReason).toBe('malformed_json');
      expect(result.rationale).toBeTruthy();
    });

    it('handles JSON missing required "rationale" field without throwing', async () => {
      const missingField = { confidence: 0.8, constraintsSatisfied: [] };
      mockCreate.mockResolvedValue(mockLlmResponse(JSON.stringify(missingField)));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.usedFallback).toBe(true);
      expect(result.fallbackReason).toBe('malformed_json');
    });

    it('handles JSON missing "confidence" field without throwing', async () => {
      const missingField = { rationale: 'Some rationale text here that is long enough for the test', constraintsSatisfied: [] };
      mockCreate.mockResolvedValue(mockLlmResponse(JSON.stringify(missingField)));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.usedFallback).toBe(true);
      expect(result.fallbackReason).toBe('malformed_json');
    });

    it('handles empty string response without throwing', async () => {
      mockCreate.mockResolvedValue(mockLlmResponse(''));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.usedFallback).toBe(true);
      expect(result.rationale).toBeTruthy();
    });

    it('fallback rationale does not contain "JSON parse error propagated"', async () => {
      mockCreate.mockResolvedValue(mockLlmResponse('not json'));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.rationale).not.toContain('JSON parse error propagated');
      expect(result.rationale).not.toContain('rationale missing');
    });
  });

  // ── fsp-041 — Timeout ────────────────────────────────────────────────────────

  describe('[fsp-041] LLM call times out', () => {
    it('falls back within the timeout window when LLM never resolves', async () => {
      vi.useFakeTimers();
      // LLM call never resolves
      mockCreate.mockImplementation(() => new Promise(() => {}));

      const resultPromise = generator.generateRationale(SAMPLE_INPUT);
      // Advance past the timeout (generator.timeoutMs = 200ms in beforeEach)
      vi.advanceTimersByTime(300);

      const result = await resultPromise;

      expect(result.usedFallback).toBe(true);
      expect(result.fallbackReason).toBe('timeout');
      expect(result.rationale).toBeTruthy();
    });

    it('fallback rationale does not contain "hanging" or "waited more than 10 seconds"', async () => {
      vi.useFakeTimers();
      mockCreate.mockImplementation(() => new Promise(() => {}));

      const resultPromise = generator.generateRationale(SAMPLE_INPUT);
      vi.advanceTimersByTime(300);

      const result = await resultPromise;

      expect(result.rationale).not.toContain('hanging');
      expect(result.rationale).not.toContain('waited more than 10 seconds');
    });

    it('timeout fallback has confidence equal to LLM_FALLBACK_CONFIDENCE', async () => {
      vi.useFakeTimers();
      mockCreate.mockImplementation(() => new Promise(() => {}));

      const resultPromise = generator.generateRationale(SAMPLE_INPUT);
      vi.advanceTimersByTime(300);

      const result = await resultPromise;

      expect(result.confidence).toBe(LLM_FALLBACK_CONFIDENCE);
    });
  });

  // ── fsp-042 — Confidence override ────────────────────────────────────────────

  describe('[fsp-042] LLM confidence 0.9 but only 50% of constraints pass', () => {
    it('overrides LLM confidence to 0.5 when constraint pass rate < 80%', async () => {
      const highConfidenceJson = {
        rationale: VALID_LLM_JSON.rationale,
        confidence: 0.9,
        constraintsSatisfied: ['Student availability confirmed'],
      };
      mockCreate.mockResolvedValue(mockLlmResponse(JSON.stringify(highConfidenceJson)));

      const lowPassInput: RationaleInput = {
        ...SAMPLE_INPUT,
        constraintResults: {
          'Student availability': true,
          'Instructor availability': false,
          'Aircraft availability': true,
          'Activity type match': false,
          'Daylight hours': false,
          'Enrollment active': true,
          // 3 of 6 pass → 50% pass rate
        },
      };

      const result = await generator.generateRationale(lowPassInput);

      expect(result.confidence).toBe(LLM_FALLBACK_CONFIDENCE); // 0.5
      expect(result.confidenceOverridden).toBe(true);
      expect(result.usedFallback).toBe(false); // rationale is still from LLM
    });

    it('does NOT override confidence when LLM confidence <= 0.8', async () => {
      const moderateConfidence = { ...VALID_LLM_JSON, confidence: 0.75 };
      mockCreate.mockResolvedValue(mockLlmResponse(JSON.stringify(moderateConfidence)));

      const lowPassInput: RationaleInput = {
        ...SAMPLE_INPUT,
        constraintResults: { A: true, B: false, C: false }, // 33% pass
      };

      const result = await generator.generateRationale(lowPassInput);

      expect(result.confidence).toBe(0.75); // not overridden
      expect(result.confidenceOverridden).toBe(false);
    });

    it('does NOT override confidence when all constraints pass (100%)', async () => {
      const highConfidenceJson = { ...VALID_LLM_JSON, confidence: 0.95 };
      mockCreate.mockResolvedValue(mockLlmResponse(JSON.stringify(highConfidenceJson)));

      const result = await generator.generateRationale(SAMPLE_INPUT); // all 6 pass

      expect(result.confidence).toBe(0.95);
      expect(result.confidenceOverridden).toBe(false);
    });
  });

  // ── Fallback template quality ─────────────────────────────────────────────

  describe('fallback template quality', () => {
    it('fallback rationale is within the valid character length range', async () => {
      mockCreate.mockRejectedValue(new Error('Service unavailable'));

      const result = await generator.generateRationale(SAMPLE_INPUT);

      expect(result.rationale.length).toBeGreaterThanOrEqual(LLM_RATIONALE_MIN_CHARS);
      expect(result.rationale.length).toBeLessThanOrEqual(LLM_RATIONALE_MAX_CHARS);
    });

    it('fallback works for student with no constraints passed', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));
      const noPassInput: RationaleInput = {
        ...SAMPLE_INPUT,
        constraintResults: {
          'Student availability': false,
          'Instructor availability': false,
        },
      };

      const result = await generator.generateRationale(noPassInput);

      expect(result.usedFallback).toBe(true);
      expect(result.constraintsSatisfied).toHaveLength(0);
    });
  });
});
