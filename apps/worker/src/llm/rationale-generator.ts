/**
 * rationale-generator.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — LLM Rationale Generator
 * -------------------------------------------------------------
 * Generates a plain-English rationale explaining why a particular student,
 * slot, and resource set was selected for a scheduling suggestion.
 *
 * Uses the Anthropic API (Claude Opus 4.6) to produce a structured JSON
 * response containing:
 *   - rationale: 2-4 sentence explanation (50–400 chars)
 *   - confidence: 0–1 float
 *   - constraintsSatisfied: human-readable list of passed constraints
 *
 * Resilience contract (fsp-039, fsp-040, fsp-041, fsp-042):
 *   - API 5xx errors → deterministic fallback template (no exception thrown)
 *   - Malformed / schema-invalid JSON → fallback template
 *   - LLM call exceeds LLM_TIMEOUT_MS → fallback template
 *   - LLM confidence > 0.8 but <80% constraints pass → confidence overridden to 0.5
 *
 * The suggestion is NEVER blocked by LLM failures.
 * Prompt construction only uses sanitised, structured fields — no raw FSP
 * API response objects are ever embedded in the prompt.
 *
 * Key exports: RationaleGenerator, ANTHROPIC_CLIENT
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-12 — LLM Rationale Generator
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type {
  LlmFallbackReason,
  LlmJsonResponse,
  RationaleInput,
  RationaleOutput,
} from '@fsp-scheduler/shared-types';
import {
  LLM_ANTHROPIC_MODEL,
  LLM_CONFIDENCE_OVERRIDE_THRESHOLD,
  LLM_CONSTRAINT_PASS_RATE_THRESHOLD,
  LLM_FALLBACK_CONFIDENCE,
  LLM_MAX_TOKENS,
  LLM_RATIONALE_MAX_CHARS,
  LLM_RATIONALE_MIN_CHARS,
  LLM_TIMEOUT_MS,
} from '@fsp-scheduler/shared-types';

/** Injection token for the Anthropic client. */
export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';

/** System prompt instructing Claude to return strict JSON only. */
const SYSTEM_PROMPT = `You are a scheduling assistant for a flight training management system.

Given information about a student, a proposed lesson slot, constraint checks, and priority scores,
produce a concise plain-English explanation of why this student and slot were selected.

You MUST respond with ONLY a valid JSON object — no markdown, no prose outside the JSON.
The JSON must have exactly these three fields:

{
  "rationale": "<string — 2-4 sentences, 50-400 characters, explaining the selection>",
  "confidence": <number — 0.0 to 1.0, your confidence in this being a good suggestion>,
  "constraintsSatisfied": [<array of strings — one human-readable entry per passed constraint>]
}

Rules:
- rationale must be between 50 and 400 characters
- confidence must be a number between 0 and 1
- constraintsSatisfied must only list constraints that PASSED
- Do not include any explanation, markdown code fences, or text outside the JSON object`;

/**
 * NestJS injectable service that generates LLM-based rationales for
 * scheduling suggestions.
 *
 * The Anthropic client is injected via ANTHROPIC_CLIENT token so it can be
 * replaced with a mock in unit tests without needing the NestJS testing module.
 */
@Injectable()
export class RationaleGenerator {
  private readonly logger = new Logger('RationaleGenerator');

  /**
   * Timeout in milliseconds for a single Anthropic API call.
   * Exposed as a public property so tests can reduce it to avoid slow tests.
   * Production code always reads LLM_TIMEOUT_MS via the default.
   */
  public timeoutMs: number = LLM_TIMEOUT_MS;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Generates a scheduling rationale for the given candidate input.
   *
   * Always resolves — never rejects. On any LLM failure the deterministic
   * fallback template is returned instead.
   *
   * @param input - Sanitised candidate data. Must not contain raw FSP response objects.
   * @returns A fully-populated RationaleOutput, LLM-generated or fallback.
   */
  public async generateRationale(input: RationaleInput): Promise<RationaleOutput> {
    try {
      return await Promise.race([
        this.callLlm(input),
        this.createTimeoutPromise(),
      ]);
    } catch (err: unknown) {
      const reason = this.classifyError(err);
      this.logger.warn(`LLM rationale fallback triggered: ${reason}`);
      return this.buildFallbackResponse(input, reason);
    }
  }

