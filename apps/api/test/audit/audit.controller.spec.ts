/**
 * audit.controller.spec.ts
 * ------------------------
 * Agentic Scheduler — FSP Integration — Audit controller tests
 * ----------------------------------------------------------
 * Tests for GET /audit endpoint with cursor-based pagination and tenant isolation.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-20 — Bulk Approve/Decline and Activity Feed
 * Updated: PR-22 — Immutable Audit Log (updated for cursor-based pagination)
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditController } from '../../src/audit/audit.controller';
import { AuditService } from '../../src/audit/audit.service';
import { TenantContext } from '../../src/auth/tenant-context';
import type { TenantContextData } from '@fsp-scheduler/shared-types';

const OPERATOR_ID = 'fsp-42';
const FSP_OPERATOR_ID = 42;
const USER_ID = 'user-abc';
const BEARER_TOKEN = 'tok-test';

const TENANT: TenantContextData = {
  operatorId: OPERATOR_ID,
  fspOperatorId: FSP_OPERATOR_ID,
  userId: USER_ID,
  bearerToken: BEARER_TOKEN,
};

function makeAuditEntry(overrides: Partial<{
  id: string;
  eventType: string;
  actorId: string;
  createdAt: string;
}> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'audit-001',
    eventType: overrides.eventType ?? 'SUGGESTION_APPROVED',
    actorId: overrides.actorId ?? OPERATOR_ID,
    suggestionId: 'sugg-001',
    payload: { status: 'APPROVED' },
    createdAt: overrides.createdAt ?? '2026-03-15T10:00:00.000Z',
  };
}

describe('AuditController', () => {
  let controller: AuditController;
  let auditService: Partial<AuditService>;
  let tenantContext: Partial<TenantContext>;

  beforeEach(() => {
    auditService = {
      listAuditEntries: vi.fn(),
      getAuditEntry: vi.fn(),
    };

    tenantContext = {
      get: vi.fn().mockReturnValue(TENANT),
    };

    controller = new AuditController(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      auditService as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      tenantContext as any,
    );
  });

  describe('GET /audit', () => {
    it('returns audit entries with default pagination', async () => {
      const entries = [
        makeAuditEntry({ eventType: 'SUGGESTION_APPROVED' }),
        makeAuditEntry({ eventType: 'SUGGESTION_REJECTED', id: 'audit-002' }),
      ];

      (auditService.listAuditEntries as any).mockResolvedValue({
        entries,
        nextCursor: undefined,
      });

      const result = await controller.listAuditEntries();

      expect(result.entries).toEqual(entries);
      expect(result.nextCursor).toBeUndefined();
      expect(auditService.listAuditEntries).toHaveBeenCalledWith(
        TENANT,
        {},
        { limit: 50, cursor: undefined },
      );
    });

    it('respects custom limit parameter', async () => {
      const entries = Array(25).fill(makeAuditEntry());

      (auditService.listAuditEntries as any).mockResolvedValue({
        entries,
        nextCursor: '2026-03-15T09:00:00.000Z',
      });

      const result = await controller.listAuditEntries('25');

      expect(result.entries).toHaveLength(25);
      expect(auditService.listAuditEntries).toHaveBeenCalledWith(
        TENANT,
        {},
        { limit: 25, cursor: undefined },
      );
    });

    it('clamps limit to maximum 1000', async () => {
      (auditService.listAuditEntries as any).mockResolvedValue({
        entries: [],
        nextCursor: undefined,
      });

      await controller.listAuditEntries('2000');

      expect(auditService.listAuditEntries).toHaveBeenCalledWith(
        TENANT,
        {},
        { limit: 2000, cursor: undefined },
      );
    });

    it('handles cursor parameter for pagination', async () => {
      (auditService.listAuditEntries as any).mockResolvedValue({
        entries: [],
        nextCursor: undefined,
      });

      const testCursor = '2026-03-15T09:00:00.000Z';
      await controller.listAuditEntries('50', testCursor);

      expect(auditService.listAuditEntries).toHaveBeenCalledWith(
        TENANT,
        {},
        { limit: 50, cursor: testCursor },
      );
    });

    it('filters by event_type if provided', async () => {
      (auditService.listAuditEntries as any).mockResolvedValue({
        entries: [],
        nextCursor: undefined,
      });

      await controller.listAuditEntries(
        undefined,
        undefined,
        'SUGGESTION_APPROVED',
      );

      expect(auditService.listAuditEntries).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ eventType: 'SUGGESTION_APPROVED' }),
        expect.any(Object),
      );
    });

    it('enforces tenant isolation', async () => {
      (auditService.listAuditEntries as any).mockResolvedValue({
        entries: [],
        nextCursor: undefined,
      });

      await controller.listAuditEntries();

      const callArgs = (auditService.listAuditEntries as any).mock.calls[0];
      expect(callArgs[0].operatorId).toBe(OPERATOR_ID);
    });
  });
});
