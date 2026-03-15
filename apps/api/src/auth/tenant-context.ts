/**
 * tenant-context.ts
 * -----------------
 * Agentic Scheduler — FSP Integration — Request-scoped tenant context
 * -------------------------------------------------------------------
 * Provides a request-scoped injectable that holds the authenticated
 * tenant's context data for the duration of a single HTTP request.
 * FspAuthGuard populates this once per request; all downstream
 * handlers inject it to access operatorId, bearerToken, etc.
 *
 * Key exports: TenantContext
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { Injectable, Scope } from '@nestjs/common';
import type { TenantContextData } from '@fsp-scheduler/shared-types';

/**
 * Request-scoped provider that stores the authenticated tenant context.
 *
 * A new instance is created for every incoming HTTP request. The guard
 * calls set() once after validating the bearer token; all downstream
 * services and controllers call get() to access the resolved context.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private data: TenantContextData | null = null;

  /**
   * Sets the tenant context for this request.
   * Should be called exactly once per request by FspAuthGuard.
   *
   * @param data - The resolved tenant context including operatorId and token.
   * @returns void
   */
  public set(data: TenantContextData): void {
    this.data = data;
  }

  /**
   * Returns the tenant context for the current request.
   *
   * @returns The tenant context data set by the auth guard.
   * @throws Error if called before set() — indicates guard misconfiguration.
   */
  public get(): TenantContextData {
    if (this.data === null) {
      throw new Error(
        'TenantContext has not been initialised for this request. FspAuthGuard must run first.',
      );
    }
    return this.data;
  }
}
