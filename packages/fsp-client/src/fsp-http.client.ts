/**
 * fsp-http.client.ts
 * ------------------
 * Agentic Scheduler — FSP Integration — Axios-based FSP HTTP client
 * -----------------------------------------------------------------
 * Provides a thin, typed wrapper around axios that handles:
 *   - Subscription-key and Bearer-token header injection
 *   - 429 global pause (shared static flag across all client instances)
 *   - Automatic retry with exponential backoff on 5xx responses
 *   - Typed error surfacing via FspRateLimitError / FspApiError
 *
 * Key exports: FspHttpClient
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import {
  FSP_MAX_RETRIES,
  FSP_RATE_LIMIT_PAUSE_SECONDS,
  FSP_RETRY_BACKOFF_MS,
} from '@fsp-scheduler/shared-types';
import { FspApiError, FspRateLimitError } from './fsp.errors';
import type { FspError } from '@fsp-scheduler/shared-types';

/**
 * Pauses execution for the given number of milliseconds.
 *
 * @param ms - Duration to sleep.
 * @returns A promise that resolves after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempts to extract structured FSP error objects from an unknown axios
 * error response body.
 *
 * @param data - The raw response body (unknown at call site).
 * @returns An array of FspError objects, or undefined if none found.
 */
function extractFspErrors(data: unknown): FspError[] | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;

  if (Array.isArray(obj['errors'])) {
    const raw = obj['errors'] as unknown[];
    const errors: FspError[] = raw
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map((e) => {
        const fspErr: FspError = {
          message: typeof e['message'] === 'string' ? e['message'] : String(e['message'] ?? ''),
        };
        if (typeof e['field'] === 'string') fspErr.field = e['field'];
        if (typeof e['code'] === 'string') fspErr.code = e['code'];
        return fspErr;
      });
    return errors.length > 0 ? errors : undefined;
  }

  if (typeof obj['message'] === 'string') {
    return [{ message: obj['message'] }];
  }

  return undefined;
}

/**
 * Axios-based HTTP client for the FSP API.
 *
 * Each instance is bound to a single base URL and subscription key.
 * Instances share a static `paused` flag so that a 429 from any instance
 * prevents all concurrent requests until the pause window elapses.
 */
export class FspHttpClient {
  /**
   * Shared across ALL FspHttpClient instances.
   * When `true`, every outbound request waits until the pause window clears.
   */
  private static paused: boolean = false;

  private readonly axiosInstance: AxiosInstance;
  private bearerToken: string | null = null;

