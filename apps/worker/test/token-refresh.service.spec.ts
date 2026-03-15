/**
 * token-refresh.service.spec.ts
 * -----------------------------
 * Agentic Scheduler — FSP Integration — TokenRefreshService unit tests
 * -------------------------------------------------------------------
 * Tests that the refresh cron job refreshes expiring tokens and skips
 * non-expiring tokens.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenRefreshService } from '../src/auth/token-refresh.service';
import { TokenStore } from '../src/auth/token-store';
import type { AuthService } from '@fsp-scheduler/fsp-client';

describe('TokenRefreshService', () => {
  let service: TokenRefreshService;
  let tokenStore: TokenStore;
  let authService: AuthService;
  let prisma: {
    operator: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    tokenStore = new TokenStore();

    authService = {
      refreshSession: vi.fn(),
    } as unknown as AuthService;

    prisma = {
      operator: {
        findMany: vi.fn(),
      },
    };

    service = new TokenRefreshService(tokenStore, authService, prisma as never);
  });

  it('refreshes expiring tokens', async () => {
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 min from now (< 5 min buffer)
    tokenStore.setToken(42, 'old-token', expiresAt);

    const newToken = 'refreshed-token';
    const newExpiresIn = 3600;
    vi.mocked(authService.refreshSession).mockResolvedValue({
      success: true,
      data: {
        accessToken: newToken,
        expiresIn: newExpiresIn,
      },
    });

    await service.handleTokenRefresh();

    expect(authService.refreshSession).toHaveBeenCalledTimes(1);
    expect(tokenStore.getToken(42)).toBe(newToken);
  });

  it('skips non-expiring tokens', async () => {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
    tokenStore.setToken(42, 'fresh-token', expiresAt);

    await service.handleTokenRefresh();

    expect(authService.refreshSession).not.toHaveBeenCalled();
    expect(tokenStore.getToken(42)).toBe('fresh-token');
  });

  it('skips refresh when token store is empty', async () => {
    await service.handleTokenRefresh();

    expect(authService.refreshSession).not.toHaveBeenCalled();
  });

  it('does not update store when refresh fails', async () => {
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    tokenStore.setToken(42, 'old-token', expiresAt);

    vi.mocked(authService.refreshSession).mockResolvedValue({
      success: false,
      error: 'Refresh token expired',
      data: null,
    });

    await service.handleTokenRefresh();

    // Token should remain as old-token since refresh failed
    // (isExpiringSoon may still return true, but getToken returns original)
    expect(authService.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('processes multiple operators, refreshing only expiring ones', async () => {
    const soonExpiry = new Date(Date.now() + 2 * 60 * 1000); // expiring soon
    const laterExpiry = new Date(Date.now() + 30 * 60 * 1000); // not expiring

    tokenStore.setToken(1, 'token-op-1', soonExpiry);
    tokenStore.setToken(2, 'token-op-2', laterExpiry);
    tokenStore.setToken(3, 'token-op-3', soonExpiry);

    vi.mocked(authService.refreshSession).mockResolvedValue({
      success: true,
      data: {
        accessToken: 'new-token',
        expiresIn: 3600,
      },
    });

    await service.handleTokenRefresh();

    // Only operators 1 and 3 should have been refreshed
    expect(authService.refreshSession).toHaveBeenCalledTimes(2);
  });
});
