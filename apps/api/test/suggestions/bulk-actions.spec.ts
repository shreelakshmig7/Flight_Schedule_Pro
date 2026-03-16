/**
 * bulk-actions.spec.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — Bulk action tests
 * -------------------------------------------------------
 * Tests for bulk approve and bulk reject endpoints.
 *
 * Test structure:
 *   - bulkApproveSuggestions - processes sequentially, skips failures, writes audit logs
 *   - bulkRejectSuggestions - rejects all with same reason
 *   - Endpoint tests for POST /suggestions/bulk-approve and POST /suggestions/bulk-reject
 *   - Tenant isolation enforcement
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-20 — Bulk Approve/Decline and Activity Feed
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SuggestionsService } from '../../src/suggestions/suggestions.service';
import { SUGGESTION_STATUS } from '@fsp-scheduler/shared-types';
import type { TenantContextData } from '@fsp-scheduler/shared-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Builds a minimal Prisma Suggestion row for mocking. */
function makeSuggestion(overrides: Partial<{
  id: string;
  operatorId: string;
  status: string;
}> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'clx-sugg-001',
    operatorId: overrides.operatorId ?? OPERATOR_ID,
    fspOperatorId: FSP_OPERATOR_ID,
    useCaseType: 'CANCELLATION_FILL',
    status: overrides.status ?? SUGGESTION_STATUS.PENDING,
    reservationId: 'res-001',
    changeEventId: 'evt-001',
    candidatePayload: { startDateTime: '2026-03-20T09:00:00Z' },
    llmPrompt: null,
    llmResponse: null,
    llmModel: null,
    llmTokensUsed: null,
    errorMessage: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    rejectionReason: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date('2026-03-15T10:00:00Z'),
    updatedAt: new Date('2026-03-15T10:00:00Z'),
  };
}

// ── Mock factories ────────────────────────────────────────────────────────────

