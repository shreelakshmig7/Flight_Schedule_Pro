/**
 * priority-weights.controller.spec.ts
 * ------------------------------------
 * Agentic Scheduler — FSP Integration — Priority weights endpoint unit tests
 * ---------------------------------------------------------------------------
 * Tests the GET /operators/me/priority-weights and
 * PUT  /operators/me/priority-weights endpoints added to OperatorsController
 * as part of PR-11 (Priority Weight Engine).
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-11 — Priority Weight Engine
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { OperatorsController } from '../src/operators/operators.controller';
import { OperatorsService } from '../src/operators/operators.service';
import { TenantContext } from '../src/auth/tenant-context';
import type {
  PriorityWeightConfig,
  TenantContextData,
  UpdatePriorityWeightsRequest,
} from '@fsp-scheduler/shared-types';

describe('OperatorsController — priority-weights endpoints', () => {
  let controller: OperatorsController;
  let operatorsService: OperatorsService;
  let tenantContext: TenantContext;

  const mockTenantData: TenantContextData = {
    operatorId: 'op-fsp-42',
    fspOperatorId: 42,
    userId: 'user-789',
    bearerToken: 'bearer-token-xyz',
  };

  const defaultWeights: PriorityWeightConfig = {
    timeSinceLastFlight: 0.5,
    timeUntilNextScheduledFlight: 0.3,
    totalFlightHours: 0.2,
    flightHoursHigherIsBetter: false,
    customSignals: {},
  };

  beforeEach(() => {
    tenantContext = new TenantContext();
    tenantContext.set(mockTenantData);

    operatorsService = {
      bootstrap: vi.fn(),
      getMyConfig: vi.fn(),
      getPriorityWeights: vi.fn(),
      updatePriorityWeights: vi.fn(),
    } as unknown as OperatorsService;

    controller = new OperatorsController(operatorsService, tenantContext);
  });

  // ── GET /operators/me/priority-weights ────────────────────────────────────

  describe('GET /operators/me/priority-weights', () => {
    it('returns the current priority weight configuration for the authenticated tenant', async () => {
      vi.mocked(operatorsService.getPriorityWeights).mockResolvedValue(defaultWeights);

      const result = await controller.getPriorityWeights();

      expect(operatorsService.getPriorityWeights).toHaveBeenCalledWith(mockTenantData);
      expect(result).toEqual(defaultWeights);
    });

    it('returns default weights when operator has not configured custom weights', async () => {
      vi.mocked(operatorsService.getPriorityWeights).mockResolvedValue(defaultWeights);

      const result = await controller.getPriorityWeights();

      expect(result.timeSinceLastFlight).toBe(0.5);
      expect(result.timeUntilNextScheduledFlight).toBe(0.3);
      expect(result.totalFlightHours).toBe(0.2);
      expect(result.customSignals).toEqual({});
    });
  });

  // ── PUT /operators/me/priority-weights ────────────────────────────────────

  describe('PUT /operators/me/priority-weights', () => {
    it('updates and returns the new priority weight configuration', async () => {
      const req: UpdatePriorityWeightsRequest = {
        timeSinceLastFlight: 0.7,
        timeUntilNextScheduledFlight: 0.2,
        totalFlightHours: 0.1,
        flightHoursHigherIsBetter: true,
        customSignals: { urgency: 0.5 },
      };
      const updated: PriorityWeightConfig = {
        timeSinceLastFlight: 0.7,
        timeUntilNextScheduledFlight: 0.2,
        totalFlightHours: 0.1,
        flightHoursHigherIsBetter: true,
        customSignals: { urgency: 0.5 },
      };

      vi.mocked(operatorsService.updatePriorityWeights).mockResolvedValue(updated);

      const result = await controller.updatePriorityWeights(req);

      expect(operatorsService.updatePriorityWeights).toHaveBeenCalledWith(mockTenantData, req);
      expect(result).toEqual(updated);
    });

    it('rejects negative weight values with HTTP 400', async () => {
      const req: UpdatePriorityWeightsRequest = {
        timeSinceLastFlight: -0.5,
      };

      vi.mocked(operatorsService.updatePriorityWeights).mockRejectedValue(
        new BadRequestException('Weight values must be non-negative numbers'),
      );

      await expect(controller.updatePriorityWeights(req)).rejects.toThrow(BadRequestException);
    });

    it('rejects negative custom signal weight with HTTP 400', async () => {
      const req: UpdatePriorityWeightsRequest = {
        customSignals: { waitlistRank: -1 },
      };

      vi.mocked(operatorsService.updatePriorityWeights).mockRejectedValue(
        new BadRequestException('Weight values must be non-negative numbers'),
      );

      await expect(controller.updatePriorityWeights(req)).rejects.toThrow(BadRequestException);
    });

    it('subsequent GET returns the persisted weights after a successful PUT', async () => {
      const updated: PriorityWeightConfig = {
        timeSinceLastFlight: 0.8,
        timeUntilNextScheduledFlight: 0.1,
        totalFlightHours: 0.1,
        flightHoursHigherIsBetter: false,
        customSignals: {},
      };

      vi.mocked(operatorsService.updatePriorityWeights).mockResolvedValue(updated);
      vi.mocked(operatorsService.getPriorityWeights).mockResolvedValue(updated);

      await controller.updatePriorityWeights({ timeSinceLastFlight: 0.8, timeUntilNextScheduledFlight: 0.1, totalFlightHours: 0.1 });
      const getResult = await controller.getPriorityWeights();

      expect(getResult.timeSinceLastFlight).toBe(0.8);
    });
  });
});