  // ── Private: LLM call ───────────────────────────────────────────────────────

  /**
   * Makes the Anthropic API call, parses and validates the response,
   * applies the confidence override rule, and returns a RationaleOutput.
   *
   * Throws on API errors or malformed JSON so the caller's try/catch
   * can route to the fallback.
   */
  private async callLlm(input: RationaleInput): Promise<RationaleOutput> {
    const startTime = Date.now();
    const userContent = this.buildUserPrompt(input);

    const response = await this.anthropic.messages.create({
      model: LLM_ANTHROPIC_MODEL,
      max_tokens: LLM_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const latencyMs = Date.now() - startTime;
    const outputTokens = (response as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0;
    this.logger.log(
      `LLM call completed: latency=${latencyMs}ms, output_tokens=${outputTokens}`,
    );

    // Extract text block
    const content = (response as { content: Array<{ type: string; text?: string }> }).content;
    const textBlock = content.find(b => b.type === 'text');
    const rawText = textBlock?.text ?? '';

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      this.logger.warn('LLM returned malformed JSON — using fallback template');
      throw new Error('MALFORMED_JSON');
    }

    // Validate schema
    if (!this.isValidLlmResponse(parsed)) {
      this.logger.warn('LLM response failed schema validation — using fallback template');
      throw new Error('MALFORMED_JSON');
    }

    const { rationale, confidence: rawConfidence, constraintsSatisfied } = parsed;

    // Apply confidence override rule (fsp-042)
    const constraintPassRate = this.computeConstraintPassRate(input.constraintResults);
    let confidence = rawConfidence;
    let confidenceOverridden = false;

    if (
      rawConfidence > LLM_CONFIDENCE_OVERRIDE_THRESHOLD &&
      constraintPassRate < LLM_CONSTRAINT_PASS_RATE_THRESHOLD
    ) {
      confidence = LLM_FALLBACK_CONFIDENCE;
      confidenceOverridden = true;
      this.logger.warn(
        `LLM confidence overridden: ${rawConfidence} → ${LLM_FALLBACK_CONFIDENCE} ` +
        `(constraint pass rate: ${constraintPassRate.toFixed(2)}, confidence overridden)`,
      );
    }

    return {
      rationale,
      confidence,
      constraintsSatisfied,
      usedFallback: false,
      confidenceOverridden,
    };
  }

  // ── Private: fallback template ──────────────────────────────────────────────

  /**
   * Builds a deterministic fallback rationale when the LLM is unavailable or fails.
   *
   * Template format:
   *   "Suggested <Name> for <date> at <time> — <top signal>. <X of Y constraints passed>. Confidence: 0.5."
   *
   * @param input  - Original candidate input.
   * @param reason - Why the fallback is being used.
   */
  private buildFallbackResponse(input: RationaleInput, reason: LlmFallbackReason): RationaleOutput {
    const { student, proposedSlot, constraintResults, prioritySignalBreakdown } = input;
    const name = `${student.firstName} ${student.lastName}`;

    // Format slot date/time
    const slotDate = new Date(proposedSlot.slotStart);
    const dateStr = slotDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const timeStr = slotDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    });

    // Top priority signal
    const topSignalEntry = Object.entries(prioritySignalBreakdown)
      .sort(([, a], [, b]) => b - a)[0];
    const topSignal = topSignalEntry
      ? `priority driven by ${topSignalEntry[0].replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`
      : 'scheduled based on availability';

    // Constraint summary
    const passed = Object.entries(constraintResults).filter(([, v]) => v);
    const total = Object.keys(constraintResults).length;
    const constraintSummary = `${passed.length} of ${total} constraint${total !== 1 ? 's' : ''} passed`;

    const rationale = `Suggested ${name} for ${dateStr} at ${timeStr} — ${topSignal}. ${constraintSummary}. Confidence: ${LLM_FALLBACK_CONFIDENCE}.`;

    // Clamp to valid length
    const clamped = rationale.length > LLM_RATIONALE_MAX_CHARS
      ? rationale.slice(0, LLM_RATIONALE_MAX_CHARS - 1) + '.'
      : rationale;

    const constraintsSatisfied = passed.map(([name]) => `${name} confirmed`);

    return {
      rationale: clamped,
      confidence: LLM_FALLBACK_CONFIDENCE,
      constraintsSatisfied,
      usedFallback: true,
      fallbackReason: reason,
      confidenceOverridden: false,
    };
  }

