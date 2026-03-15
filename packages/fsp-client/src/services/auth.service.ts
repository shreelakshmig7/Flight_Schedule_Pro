/**
 * auth.service.ts
 * ---------------
 * Agentic Scheduler — FSP Integration — FSP Authentication service
 * ----------------------------------------------------------------
 * Provides authentication operations against the FSP auth gateway.
 * Handles login, MFA verification, token refresh, and logout.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: AuthService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspAuthRequest,
  FspAuthResponse,
  FspMfaRequest,
  FspMfaResponse,
  FspRefreshRequest,
  FspRefreshResponse,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for authenticating with the FSP API gateway.
 * Injected via FspClientModule; uses the FSP_AUTH_CLIENT HTTP client instance.
 */
@Injectable()
export class AuthService {
  /**
   * @param authClient - HTTP client bound to the FSP auth gateway base URL.
   */
  constructor(private readonly authClient: FspHttpClient) {}

  /**
   * Authenticates a user with username and password.
   *
   * @param req - Credentials and optional operator context.
   * @returns ServiceResult containing the auth response, or an error.
   */
  public async authenticate(req: FspAuthRequest): Promise<ServiceResult<FspAuthResponse>> {
    try {
      const data = await this.authClient.post<FspAuthResponse>('/api/V1/Auth/login', req);
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Verifies a multi-factor authentication code.
   *
   * @param req - MFA token and one-time code.
   * @returns ServiceResult containing the MFA response, or an error.
   */
  public async verifyMfa(req: FspMfaRequest): Promise<ServiceResult<FspMfaResponse>> {
    try {
      const data = await this.authClient.post<FspMfaResponse>('/api/V1/Auth/mfa/verify', req);
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Refreshes an expired access token using a refresh token.
   *
   * @param req - The refresh token payload.
   * @returns ServiceResult containing the new tokens, or an error.
   */
  public async refreshSession(req: FspRefreshRequest): Promise<ServiceResult<FspRefreshResponse>> {
    try {
      const data = await this.authClient.post<FspRefreshResponse>('/api/V1/Auth/refresh', req);
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Invalidates the current access token / session.
   *
   * @param token - The access token to invalidate.
   * @returns ServiceResult indicating success or failure.
   */
  public async logout(token: string): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const data = await this.authClient.post<Record<string, unknown>>('/api/V1/Auth/logout', { token });
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
