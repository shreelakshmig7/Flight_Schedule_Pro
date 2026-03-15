/**
 * availability.service.spec.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — AvailabilityService unit tests
 * --------------------------------------------------------------------
 * Tests getBatchAvailability returning correct ServiceResult shapes.
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
import { AvailabilityService } from '../src/services/availability.service';
import type {
  FspAvailabilityBatchRequest,
  FspAvailabilityBatchResponse,
} from '@fsp-scheduler/shared-types';

const CORE_BASE = 'https://test-core-avail.example.com';
const SUB_KEY = 'sub-key-avail';
const OPERATOR_ID = 'op-avail-123';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Creates an AvailabilityService with a test-scoped HTTP client.
 *
 * @returns An AvailabilityService instance.
 */
function makeService(): AvailabilityService {
  const client = new FspHttpClient(CORE_BASE, SUB_KEY);
  return new AvailabilityService(client);
}

describe('AvailabilityService', () => {
  describe('getBatchAvailability()', () => {
    it('returns success with availability results for multiple users', async () => {
      const mockResponse: FspAvailabilityBatchResponse = {
        results: [
          {
            userId: 'user-1',
            date: '2026-03-20',
            available: true,
            slots: [
              { startTime: '09:00', endTime: '12:00', available: true },
            ],
          },
          {
            userId: 'user-2',
            date: '2026-03-20',
            available: false,
          },
        ],
        requestedAt: '2026-03-15T10:00:00Z',
      };

      server.use(
        http.post(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/availability/batch`,
          () => HttpResponse.json(mockResponse),
        ),
      );

      const service = makeService();
      const req: FspAvailabilityBatchRequest = {
        userIds: ['user-1', 'user-2'],
        startDate: '2026-03-20',
        endDate: '2026-03-20',
      };
      const result = await service.getBatchAvailability(OPERATOR_ID, req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.results).toHaveLength(2);
        expect(result.data.results[0].userId).toBe('user-1');
        expect(result.data.results[0].available).toBe(true);
        expect(result.data.results[1].available).toBe(false);
      }
    });

    it('returns failure on 400', async () => {
      server.use(
        http.post(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/availability/batch`,
          () =>
            HttpResponse.json(
              { errors: [{ message: 'userIds must not be empty' }] },
              { status: 400 },
            ),
        ),
      );

      const service = makeService();
      const req: FspAvailabilityBatchRequest = {
        userIds: [],
        startDate: '2026-03-20',
        endDate: '2026-03-20',
      };
      const result = await service.getBatchAvailability(OPERATOR_ID, req);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe('getUserAvailability()', () => {
    it('returns success with user availability', async () => {
      const mockAvail = {
        userId: 'user-1',
        date: '2026-03-20',
        available: true,
      };

      server.use(
        http.get(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/availability/user-1`,
          () => HttpResponse.json(mockAvail),
        ),
      );

      const service = makeService();
      const result = await service.getUserAvailability(OPERATOR_ID, 'user-1', {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe('user-1');
      }
    });
  });

  describe('checkReservationAvailability()', () => {
    it('returns success with availability check result', async () => {
      server.use(
        http.post(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/availability/check`,
          () => HttpResponse.json({ available: true, conflicts: [] }),
        ),
      );

      const service = makeService();
      const result = await service.checkReservationAvailability(OPERATOR_ID, {
        startDateTime: '2026-03-20T09:00:00Z',
        endDateTime: '2026-03-20T11:00:00Z',
      });

      expect(result.success).toBe(true);
    });
  });
});
