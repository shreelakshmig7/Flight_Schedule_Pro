/**
 * find-a-time.service.spec.ts
 * ---------------------------
 * Agentic Scheduler — FSP Integration — FindATimeService unit tests
 * ----------------------------------------------------------------
 * Tests getAvailableSlots returning correct ServiceResult shapes.
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
import { FindATimeService } from '../src/services/find-a-time.service';
import type {
  FspFindATimeRequest,
  FspFindATimeSlot,
  FspFindATimePreferences,
} from '@fsp-scheduler/shared-types';

const CORE_BASE = 'https://test-core-fat.example.com';
const SUB_KEY = 'sub-key-fat';
const OPERATOR_ID = 'op-fat-123';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Builds a FindATimeService with a test-scoped HTTP client.
 *
 * @returns A FindATimeService instance.
 */
function makeService(): FindATimeService {
  const client = new FspHttpClient(CORE_BASE, SUB_KEY);
  return new FindATimeService(client);
}

describe('FindATimeService', () => {
  describe('getAvailableSlots()', () => {
    it('returns success with a list of available time slots', async () => {
      const mockSlots: FspFindATimeSlot[] = [
        {
          startDateTime: '2026-03-20T09:00:00Z',
          endDateTime: '2026-03-20T11:00:00Z',
          instructorId: 'inst-1',
          aircraftId: 'ac-1',
          score: 0.95,
        },
        {
          startDateTime: '2026-03-20T14:00:00Z',
          endDateTime: '2026-03-20T16:00:00Z',
          instructorId: 'inst-2',
          aircraftId: 'ac-2',
          score: 0.80,
        },
      ];

      server.use(
        http.post(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/findatime/slots`,
          () => HttpResponse.json({ slots: mockSlots }),
        ),
      );

      const service = makeService();
      const req: FspFindATimeRequest = {
        studentId: 'stu-001',
        durationMinutes: 120,
        startDate: '2026-03-20',
        endDate: '2026-03-27',
      };
      const result = await service.getAvailableSlots(OPERATOR_ID, req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data).toHaveLength(2);
        expect(result.data[0].startDateTime).toBe('2026-03-20T09:00:00Z');
        expect(result.data[0].score).toBe(0.95);
      }
    });

    it('returns failure on 400 with validation errors', async () => {
      server.use(
        http.post(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/findatime/slots`,
          () =>
            HttpResponse.json(
              { errors: [{ message: 'durationMinutes must be positive' }] },
              { status: 400 },
            ),
        ),
      );

      const service = makeService();
      const req: FspFindATimeRequest = {
        studentId: 'stu-001',
        durationMinutes: -1,
        startDate: '2026-03-20',
        endDate: '2026-03-27',
      };
      const result = await service.getAvailableSlots(OPERATOR_ID, req);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.error).toBeTruthy();
      }
    });

    it('returns empty list when no slots are available', async () => {
      server.use(
        http.post(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/findatime/slots`,
          () => HttpResponse.json({ slots: [] }),
        ),
      );

      const service = makeService();
      const req: FspFindATimeRequest = {
        studentId: 'stu-002',
        durationMinutes: 60,
        startDate: '2026-03-20',
        endDate: '2026-03-21',
      };
      const result = await service.getAvailableSlots(OPERATOR_ID, req);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe('getPreferences()', () => {
    it('returns success with user preferences', async () => {
      const mockPrefs: FspFindATimePreferences = {
        userId: 'user-1',
        operatorId: OPERATOR_ID,
        preferredDays: [1, 2, 3, 4, 5],
        preferredStartTime: '08:00',
        preferredEndTime: '17:00',
      };

      server.use(
        http.get(
          `${CORE_BASE}/api/V1/operator/${OPERATOR_ID}/findatime/preferences/user-1`,
          () => HttpResponse.json(mockPrefs),
        ),
      );

      const service = makeService();
      const result = await service.getPreferences(OPERATOR_ID, 'user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe('user-1');
        expect(result.data.preferredDays).toHaveLength(5);
      }
    });
  });
});
