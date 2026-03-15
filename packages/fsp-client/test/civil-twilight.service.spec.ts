/**
 * civil-twilight.service.spec.ts
 * --------------------------------
 * Agentic Scheduler — FSP Integration — CivilTwilightService unit tests
 * -----------------------------------------------------------------------
 * Tests getCivilTwilight returning correct ServiceResult shapes.
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
import { CivilTwilightService } from '../src/services/civil-twilight.service';
import type { FspCivilTwilight } from '@fsp-scheduler/shared-types';

const CORE_BASE = 'https://test-core-ct.example.com';
const SUB_KEY = 'sub-key-ct';
const OPERATOR_ID = 'op-ct-123';
const LOCATION_ID = 'loc-001';
const DATE = '2026-03-20';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Builds a CivilTwilightService with a test-scoped HTTP client.
 *
 * @returns A CivilTwilightService instance.
 */
function makeService(): CivilTwilightService {
  const client = new FspHttpClient(CORE_BASE, SUB_KEY);
  return new CivilTwilightService(client);
}

describe('CivilTwilightService', () => {
  describe('getCivilTwilight()', () => {
    it('returns success with civil twilight times', async () => {
      const mockTwilight: FspCivilTwilight = {
        locationId: LOCATION_ID,
        date: DATE,
        civilTwilightBegin: '06:15',
        sunrise: '06:42',
        sunset: '19:18',
        civilTwilightEnd: '19:45',
        timeZone: 'America/Chicago',
      };

      server.use(
        http.get(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/locations/${LOCATION_ID}/civilTwilight`,
          ({ request }) => {
            const url = new URL(request.url);
            if (url.searchParams.get('date') === DATE) {
              return HttpResponse.json(mockTwilight);
            }
            return new HttpResponse(null, { status: 400 });
          },
        ),
      );

      const service = makeService();
      const result = await service.getCivilTwilight(OPERATOR_ID, LOCATION_ID, DATE);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.locationId).toBe(LOCATION_ID);
        expect(result.data.date).toBe(DATE);
        expect(result.data.sunrise).toBe('06:42');
        expect(result.data.sunset).toBe('19:18');
        expect(result.data.civilTwilightBegin).toBe('06:15');
        expect(result.data.civilTwilightEnd).toBe('19:45');
        expect(result.data.timeZone).toBe('America/Chicago');
      }
    });

    it('returns failure when location is not found (404)', async () => {
      server.use(
        http.get(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/locations/bad-loc/civilTwilight`,
          () => new HttpResponse(null, { status: 404 }),
        ),
      );

      const service = makeService();
      const result = await service.getCivilTwilight(OPERATOR_ID, 'bad-loc', DATE);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.error).toBeTruthy();
      }
    });
  });
});