  /**
   * @param baseUrl         - Root URL for this client (e.g. core or curriculum).
   * @param subscriptionKey - Azure API Management subscription key added as
   *                          `x-subscription-key` on every request.
   */
  constructor(baseUrl: string, subscriptionKey: string) {
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      headers: {
        'x-subscription-key': subscriptionKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Attaches a Bearer token to subsequent requests.
   *
   * @param token - The JWT access token obtained from FSP auth.
   * @returns void
   */
  public setBearerToken(token: string): void {
    this.bearerToken = token;
  }

  /**
   * Removes any previously set Bearer token.
   * Subsequent requests will be sent without an Authorization header.
   *
   * @returns void
   */
  public clearBearerToken(): void {
    this.bearerToken = null;
  }

  /**
   * Builds the Authorization header value when a token is present.
   *
   * @returns An object with Authorization header, or an empty object.
   */
  private buildAuthHeader(): Record<string, string> {
    return this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {};
  }

  /**
   * Waits if a global rate-limit pause is in effect, then executes `fn`.
   * Retries up to FSP_MAX_RETRIES times on 5xx. Handles 429 by activating
   * the global pause and then retrying once.
   *
   * @param fn - Factory returning an AxiosResponse promise (called per attempt).
   * @returns The resolved AxiosResponse data.
   * @throws FspRateLimitError  - If a 429 is received and retries are exhausted.
   * @throws FspApiError        - For all other non-2xx responses after retries.
   */
  private async executeWithRetry<T>(
    fn: () => Promise<AxiosResponse<T>>,
  ): Promise<T> {
    // Wait out any existing global pause before attempting
    if (FspHttpClient.paused) {
      await sleep(FSP_RATE_LIMIT_PAUSE_SECONDS * 1000);
      FspHttpClient.paused = false;
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= FSP_MAX_RETRIES; attempt++) {
      try {
        const response = await fn();
        return response.data;
      } catch (err) {
        lastError = err;

        if (!axios.isAxiosError(err)) {
          throw new FspApiError(
            err instanceof Error ? err.message : String(err),
            0,
          );
        }

        const axiosErr = err as AxiosError<unknown>;
        const status = axiosErr.response?.status ?? 0;

        if (status === 429) {
          // Activate global pause for all instances
          if (!FspHttpClient.paused) {
            FspHttpClient.paused = true;
            await sleep(FSP_RATE_LIMIT_PAUSE_SECONDS * 1000);
            FspHttpClient.paused = false;
          } else {
            // Already paused by another concurrent request — wait it out
            await sleep(FSP_RATE_LIMIT_PAUSE_SECONDS * 1000);
          }

          if (attempt < FSP_MAX_RETRIES) {
            continue;
          }

          throw new FspRateLimitError(
            `FSP API rate limit exceeded (429) after ${FSP_MAX_RETRIES} retries`,
          );
        }

        if (status >= 500 && attempt < FSP_MAX_RETRIES) {
          const backoffMs: number = FSP_RETRY_BACKOFF_MS[attempt] ?? 4000;
          await sleep(backoffMs);
          continue;
        }

        const fspErrors = extractFspErrors(axiosErr.response?.data);
        const message =
          axiosErr.message ||
          `FSP API request failed with status ${status}`;

        throw new FspApiError(message, status, fspErrors);
      }
    }

    // Should not reach here, but satisfy TypeScript
    const axiosErr = lastError as AxiosError<unknown>;
    const status = axiosErr?.response?.status ?? 0;
    const fspErrors = extractFspErrors(axiosErr?.response?.data);
    throw new FspApiError(
      `FSP API request failed after ${FSP_MAX_RETRIES} retries`,
      status,
      fspErrors,
    );
  }

  /**
   * Sends an HTTP GET request to the FSP API.
   *
   * @param path   - URL path relative to the base URL.
   * @param params - Optional query-string parameters.
   * @returns The deserialized response body.
   * @throws FspRateLimitError | FspApiError
   */
  public async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.executeWithRetry<T>(() =>
      this.axiosInstance.get<T>(path, {
        params,
        headers: this.buildAuthHeader(),
      }),
    );
  }

  /**
   * Sends an HTTP POST request to the FSP API.
   *
   * @param path - URL path relative to the base URL.
   * @param body - Optional request body (will be JSON-serialized).
   * @returns The deserialized response body.
   * @throws FspRateLimitError | FspApiError
   */
  public async post<T>(path: string, body?: unknown): Promise<T> {
    return this.executeWithRetry<T>(() =>
      this.axiosInstance.post<T>(path, body, {
        headers: this.buildAuthHeader(),
      }),
    );
  }

  /**
   * Sends an HTTP PUT request to the FSP API.
   *
   * @param path - URL path relative to the base URL.
   * @param body - Optional request body (will be JSON-serialized).
   * @returns The deserialized response body.
   * @throws FspRateLimitError | FspApiError
   */
  public async put<T>(path: string, body?: unknown): Promise<T> {
    return this.executeWithRetry<T>(() =>
      this.axiosInstance.put<T>(path, body, {
        headers: this.buildAuthHeader(),
      }),
    );
  }

  /**
   * Sends an HTTP DELETE request to the FSP API.
   *
   * @param path - URL path relative to the base URL.
   * @returns The deserialized response body.
   * @throws FspRateLimitError | FspApiError
   */
  public async delete<T>(path: string): Promise<T> {
    return this.executeWithRetry<T>(() =>
      this.axiosInstance.delete<T>(path, {
        headers: this.buildAuthHeader(),
      }),
    );
  }
}
