/**
 * operators.controller.spec.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — OperatorsController unit tests
 * --------------------------------------------------------------------
 * Tests the operators controller: bootstrap happy path, bootstrap
 * idempotent (same operator called twice), and getMyConfig returns
 * correct operator config.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OperatorsController } from '../src/operators/operators.controller';
import { OperatorsService } from '../src/operators/operators.service';
import { TenantContext } from '../src/auth/tenant-context';
import type { OperatorBootstrapRequest, OperatorConfigResponse, TenantContextData } from '@fsp-scheduler/shared-types';

describe('OperatorsController', () => {
  let controller: OperatorsController;
  let operatorsService: OperatorsService;
  let tenantContext: TenantContext;

  const mockConfigResponse: OperatorConfigResponse = {
    id: 'clx-uuid-1234',
    fspOperatorId: 42,
    name: 'Test Flight School',
    pollingTier: 'TIER2',
    priorityWeights: {},
    policyConfig: {},
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const mockTenantData: TenantContextData = {
    operatorId: 'clx-uuid-1234',
    fspOperatorId: 42,
    userId: 'user-789',
    bearerToken: 'eyJhbGciOiJSUzI1NiJ9.test',
  };

  beforeEach(() => {
    tenantContext = new TenantContext();
    tenantContext.set(mockTenantData);

    operatorsService = {
      bootstrap: vi.fn(),
      getMyConfig: vi.fn(),
    } as unknown as OperatorsService;

    controller = new OperatorsController(operatorsService, tenantContext);
  });

  describe('POST /operators/bootstrap', () => {
    it('bootstrap happy path — creates operator and returns config', async () => {
      const req: OperatorBootstrapRequest = {
        fspOperatorId: 42,
        operatorName: 'Test Flight School',
        fspSubscriptionKeyRef: 'https://vault.azure.net/secrets/op-42-key',
      };

      vi.mocked(operatorsService.bootstrap).mockResolvedValue(mockConfigResponse);

      const result = await controller.bootstrap(req);

      expect(operatorsService.bootstrap).toHaveBeenCalledWith(req);
      expect(result).toEqual(mockConfigResponse);
    });

    it('bootstrap is idempotent — calling twice with same operator returns same result', async () => {
      const req: OperatorBootstrapRequest = {
        fspOperatorId: 42,
        operatorName: 'Test Flight School',
        fspSubscriptionKeyRef: 'https://vault.azure.net/secrets/op-42-key',
      };

      vi.mocked(operatorsService.bootstrap).mockResolvedValue(mockConfigResponse);

      const first = await controller.bootstrap(req);
      const second = await controller.bootstrap(req);

      expect(operatorsService.bootstrap).toHaveBeenCalledTimes(2);
      expect(first).toEqual(mockConfigResponse);
      expect(second).toEqual(mockConfigResponse);
    });
  });

  describe('GET /operators/me', () => {
    it('getMyConfig returns operator config for authenticated tenant', async () => {
      vi.mocked(operatorsService.getMyConfig).mockResolvedValue(mockConfigResponse);

      const result = await controller.getMyConfig();

      expect(operatorsService.getMyConfig).toHaveBeenCalledWith(mockTenantData);
      expect(result).toEqual(mockConfigResponse);
    });

    it('getMyConfig passes tenant context to service', async () => {
      const altTenantData: TenantContextData = {
        operatorId: 'different-operator-id',
        fspOperatorId: 99,
        userId: 'user-other',
        bearerToken: 'other-token',
      };
      tenantContext.set(altTenantData);

      const altConfigResponse: OperatorConfigResponse = {
        ...mockConfigResponse,
        id: 'different-operator-id',
        fspOperatorId: 99,
      };

      vi.mocked(operatorsService.getMyConfig).mockResolvedValue(altConfigResponse);

      const result = await controller.getMyConfig();

      expect(operatorsService.getMyConfig).toHaveBeenCalledWith(altTenantData);
      expect(result.fspOperatorId).toBe(99);
    });
  });
});
