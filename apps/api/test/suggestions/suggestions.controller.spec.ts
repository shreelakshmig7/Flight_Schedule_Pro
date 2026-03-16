/**
 * suggestions.controller.spec.ts
 * --------------------------------
 * Agentic Scheduler — FSP Integration — SuggestionsController unit tests
 * -----------------------------------------------------------------------
 * Tests HTTP-layer behaviour: correct delegation to SuggestionsService,
 * tenant context passing, pagination shape, and HTTP status codes.
 *
 * Test structure:
 *   - GET  /suggestions        → delegates to listSuggestions with parsed query
 *   - POST /suggestions        → delegates to createSuggestion; returns 201 body
 *   - POST /suggestions/:id/approve → delegates to approveSuggestion; returns 200
 *   - POST /suggestions/:id/reject  → delegates to rejectSuggestion; returns 200
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-10 — Suggestion State Machine
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuggestionsController } from '../../src/suggestions/suggestions.controller';
import { SuggestionsService } from '../../src/suggestions/suggestions.service';
import { TenantContext } from '../../src/auth/tenant-context';
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

const SUGGESTION_ID = 'clx-sugg-001';

function makeSuggestionRow(status = SUGGESTION_STATUS.PENDING) {
  return {
    id: SUGGESTION_ID,
    operatorId: OPERATOR_ID,
    fspOperatorId: FSP_OPERATOR_ID,
    useCaseType: 'CANCELLATION_FILL',
    status,
    reservationId: 'res-001',
    changeEventId: 'evt-001',
    candidatePayload: {},
    llmPrompt: null,
    llmResponse: null,
    llmModel: null,
    llmTokensUsed: null,
    errorMessage: null,
    expiresAt: new Date('2026-03-16T10:00:00Z'),
    rejectionReason: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date('2026-03-15T10:00:00Z'),
    updatedAt: new Date('2026-03-15T10:00:00Z'),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SuggestionsController', () => {
  let controller: SuggestionsController;
  let suggestionsService: SuggestionsService;
  let tenantContext: TenantContext;

  beforeEach(() => {
    tenantContext = new TenantContext();
    tenantContext.set(TENANT);

    suggestionsService = {
      createSuggestion: vi.fn(),
      approveSuggestion: vi.fn(),
      rejectSuggestion: vi.fn(),
      listSuggestions: vi.fn(),
    } as unknown as SuggestionsService;

    controller = new SuggestionsController(suggestionsService, tenantContext);
  });

  // ── GET /suggestions ───────────────────────────────────────────────────────

  describe('GET /suggestions', () => {
    it('delegates to listSuggestions with tenant and parsed query params', async () => {
      const paginatedResult = {
        items: [makeSuggestionRow()],
        hasNextPage: false,
        nextCursor: null,
      };
      vi.mocked(suggestionsService.listSuggestions).mockResolvedValue(paginatedResult);

      const query = { limit: '20', status: SUGGESTION_STATUS.PENDING };
      const result = await controller.list(query);

      expect(suggestionsService.listSuggestions).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({
          limit: 20,
          status: SUGGESTION_STATUS.PENDING,
        }),
      );
      expect(result).toEqual(paginatedResult);
    });

    it('uses default limit of 20 when not supplied', async () => {
      vi.mocked(suggestionsService.listSuggestions).mockResolvedValue({
        items: [],
        hasNextPage: false,
        nextCursor: null,
      });

      await controller.list({});

      expect(suggestionsService.listSuggestions).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ limit: 20 }),
      );
    });

    it('passes afterCursor from query to service', async () => {
      vi.mocked(suggestionsService.listSuggestions).mockResolvedValue({
        items: [],
        hasNextPage: false,
        nextCursor: null,
      });

      await controller.list({ after: 'clx-cursor-id' });

      expect(suggestionsService.listSuggestions).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ afterCursor: 'clx-cursor-id' }),
      );
    });
  });

  // ── POST /suggestions ──────────────────────────────────────────────────────

  describe('POST /suggestions', () => {
    it('delegates to createSuggestion and returns the created row', async () => {
      const created = makeSuggestionRow(SUGGESTION_STATUS.PENDING);
      vi.mocked(suggestionsService.createSuggestion).mockResolvedValue(created);

      const dto = {
        useCaseType: 'CANCELLATION_FILL' as const,
        reservationId: 'res-001',
        changeEventId: 'evt-001',
        candidatePayload: { startDateTime: '2026-03-20T09:00:00Z' },
        expiresAt: '2026-03-16T10:00:00Z',
      };

      const result = await controller.create(dto);

      expect(suggestionsService.createSuggestion).toHaveBeenCalledWith(TENANT, dto);
      expect(result).toEqual(created);
    });
  });

  // ── POST /suggestions/:id/approve ─────────────────────────────────────────

  describe('POST /suggestions/:id/approve', () => {
    it('delegates to approveSuggestion and returns the updated row', async () => {
      const approved = makeSuggestionRow(SUGGESTION_STATUS.APPROVED);
      vi.mocked(suggestionsService.approveSuggestion).mockResolvedValue(approved);

      const result = await controller.approve(SUGGESTION_ID);

      expect(suggestionsService.approveSuggestion).toHaveBeenCalledWith(TENANT, SUGGESTION_ID);
      expect(result.status).toBe(SUGGESTION_STATUS.APPROVED);
    });
  });

  // ── POST /suggestions/:id/reject ──────────────────────────────────────────

  describe('POST /suggestions/:id/reject', () => {
    it('delegates to rejectSuggestion with the supplied reason', async () => {
      const rejected = makeSuggestionRow(SUGGESTION_STATUS.REJECTED);
      vi.mocked(suggestionsService.rejectSuggestion).mockResolvedValue(rejected);

      const result = await controller.reject(SUGGESTION_ID, { reason: 'Schedule conflict' });

      expect(suggestionsService.rejectSuggestion).toHaveBeenCalledWith(
        TENANT,
        SUGGESTION_ID,
        'Schedule conflict',
      );
      expect(result.status).toBe(SUGGESTION_STATUS.REJECTED);
    });

    it('passes empty reason string when reason is omitted from body', async () => {
      const rejected = makeSuggestionRow(SUGGESTION_STATUS.REJECTED);
      vi.mocked(suggestionsService.rejectSuggestion).mockResolvedValue(rejected);

      await controller.reject(SUGGESTION_ID, {});

      expect(suggestionsService.rejectSuggestion).toHaveBeenCalledWith(
        TENANT,
        SUGGESTION_ID,
        '',
      );
    });
  });
});
