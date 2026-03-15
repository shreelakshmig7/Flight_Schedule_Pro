/**
 * enrollment.service.spec.ts
 * --------------------------
 * Agentic Scheduler — FSP Integration — EnrollmentService unit tests
 * ------------------------------------------------------------------
 * Tests getEnrollments and getProgress returning correct ServiceResult shapes.
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
import { EnrollmentService } from '../src/services/enrollment.service';
import type {
  FspEnrollment,
  FspEnrollmentProgress,
} from '@fsp-scheduler/shared-types';

const CURRICULUM_BASE = 'https://test-curriculum.example.com';
const SUB_KEY = 'sub-key-curr';
const OPERATOR_ID = 'op-curr-123';
const STUDENT_ID = 'stu-001';
const ENROLLMENT_ID = 'enr-001';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Builds an EnrollmentService with a test-scoped HTTP client.
 *
 * @returns An EnrollmentService instance.
 */
function makeService(): EnrollmentService {
  const client = new FspHttpClient(CURRICULUM_BASE, SUB_KEY);
  return new EnrollmentService(client);
}

const mockEnrollment: FspEnrollment = {
  enrollmentId: ENROLLMENT_ID,
  operatorId: OPERATOR_ID,
  studentId: STUDENT_ID,
  programName: 'Private Pilot Certificate',
  status: 'active',
  startDate: '2026-01-01',
};

describe('EnrollmentService', () => {
  describe('getEnrollments()', () => {
    it('returns success with enrollment list for a student', async () => {
      server.use(
        http.get(
          `${CURRICULUM_BASE}/api/V1/operator/${OPERATOR_ID}/students/${STUDENT_ID}/enrollments`,
          () => HttpResponse.json([mockEnrollment]),
        ),
      );

      const service = makeService();
      const result = await service.getEnrollments(OPERATOR_ID, STUDENT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].enrollmentId).toBe(ENROLLMENT_ID);
        expect(result.data[0].programName).toBe('Private Pilot Certificate');
      }
    });

    it('returns failure when student is not found', async () => {
      server.use(
        http.get(
          `${CURRICULUM_BASE}/api/V1/operator/${OPERATOR_ID}/students/bad-stu/enrollments`,
          () => new HttpResponse(null, { status: 404 }),
        ),
      );

      const service = makeService();
      const result = await service.getEnrollments(OPERATOR_ID, 'bad-stu');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe('getProgress()', () => {
    it('returns success with enrollment progress', async () => {
      const mockProgress: FspEnrollmentProgress = {
        enrollmentId: ENROLLMENT_ID,
        completedLessons: 12,
        totalLessons: 40,
        completedHours: 18.5,
        requiredHours: 40,
        percentComplete: 30,
        lastActivityDate: '2026-03-10',
      };

      server.use(
        http.get(
          `${CURRICULUM_BASE}/api/V1/operator/${OPERATOR_ID}/enrollments/${ENROLLMENT_ID}/progress`,
          () => HttpResponse.json(mockProgress),
        ),
      );

      const service = makeService();
      const result = await service.getProgress(OPERATOR_ID, ENROLLMENT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enrollmentId).toBe(ENROLLMENT_ID);
        expect(result.data.completedLessons).toBe(12);
        expect(result.data.percentComplete).toBe(30);
        expect(result.data.completedHours).toBe(18.5);
      }
    });

    it('returns failure on 500 after retries', async () => {
      server.use(
        http.get(
          `${CURRICULUM_BASE}/api/V1/operator/${OPERATOR_ID}/enrollments/${ENROLLMENT_ID}/progress`,
          () => new HttpResponse(null, { status: 500 }),
        ),
      );

      vi.useFakeTimers();
      const service = makeService();
      const promise = service.getProgress(OPERATOR_ID, ENROLLMENT_ID);
      await vi.runAllTimersAsync();
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
    });
  });

  describe('getEnrollmentDetails()', () => {
    it('returns success with enrollment details', async () => {
      server.use(
        http.get(
          `${CURRICULUM_BASE}/api/V1/operator/${OPERATOR_ID}/enrollments/${ENROLLMENT_ID}`,
          () => HttpResponse.json(mockEnrollment),
        ),
      );

      const service = makeService();
      const result = await service.getEnrollmentDetails(OPERATOR_ID, ENROLLMENT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enrollmentId).toBe(ENROLLMENT_ID);
      }
    });
  });
});
