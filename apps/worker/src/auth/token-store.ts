/**
 * token-store.ts
 * --------------
 * Agentic Scheduler — FSP Integration — In-memory FSP token store
 * ---------------------------------------------------------------
 * Manages one FSP bearer token per operator in memory. Tokens are keyed
 * by fspOperatorId (integer). The store is not persisted — worker restarts
 * require re-authentication for all operators. isExpiringSoon() drives the
 * proactive refresh logic in TokenRefreshService.
 *
 * Key exports: TokenStore
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { Injectable, Logger } from '@nestjs/common';
import { TOKEN_REFRESH_BUFFER_MINUTES } from '@fsp-scheduler/shared-types';

/** Logger name for this service. */
const SERVICE_NAME = 'TokenStore';

/** Internal record shape stored per operator. */
interface TokenRecord {
  token: string;
  expiresAt: Date;
}

/**
 * In-memory store for FSP bearer tokens, one per operator.
 *
 * Tokens are stored with their expiry timestamp. getToken() returns null
 * for unknown operators and for expired tokens. isExpiringSoon() returns
 * true when the token expires within TOKEN_REFRESH_BUFFER_MINUTES minutes.
 */
@Injectable()
export class TokenStore {
  private readonly logger = new Logger(SERVICE_NAME);
  private readonly tokens = new Map<number, TokenRecord>();

  /**
   * Stores or replaces the FSP bearer token for an operator.
   *
   * @param fspOperatorId - The FSP integer operator identifier.
   * @param token         - The raw bearer token string.
   * @param expiresAt     - The Date when this token expires.
   * @returns void
   */
  public setToken(fspOperatorId: number, token: string, expiresAt: Date): void {
    this.tokens.set(fspOperatorId, { token, expiresAt });
    this.logger.debug(
      `Token stored for fspOperatorId=${fspOperatorId} expires=${expiresAt.toISOString()}`,
    );
  }

  /**
   * Returns the bearer token for an operator, or null if not present or expired.
   *
   * @param fspOperatorId - The FSP integer operator identifier.
   * @returns The bearer token string, or null if absent/expired.
   */
  public getToken(fspOperatorId: number): string | null {
    const record = this.tokens.get(fspOperatorId);
    if (!record) return null;
    if (record.expiresAt <= new Date()) {
      this.logger.debug(
        `Token for fspOperatorId=${fspOperatorId} has expired`,
      );
      return null;
    }
    return record.token;
  }

  /**
   * Returns true when the token for an operator expires within the
   * TOKEN_REFRESH_BUFFER_MINUTES window, or has already expired.
   *
   * @param fspOperatorId - The FSP integer operator identifier.
   * @returns true if the token is expiring soon or absent; false otherwise.
   */
  public isExpiringSoon(fspOperatorId: number): boolean {
    const record = this.tokens.get(fspOperatorId);
    if (!record) return false;

    const bufferMs = TOKEN_REFRESH_BUFFER_MINUTES * 60 * 1000;
    const refreshThreshold = new Date(Date.now() + bufferMs);
    return record.expiresAt <= refreshThreshold;
  }

  /**
   * Returns all operator IDs currently tracked by the store.
   *
   * @returns An array of fspOperatorId integers.
   */
  public getAllOperatorIds(): number[] {
    return Array.from(this.tokens.keys());
  }
}
