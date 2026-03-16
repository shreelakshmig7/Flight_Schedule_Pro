/**
 * dashboard.service.spec.ts
 * -------------------------
 * Agentic Scheduler — FSP Integration — Dashboard service unit tests
 * -----------------------------------------------------------------
 * Tests for dashboard metrics computation: C_util, acceptance rate,
 * time to fill, queue health, and weekly flight hours.
 * Verifies caching behavior and metric calculations.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-24 — Operator Dashboard
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { PrismaService } from '@fsp-scheduler/database';
import { AircraftService, ScheduleService } from '@fsp-scheduler/fsp-client';
import type { TenantContextData } from '@fsp-scheduler/shared-types';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: PrismaService;
  let aircraftService: AircraftService;
  let scheduleService: ScheduleService;

  const mockTenantData: TenantContextData = {
    operatorId: 'clx-uuid-1234',
    fspOperatorId: 42,
    userId: 'user-789',
    bearerToken: 'eyJhbGciOiJSUzI1NiJ9.test',
  };

  beforeEach(() => {
    prisma = {
      suggestion: {
        findMany: vi.fn(),
      },
    } as unknown as PrismaService;

    aircraftService = {
      listAircraft: vi.fn(),
    } as unknown as AircraftService;

    scheduleService = {
      getDisplayHours: vi.fn(),
    } as unknown as ScheduleService;

    service = new DashboardService(prisma, aircraftService, scheduleService);
  });

  describe('computeCutil', () => {
    it('computes C_util from fleet size and operational hours', async () => {
      vi.mocked(aircraftService.listAircraft).mockResolvedValue({
        success: true,
        data: [
          { aircraftId: '1', operatorId: '42' },
          { aircraftId: '2', operatorId: '42' },
          { aircraftId: '3', operatorId: '42' },
        ],
      });

      vi.mocked(scheduleService.getDisplayHours).mockResolvedValue({
        success: true,
        data: [
          { operatorId: '42', dayOfWeek: 1, openTime: '08:00', closeTime: '17:00' },
          { operatorId: '42', dayOfWeek: 2, openTime: '08:00', closeTime: '17:00' },
          { operatorId: '42', dayOfWeek: 3, openTime: '08:00', closeTime: '17:00' },
        ],
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany).mockResolvedValue([
        {
          candidatePayload: { flightHours: 5 },
        } as any,
        {
          candidatePayload: { flightHours: 3 },
        } as any,
      ]);

      const result = await service.computeCutil(mockTenantData);

      expect(result.value).toBeDefined();
      expect(result.unit).toBe('%');
      expect(result.trendPoints).toHaveLength(7);
      expect(result.trendPoints[0]).toHaveProperty('date');
      expect(result.trendPoints[0]).toHaveProperty('value');
    });

    it('returns empty C_util metric when aircraft fetch fails', async () => {
      vi.mocked(aircraftService.listAircraft).mockResolvedValue({
        success: false,
        error: 'API error',
        data: null,
      });

      const result = await service.computeCutil(mockTenantData);

      expect(result.value).toBe(0);
      expect(result.unit).toBe('%');
      expect(result.trendPoints).toHaveLength(7);
    });

    it('returns empty C_util metric when fleet size is zero', async () => {
      vi.mocked(aircraftService.listAircraft).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await service.computeCutil(mockTenantData);

      expect(result.value).toBe(0);
      expect(result.unit).toBe('%');
    });
  });

  describe('computeAcceptanceRate', () => {
    it('computes acceptance rate for 7-day period with previous period comparison', async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .mockResolvedValueOnce([
          { status: 'APPROVED', resolvedAt: now } as any,
          { status: 'APPROVED', resolvedAt: now } as any,
          { status: 'REJECTED', resolvedAt: now } as any,
        ])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .mockResolvedValueOnce([
          { status: 'APPROVED', resolvedAt: sevenDaysAgo } as any,
          { status: 'REJECTED', resolvedAt: sevenDaysAgo } as any,
          { status: 'REJECTED', resolvedAt: sevenDaysAgo } as any,
        ]);

      const result = await service.computeAcceptanceRate(mockTenantData);

      expect(result.value).toBe(66.67); // 2 approved out of 3
      expect(result.previousPeriod).toBe(33.33); // 1 approved out of 3
      expect(result.unit).toBe('%');
      expect(result.trendPoints).toHaveLength(7);
    });

    it('returns zero acceptance rate when no suggestions exist', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany)
        .mockResolvedValueOnce([])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .mockResolvedValueOnce([]);

      const result = await service.computeAcceptanceRate(mockTenantData);

      expect(result.value).toBe(0);
      expect(result.previousPeriod).toBe(0);
      expect(result.unit).toBe('%');
    });
  });

  describe('computeTimeToFill', () => {
    it('computes average time to fill from creation to approval', async () => {
      const now = new Date();
      const createdTime = new Date(now.getTime() - 3600 * 1000); // 1 hour ago

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany).mockResolvedValue([
        {
          createdAt: createdTime,
          resolvedAt: now,
        } as any,
        {
          createdAt: new Date(now.getTime() - 1800 * 1000), // 30 min ago
          resolvedAt: now,
        } as any,
      ]);

      const result = await service.computeTimeToFill(mockTenantData);

      expect(result.value).toBeGreaterThan(0);
      expect(result.unit).toBe('seconds');
      expect(result.trendPoints).toHaveLength(7);
    });

    it('returns zero time to fill when no approved suggestions exist', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany).mockResolvedValue([]);

      const result = await service.computeTimeToFill(mockTenantData);

      expect(result.value).toBe(0);
      expect(result.unit).toBe('seconds');
    });
  });

  describe('getQueueHealth', () => {
    it('counts PENDING suggestions by use case type', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany).mockResolvedValue([
        { useCaseType: 'CANCELLATION_FILL' } as any,
        { useCaseType: 'CANCELLATION_FILL' } as any,
        { useCaseType: 'NEW_OPENING' } as any,
        { useCaseType: 'WAITLIST_FILL' } as any,
      ]);

      const result = await service.getQueueHealth(mockTenantData);

      expect(result.total).toBe(4);
      expect(result.counts['CANCELLATION_FILL']).toBe(2);
      expect(result.counts['NEW_OPENING']).toBe(1);
      expect(result.counts['WAITLIST_FILL']).toBe(1);
    });

    it('returns empty queue health when no pending suggestions', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany).mockResolvedValue([]);

      const result = await service.getQueueHealth(mockTenantData);

      expect(result.total).toBe(0);
      expect(Object.keys(result.counts).length).toBe(0);
    });
  });

  describe('computeWeeklyFlightHours', () => {
    it('computes this week vs previous week flight hours', async () => {
      const now = new Date();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .mockResolvedValueOnce([
          {
            candidatePayload: { flightHours: 2 },
            createdAt: now,
          } as any,
          {
            candidatePayload: { flightHours: 3 },
            createdAt: now,
          } as any,
        ])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .mockResolvedValueOnce([
          {
            candidatePayload: { flightHours: 1 },
            createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          } as any,
        ]);

      const result = await service.computeWeeklyFlightHours(mockTenantData);

      expect(result.thisWeek).toBe(5);
      expect(result.previousWeek).toBe(1);
      expect(result.unit).toBe('hours');
    });

    it('returns zero hours when no approved suggestions', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany)
        .mockResolvedValueOnce([])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .mockResolvedValueOnce([]);

      const result = await service.computeWeeklyFlightHours(mockTenantData);

      expect(result.thisWeek).toBe(0);
      expect(result.previousWeek).toBe(0);
      expect(result.unit).toBe('hours');
    });
  });

  describe('getMetrics', () => {
    it('returns all metrics and caches result', async () => {
      vi.mocked(aircraftService.listAircraft).mockResolvedValue({
        success: true,
        data: [{ aircraftId: '1', operatorId: '42' }],
      });

      vi.mocked(scheduleService.getDisplayHours).mockResolvedValue({
        success: true,
        data: [
          { operatorId: '42', dayOfWeek: 1, openTime: '08:00', closeTime: '17:00' },
        ],
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany).mockResolvedValue([]);

      const result = await service.getMetrics(mockTenantData);

      expect(result).toHaveProperty('cUtil');
      expect(result).toHaveProperty('acceptanceRate');
      expect(result).toHaveProperty('timeToFill');
      expect(result).toHaveProperty('queueHealth');
      expect(result).toHaveProperty('weeklyFlightHours');
      expect(result).toHaveProperty('lastUpdated');

      // Verify caching by checking that subsequent call uses cache
      const _result2 = await service.getMetrics(mockTenantData);
      expect(_result2).toEqual(result);
    });

    it('recomputes metrics after cache expires', async () => {
      vi.useFakeTimers();
      const now = new Date(2024, 0, 1);
      vi.setSystemTime(now);

      vi.mocked(aircraftService.listAircraft).mockResolvedValue({
        success: true,
        data: [],
      });

      vi.mocked(scheduleService.getDisplayHours).mockResolvedValue({
        success: true,
        data: [],
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany).mockResolvedValue([]);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const result1 = await service.getMetrics(mockTenantData);

      // Advance time by 6 minutes (cache expires after 5 minutes)
      vi.setSystemTime(new Date(now.getTime() + 6 * 60 * 1000));

      vi.mocked(aircraftService.listAircraft).mockResolvedValueOnce({
        success: true,
        data: [{ aircraftId: '1', operatorId: '42' }],
      });

      vi.mocked(scheduleService.getDisplayHours).mockResolvedValueOnce({
        success: true,
        data: [],
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany).mockResolvedValue([]);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const result2 = await service.getMetrics(mockTenantData);

      // Results should be different since cache was invalidated
      expect(aircraftService.listAircraft).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('metric rounding', () => {
    it('rounds metric values to 2 decimal places', async () => {
      vi.mocked(aircraftService.listAircraft).mockResolvedValue({
        success: true,
        data: [{ aircraftId: '1', operatorId: '42' }],
      });

      vi.mocked(scheduleService.getDisplayHours).mockResolvedValue({
        success: true,
        data: [
          { operatorId: '42', dayOfWeek: 1, openTime: '08:00', closeTime: '17:00' },
        ],
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      vi.mocked(prisma.suggestion.findMany).mockResolvedValue([
        { candidatePayload: { flightHours: 3.14159 } } as any,
      ]);

      const result = await service.computeCutil(mockTenantData);

      // Value should be rounded to 2 decimal places
      const stringValue = result.value.toString();
      const decimalPlaces = (stringValue.split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });
});
