/**
 * priority-weight.engine.ts
 * --------------------------
 * Agentic Scheduler — FSP Integration — Priority Weight Engine
 * ------------------------------------------------------------
 * Computes a normalised priority score (0–1) for each candidate student
 * using up to four configurable signals:
 *
 *   1. timeSinceLastFlight       — days since most recent non-cancelled reservation
 *   2. timeUntilNextScheduledFlight — days until next upcoming reservation
 *   3. totalFlightHours          — completed vs required hours (direction configurable)
 *   4. customSignals             — operator-defined key/value signals (pre-normalised)
 *
 * Each signal is normalised to [0, 1]. A signal that cannot be computed
 * (e.g. no flight history) receives PRIORITY_SIGNAL_NEUTRAL_SCORE (0.5),
 * which means the student is never excluded from the ranked list.
 *
 * Final score = weighted sum of normalised signal scores, divided by total
 * active weight so the result stays within [0, 1].
 *
 * When two candidates have identical final scores, the student with the
 * lexicographically lower studentId sorts first (deterministic tiebreaker).
 *
 * Key exports: PriorityWeightEngine
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-11 — Priority Weight Engine
 */

import { Injectable } from '@nestjs/common';
import type {
  CandidateInput,
  PriorityWeightConfig,
  ScoredCandidate,
} from '@fsp-scheduler/shared-types';
import {
  DEFAULT_PRIORITY_WEIGHTS,
  PRIORITY_SIGNAL_NEUTRAL_SCORE,
  TIME_SINCE_LAST_FLIGHT_CAP_DAYS,
  TIME_UNTIL_NEXT_FLIGHT_CAP_DAYS,
} from '@fsp-scheduler/shared-types';

/** Milliseconds per day constant. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure stateless engine that scores and ranks a list of student candidates
 * according to operator-configured priority weights.
 *
 * Designed to be injected into use-case handler services in the worker.
 */
@Injectable()
export class PriorityWeightEngine {
  /**
   * Returns the default priority weight configuration.
   * Used when an operator has not stored a custom configuration.
   *
   * @returns A fully-populated PriorityWeightConfig using built-in defaults.
   */
  public getDefaultConfig(): PriorityWeightConfig {
    return {
      timeSinceLastFlight: DEFAULT_PRIORITY_WEIGHTS.timeSinceLastFlight,
      timeUntilNextScheduledFlight: DEFAULT_PRIORITY_WEIGHTS.timeUntilNextScheduledFlight,
      totalFlightHours: DEFAULT_PRIORITY_WEIGHTS.totalFlightHours,
      flightHoursHigherIsBetter: DEFAULT_PRIORITY_WEIGHTS.flightHoursHigherIsBetter,
      customSignals: { ...DEFAULT_PRIORITY_WEIGHTS.customSignals },
    };
  }

