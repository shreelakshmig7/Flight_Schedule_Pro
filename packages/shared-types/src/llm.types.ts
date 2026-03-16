/**
 * llm.types.ts
 * ------------
 * Agentic Scheduler — FSP Integration — LLM Rationale Generator types
 * --------------------------------------------------------------------
 * Defines TypeScript types for the LLM Rationale Generator (PR-12).
 * Shared between apps/worker (generator) and consuming use-case handlers
 * (PR-13 through PR-16).
 *
 * Key exports: RationaleInput, RationaleOutput, LlmFallbackReason
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-12 — LLM Rationale Generator
 */

/**
 * Sanitised student profile passed to the rationale generator.
 * Never contains raw FSP API response objects — only structured fields.
 */
export interface RationaleStudentInput {
  /** FSP student identifier. */
  studentId: string;
  /** Student first name (display only). */
  firstName: string;
  /** Student last name (display only). */
  lastName: string;
  /** Completed flight hours in the student's active enrollment. */
  completedHours: number;
  /** Total required hours for the program. */
  requiredHours: number;
}

/**
 * Proposed scheduling slot passed to the rationale generator.
 * All timestamps are ISO 8601 strings.
 */
export interface RationaleSlotInput {
  /** ISO 8601 start time of the proposed slot. */
  slotStart: string;
  /** ISO 8601 end time of the proposed slot. */
  slotEnd: string;
  /** FSP instructor identifier for the slot. */
  instructorId: string;
  /** FSP aircraft identifier for the slot. */
  aircraftId: string;
  /** FSP location identifier for the slot. */
  locationId: string;
}

/**
 * Input payload for the LLM Rationale Generator.
 * All fields contain pre-processed, sanitised data — no raw FSP API
 * response objects must be passed here to prevent prompt injection.
 */
export interface RationaleInput {
  /** Sanitised student profile. */
  student: RationaleStudentInput;
  /** The scheduling slot being proposed. */
  proposedSlot: RationaleSlotInput;
  /**
   * Constraint check results. Key = constraint name (human-readable),
   * value = true if the constraint passed, false if it failed.
   */
  constraintResults: Record<string, boolean>;
  /** Final priority score (0–1) computed by the Priority Weight Engine. */
  priorityScore: number;
  /**
   * Per-signal scores from the Priority Weight Engine.
   * Key = signal name, value = normalised score (0–1).
   */
  prioritySignalBreakdown: Record<string, number>;
  /** Operator context used to personalise the rationale. */
  operatorContext: {
    /** Human-readable operator name. */
    operatorName: string;
  };
  /** Total number of candidates evaluated before this suggestion was selected. */
  candidateCount: number;
  /** True when this student was the top-ranked candidate. */
  topRank: boolean;
}

/**
 * Reason why the fallback template was used instead of an LLM response.
 * Used for logging and observability.
 */
export type LlmFallbackReason =
  | 'api_error'       // Anthropic API returned a non-2xx status
  | 'malformed_json'  // LLM response JSON could not be parsed or failed schema validation
  | 'timeout'         // LLM call exceeded LLM_TIMEOUT_MS
  | 'confidence_override'; // Confidence overridden (logged separately, not a fallback)

/**
 * Output of the LLM Rationale Generator.
 * Always returned — never null, even when the fallback template is used.
 */
export interface RationaleOutput {
  /**
   * Plain-English explanation of why this student/slot combination was
   * selected. Between LLM_RATIONALE_MIN_CHARS and LLM_RATIONALE_MAX_CHARS
   * characters inclusive.
   */
  rationale: string;
  /**
   * Confidence score in the range [0, 1].
   * May have been overridden from the LLM value to LLM_FALLBACK_CONFIDENCE
   * when fewer than LLM_CONSTRAINT_PASS_RATE_THRESHOLD of constraints passed.
   */
  confidence: number;
  /**
   * Human-readable descriptions of each constraint that passed.
   * Populated by the LLM on success, or derived deterministically from
   * constraintResults on fallback.
   */
  constraintsSatisfied: string[];
  /**
   * True when the deterministic fallback template was used instead of an
   * LLM-generated rationale.
   */
  usedFallback: boolean;
  /**
   * Set when usedFallback is true. Describes why the fallback was triggered.
   */
  fallbackReason?: LlmFallbackReason;
  /**
   * True when the LLM returned a valid response but its confidence score
   * was overridden by the deterministic constraint pass-rate rule.
   */
  confidenceOverridden: boolean;
}

/**
 * Internal validated shape of a successful LLM JSON response.
 * The generator validates incoming JSON against this before accepting it.
 */
export interface LlmJsonResponse {
  /** 2-4 sentence plain-English rationale. */
  rationale: string;
  /** Confidence score 0–1. */
  confidence: number;
  /** Human-readable constraint descriptions. */
  constraintsSatisfied: string[];
}
