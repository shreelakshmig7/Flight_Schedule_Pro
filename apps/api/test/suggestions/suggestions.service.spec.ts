/**
 * suggestions.service.spec.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — SuggestionsService unit tests
 * -------------------------------------------------------------------
 * Tests all state machine transitions, FSP validateOnly integration,
 * expiry batch logic, audit log writes, tenant isolation, and cursor
 * pagination for the SuggestionsService.
 *
 * Test structure:
 *   - createSuggestion    → persists PENDING row + writes audit log
 *   - approveSuggestion   → FSP validateOnly passes → APPROVED + publishes SB message
 *   - approveSuggestion   → FSP validateOnly fails  → 409, stays PENDING
 *   - approveSuggestion   → wrong tenant            → throws NotFoundException
 *   - approveSuggestion   → invalid transition (not PENDING) → throws ConflictException
 *   - rejectSuggestion    → PENDING → REJECTED + writes audit log
 *   - rejectSuggestion    → wrong tenant            → throws NotFoundException
 *   - rejectSuggestion    → invalid transition      → throws ConflictException
 *   - expireSuggestions   → batch transitions PENDING→EXPIRED where expiresAt < now
 *   - expireSuggestions   → idempotent: zero rows if nothing eligible
 *   - listSuggestions     → cursor pagination shape, tenant scoping
 *   - listSuggestions     → filters by status and useCaseType
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-10 — Suggestion State Machine
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SuggestionsService } from '../../src/suggestions/suggestions.service';
import { SUGGESTION_STATUS } from '@fsp-scheduler/shared-types';
import type {
  TenantContextData,
  SuggestionResultMessage,
} from '@fsp-scheduler/shared-types';

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

const SUGGESTION_ID = 'clx-sugg-001';
const EXPIRES_AT = new Date(Date.now() + 3_600_000); // 1 h from now

/** Builds a minimal Prisma Suggestion row for mocking. */
function makeSuggestion(overrides: Partial<{
  id: string;
  operatorId: string;
  status: string;
  expiresAt: Date | null;
}> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? SUGGESTION_ID,
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
    expiresAt: overrides.expiresAt !== undefined ? overrides.expiresAt : EXPIRES_AT,
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
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      suggestion: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    })),
  };
}

function makeFspReservationsService(): Record<string, unknown> {
  return {
    validateReservation: vi.fn(),
  };
}

