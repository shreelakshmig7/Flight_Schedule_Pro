/**
 * fsp-auth.guard.spec.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — FspAuthGuard unit tests
 * -------------------------------------------------------------
 * Tests the authentication guard. Covers valid token → 200, missing
 * token → 401, missing x-operator-id header → 401, operator not in
 * DB → 401, canManageSchedule=false → 401, and @Public() bypass.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { FspAuthGuard } from '../src/auth/fsp-auth.guard';
import { TenantContext } from '../src/auth/tenant-context';
import type { OperatorsService } from '@fsp-scheduler/fsp-client';
import type { FspHttpClient } from '@fsp-scheduler/fsp-client';

/** Builds a minimal NestJS ExecutionContext mock for Fastify. */
function buildContext(
  headers: Record<string, string | undefined>,
): ExecutionContext {
  const request = { headers };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('FspAuthGuard', () => {
  let guard: FspAuthGuard;
  let reflector: Reflector;
  let operatorsService: OperatorsService;
  let authClient: FspHttpClient;
  let prisma: {
    operator: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let tenantContext: TenantContext;

  const validOperator = {
    id: 'internal-uuid',
    operatorId: 'op-uuid-string',
    fspOperatorId: 42,
    name: 'Test Operator',
    pollingTier: 'TIER2',
    isActive: true,
    lastPolledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    reflector = new Reflector();
    tenantContext = new TenantContext();

    authClient = {
      setBearerToken: vi.fn(),
      clearBearerToken: vi.fn(),
    } as unknown as FspHttpClient;

    operatorsService = {
      getPermissions: vi.fn(),
    } as unknown as OperatorsService;

    prisma = {
      operator: {
        findUnique: vi.fn(),
      },
    };

    guard = new FspAuthGuard(
      reflector,
      operatorsService,
      authClient,
      prisma as never,
      tenantContext,
    );
  });

  it('returns true for valid token, valid operator ID, and canManageSchedule=true', async () => {
    vi.mocked(operatorsService.getPermissions).mockResolvedValue({
      success: true,
      data: {
        operatorId: '42',
        canManageSchedule: true,
        userId: 'user-456',
      },
    });
    vi.mocked(prisma.operator.findUnique).mockResolvedValue(validOperator);

    const ctx = buildContext({
      authorization: 'Bearer valid-token',
      'x-operator-id': '42',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('returns false (401) when Authorization header is missing', async () => {
    const ctx = buildContext({
      'x-operator-id': '42',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('returns false (401) when Authorization header is not Bearer', async () => {
    const ctx = buildContext({
      authorization: 'Basic dXNlcjpwYXNz',
      'x-operator-id': '42',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('returns false (401) when x-operator-id header is missing', async () => {
    const ctx = buildContext({
      authorization: 'Bearer valid-token',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('returns false (401) when x-operator-id is not a valid integer', async () => {
    const ctx = buildContext({
      authorization: 'Bearer valid-token',
      'x-operator-id': 'not-a-number',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('returns false (401) when FSP getPermissions returns success=false (invalid token)', async () => {
    vi.mocked(operatorsService.getPermissions).mockResolvedValue({
      success: false,
      error: 'Unauthorized',
      data: null,
    });

    const ctx = buildContext({
      authorization: 'Bearer expired-token',
      'x-operator-id': '42',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('returns false (401) when canManageSchedule is false', async () => {
    vi.mocked(operatorsService.getPermissions).mockResolvedValue({
      success: true,
      data: {
        operatorId: '42',
        canManageSchedule: false,
        userId: 'user-456',
      },
    });

    const ctx = buildContext({
      authorization: 'Bearer valid-token',
      'x-operator-id': '42',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('returns false (401) when operator is not found in DB (must bootstrap first)', async () => {
    vi.mocked(operatorsService.getPermissions).mockResolvedValue({
      success: true,
      data: {
        operatorId: '42',
        canManageSchedule: true,
        userId: 'user-456',
      },
    });
    vi.mocked(prisma.operator.findUnique).mockResolvedValue(null);

    const ctx = buildContext({
      authorization: 'Bearer valid-token',
      'x-operator-id': '42',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('bypasses guard for @Public() routes', async () => {
    // Simulate Reflector returning true for isPublic
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const ctx = buildContext({});

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('sets TenantContext on successful authentication', async () => {
    vi.mocked(operatorsService.getPermissions).mockResolvedValue({
      success: true,
      data: {
        operatorId: '42',
        canManageSchedule: true,
        userId: 'user-456',
      },
    });
    vi.mocked(prisma.operator.findUnique).mockResolvedValue(validOperator);

    const ctx = buildContext({
      authorization: 'Bearer my-token',
      'x-operator-id': '42',
    });

    await guard.canActivate(ctx);

    const tenantData = tenantContext.get();
    expect(tenantData.operatorId).toBe(validOperator.operatorId);
    expect(tenantData.fspOperatorId).toBe(42);
    expect(tenantData.bearerToken).toBe('my-token');
    expect(tenantData.userId).toBe('user-456');
  });
});
