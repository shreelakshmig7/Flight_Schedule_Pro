/**
 * reservations.service.spec.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — ReservationsService unit tests
 * --------------------------------------------------------------------
 * Tests createReservation, validateReservation, and listReservations
 * returning correct ServiceResult shapes.
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
import { ReservationsService } from '../src/services/reservations.service';
import type {
  FspReservation,
  FspReservationCreateRequest,
  FspReservationListRequest,
  FspReservationListResponse,
} from '@fsp-scheduler/shared-types';

const CORE_BASE = 'https://test-core.example.com';
const SUB_KEY = 'sub-key-core';
const OPERATOR_ID = 'op-123';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Builds a ReservationsService with a test-scoped FspHttpClient.
 *
 * @returns A ReservationsService instance.
 */
function makeService(): ReservationsService {
  const client = new FspHttpClient(CORE_BASE, SUB_KEY);
  return new ReservationsService(client);
}

const mockReservation: FspReservation = {
  reservationId: 'res-001',
  operatorId: OPERATOR_ID,
  startDateTime: '2026-03-20T09:00:00Z',
  endDateTime: '2026-03-20T11:00:00Z',
  status: 'confirmed',
};

describe('ReservationsService', () => {
  describe('createReservation()', () => {
    it('returns success with created reservation on 200', async () => {
      server.use(
        http.post(`${CORE_BASE}/api/V2/Reservation`, () =>
          HttpResponse.json(mockReservation),
        ),
      );

      const service = makeService();
      const req: FspReservationCreateRequest = {
        operatorId: OPERATOR_ID,
        startDateTime: '2026-03-20T09:00:00Z',
        endDateTime: '2026-03-20T11:00:00Z',
      };
      const result = await service.createReservation(OPERATOR_ID, req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reservationId).toBe('res-001');
        expect(result.data.status).toBe('confirmed');
      }
    });

    it('returns failure with fspErrors on 400', async () => {
      server.use(
        http.post(`${CORE_BASE}/api/V2/Reservation`, () =>
          HttpResponse.json(
            { errors: [{ message: 'Conflict', field: 'startDateTime' }] },
            { status: 400 },
          ),
        ),
      );

      const service = makeService();
      const req: FspReservationCreateRequest = {
        operatorId: OPERATOR_ID,
        startDateTime: 'invalid',
        endDateTime: 'invalid',
      };
      const result = await service.createReservation(OPERATOR_ID, req);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.fspErrors).toBeDefined();
        expect(result.fspErrors![0].field).toBe('startDateTime');
      }
    });
  });

  describe('validateReservation()', () => {
    it('returns success when reservation is valid', async () => {
      server.use(
        http.post(`${CORE_BASE}/api/V2/Reservation/validate`, () =>
          HttpResponse.json({ valid: true }),
        ),
      );

      const service = makeService();
      const req: FspReservationCreateRequest = {
        operatorId: OPERATOR_ID,
        startDateTime: '2026-03-20T09:00:00Z',
        endDateTime: '2026-03-20T11:00:00Z',
      };
      const result = await service.validateReservation(OPERATOR_ID, req);

      expect(result.success).toBe(true);
    });
  });

  describe('listReservations()', () => {
    it('returns success with reservation list', async () => {
      const mockListResponse: FspReservationListResponse = {
        reservations: [mockReservation],
        totalCount: 1,
        pageSize: 50,
        pageNumber: 1,
      };

      server.use(
        http.post(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/operatorReservations/list`,
          () => HttpResponse.json(mockListResponse),
        ),
      );

      const service = makeService();
      const req: FspReservationListRequest = {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      };
      const result = await service.listReservations(OPERATOR_ID, req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reservations).toHaveLength(1);
        expect(result.data.reservations[0].reservationId).toBe('res-001');
        expect(result.data.totalCount).toBe(1);
      }
    });

    it('returns failure on 500 after retries', async () => {
      server.use(
        http.post(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/operatorReservations/list`,
          () => new HttpResponse(null, { status: 500 }),
        ),
      );

      vi.useFakeTimers();
      const service = makeService();
      const req: FspReservationListRequest = {};
      const promise = service.listReservations(OPERATOR_ID, req);
      await vi.runAllTimersAsync();
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });

  describe('getReservation()', () => {
    it('returns success with reservation details', async () => {
      server.use(
        http.get(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/reservations/res-001`,
          () => HttpResponse.json(mockReservation),
        ),
      );

      const service = makeService();
      const result = await service.getReservation(OPERATOR_ID, 'res-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reservationId).toBe('res-001');
      }
    });
  });
});