function makeSuggestionResultPublisher(): Record<string, unknown> {
  return {
    publishSuggestionResult: vi.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SuggestionsService', () => {
  let service: SuggestionsService;
  let prisma: ReturnType<typeof makePrisma>;
  let fspReservationsService: ReturnType<typeof makeFspReservationsService>;
  let suggestionResultPublisher: ReturnType<typeof makeSuggestionResultPublisher>;

  beforeEach(() => {
    prisma = makePrisma();
    fspReservationsService = makeFspReservationsService();
    suggestionResultPublisher = makeSuggestionResultPublisher();
    service = new SuggestionsService(
      prisma as never,
      fspReservationsService as never,
      suggestionResultPublisher as never,
    );
  });

  // ── createSuggestion ───────────────────────────────────────────────────────

  describe('createSuggestion', () => {
    it('persists a PENDING suggestion and returns it', async () => {
      const row = makeSuggestion();
      const txSuggestionCreate = vi.fn().mockResolvedValue(row);
      const txAuditCreate = vi.fn().mockResolvedValue({});
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          suggestion: { create: txSuggestionCreate },
          auditLog: { create: txAuditCreate },
        }),
      );

      const dto = {
        useCaseType: 'CANCELLATION_FILL' as const,
        reservationId: 'res-001',
        changeEventId: 'evt-001',
        candidatePayload: { startDateTime: '2026-03-20T09:00:00Z' },
        expiresAt: EXPIRES_AT.toISOString(),
      };

      const result = await service.createSuggestion(TENANT, dto);

      expect(txSuggestionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operatorId: OPERATOR_ID,
            fspOperatorId: FSP_OPERATOR_ID,
            status: SUGGESTION_STATUS.PENDING,
            useCaseType: 'CANCELLATION_FILL',
          }),
        }),
      );
      expect(txAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operatorId: OPERATOR_ID,
            action: 'suggestion.created',
            entityType: 'Suggestion',
          }),
        }),
      );
      expect(result.status).toBe(SUGGESTION_STATUS.PENDING);
    });
  });

  // ── approveSuggestion ──────────────────────────────────────────────────────

  describe('approveSuggestion', () => {
    it('transitions PENDING → APPROVED when FSP validateOnly passes', async () => {
      const row = makeSuggestion();
      const approvedRow = { ...row, status: SUGGESTION_STATUS.APPROVED, resolvedBy: USER_ID, resolvedAt: new Date() };

      const txFindFirst = vi.fn().mockResolvedValue(row);
      const txUpdate = vi.fn().mockResolvedValue(approvedRow);
      const txAuditCreate = vi.fn().mockResolvedValue({});

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          suggestion: { findFirst: txFindFirst, update: txUpdate },
          auditLog: { create: txAuditCreate },
        }),
      );

      fspReservationsService.validateReservation.mockResolvedValue({ success: true, data: {} });
      suggestionResultPublisher.publishSuggestionResult.mockResolvedValue(undefined);

      const result = await service.approveSuggestion(TENANT, SUGGESTION_ID);

      expect(fspReservationsService.validateReservation).toHaveBeenCalledWith(
        String(FSP_OPERATOR_ID),
        expect.objectContaining({ startDateTime: '2026-03-20T09:00:00Z' }),
      );
      expect(txUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SUGGESTION_STATUS.APPROVED,
            resolvedBy: USER_ID,
          }),
        }),
      );
      expect(txAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'suggestion.approved',
          }),
        }),
      );
      expect(suggestionResultPublisher.publishSuggestionResult).toHaveBeenCalledWith(
        expect.objectContaining<Partial<SuggestionResultMessage>>({
          suggestionId: SUGGESTION_ID,
          operatorId: OPERATOR_ID,
          status: 'CREATED',
        }),
      );
      expect(result.status).toBe(SUGGESTION_STATUS.APPROVED);
    });

    it('returns 409 and leaves suggestion PENDING when FSP validateOnly fails', async () => {
      const row = makeSuggestion();

      const txFindFirst = vi.fn().mockResolvedValue(row);

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          suggestion: { findFirst: txFindFirst },
          auditLog: { create: vi.fn() },
        }),
      );

      fspReservationsService.validateReservation.mockResolvedValue({
        success: false,
        error: 'Instructor not available',
        data: null,
        fspErrors: [{ message: 'Instructor not available', code: 'CONFLICT' }],
      });

      await expect(service.approveSuggestion(TENANT, SUGGESTION_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(suggestionResultPublisher.publishSuggestionResult).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when suggestion does not belong to tenant', async () => {
      const txFindFirst = vi.fn().mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          suggestion: { findFirst: txFindFirst },
          auditLog: { create: vi.fn() },
        }),
      );

      await expect(service.approveSuggestion(TENANT, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when suggestion is not in PENDING state', async () => {
      const row = makeSuggestion({ status: SUGGESTION_STATUS.APPROVED });

      const txFindFirst = vi.fn().mockResolvedValue(row);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          suggestion: { findFirst: txFindFirst },
          auditLog: { create: vi.fn() },
        }),
      );

      await expect(service.approveSuggestion(TENANT, SUGGESTION_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── rejectSuggestion ───────────────────────────────────────────────────────

  describe('rejectSuggestion', () => {
    it('transitions PENDING → REJECTED with reason and writes audit log', async () => {
      const row = makeSuggestion();
      const rejectedRow = {
        ...row,
        status: SUGGESTION_STATUS.REJECTED,
        rejectionReason: 'Schedule conflict',
        resolvedBy: USER_ID,
        resolvedAt: new Date(),
      };

      const txFindFirst = vi.fn().mockResolvedValue(row);
      const txUpdate = vi.fn().mockResolvedValue(rejectedRow);
      const txAuditCreate = vi.fn().mockResolvedValue({});

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          suggestion: { findFirst: txFindFirst, update: txUpdate },
          auditLog: { create: txAuditCreate },
        }),
      );

      const result = await service.rejectSuggestion(TENANT, SUGGESTION_ID, 'Schedule conflict');

      expect(txUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SUGGESTION_STATUS.REJECTED,
            rejectionReason: 'Schedule conflict',
            resolvedBy: USER_ID,
          }),
        }),
      );
      expect(txAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'suggestion.rejected',
          }),
        }),
      );
      expect(result.status).toBe(SUGGESTION_STATUS.REJECTED);
    });

    it('throws NotFoundException for cross-tenant rejection attempt', async () => {
      const txFindFirst = vi.fn().mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          suggestion: { findFirst: txFindFirst },
          auditLog: { create: vi.fn() },
        }),
      );

      await expect(
        service.rejectSuggestion(TENANT, 'other-operator-suggestion', 'reason'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when rejecting a non-PENDING suggestion', async () => {
      const row = makeSuggestion({ status: SUGGESTION_STATUS.REJECTED });
      const txFindFirst = vi.fn().mockResolvedValue(row);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          suggestion: { findFirst: txFindFirst },
          auditLog: { create: vi.fn() },
        }),
      );

      await expect(
        service.rejectSuggestion(TENANT, SUGGESTION_ID, 'already done'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── expireSuggestions ──────────────────────────────────────────────────────

  describe('expireSuggestions', () => {
    it('batch-transitions all eligible PENDING → EXPIRED rows', async () => {
      prisma.suggestion.updateMany.mockResolvedValue({ count: 5 });

      const count = await service.expireSuggestions();

      expect(prisma.suggestion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: SUGGESTION_STATUS.PENDING,
            expiresAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
          data: expect.objectContaining({
            status: SUGGESTION_STATUS.EXPIRED,
          }),
        }),
      );
      expect(count).toBe(5);
    });

    it('returns 0 when no rows are eligible for expiry (idempotent)', async () => {
      prisma.suggestion.updateMany.mockResolvedValue({ count: 0 });

      const count = await service.expireSuggestions();

      expect(count).toBe(0);
    });
  });

  // ── listSuggestions ────────────────────────────────────────────────────────

  describe('listSuggestions', () => {
    it('returns cursor-paginated result scoped to tenant operatorId', async () => {
      const rows = [makeSuggestion(), makeSuggestion({ id: 'clx-sugg-002' })];
      prisma.suggestion.findMany.mockResolvedValue(rows);

      const result = await service.listSuggestions(TENANT, { limit: 20 });

      expect(prisma.suggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ operatorId: OPERATOR_ID }),
          take: 21, // limit+1 for hasNextPage detection
          orderBy: expect.objectContaining({ createdAt: 'desc' }),
        }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.hasNextPage).toBe(false);
    });

    it('sets hasNextPage true when result contains limit+1 rows', async () => {
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeSuggestion({ id: `clx-sugg-${i}` }),
      );
      prisma.suggestion.findMany.mockResolvedValue(rows);

      const result = await service.listSuggestions(TENANT, { limit: 20 });

      expect(result.hasNextPage).toBe(true);
      expect(result.items).toHaveLength(20); // returns only `limit` items
    });

    it('filters by status when provided', async () => {
      prisma.suggestion.findMany.mockResolvedValue([]);

      await service.listSuggestions(TENANT, { limit: 20, status: SUGGESTION_STATUS.APPROVED });

      expect(prisma.suggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            operatorId: OPERATOR_ID,
            status: SUGGESTION_STATUS.APPROVED,
          }),
        }),
      );
    });

    it('filters by useCaseType when provided', async () => {
      prisma.suggestion.findMany.mockResolvedValue([]);

      await service.listSuggestions(TENANT, { limit: 20, useCaseType: 'WAITLIST_FILL' });

      expect(prisma.suggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            useCaseType: 'WAITLIST_FILL',
          }),
        }),
      );
    });

    it('uses cursor for pagination when afterCursor is provided', async () => {
      prisma.suggestion.findMany.mockResolvedValue([]);

      await service.listSuggestions(TENANT, { limit: 20, afterCursor: 'clx-cursor-id' });

      expect(prisma.suggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'clx-cursor-id' },
          skip: 1,
        }),
      );
    });
  });
});