  /**
   * Scores and sorts a list of candidate students by descending priority.
   *
   * @param candidates - Input candidates with pre-fetched FSP data.
   * @param config     - Operator-configured weight settings.
   * @param now        - Reference timestamp (defaults to current time). Injected
   *                    for deterministic unit testing.
   * @returns Sorted array of ScoredCandidate, highest score first. Ties broken
   *          by studentId ascending (lower string = higher rank).
   */
  public scoreCandidates(
    candidates: CandidateInput[],
    config: PriorityWeightConfig,
    now: Date = new Date(),
  ): ScoredCandidate[] {
    const scored = candidates.map(candidate => this.scoreOne(candidate, config, now));

    // Sort descending by score; break ties by studentId ascending
    scored.sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) > Number.EPSILON) return diff;
      // Tiebreaker: lower studentId sorts first
      return a.studentId < b.studentId ? -1 : 1;
    });

    return scored;
  }

  // ── Private signal helpers ──────────────────────────────────────────────────

  /**
   * Computes a ScoredCandidate for a single input candidate.
   *
   * @param candidate - One student candidate.
   * @param config    - Active weight configuration.
   * @param now       - Reference time for date calculations.
   */
  private scoreOne(
    candidate: CandidateInput,
    config: PriorityWeightConfig,
    now: Date,
  ): ScoredCandidate {
    const signals: Record<string, number> = {};

    // Collect weighted signal values
    let weightedSum = 0;
    let totalWeight = 0;

    // ── Signal 1: timeSinceLastFlight ─────────────────────────────────────
    if (config.timeSinceLastFlight > 0) {
      const signal = this.computeTimeSinceLastFlight(candidate, now);
      signals['timeSinceLastFlight'] = signal;
      weightedSum += signal * config.timeSinceLastFlight;
      totalWeight += config.timeSinceLastFlight;
    } else {
      // Even when weight is 0, record the signal for completeness
      signals['timeSinceLastFlight'] = this.computeTimeSinceLastFlight(candidate, now);
    }

    // ── Signal 2: timeUntilNextScheduledFlight ────────────────────────────
    if (config.timeUntilNextScheduledFlight > 0) {
      const signal = this.computeTimeUntilNextFlight(candidate, now);
      signals['timeUntilNextScheduledFlight'] = signal;
      weightedSum += signal * config.timeUntilNextScheduledFlight;
      totalWeight += config.timeUntilNextScheduledFlight;
    } else {
      signals['timeUntilNextScheduledFlight'] = this.computeTimeUntilNextFlight(candidate, now);
    }

    // ── Signal 3: totalFlightHours ────────────────────────────────────────
    if (config.totalFlightHours > 0) {
      const signal = this.computeFlightHours(candidate, config.flightHoursHigherIsBetter);
      signals['totalFlightHours'] = signal;
      weightedSum += signal * config.totalFlightHours;
      totalWeight += config.totalFlightHours;
    } else {
      signals['totalFlightHours'] = this.computeFlightHours(candidate, config.flightHoursHigherIsBetter);
    }

    // ── Signal 4: custom signals ──────────────────────────────────────────
    for (const [key, weight] of Object.entries(config.customSignals)) {
      const rawValue = candidate.customSignals?.[key];
      const signal = rawValue !== undefined ? rawValue : PRIORITY_SIGNAL_NEUTRAL_SCORE;
      signals[`customSignals.${key}`] = signal;
      if (weight > 0) {
        weightedSum += signal * weight;
        totalWeight += weight;
      }
    }

    // ── Final score ───────────────────────────────────────────────────────
    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

    return {
      studentId: candidate.studentId,
      score: Math.min(1, Math.max(0, score)),
      signals,
    };
  }

  /**
   * Computes the normalised timeSinceLastFlight signal.
   *
   * Looks for the most recent past reservation that is NOT cancelled.
   * If none found, returns PRIORITY_SIGNAL_NEUTRAL_SCORE (student is not excluded).
   *
   * @param candidate - Candidate with reservations array.
   * @param now       - Reference time.
   * @returns Normalised score in [0, 1].
   */
  private computeTimeSinceLastFlight(candidate: CandidateInput, now: Date): number {
    const pastNonCancelled = candidate.reservations.filter(r => {
      const end = new Date(r.endDateTime);
      return end <= now && !r.status.toLowerCase().includes('cancel');
    });

    if (pastNonCancelled.length === 0) {
      return PRIORITY_SIGNAL_NEUTRAL_SCORE;
    }

    const mostRecent = pastNonCancelled.reduce((latest, r) => {
      return new Date(r.endDateTime) > new Date(latest.endDateTime) ? r : latest;
    });

    const daysSince = (now.getTime() - new Date(mostRecent.endDateTime).getTime()) / MS_PER_DAY;
    return Math.min(daysSince / TIME_SINCE_LAST_FLIGHT_CAP_DAYS, 1.0);
  }

  /**
   * Computes the normalised timeUntilNextScheduledFlight signal.
   *
   * Looks for the earliest upcoming reservation that is NOT cancelled.
   * If none, returns 1.0 (maximum priority — student has no upcoming slot).
   *
   * @param candidate - Candidate with reservations array.
   * @param now       - Reference time.
   * @returns Normalised score in [0, 1].
   */
  private computeTimeUntilNextFlight(candidate: CandidateInput, now: Date): number {
    const upcoming = candidate.reservations.filter(r => {
      const start = new Date(r.startDateTime);
      return start > now && !r.status.toLowerCase().includes('cancel');
    });

    if (upcoming.length === 0) {
      return 1.0;
    }

    const nearest = upcoming.reduce((earliest, r) => {
      return new Date(r.startDateTime) < new Date(earliest.startDateTime) ? r : earliest;
    });

    const daysUntil = (new Date(nearest.startDateTime).getTime() - now.getTime()) / MS_PER_DAY;
    return Math.min(daysUntil / TIME_UNTIL_NEXT_FLIGHT_CAP_DAYS, 1.0);
  }

  /**
   * Computes the normalised totalFlightHours signal.
   *
   * Normalises completedHours / requiredHours. Direction is controlled by
   * flightHoursHigherIsBetter:
   *   false → score = 1 - ratio  (fewer hours = higher priority)
   *   true  → score = ratio      (more hours = higher priority)
   *
   * Returns PRIORITY_SIGNAL_NEUTRAL_SCORE when enrollmentProgress is missing.
   *
   * @param candidate            - Candidate with optional enrollmentProgress.
   * @param higherIsBetter       - Direction flag from the weight config.
   * @returns Normalised score in [0, 1].
   */
  private computeFlightHours(
    candidate: CandidateInput,
    higherIsBetter: boolean,
  ): number {
    const progress = candidate.enrollmentProgress;
    if (!progress || progress.requiredHours <= 0) {
      return PRIORITY_SIGNAL_NEUTRAL_SCORE;
    }

    const ratio = Math.min(progress.completedHours / progress.requiredHours, 1.0);
    return higherIsBetter ? ratio : 1.0 - ratio;
  }
}
