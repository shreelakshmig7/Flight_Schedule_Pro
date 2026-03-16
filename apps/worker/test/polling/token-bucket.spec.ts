/**
 * token-bucket.spec.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — TokenBucket unit tests
 * ------------------------------------------------------------
 * Covers: token consumption, bucket exhaustion, 60-second refill,
 * and 429 pause behaviour. Uses a controllable clock function to
 * avoid real-time dependencies.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { TokenBucket } from '../../src/polling/token-bucket';
import {
  FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE,
  FSP_RATE_LIMIT_PAUSE_SECONDS,
  TOKEN_BUCKET_REFILL_INTERVAL_MS,
  TOKEN_BUCKET_LOW_WATER_MARK,
} from '@fsp-scheduler/shared-types';

/** Creates a mutable clock for test control. */
function makeClock(startMs: number = 0): { now: () => number; advance: (ms: number) => void } {
  let time = startMs;
  return {
    now: () => time,
    advance: (ms: number) => { time += ms; },
  };
}

describe('TokenBucket', () => {
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    clock = makeClock(Date.now());
  });

  // ── Token consumption ────────────────────────────────────────────────────

  it('starts with full capacity of FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE tokens', () => {
    const bucket = new TokenBucket(clock.now);
    expect(bucket.getTokenCount()).toBe(FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE);
  });

  it('consumes one token per tryAcquire call', () => {
    const bucket = new TokenBucket(clock.now);
    const initial = bucket.getTokenCount();

    bucket.tryAcquire();

    expect(bucket.getTokenCount()).toBe(initial - 1);
  });

  it('returns true when a token is successfully consumed', () => {
    const bucket = new TokenBucket(clock.now);
    const result = bucket.tryAcquire();
    expect(result).toBe(true);
  });

  it('allows exactly FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE consecutive acquisitions', () => {
    const bucket = new TokenBucket(clock.now);

    for (let i = 0; i < FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE; i++) {
      expect(bucket.tryAcquire()).toBe(true);
    }
  });

  // ── Bucket exhaustion ────────────────────────────────────────────────────

  it('returns false when the bucket is exhausted', () => {
    const bucket = new TokenBucket(clock.now);

    // Drain all tokens
    for (let i = 0; i < FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE; i++) {
      bucket.tryAcquire();
    }

    expect(bucket.tryAcquire()).toBe(false);
  });

  it('has 0 tokens after exhaustion', () => {
    const bucket = new TokenBucket(clock.now);

    for (let i = 0; i < FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE; i++) {
      bucket.tryAcquire();
    }

    expect(bucket.getTokenCount()).toBe(0);
  });

  // ── 60-second refill ─────────────────────────────────────────────────────

  it('refills to full capacity after TOKEN_BUCKET_REFILL_INTERVAL_MS elapses', () => {
    const bucket = new TokenBucket(clock.now);

    // Drain all tokens
    for (let i = 0; i < FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE; i++) {
      bucket.tryAcquire();
    }
    expect(bucket.getTokenCount()).toBe(0);

    // Advance clock by exactly 60 seconds
    clock.advance(TOKEN_BUCKET_REFILL_INTERVAL_MS);

    // tryAcquire triggers refill
    const result = bucket.tryAcquire();

    expect(result).toBe(true);
    // After 1 refill cycle (55 tokens added) minus the 1 consumed = 54
    expect(bucket.getTokenCount()).toBe(FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE - 1);
  });

  it('does not refill before TOKEN_BUCKET_REFILL_INTERVAL_MS elapses', () => {
    const bucket = new TokenBucket(clock.now);

    // Drain all tokens
    for (let i = 0; i < FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE; i++) {
      bucket.tryAcquire();
    }

    // Advance by less than one full interval
    clock.advance(TOKEN_BUCKET_REFILL_INTERVAL_MS - 1);

    expect(bucket.tryAcquire()).toBe(false);
    expect(bucket.getTokenCount()).toBe(0);
  });

  it('accumulates multiple refill intervals', () => {
    const bucket = new TokenBucket(clock.now);

    // Drain all tokens
    for (let i = 0; i < FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE; i++) {
      bucket.tryAcquire();
    }

    // Advance by two full intervals
    clock.advance(TOKEN_BUCKET_REFILL_INTERVAL_MS * 2);

    // After refill, tokens are capped at capacity
    bucket.tryAcquire(); // triggers refill calculation
    expect(bucket.getTokenCount()).toBe(FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE - 1);
  });

  // ── 429 pause behaviour ───────────────────────────────────────────────────

  it('is not paused initially', () => {
    const bucket = new TokenBucket(clock.now);
    expect(bucket.isPaused()).toBe(false);
  });

  it('is paused immediately after calling pause()', () => {
    const bucket = new TokenBucket(clock.now);
    bucket.pause();
    expect(bucket.isPaused()).toBe(true);
  });

  it('tryAcquire returns false when paused even if tokens are available', () => {
    const bucket = new TokenBucket(clock.now);
    bucket.pause();
    expect(bucket.tryAcquire()).toBe(false);
    // Tokens should NOT be consumed when paused
    expect(bucket.getTokenCount()).toBe(FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE);
  });

  it('unpauses after FSP_RATE_LIMIT_PAUSE_SECONDS seconds', () => {
    const bucket = new TokenBucket(clock.now);
    bucket.pause();
    expect(bucket.isPaused()).toBe(true);

    clock.advance(FSP_RATE_LIMIT_PAUSE_SECONDS * 1000);

    expect(bucket.isPaused()).toBe(false);
  });

  it('remains paused just before FSP_RATE_LIMIT_PAUSE_SECONDS expires', () => {
    const bucket = new TokenBucket(clock.now);
    bucket.pause();

    clock.advance(FSP_RATE_LIMIT_PAUSE_SECONDS * 1000 - 1);

    expect(bucket.isPaused()).toBe(true);
  });

  it('resumes tryAcquire after pause expires', () => {
    const bucket = new TokenBucket(clock.now);
    bucket.pause();

    clock.advance(FSP_RATE_LIMIT_PAUSE_SECONDS * 1000);

    expect(bucket.tryAcquire()).toBe(true);
  });

  // ── Low water mark ────────────────────────────────────────────────────────

  it('reports isLow when token count drops below TOKEN_BUCKET_LOW_WATER_MARK', () => {
    const bucket = new TokenBucket(clock.now);

    // Drain tokens until just above low water mark
    for (let i = 0; i < FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE - TOKEN_BUCKET_LOW_WATER_MARK; i++) {
      bucket.tryAcquire();
    }

    expect(bucket.isLow()).toBe(false);

    // Consume one more to cross the threshold
    bucket.tryAcquire();

    expect(bucket.isLow()).toBe(true);
  });

  it('reports remaining seconds until next refill', () => {
    const bucket = new TokenBucket(clock.now);

    // Drain all tokens
    for (let i = 0; i < FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE; i++) {
      bucket.tryAcquire();
    }

    clock.advance(30_000); // advance 30 seconds

    // Should be approximately 30 seconds until next refill
    const secs = bucket.secondsUntilRefill();
    expect(secs).toBeCloseTo(30, 0);
  });
});
