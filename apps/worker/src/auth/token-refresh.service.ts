/**
 * token-refresh.service.ts
 * ------------------------
 * Agentic Scheduler — FSP Integration — Proactive FSP token refresh cron job
 * --------------------------------------------------------------------------
 * Runs every minute via @Cron and refreshes tokens in the TokenStore that
 * are expiring within TOKEN_REFRESH_BUFFER_MINUTES. Uses AuthService from
 * fsp-client to exchange the stored token for a fresh one.
 *
 * Key exports: TokenRefreshService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@fsp-scheduler/database';
import { AuthService } from '@fsp-scheduler/fsp-client';
import { TokenStore } from './token-store';

/** Logger name for this service. */
const SERVICE_NAME = 'TokenRefreshService';

/**
 * NestJS service that proactively refreshes expiring FSP bearer tokens.
 *
 * Runs on a 1-minute cron schedule. For each operatorId tracked in
 * TokenStore, if isExpiringSoon() returns true, calls AuthService.refreshSession()
 * to obtain a new token and updates the store.
 */
@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(SERVICE_NAME);

  /**
   * @param tokenStore  - In-memory store of operator tokens.
   * @param authService - FSP client service for token refresh.
   * @param prisma      - Database service for active operator lookup.
   */
  constructor(
    private readonly tokenStore: TokenStore,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Cron job that runs every minute to refresh expiring tokens.
   *
   * Iterates all operator IDs in the token store and refreshes tokens
   * that are within the expiry buffer window. Failed refreshes are
   * logged but do not throw — the next cron run will retry.
   *
   * @returns A Promise that resolves when all refresh attempts complete.
   */
  @Cron('*/1 * * * *')
  public async handleTokenRefresh(): Promise<void> {
    const operatorIds = this.tokenStore.getAllOperatorIds();

    if (operatorIds.length === 0) {
      return;
    }

    const expiringIds = operatorIds.filter((id) => this.tokenStore.isExpiringSoon(id));

    if (expiringIds.length === 0) {
      return;
    }

    this.logger.log(
      `Refreshing tokens for ${expiringIds.length} operator(s): [${expiringIds.join(', ')}]`,
    );

    await Promise.all(
      expiringIds.map((fspOperatorId) =>
        this.refreshTokenForOperator(fspOperatorId),
      ),
    );
  }

  /**
   * Refreshes the token for a single operator.
   *
   * @param fspOperatorId - The FSP integer operator identifier.
   * @returns A Promise that resolves when the refresh attempt completes.
   */
  private async refreshTokenForOperator(fspOperatorId: number): Promise<void> {
    const currentToken = this.tokenStore.getToken(fspOperatorId);
    if (!currentToken) {
      this.logger.warn(
        `No valid token to refresh for fspOperatorId=${fspOperatorId}`,
      );
      return;
    }

    this.logger.debug(`Refreshing token for fspOperatorId=${fspOperatorId}`);

    const result = await this.authService.refreshSession({
      refreshToken: currentToken,
    });

    if (!result.success) {
      this.logger.error(
        `Token refresh failed for fspOperatorId=${fspOperatorId}: ${result.error}`,
      );
      return;
    }

    const { accessToken, expiresIn } = result.data;
    const expiresInSeconds = typeof expiresIn === 'number' ? expiresIn : 3600;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    this.tokenStore.setToken(fspOperatorId, accessToken, expiresAt);

    this.logger.log(
      `Token refreshed for fspOperatorId=${fspOperatorId} new expiry=${expiresAt.toISOString()}`,
    );
  }
}
