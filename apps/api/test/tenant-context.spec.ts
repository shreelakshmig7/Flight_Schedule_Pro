/**
 * tenant-context.spec.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — TenantContext unit tests
 * --------------------------------------------------------------
 * Tests the request-scoped TenantContext provider. Verifies that
 * set/get round-trips correctly and that calling get() before set()
 * throws an error.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TenantContext } from '../src/auth/tenant-context';
import type { TenantContextData } from '@fsp-scheduler/shared-types';

describe('TenantContext', () => {
  let tenantContext: TenantContext;

  beforeEach(() => {
    tenantContext = new TenantContext();
  });

  it('set and get round-trip returns the same data', () => {
    const data: TenantContextData = {
      operatorId: 'clx-uuid-1234',
      fspOperatorId: 42,
      userId: 'user-789',
      bearerToken: 'eyJhbGciOiJSUzI1NiJ9.test',
    };

    tenantContext.set(data);
    const result = tenantContext.get();

    expect(result).toEqual(data);
  });

  it('get() throws if called before set()', () => {
    expect(() => tenantContext.get()).toThrowError(
      'TenantContext has not been initialised for this request. FspAuthGuard must run first.',
    );
  });

  it('set() can be called multiple times, last value wins', () => {
    const first: TenantContextData = {
      operatorId: 'op-1',
      fspOperatorId: 1,
      userId: 'user-1',
      bearerToken: 'token-1',
    };
    const second: TenantContextData = {
      operatorId: 'op-2',
      fspOperatorId: 2,
      userId: 'user-2',
      bearerToken: 'token-2',
    };

    tenantContext.set(first);
    tenantContext.set(second);

    expect(tenantContext.get()).toEqual(second);
  });
});