  // ── Private: helpers ────────────────────────────────────────────────────────

  /**
   * Builds the user-facing prompt from sanitised candidate data.
   * Contains NO raw FSP API response objects — only structured fields.
   */
  private buildUserPrompt(input: RationaleInput): string {
    const { student, proposedSlot, constraintResults, priorityScore, prioritySignalBreakdown, operatorContext, candidateCount, topRank } = input;

    const passedConstraints = Object.entries(constraintResults)
      .filter(([, v]) => v)
      .map(([k]) => `  - ${k}: PASSED`)
      .join('\n');

    const failedConstraints = Object.entries(constraintResults)
      .filter(([, v]) => !v)
      .map(([k]) => `  - ${k}: FAILED`)
      .join('\n');

    const signals = Object.entries(prioritySignalBreakdown)
      .map(([k, v]) => `  - ${k}: ${v.toFixed(2)}`)
      .join('\n');

    return [
      `Operator: ${operatorContext.operatorName}`,
      '',
      `Student: ${student.firstName} ${student.lastName} (ID: ${student.studentId})`,
      `  Completed hours: ${student.completedHours} / ${student.requiredHours} required`,
      '',
      `Proposed slot: ${proposedSlot.slotStart} → ${proposedSlot.slotEnd}`,
      `  Instructor: ${proposedSlot.instructorId}`,
      `  Aircraft: ${proposedSlot.aircraftId}`,
      `  Location: ${proposedSlot.locationId}`,
      '',
      `Priority score: ${priorityScore.toFixed(3)} (ranked ${topRank ? '#1' : 'not top'} of ${candidateCount} candidates)`,
      'Priority signal breakdown:',
      signals,
      '',
      'Constraint check results:',
      passedConstraints || '  (none passed)',
      failedConstraints ? `\nFailed constraints:\n${failedConstraints}` : '',
    ].join('\n').trim();
  }

  /**
   * Returns a Promise that rejects after `this.timeoutMs` milliseconds
   * with an LLM_TIMEOUT error.
   */
  private createTimeoutPromise(): Promise<never> {
    return new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('LLM_TIMEOUT')), this.timeoutMs);
    });
  }

  /**
   * Maps an error thrown by the LLM call to a LlmFallbackReason.
   */
  private classifyError(err: unknown): LlmFallbackReason {
    if (err instanceof Error) {
      if (err.message === 'LLM_TIMEOUT') return 'timeout';
      if (err.message === 'MALFORMED_JSON') return 'malformed_json';
    }
    return 'api_error';
  }

  /**
   * Validates that a parsed JSON value conforms to the LlmJsonResponse shape.
   * Also checks that rationale is within the required character length bounds.
   */
  private isValidLlmResponse(value: unknown): value is LlmJsonResponse {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj['rationale'] !== 'string') return false;
    if (typeof obj['confidence'] !== 'number') return false;
    if (!Array.isArray(obj['constraintsSatisfied'])) return false;
    if (
      obj['rationale'].length < LLM_RATIONALE_MIN_CHARS ||
      obj['rationale'].length > LLM_RATIONALE_MAX_CHARS
    ) {
      return false;
    }
    if (obj['confidence'] < 0 || obj['confidence'] > 1) return false;
    return true;
  }

  /**
   * Computes the fraction of constraints that passed.
   * Returns 1.0 when there are no constraints (no override needed).
   */
  private computeConstraintPassRate(constraints: Record<string, boolean>): number {
    const entries = Object.values(constraints);
    if (entries.length === 0) return 1.0;
    const passCount = entries.filter(Boolean).length;
    return passCount / entries.length;
  }
}
