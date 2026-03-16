/**
 * priority-weight.engine.spec.ts
 * --------------------------------
 * Agentic Scheduler — FSP Integration — PriorityWeightEngine unit tests
 * -----------------------------------------------------------------------
 * Tests all four signals, edge cases (no history → neutral score 0.5),
 * deterministic tiebreaker (lower studentId sorts first), and the default
 * weight configuration.
 *
 * Covers eval golden-data cases:
 *   fsp-016 — Brand new student with no flight history → neutral score 0.5,
 *             student not excluded, included in ranked list.
 *   fsp-017 — Identical priority scores → deterministic tiebreaker by studentId.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-11 — Priority Weight Engine
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { PriorityWeightEngine } from '../src/suggestions/priority-weight.engine';
import type {
  CandidateInput,
  PriorityWeightConfig,
} from '@fsp-scheduler/shared-types';
import {
  PRIORITY_SIGNAL_NEUTRAL_SCORE,
  TIME_SINCE_LAST_FLIGHT_CAP_DAYS,
} from '@fsp-scheduler/shared-types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns an ISO date string N days before the reference date. */
function daysAgo(days: number, ref: Date = new Date()): string {
  return new Date(ref.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Returns an ISO date string N days after the reference date. */
function daysFromNow(days: number, ref: Date = new Date()): string {
  return new Date(ref.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** A minimal PriorityWeightConfig with all custom signals disabled. */
const SINGLE_SIGNAL_CONFIG: PriorityWeightConfig = {
  timeSinceLastFlight: 1,
  timeUntilNextScheduledFlight: 0,
  totalFlightHours: 0,
  flightHoursHigherIsBetter: false,
  customSignals: {},
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PriorityWeightEngine', () => {
  const engine = new PriorityWeightEngine();
  const now = new Date('2026-03-15T12:00:00.000Z');

  // ── scoreCandidates — basic API ───────────────────────────────────────────

  describe('scoreCandidates', () => {
    it('returns one ScoredCandidate per input candidate', () => {
      const candidates: CandidateInput[] = [
        {
          studentId: 'usr-student-001',
          reservations: [],
          enrollmentProgress: null,
        },
        {
          studentId: 'usr-student-002',
          reservations: [],
          enrollmentProgress: null,
        },
      ];
      const results = engine.scoreCandidates(candidates, SINGLE_SIGNAL_CONFIG, now);
      expect(results).toHaveLength(2);
      expect(results.map(r => r.studentId)).toContain('usr-student-001');
      expect(results.map(r => r.studentId)).toContain('usr-student-002');
    });

    it('scores are in the range [0, 1]', () => {
      const candidates: CandidateInput[] = [
        {
          studentId: 's-001',
          reservations: [
            { startDateTime: daysAgo(5, now), endDateTime: daysAgo(5, now), status: 'Confirmed' },
          ],
          enrollmentProgress: { completedHours: 10, requiredHours: 40 },
        },
      ];
      const config: PriorityWeightConfig = {
        timeSinceLastFlight: 0.5,
        timeUntilNextScheduledFlight: 0.3,
        totalFlightHours: 0.2,
        flightHoursHigherIsBetter: false,
        customSignals: {},
      };
      const results = engine.scoreCandidates(candidates, config, now);
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── timeSinceLastFlight signal ────────────────────────────────────────────

  describe('timeSinceLastFlight signal', () => {
    it('student who flew 30 days ago scores higher than one who flew 5 days ago', () => {
      const config = SINGLE_SIGNAL_CONFIG;
      const candidateA: CandidateInput = {
        studentId: 'A',
        reservations: [
          { startDateTime: daysAgo(30, now), endDateTime: daysAgo(30, now), status: 'Confirmed' },
        ],
        enrollmentProgress: null,
      };
      const candidateB: CandidateInput = {
        studentId: 'B',
        reservations: [
          { startDateTime: daysAgo(5, now), endDateTime: daysAgo(5, now), status: 'Confirmed' },
        ],
        enrollmentProgress: null,
      };
      const [ra, rb] = engine.scoreCandidates([candidateA, candidateB], config, now);
      const scoreA = ra.studentId === 'A' ? ra.score : rb.score;
      const scoreB = ra.studentId === 'B' ? ra.score : rb.score;
      expect(scoreA).toBeGreaterThan(scoreB);
    });

    it('caps at 90 days — 90 days and 200 days both produce score 1.0', () => {
      const config = SINGLE_SIGNAL_CONFIG;
      const c90: CandidateInput = {
        studentId: 'c90',
        reservations: [
          { startDateTime: daysAgo(TIME_SINCE_LAST_FLIGHT_CAP_DAYS, now), endDateTime: daysAgo(TIME_SINCE_LAST_FLIGHT_CAP_DAYS, now), status: 'Confirmed' },
        ],
        enrollmentProgress: null,
      };
      const c200: CandidateInput = {
        studentId: 'c200',
        reservations: [
          { startDateTime: daysAgo(200, now), endDateTime: daysAgo(200, now), status: 'Confirmed' },
        ],
        enrollmentProgress: null,
      };
      const [r90, r200] = engine.scoreCandidates([c90, c200], config, now);
      expect(r90.score).toBeCloseTo(1.0, 5);
      expect(r200.score).toBeCloseTo(1.0, 5);
    });

    it('ignores cancelled reservations when computing timeSinceLastFlight', () => {
      const config = SINGLE_SIGNAL_CONFIG;
      // Only past reservation is cancelled — should fall back to neutral
      const candidate: CandidateInput = {
        studentId: 'cancel-student',
        reservations: [
          { startDateTime: daysAgo(10, now), endDateTime: daysAgo(10, now), status: 'Cancelled' },
        ],
        enrollmentProgress: null,
      };
      const [result] = engine.scoreCandidates([candidate], config, now);
      expect(result.score).toBeCloseTo(PRIORITY_SIGNAL_NEUTRAL_SCORE, 5);
    });

    // ── fsp-016 — Brand new student with no flight history ────────────────

    it('[fsp-016] brand new student with no flight history receives neutral score 0.5 and is NOT excluded', () => {
      const config = SINGLE_SIGNAL_CONFIG;
      const newStudent: CandidateInput = {
        studentId: 'usr-student-new-001',
        reservations: [],
        enrollmentProgress: null,
      };
      const results = engine.scoreCandidates([newStudent], config, now);

      // Student must be included — not excluded
      expect(results).toHaveLength(1);
      expect(results[0].studentId).toBe('usr-student-new-001');

      // Signal score must be neutral (0.5)
      expect(results[0].signals['timeSinceLastFlight']).toBeCloseTo(PRIORITY_SIGNAL_NEUTRAL_SCORE, 5);

      // Final score should also be 0.5 when only this signal has weight
      expect(results[0].score).toBeCloseTo(PRIORITY_SIGNAL_NEUTRAL_SCORE, 5);
    });
  });

  // ── timeUntilNextScheduledFlight signal ───────────────────────────────────

  describe('timeUntilNextScheduledFlight signal', () => {
    const config: PriorityWeightConfig = {
      timeSinceLastFlight: 0,
      timeUntilNextScheduledFlight: 1,
      totalFlightHours: 0,
      flightHoursHigherIsBetter: false,
      customSignals: {},
    };

    it('student with no upcoming flight scores 1.0', () => {
      const candidate: CandidateInput = {
        studentId: 's-no-next',
        reservations: [],
        enrollmentProgress: null,
      };
      const [result] = engine.scoreCandidates([candidate], config, now);
      expect(result.score).toBeCloseTo(1.0, 5);
    });

    it('student with upcoming flight in 60 days scores higher than one in 10 days', () => {
      const far: CandidateInput = {
        studentId: 'far',
        reservations: [
          { startDateTime: daysFromNow(60, now), endDateTime: daysFromNow(60, now), status: 'Confirmed' },
        ],
        enrollmentProgress: null,
      };
      const close: CandidateInput = {
        studentId: 'close',
        reservations: [
          { startDateTime: daysFromNow(10, now), endDateTime: daysFromNow(10, now), status: 'Confirmed' },
        ],
        enrollmentProgress: null,
      };
      const results = engine.scoreCandidates([far, close], config, now);
      const farScore = results.find(r => r.studentId === 'far')!.score;
      const closeScore = results.find(r => r.studentId === 'close')!.score;
      expect(farScore).toBeGreaterThan(closeScore);
    });

    it('ignores past reservations when computing timeUntilNextScheduledFlight', () => {
      const candidate: CandidateInput = {
        studentId: 'past-only',
        reservations: [
          { startDateTime: daysAgo(3, now), endDateTime: daysAgo(3, now), status: 'Confirmed' },
        ],
        enrollmentProgress: null,
      };
      const [result] = engine.scoreCandidates([candidate], config, now);
      // No upcoming → 1.0
      expect(result.score).toBeCloseTo(1.0, 5);
    });
  });

  // ── totalFlightHours signal ───────────────────────────────────────────────

  describe('totalFlightHours signal', () => {
    const buildConfig = (higherIsBetter: boolean): PriorityWeightConfig => ({
      timeSinceLastFlight: 0,
      timeUntilNextScheduledFlight: 0,
      totalFlightHours: 1,
      flightHoursHigherIsBetter: higherIsBetter,
      customSignals: {},
    });

    it('flightHoursHigherIsBetter=false: student with fewer hours scores higher', () => {
      const config = buildConfig(false);
      const few: CandidateInput = {
        studentId: 'few',
        reservations: [],
        enrollmentProgress: { completedHours: 5, requiredHours: 40 },
      };
      const many: CandidateInput = {
        studentId: 'many',
        reservations: [],
        enrollmentProgress: { completedHours: 35, requiredHours: 40 },
      };
      const results = engine.scoreCandidates([few, many], config, now);
      const fewScore = results.find(r => r.studentId === 'few')!.score;
      const manyScore = results.find(r => r.studentId === 'many')!.score;
      expect(fewScore).toBeGreaterThan(manyScore);
    });

    it('flightHoursHigherIsBetter=true: student with more hours scores higher', () => {
      const config = buildConfig(true);
      const few: CandidateInput = {
        studentId: 'few',
        reservations: [],
        enrollmentProgress: { completedHours: 5, requiredHours: 40 },
      };
      const many: CandidateInput = {
        studentId: 'many',
        reservations: [],
        enrollmentProgress: { completedHours: 35, requiredHours: 40 },
      };
      const results = engine.scoreCandidates([few, many], config, now);
      const fewScore = results.find(r => r.studentId === 'few')!.score;
      const manyScore = results.find(r => r.studentId === 'many')!.score;
      expect(manyScore).toBeGreaterThan(fewScore);
    });

    it('returns neutral score 0.5 when enrollmentProgress is null', () => {
      const config = buildConfig(false);
      const noProgress: CandidateInput = {
        studentId: 'no-prog',
        reservations: [],
        enrollmentProgress: null,
      };
      const [result] = engine.scoreCandidates([noProgress], config, now);
      expect(result.signals['totalFlightHours']).toBeCloseTo(PRIORITY_SIGNAL_NEUTRAL_SCORE, 5);
    });

    it('clamps score at 1.0 when completedHours >= requiredHours', () => {
      const config = buildConfig(true);
      const complete: CandidateInput = {
        studentId: 'complete',
        reservations: [],
        enrollmentProgress: { completedHours: 50, requiredHours: 40 },
      };
      const [result] = engine.scoreCandidates([complete], config, now);
      expect(result.signals['totalFlightHours']).toBeCloseTo(1.0, 5);
    });
  });

  // ── customSignals ─────────────────────────────────────────────────────────

  describe('customSignals', () => {
    it('applies custom signal weight and uses provided value', () => {
      const config: PriorityWeightConfig = {
        timeSinceLastFlight: 0,
        timeUntilNextScheduledFlight: 0,
        totalFlightHours: 0,
        flightHoursHigherIsBetter: false,
        customSignals: { waitlistRank: 1 },
      };
      const high: CandidateInput = {
        studentId: 'high-rank',
        reservations: [],
        enrollmentProgress: null,
        customSignals: { waitlistRank: 0.9 },
      };
      const low: CandidateInput = {
        studentId: 'low-rank',
        reservations: [],
        enrollmentProgress: null,
        customSignals: { waitlistRank: 0.2 },
      };
      const results = engine.scoreCandidates([high, low], config, now);
      const highScore = results.find(r => r.studentId === 'high-rank')!.score;
      const lowScore = results.find(r => r.studentId === 'low-rank')!.score;
      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('uses neutral score 0.5 when custom signal key is absent from candidate', () => {
      const config: PriorityWeightConfig = {
        timeSinceLastFlight: 0,
        timeUntilNextScheduledFlight: 0,
        totalFlightHours: 0,
        flightHoursHigherIsBetter: false,
        customSignals: { waitlistRank: 1 },
      };
      const candidate: CandidateInput = {
        studentId: 'no-custom',
        reservations: [],
        enrollmentProgress: null,
        // no customSignals provided
      };
      const [result] = engine.scoreCandidates([candidate], config, now);
      expect(result.signals['customSignals.waitlistRank']).toBeCloseTo(PRIORITY_SIGNAL_NEUTRAL_SCORE, 5);
    });
  });

  // ── Deterministic tiebreaker ──────────────────────────────────────────────

  describe('deterministic tiebreaker — fsp-017', () => {
    it('[fsp-017] when two candidates have identical scores, lower studentId sorts first', () => {
      const config: PriorityWeightConfig = {
        timeSinceLastFlight: 0,
        timeUntilNextScheduledFlight: 0,
        totalFlightHours: 0,
        flightHoursHigherIsBetter: false,
        customSignals: {},
      };
      // All weights zero → both get score 0 → tiebreaker kicks in
      const s1: CandidateInput = { studentId: 'usr-student-001', reservations: [], enrollmentProgress: null };
      const s2: CandidateInput = { studentId: 'usr-student-002', reservations: [], enrollmentProgress: null };

      const results = engine.scoreCandidates([s2, s1], config, now); // intentionally reversed input order

      expect(results[0].studentId).toBe('usr-student-001');
      expect(results[1].studentId).toBe('usr-student-002');
    });

    it('[fsp-017] tiebreaker is deterministic regardless of input order', () => {
      const config: PriorityWeightConfig = {
        timeSinceLastFlight: 1,
        timeUntilNextScheduledFlight: 0,
        totalFlightHours: 0,
        flightHoursHigherIsBetter: false,
        customSignals: {},
      };
      // Both students have no flight history → both get neutral 0.5 → tiebreaker
      const s1: CandidateInput = { studentId: 'usr-student-001', reservations: [], enrollmentProgress: null };
      const s2: CandidateInput = { studentId: 'usr-student-002', reservations: [], enrollmentProgress: null };

      const forwardOrder = engine.scoreCandidates([s1, s2], config, now);
      const reverseOrder = engine.scoreCandidates([s2, s1], config, now);

      expect(forwardOrder[0].studentId).toBe('usr-student-001');
      expect(reverseOrder[0].studentId).toBe('usr-student-001');
    });

    it('[fsp-017] result contains tiebreaker evidence — equal scores, first is lower studentId', () => {
      const config = SINGLE_SIGNAL_CONFIG;
      const s1: CandidateInput = { studentId: 'usr-student-001', reservations: [], enrollmentProgress: null };
      const s2: CandidateInput = { studentId: 'usr-student-002', reservations: [], enrollmentProgress: null };

      const results = engine.scoreCandidates([s1, s2], config, now);

      // Both scores should be equal (both neutral)
      expect(results[0].score).toBeCloseTo(results[1].score, 5);
      // Lower ID comes first (tiebreaker)
      expect(results[0].studentId < results[1].studentId).toBe(true);
    });
  });

  // ── All signals active simultaneously ─────────────────────────────────────

  describe('all signals active simultaneously', () => {
    it('correctly combines all four signal types into a weighted score', () => {
      const config: PriorityWeightConfig = {
        timeSinceLastFlight: 0.4,
        timeUntilNextScheduledFlight: 0.3,
        totalFlightHours: 0.2,
        flightHoursHigherIsBetter: false,
        customSignals: { urgency: 0.1 },
      };
      const candidate: CandidateInput = {
        studentId: 'all-signals',
        reservations: [
          // past completed
          { startDateTime: daysAgo(45, now), endDateTime: daysAgo(45, now), status: 'Confirmed' },
          // upcoming
          { startDateTime: daysFromNow(30, now), endDateTime: daysFromNow(30, now), status: 'Confirmed' },
        ],
        enrollmentProgress: { completedHours: 20, requiredHours: 40 },
        customSignals: { urgency: 0.8 },
      };
      const [result] = engine.scoreCandidates([candidate], config, now);
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
      // All four signal keys should be present in the signals map
      expect(result.signals).toHaveProperty('timeSinceLastFlight');
      expect(result.signals).toHaveProperty('timeUntilNextScheduledFlight');
      expect(result.signals).toHaveProperty('totalFlightHours');
      expect(result.signals).toHaveProperty('customSignals.urgency');
    });
  });

  // ── Default weights ───────────────────────────────────────────────────────

  describe('getDefaultConfig', () => {
    it('returns a valid PriorityWeightConfig with positive weights', () => {
      const config = engine.getDefaultConfig();
      expect(config.timeSinceLastFlight).toBeGreaterThan(0);
      expect(config.timeUntilNextScheduledFlight).toBeGreaterThan(0);
      expect(config.totalFlightHours).toBeGreaterThan(0);
      expect(typeof config.flightHoursHigherIsBetter).toBe('boolean');
      expect(config.customSignals).toEqual({});
    });
  });
});
