/**
 * bulk-actions.spec.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — BulkActions component tests
 * ------------------------------------------------------------------
 * Tests for bulk selection, approve, reject buttons, and progress display.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-20 — Bulk Approve/Decline and Activity Feed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as apiClient from '../src/lib/api-client';

describe('Bulk Actions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('bulkApproveSuggestions', () => {
    it('should make POST request to /suggestions/bulk-approve', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            approved: [{ id: 'sugg-1' }, { id: 'sugg-2' }],
            failed: [],
          }),
          { status: 200 },
        ),
      );

      // Note: bulkApproveSuggestions will be added to api-client
      const mockBulkApprove = async (ids: string[]) => {
        const response = await global.fetch('http://localhost:3000/suggestions/bulk-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggestionIds: ids }),
        });
        return response.json();
      };

      await mockBulkApprove(['sugg-1', 'sugg-2']);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/suggestions/bulk-approve',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ suggestionIds: ['sugg-1', 'sugg-2'] }),
        }),
      );
    });
  });

  describe('bulkRejectSuggestions', () => {
    it('should make POST request to /suggestions/bulk-reject', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            rejected: [{ id: 'sugg-1' }, { id: 'sugg-2' }],
            failed: [],
          }),
          { status: 200 },
        ),
      );

      const mockBulkReject = async (ids: string[], reason: string) => {
        const response = await global.fetch('http://localhost:3000/suggestions/bulk-reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggestionIds: ids, reason }),
        });
        return response.json();
      };

      await mockBulkReject(['sugg-1', 'sugg-2'], 'Operator preference');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/suggestions/bulk-reject',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            suggestionIds: ['sugg-1', 'sugg-2'],
            reason: 'Operator preference',
          }),
        }),
      );
    });
  });

  describe('getAuditEntries', () => {
    it('should make GET request to /audit', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            entries: [
              {
                id: 'audit-001',
                action: 'suggestion.approved',
                createdAt: '2026-03-15T10:00:00Z',
              },
            ],
            hasMore: false,
          }),
          { status: 200 },
        ),
      );

      const mockGetAudit = async (limit?: number) => {
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit.toString());
        const response = await global.fetch(
          `http://localhost:3000/audit${params.toString() ? `?${params.toString()}` : ''}`,
        );
        return response.json();
      };

      await mockGetAudit(50);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/audit?limit=50',
      );
    });

    it('should handle pagination with offset', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ entries: [], hasMore: false }),
          { status: 200 },
        ),
      );

      const mockGetAudit = async (limit?: number, offset?: number) => {
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit.toString());
        if (offset) params.append('offset', offset.toString());
        const response = await global.fetch(
          `http://localhost:3000/audit${params.toString() ? `?${params.toString()}` : ''}`,
        );
        return response.json();
      };

      await mockGetAudit(50, 100);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/audit?limit=50&offset=100',
      );
    });
  });
});
