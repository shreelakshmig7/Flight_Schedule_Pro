/**
 * priority-weight.types.ts
 * ------------------------
 * Agentic Scheduler — FSP Integration — Priority Weight Engine types
 * ------------------------------------------------------------------
 * Defines TypeScript types for the Priority Weight Engine (PR-11).
 * These types are shared between apps/worker (engine) and apps/api
 * (operator configuration endpoints).
 *
 * Key exports: PriorityWeightConfig, CandidateInput, ScoredCandidate,
 *              UpdatePriorityWeightsRequest
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-11 — Priority Weight Engine
 */

/**
 * Operator-configured priority weight settings stored in operators.priorityWeights.
 * All numeric weights must be non-negative. The engine normalises them so
 * they do not need to sum to 1.
 */
export interface PriorityWeightConfig {
  /**
   * Weight applied to the timeSinceLastFlight signal.
   * Higher values make recency of last flight more influential.
   */
  timeSinceLastFlight: number;
  /**
   * Weight applied to the timeUntilNextScheduledFlight signal.
   * Higher values prioritise students whose next scheduled flight is far away.
   */
  timeUntilNextScheduledFlight: number;
  /**
   * Weight applied to the totalFlightHours signal.
   */
  totalFlightHours: number;
  /**
   * Direction flag for the totalFlightHours signal.
   * false (default) — fewer completed hours → higher score (needs more training).
   * true            — more completed hours  → higher score (closer to checkride).
   */
  flightHoursHigherIsBetter: boolean;
  /**
   * Operator-defined custom signal weights. Keys must match keys present in
   * CandidateInput.customSignals. Values are non-negative weights.
   */
  customSignals: Record<string, number>;
}

/**
 * A single candidate reservation summary used for signal computation.
 * Represents one FSP reservation entry in abbreviated form.
 */
export interface CandidateReservation {
  /** ISO 8601 string for when the reservation starts. */
  startDateTime: string;
  /** ISO 8601 string for when the reservation ends. */
  endDateTime: string;
  /**
   * Reservation status string from FSP (e.g. 'Confirmed', 'Cancelled').
   * The engine treats any status containing 'cancel' (case-insensitive) as cancelled.
   */
  status: string;
}

/**
 * Enrollment progress data required for the totalFlightHours signal.
 */
export interface CandidateEnrollmentProgress {
  /** Hours the student has completed so far. */
  completedHours: number;
  /** Total hours required for the program/enrollment. */
  requiredHours: number;
}

/**
 * Input data describing a single student candidate for priority ranking.
 * All FSP data is pre-fetched by the caller and passed here to avoid
 * extra API calls inside the engine.
 */
export interface CandidateInput {
  /** FSP student identifier string. Used as the deterministic tiebreaker. */
  studentId: string;
  /**
   * All reservations for this student, including past and future.
   * The engine filters by status and date internally.
   */
  reservations: CandidateReservation[];
  /**
   * Enrollment progress for the student's active enrollment.
   * Null or undefined when the student has no active enrollment.
   */
  enrollmentProgress: CandidateEnrollmentProgress | null | undefined;
  /**
   * Operator-defined custom signals for this candidate.
   * Keys must match keys declared in PriorityWeightConfig.customSignals.
   * Values should be pre-normalised to the 0–1 range by the caller.
   * Missing keys receive PRIORITY_SIGNAL_NEUTRAL_SCORE (0.5) from the engine.
   */
  customSignals?: Record<string, number>;
}

/**
 * Output of the priority weight engine for a single candidate.
 * Consumers use `score` for ranking and `signals` for debugging/audit.
 */
export interface ScoredCandidate {
  /** FSP student identifier. Matches the input CandidateInput.studentId. */
  studentId: string;
  /**
   * Final priority score in the range [0, 1].
   * Higher score = higher scheduling priority.
   */
  score: number;
  /**
   * Individual normalised signal scores before weighting.
   * Keys are signal names; values are in [0, 1].
   * Useful for debugging and audit logging.
   */
  signals: Record<string, number>;
}

/**
 * Request body for PUT /operators/me/priority-weights.
 * All fields are optional; missing fields preserve existing values.
 * Any numeric weight must be ≥ 0 or the request is rejected with HTTP 400.
 */
export interface UpdatePriorityWeightsRequest {
  /** New weight for the timeSinceLastFlight signal (≥ 0). */
  timeSinceLastFlight?: number;
  /** New weight for the timeUntilNextScheduledFlight signal (≥ 0). */
  timeUntilNextScheduledFlight?: number;
  /** New weight for the totalFlightHours signal (≥ 0). */
  totalFlightHours?: number;
  /** New direction flag for the totalFlightHours signal. */
  flightHoursHigherIsBetter?: boolean;
  /** New custom signal weights. Merges with existing custom signals. */
  customSignals?: Record<string, number>;
}
