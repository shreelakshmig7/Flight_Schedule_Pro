/**
 * auth.service.spec.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — AuthService unit tests
 * ------------------------------------------------------------
 * Tests authenticate, verifyMfa, refreshSession, and logout returning
 * the correct ServiceResult shape. Uses MSW v2 to mock the FSP auth gateway.
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
import { AuthService } from '../src/services/auth.service';
import type {
  FspAuthRequest,
  FspAuthResponse,
  FspMfaRequest,
  FspMfaResponse,
  FspRefreshRequest,
  FspRefreshResponse,
} from '@fsp-scheduler/shared-types';

const AUTH_BASE = 'https://test-auth.example.com';
const SUB_KEY = 'sub-key-auth';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Constructs an AuthService backed by a test FspHttpClient.
 *
 * @returns An AuthService instance pointing at the test server.
 */
function makeService(): AuthService {
  const client = new FspHttpClient(AUTH_BASE, SUB_KEY);
  return new AuthService(client);
}

describe('AuthService', () => {
  describe('authenticate()', () => {
    it('returns success with auth data on 200', async () => {
      const mockResponse: FspAuthResponse = {
        accessToken: 'access-token-abc',
        refreshToken: 'refresh-token-xyz',
        expiresIn: 3600,
        requiresMfa: false,
      };

      server.use(
        http.post(`${AUTH_BASE}/api/V1/Auth/login`, () =>
          HttpResponse.json(mockResponse),
        ),
      );

      const service = makeService();
      const req: FspAuthRequest = { username: 'user@example.com', password: 'pass123' };
      const result = await service.authenticate(req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessToken).toBe('access-token-abc');
        expect(result.data.refreshToken).toBe('refresh-token-xyz');
      }
    });

    it('returns failure on 401', async () => {
      server.use(
        http.post(`${AUTH_BASE}/api/V1/Auth/login`, () =>
          HttpResponse.json(
            { errors: [{ message: 'Invalid credentials' }] },
            { status: 401 },
          ),
        ),
      );

      const service = makeService();
      const req: FspAuthRequest = { username: 'bad@example.com', password: 'wrong' };
      const result = await service.authenticate(req);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
        expect(result.data).toBeNull();
      }
    });
  });

  describe('verifyMfa()', () => {
    it('returns success with access token after MFA verification', async () => {
      const mockMfaResponse: FspMfaResponse = {
        accessToken: 'mfa-access-token',
        refreshToken: 'mfa-refresh-token',
      };

      server.use(
        http.post(`${AUTH_BASE}/api/V1/Auth/mfa/verify`, () =>
          HttpResponse.json(mockMfaResponse),
        ),
      );

      const service = makeService();
      const req: FspMfaRequest = { mfaToken: 'mfa-tok', code: '123456' };
      const result = await service.verifyMfa(req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessToken).toBe('mfa-access-token');
      }
    });

    it('returns failure when MFA code is invalid', async () => {
      server.use(
        http.post(`${AUTH_BASE}/api/V1/Auth/mfa/verify`, () =>
          new HttpResponse(null, { status: 400 }),
        ),
      );

      const service = makeService();
      const req: FspMfaRequest = { mfaToken: 'bad-tok', code: '000000' };
      const result = await service.verifyMfa(req);

      expect(result.success).toBe(false);
    });
  });

  describe('refreshSession()', () => {
    it('returns new access token on successful refresh', async () => {
      const mockRefreshResponse: FspRefreshResponse = {
        accessToken: 'new-access-token',
        expiresIn: 3600,
      };

      server.use(
        http.post(`${AUTH_BASE}/api/V1/Auth/refresh`, () =>
          HttpResponse.json(mockRefreshResponse),
        ),
      );

      const service = makeService();
      const req: FspRefreshRequest = { refreshToken: 'old-refresh-token' };
      const result = await service.refreshSession(req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessToken).toBe('new-access-token');
      }
    });
  });

  describe('logout()', () => {
    it('returns success on successful logout', async () => {
      server.use(
        http.post(`${AUTH_BASE}/api/V1/Auth/logout`, () =>
          HttpResponse.json({ loggedOut: true }),
        ),
      );

      const service = makeService();
      const result = await service.logout('access-token-to-invalidate');

      expect(result.success).toBe(true);
    });

    it('returns failure when logout endpoint returns 500', async () => {
      server.use(
        http.post(`${AUTH_BASE}/api/V1/Auth/logout`, () =>
          new HttpResponse(null, { status: 500 }),
        ),
      );

      vi.useFakeTimers();
      const service = makeService();
      const promise = service.logout('bad-token');
      await vi.runAllTimersAsync();
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
    });
  });
});
