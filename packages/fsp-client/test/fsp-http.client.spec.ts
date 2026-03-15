/**
 * fsp-http.client.spec.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — FspHttpClient unit tests
 * --------------------------------------------------------------
 * Tests the HTTP client wrapper for correct header injection,
 * 429 global-pause behaviour, 5xx retry logic, and error surfacing.
 * Uses MSW v2 to intercept axios requests at the network layer.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { FspHttpClient } from '../src/fsp-http.client';
import { FspApiError, FspRateLimitError } from '../src/fsp.errors';

const BASE_URL = 'https://test-fsp.example.com';
const SUB_KEY = 'test-sub-key-123';
const TOKEN = 'test-bearer-token';

// ── MSW server ────────────────────────────────────────────────────────────────

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a fresh FspHttpClient with the shared base URL and subscription key.
 *
 * @returns A new FspHttpClient instance.
 */
function makeClient(): FspHttpClient {
  return new FspHttpClient(BASE_URL, SUB_KEY);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FspHttpClient', () => {
  describe('successful requests', () => {
    it('GET returns parsed response data', async () => {
      server.use(
        http.get(`${BASE_URL}/api/V1/test`, () =>
          HttpResponse.json({ ok: true }),
        ),
      );

      const client = makeClient();
      const result = await client.get<{ ok: boolean }>('/api/V1/test');
      expect(result).toEqual({ ok: true });
    });

    it('POST sends body and returns parsed response data', async () => {
      server.use(
        http.post(`${BASE_URL}/api/V1/test`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ received: body });
        }),
      );

      const client = makeClient();
      const result = await client.post<{ received: Record<string, unknown> }>('/api/V1/test', { foo: 'bar' });
      expect(result).toEqual({ received: { foo: 'bar' } });
    });

    it('PUT sends body and returns parsed response data', async () => {
      server.use(
        http.put(`${BASE_URL}/api/V1/test/1`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ updated: body });
        }),
      );

      const client = makeClient();
      const result = await client.put<{ updated: Record<string, unknown> }>('/api/V1/test/1', { name: 'new' });
      expect(result).toEqual({ updated: { name: 'new' } });
    });

    it('DELETE returns parsed response data', async () => {
      server.use(
        http.delete(`${BASE_URL}/api/V1/test/1`, () =>
          HttpResponse.json({ deleted: true }),
        ),
      );

      const client = makeClient();
      const result = await client.delete<{ deleted: boolean }>('/api/V1/test/1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('header injection', () => {
    it('includes x-subscription-key on every GET request', async () => {
      let capturedKey: string | null = null;

      server.use(
        http.get(`${BASE_URL}/api/V1/headers`, ({ request }) => {
          capturedKey = request.headers.get('x-subscription-key');
          return HttpResponse.json({});
        }),
      );

      await makeClient().get('/api/V1/headers');
      expect(capturedKey).toBe(SUB_KEY);
    });

    it('includes Authorization header when bearer token is set', async () => {
      let capturedAuth: string | null = null;

      server.use(
        http.get(`${BASE_URL}/api/V1/auth-test`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization');
          return HttpResponse.json({});
        }),
      );

      const client = makeClient();
      client.setBearerToken(TOKEN);
      await client.get('/api/V1/auth-test');
      expect(capturedAuth).toBe(`Bearer ${TOKEN}`);
    });

    it('omits Authorization header when no token is set', async () => {
      let capturedAuth: string | null = 'not-null';

      server.use(
        http.get(`${BASE_URL}/api/V1/no-auth`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization');
          return HttpResponse.json({});
        }),
      );

      await makeClient().get('/api/V1/no-auth');
      expect(capturedAuth).toBeNull();
    });

    it('omits Authorization header after clearBearerToken()', async () => {
      let capturedAuth: string | null = 'not-null';

      server.use(
        http.get(`${BASE_URL}/api/V1/cleared`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization');
          return HttpResponse.json({});
        }),
      );

      const client = makeClient();
      client.setBearerToken(TOKEN);
      client.clearBearerToken();
      await client.get('/api/V1/cleared');
      expect(capturedAuth).toBeNull();
    });
  });

  describe('5xx retry behaviour', () => {
    it('retries on 500 and succeeds on second attempt', async () => {
      let callCount = 0;

      server.use(
        http.get(`${BASE_URL}/api/V1/flaky`, () => {
          callCount += 1;
          if (callCount === 1) {
            return new HttpResponse(null, { status: 500 });
          }
          return HttpResponse.json({ recovered: true });
        }),
      );

      // Use fake timers so backoff delay does not stall the test
      vi.useFakeTimers();
      const client = makeClient();
      const promise = client.get<{ recovered: boolean }>('/api/V1/flaky');
      await vi.runAllTimersAsync();
      const result = await promise;
      vi.useRealTimers();

      expect(result).toEqual({ recovered: true });
      expect(callCount).toBe(2);
    });

    it('throws FspApiError after all retries exhausted on persistent 500', async () => {
      server.use(
        http.get(`${BASE_URL}/api/V1/always-500`, () =>
          new HttpResponse(null, { status: 500 }),
        ),
      );

      vi.useFakeTimers();
      const client = makeClient();
      const promise = client.get('/api/V1/always-500');
      // Catch immediately to prevent unhandled-rejection noise, then advance timers.
      const resultPromise = promise.catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      vi.useRealTimers();

      expect(result).toBeInstanceOf(FspApiError);
    });
  });

  describe('error handling', () => {
    it('throws FspApiError with correct statusCode on 400', async () => {
      server.use(
        http.post(`${BASE_URL}/api/V1/bad`, () =>
          HttpResponse.json(
            { errors: [{ message: 'Invalid input', field: 'startDate' }] },
            { status: 400 },
          ),
        ),
      );

      const client = makeClient();
      try {
        await client.post('/api/V1/bad', {});
        expect.fail('Expected FspApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(FspApiError);
        const apiErr = err as FspApiError;
        expect(apiErr.statusCode).toBe(400);
        expect(apiErr.fspErrors).toHaveLength(1);
        expect(apiErr.fspErrors![0].field).toBe('startDate');
      }
    });

    it('throws FspApiError on 401', async () => {
      server.use(
        http.get(`${BASE_URL}/api/V1/protected`, () =>
          new HttpResponse(null, { status: 401 }),
        ),
      );

      const client = makeClient();
      await expect(client.get('/api/V1/protected')).rejects.toThrow(FspApiError);
    });

    it('throws FspApiError on 404', async () => {
      server.use(
        http.get(`${BASE_URL}/api/V1/missing`, () =>
          new HttpResponse(null, { status: 404 }),
        ),
      );

      const client = makeClient();
      try {
        await client.get('/api/V1/missing');
        expect.fail('Expected FspApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(FspApiError);
        expect((err as FspApiError).statusCode).toBe(404);
      }
    });
  });

  describe('429 pause behaviour', () => {
    it('throws FspRateLimitError after receiving 429 and exhausting retries', async () => {
      server.use(
        http.get(`${BASE_URL}/api/V1/rate-limited`, () =>
          new HttpResponse(null, { status: 429 }),
        ),
      );

      vi.useFakeTimers();
      const client = makeClient();
      const promise = client.get('/api/V1/rate-limited');
      // Catch the promise immediately to prevent unhandled-rejection noise,
      // then advance timers so the internal sleeps resolve.
      const resultPromise = promise.catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      vi.useRealTimers();

      expect(result).toBeInstanceOf(FspRateLimitError);
    });
  });
});
