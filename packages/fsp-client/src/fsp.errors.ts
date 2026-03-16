/**
 * fsp.errors.ts
 * -------------
 * Agentic Scheduler — FSP Integration — FSP API error classes
 * ------------------------------------------------------------
 * Defines typed error classes thrown by FspHttpClient when the FSP API
 * returns non-success responses. Callers catch these specific error types
 * to distinguish rate-limit events from general API failures.
 *
 * Key exports: FspRateLimitError, FspApiError
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import type { FspError } from '@fsp-scheduler/shared-types';

/**
 * Thrown when the FSP API returns a 429 (Too Many Requests) response and
 * the automatic pause-and-retry budget has been exhausted.
 */
export class FspRateLimitError extends Error {
  /** HTTP status code — always 429. */
  public readonly statusCode: number = 429;

  /**
   * @param message - Human-readable description of the rate-limit event.
   */
  constructor(message: string) {
    super(message);
    this.name = 'FspRateLimitError';
    // Maintains correct prototype chain in environments that transpile classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the FSP API returns a non-2xx, non-429 response that the HTTP
 * client has not retried away (e.g. 400, 401, 403, 404, or a 5xx after all
 * retries are exhausted).
 */
export class FspApiError extends Error {
  /** The HTTP status code returned by the FSP API. */
  public readonly statusCode: number;

  /**
   * Structured error objects parsed from the FSP API response body, if any.
   */
  public readonly fspErrors?: FspError[];

  /**
   * @param message    - Human-readable description of the failure.
   * @param statusCode - HTTP status code from the API response.
   * @param fspErrors  - Optional array of structured errors from the response body.
   */
  constructor(message: string, statusCode: number, fspErrors?: FspError[]) {
    super(message);
    this.name = 'FspApiError';
    this.statusCode = statusCode;
    if (fspErrors !== undefined) {
      this.fspErrors = fspErrors;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
