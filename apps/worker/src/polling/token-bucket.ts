/**
 * token-bucket.ts
 * ---------------
 * Agentic Scheduler — FSP Integration — Rate-limit token bucket
 * -------------------------------------------------------------
 * Implements a token bucket that caps FSP API calls at
 * FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE (55) per 60-second window.
 * Callers await acquire() before making any FSP API call; if the
 * bucket is empty or paused (after a 429), acquire() waits until
 * a token is available.
 *
 * The clock function is injectable for deterministic unit testing.
 *
 * Key exports: TokenBucket, TOKEN_BUCKET_CLOCK
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import {
  FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE,
  FSP_RATE_LIMIT_PAUSE_SECONDS,
  TOKEN_BUCKET_REFILL_INTERVAL_MS,
  TOKEN_BUCKET_LOW_WATER_MARK,
  TOKEN_BUCKET_POLL_INTERVAL_MS,
} from '@fsp-scheduler/shared-types';

/** DI injection token for the clock function — used in tests. */
export const TOKEN_BUCKET_CLOCK = 'TOKEN_BUCKET_CLOCK';

/**
 * Token bucket that enforces the FSP API rate limit of 55 calls per minute.
 *
 * - Capacity: FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE (55)
 * - Refill: full capacity restored every TOKEN_BUCKET_REFILL_INTERVAL_MS (60 s)
 * - Pause: after a 429 response, all acquisitions are blocked for
 *   FSP_RATE_LIMIT_PAUSE_SECONDS (60 s)
 */
@Injectable()
export class TokenBucket {
  private readonly logger = new Logger(TokenBucket.name);

  /** Current available token count (0 .. capacity). */
  private tokens: number;

  /** Timestamp (ms) of the last refill event. */
  private lastRefillTime: number;

  /** Timestamp (ms) until which the bucket is paused due to a 429. */
  private pauseUntil: number = 0;

  /** Injectable clock — defaults to Date.now for production. */
  private readonly clock: () => number;

  /**
   * @param clockFn - Optional injectable clock function (defaults to Date.now).
   *                  Provide a controllable clock in unit tests.
   */
  constructor(
    @Optional() @Inject(TOKEN_BUCKET_CLOCK) clockFn?: () => number,
  ) {
    this.clock = clockFn ?? (() => Date.now());
    this.tokens = FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE;
    this.lastRefillTime = this.clock();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Asynchronously acquires one token, waiting until one is available.
   * Respects the pause state set by pause(). Safe to call concurrently.
   *
   * @returns Promise that resolves once a token has been consumed.
   */
  async acquire(): Promise<void> {
    let acquired = false;
    while (!acquired) {
      acquired = this.tryAcquire();
      if (!acquired) {
        // Wait a short interval before retrying
        await delay(TOKEN_BUCKET_POLL_INTERVAL_MS);
      }
    }
  }

  /**
   * Synchronously attempts to acquire one token.
   * Returns false without consuming a token when paused or empty.
   *
   * @returns true when a token was consumed; false otherwise.
   */
  tryAcquire(): boolean {
    this.refillTokens();

    if (this.isPaused()) {
      return false;
    }

    if (this.tokens <= 0) {
      return false;
    }

    this.tokens--;

    if (this.isLow()) {
      this.logger.warn(
        `Token bucket low: ${this.tokens} tokens remaining — approaching FSP rate limit`,
      );
    }

    return true;
  }

  /**
   * Pauses the token bucket for FSP_RATE_LIMIT_PAUSE_SECONDS seconds.
   * Call this when FSP returns a 429 response. All tryAcquire() calls
   * will return false until the pause expires.
   */
  pause(): void {
    this.pauseUntil = this.clock() + FSP_RATE_LIMIT_PAUSE_SECONDS * 1000;
    this.logger.error(
      `Token bucket paused for ${FSP_RATE_LIMIT_PAUSE_SECONDS}s after 429 response`,
    );
  }

  /**
   * Returns true when the bucket is currently in a 429-triggered pause.
   */
  isPaused(): boolean {
    return this.clock() < this.pauseUntil;
  }

  /**
   * Returns true when token count is below TOKEN_BUCKET_LOW_WATER_MARK.
   */
  isLow(): boolean {
    return this.tokens < TOKEN_BUCKET_LOW_WATER_MARK;
  }

  /**
   * Returns the current number of available tokens.
   * Triggers a refill calculation before returning.
   */
  getTokenCount(): number {
    this.refillTokens();
    return this.tokens;
  }

  /**
   * Returns the number of seconds remaining until the next refill interval
   * completes. Useful for metrics and wait-time estimation.
   */
  secondsUntilRefill(): number {
    const elapsed = this.clock() - this.lastRefillTime;
    const remaining = TOKEN_BUCKET_REFILL_INTERVAL_MS - (elapsed % TOKEN_BUCKET_REFILL_INTERVAL_MS);
    return remaining / 1000;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Adds tokens for each complete 60-second interval that has elapsed since
   * the last refill. Caps at FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE.
   */
  private refillTokens(): void {
    const now = this.clock();
    const elapsed = now - this.lastRefillTime;

    if (elapsed < TOKEN_BUCKET_REFILL_INTERVAL_MS) {
      return;
    }

    const intervalsElapsed = Math.floor(elapsed / TOKEN_BUCKET_REFILL_INTERVAL_MS);
    const newTokens = intervalsElapsed * FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE;

    this.tokens = Math.min(
      FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE,
      this.tokens + newTokens,
    );

    this.lastRefillTime += intervalsElapsed * TOKEN_BUCKET_REFILL_INTERVAL_MS;
  }
}

// ── Module-private helpers ─────────────────────────────────────────────────

/**
 * Returns a promise that resolves after the given number of milliseconds.
 *
 * @param ms - Duration to wait in milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