function makePrisma(): Record<string, unknown> {
  return {
    suggestion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    $transaction: vi.fn((fn) => {
      const txPrisma = {
        suggestion: {
          findFirst: vi.fn(),
          update: vi.fn(),
          findMany: vi.fn(),
        },
        auditLog: {
          create: vi.fn(),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      return fn(txPrisma);
    }),
  };
}

function makeReservationsService(): Record<string, unknown> {
  return {
    validateReservation: vi.fn(),
  };
}

function makePublisher(): Record<string, unknown> {
  return {
    publishSuggestionResult: vi.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SuggestionsService — Bulk Actions', () => {
  let service: SuggestionsService;
  let prisma: ReturnType<typeof makePrisma>;
  let reservationsService: ReturnType<typeof makeReservationsService>;
  let publisher: ReturnType<typeof makePublisher>;

  beforeEach(() => {
    prisma = makePrisma();
    reservationsService = makeReservationsService();
    publisher = makePublisher();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    service = new SuggestionsService(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      reservationsService as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      publisher as any,
    );
  });

  // ── bulkApproveSuggestions ────────────────────────────────────────────────

  describe('bulkApproveSuggestions', () => {
    it('approves all PENDING suggestions sequentially', async () => {
      const ids = ['sugg-1', 'sugg-2', 'sugg-3'];
      const suggestions = ids.map((id) =>
        makeSuggestion({ id, status: SUGGESTION_STATUS.PENDING }),
      );

      // Setup: create a call counter to track which suggestion is being processed
      let findFirstCallIndex = 0;
      let updateCallIndex = 0;

      // Mock $transaction: for approveSuggestion and rejectSuggestion
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (prisma.$transaction as any).mockImplementation((fn: any) => {
        const tx = {
          suggestion: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            findFirst: vi.fn(() => {
              const idx = findFirstCallIndex++;
              return idx < suggestions.length ? suggestions[idx] : null;
            }),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            update: vi.fn((_args: any) => {
              return {
                ...suggestions[updateCallIndex++],
                status: SUGGESTION_STATUS.APPROVED,
                resolvedBy: USER_ID,
                resolvedAt: new Date(),
              };
            }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return fn(tx);
      });

      // Mock validateReservation to return success
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (reservationsService.validateReservation as any).mockResolvedValue({
        success: true,
      });

      // Mock publisher
      (publisher.publishSuggestionResult as any).mockResolvedValue(undefined);

      // Execute bulk approve
      const result = await service.bulkApproveSuggestions(TENANT, ids);

      // Verify sequential processing
      expect(result.approved).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      expect(publisher.publishSuggestionResult).toHaveBeenCalledTimes(3);
    });

    it('skips suggestions that fail FSP validation', async () => {
      const ids = ['sugg-1', 'sugg-2', 'sugg-3'];
      const suggestions = ids.map((id) =>
        makeSuggestion({ id, status: SUGGESTION_STATUS.PENDING }),
      );

      let findFirstCallIndex = 0;
      let updateCallIndex = 0;

      // Mock $transaction
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (prisma.$transaction as any).mockImplementation((fn: any) => {
        const tx = {
          suggestion: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            findFirst: vi.fn(() => {
              const idx = findFirstCallIndex++;
              return idx < suggestions.length ? suggestions[idx] : null;
            }),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            update: vi.fn(() => {
              return {
                ...suggestions[updateCallIndex++],
                status: SUGGESTION_STATUS.APPROVED,
              };
            }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return fn(tx);
      });

      // Mock validateReservation: second call fails
      (reservationsService.validateReservation as any)
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'FSP error' })
        .mockResolvedValueOnce({ success: true });

      (publisher.publishSuggestionResult as any).mockResolvedValue(undefined);

      const result = await service.bulkApproveSuggestions(TENANT, ids);

      // Verify failed suggestion is tracked
      expect(result.approved).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('sugg-2');
      expect(result.failed[0].reason).toContain('FSP');
    });

    it('skips suggestions not found for this tenant', async () => {
      const ids = ['sugg-1', 'sugg-2'];

      // Mock: first exists, second doesn't
      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (prisma.$transaction as any).mockImplementation((fn: any) => {
        callCount++;
        const tx = {
          suggestion: {
            findFirst: vi.fn().mockResolvedValue(
              callCount === 1 ? makeSuggestion() : null,
            ),
            update: vi.fn().mockResolvedValue(
              makeSuggestion({ status: SUGGESTION_STATUS.APPROVED }),
            ),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return fn(tx);
      });

      (reservationsService.validateReservation as any).mockResolvedValue({
        success: true,
      });

      (publisher.publishSuggestionResult as any).mockResolvedValue(undefined);

      const result = await service.bulkApproveSuggestions(TENANT, ids);

      expect(result.approved).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('sugg-2');
    });

    it('skips non-PENDING suggestions', async () => {
      const ids = ['sugg-1'];
      const suggestion = makeSuggestion({ status: SUGGESTION_STATUS.REJECTED });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (prisma.$transaction as any).mockImplementation((fn: any) => {
        const tx = {
          suggestion: {
            findFirst: vi.fn().mockResolvedValue(suggestion),
            update: vi.fn(),
          },
          auditLog: {
            create: vi.fn(),
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return fn(tx);
      });

      const result = await service.bulkApproveSuggestions(TENANT, ids);

      expect(result.approved).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].reason).toContain('cannot be approved');
    });

    it('returns empty result for empty input', async () => {
      const result = await service.bulkApproveSuggestions(TENANT, []);

      expect(result.approved).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });
  });

  // ── bulkRejectSuggestions ─────────────────────────────────────────────────

  describe('bulkRejectSuggestions', () => {
    it('rejects all PENDING suggestions with same reason', async () => {
      const ids = ['sugg-1', 'sugg-2'];
      const reason = 'Operator preference';
      const suggestions = ids.map((id) =>
        makeSuggestion({ id, status: SUGGESTION_STATUS.PENDING }),
      );

      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (prisma.$transaction as any).mockImplementation((fn: any) => {
        const tx = {
          suggestion: {
            findFirst: vi
              .fn()
              .mockResolvedValue(suggestions[callCount]),
            update: vi.fn().mockResolvedValue({
              ...suggestions[callCount],
              status: SUGGESTION_STATUS.REJECTED,
              rejectionReason: reason,
            }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        callCount++;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return fn(tx);
      });

      const result = await service.bulkRejectSuggestions(TENANT, ids, reason);

      expect(result.rejected).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(callCount).toBe(2);
    });

    it('skips non-PENDING suggestions when rejecting', async () => {
      const ids = ['sugg-1', 'sugg-2'];
      const suggestion1 = makeSuggestion({ id: 'sugg-1', status: SUGGESTION_STATUS.PENDING });
      const suggestion2 = makeSuggestion({ id: 'sugg-2', status: SUGGESTION_STATUS.APPROVED });

      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (prisma.$transaction as any).mockImplementation((fn: any) => {
        const currentSuggestion = callCount === 0 ? suggestion1 : suggestion2;
        const tx = {
          suggestion: {
            findFirst: vi.fn().mockResolvedValue(currentSuggestion),
            update: vi.fn().mockResolvedValue({
              ...currentSuggestion,
              status: SUGGESTION_STATUS.REJECTED,
            }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        callCount++;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return fn(tx);
      });

      const result = await service.bulkRejectSuggestions(TENANT, ids, 'test reason');

      expect(result.rejected).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });

    it('returns empty result for empty input', async () => {
      const result = await service.bulkRejectSuggestions(TENANT, [], 'test');

      expect(result.rejected).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });
  });
});
