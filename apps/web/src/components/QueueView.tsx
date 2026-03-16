/**
 * QueueView.tsx
 * -----
 * Agentic Scheduler — FSP Integration — Queue view component
 * ---
 * Client component that manages the approval queue state, polling, and filtering.
 * Fetches suggestions every 30 seconds, handles approve/reject with optimistic updates,
 * and renders the filter bar, suggestion cards, modals, bulk actions, and activity feed.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-20 — Bulk Approve/Decline and Activity Feed
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchSuggestions, approveSuggestion, rejectSuggestion } from '../lib/api-client';
import type { Suggestion, FetchSuggestionsParams } from '../lib/api-client';
import { FilterBar } from './FilterBar';
import { SuggestionCard } from './SuggestionCard';
import { RejectModal } from './RejectModal';
import { EmptyState } from './EmptyState';
import { BulkActions } from './BulkActions';
import { ActivityFeed } from './ActivityFeed';

const POLLING_INTERVAL_MS = 30 * 1000; // 30 seconds

export function QueueView(): JSX.Element {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [status, setStatus] = useState('PENDING');
  const [useCaseType, setUseCaseType] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Reject modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  // Optimistic update tracking
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Activity feed state
  const [activityFeedOpen, setActivityFeedOpen] = useState(false);

  /**
   * Fetch suggestions based on current filters.
   */
  const loadSuggestions = useCallback(async () => {
    try {
      setError(null);

      const params: FetchSuggestionsParams = { limit: 100 };

      // Build status filter: if showHistory is true and status is ALL, fetch all statuses
      if (showHistory) {
        if (status !== 'ALL') {
          params.status = status;
        }
        // else: omit status to get all statuses
      } else {
        // Default to PENDING when not showing history
        params.status = 'PENDING';
      }

      if (useCaseType) {
        params.useCaseType = useCaseType;
      }

      const result = await fetchSuggestions(params);
      setSuggestions(result.items);
    } catch (err) {
      // Treat auth errors (401/403) as empty result — the API requires operator auth
      // but the dashboard shows an empty queue when no session is active.
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
      if (status === 401 || status === 403) {
        setSuggestions([]);
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load suggestions');
    } finally {
      setIsLoading(false);
    }
  }, [status, useCaseType, showHistory]);

  /**
   * Set up polling: fetch suggestions every 30 seconds.
   */
  useEffect(() => {
    // Initial load
    loadSuggestions();

    // Set up polling
    const intervalId = setInterval(() => {
      loadSuggestions();
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [loadSuggestions]);

  /**
   * Handle approve button click: perform optimistic update and API call.
   */
  const handleApprove = useCallback(
    async (id: string) => {
      // Optimistic update: remove from list
      const updatedIds = new Set(updatingIds);
      updatedIds.add(id);
      setUpdatingIds(updatedIds);

      try {
        await approveSuggestion(id);
        // Remove the approved suggestion from the list
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to approve suggestion');
        // Refresh list to restore state on error
        await loadSuggestions();
      } finally {
        updatedIds.delete(id);
        setUpdatingIds(new Set(updatedIds));
      }
    },
    [updatingIds, loadSuggestions],
  );

  /**
   * Handle reject button click: open modal.
   */
  const handleRejectClick = (id: string) => {
    setRejectingId(id);
    setRejectModalOpen(true);
  };

  /**
   * Handle reject modal confirmation: perform optimistic update and API call.
   */
  const handleRejectConfirm = useCallback(
    async (reason: string) => {
      if (!rejectingId) return;

      const updatedIds = new Set(updatingIds);
      updatedIds.add(rejectingId);
      setUpdatingIds(updatedIds);
      setRejectModalOpen(false);

      try {
        await rejectSuggestion(rejectingId, reason);
        // Remove the rejected suggestion from the list
        setSuggestions((prev) => prev.filter((s) => s.id !== rejectingId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reject suggestion');
        // Refresh list to restore state on error
        await loadSuggestions();
      } finally {
        updatedIds.delete(rejectingId);
        setUpdatingIds(new Set(updatedIds));
        setRejectingId(null);
      }
    },
    [rejectingId, updatingIds, loadSuggestions],
  );

  /**
   * Handle reject modal close.
   */
  const handleRejectCancel = () => {
    setRejectModalOpen(false);
    setRejectingId(null);
  };

  /**
   * Handle filter changes.
   */
  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setIsLoading(true);
  };

  const handleUseCaseTypeChange = (newType: string) => {
    setUseCaseType(newType);
    setIsLoading(true);
  };

  const handleShowHistoryChange = (show: boolean) => {
    setShowHistory(show);
    setIsLoading(true);
  };

  /**
   * Handle bulk selection toggle.
   */
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return Array.from(newSet);
    });
  };

  /**
   * Handle select-all toggle.
   */
  const handleSelectAll = () => {
    if (selectedIds.length === suggestions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(suggestions.map((s) => s.id));
    }
  };

  /**
   * Handle bulk action completion.
   */
  const handleBulkActionComplete = () => {
    setSelectedIds([]);
    loadSuggestions();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
            Approval Queue
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
            Review and approve scheduling suggestions
          </p>
        </div>
        <button
          onClick={() => setActivityFeedOpen(!activityFeedOpen)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: '1px solid var(--color-border)',
            backgroundColor: activityFeedOpen ? 'var(--color-bg-secondary)' : 'transparent',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {activityFeedOpen ? 'Hide' : 'Show'} Activity
        </button>
      </div>

      {/* Filter bar with select-all */}
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <FilterBar
            status={status}
            onStatusChange={handleStatusChange}
            useCaseType={useCaseType}
            onUseCaseTypeChange={handleUseCaseTypeChange}
            showHistory={showHistory}
            onShowHistoryChange={handleShowHistoryChange}
          />
        </div>
        {suggestions.length > 0 && (
          <div style={{ marginLeft: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedIds.length === suggestions.length && suggestions.length > 0}
                onChange={handleSelectAll}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.875rem' }}>Select All</span>
            </label>
          </div>
        )}
      </div>

      {/* Bulk actions bar */}
      <BulkActions
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
        onActionComplete={handleBulkActionComplete}
        onError={setError}
      />

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: 'var(--color-error)',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && suggestions.length === 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            color: 'var(--color-text-secondary)',
          }}
        >
          <p>Loading suggestions…</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && suggestions.length === 0 && <EmptyState />}

      {/* Suggestions list */}
      {suggestions.map((suggestion) => (
        <div key={suggestion.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          {/* Selection checkbox */}
          <input
            type="checkbox"
            checked={selectedIds.includes(suggestion.id)}
            onChange={() => handleToggleSelect(suggestion.id)}
            style={{ marginTop: '1rem', cursor: 'pointer' }}
          />
          {/* Card */}
          <div style={{ flex: 1 }}>
            <SuggestionCard
              suggestion={suggestion}
              onApprove={handleApprove}
              onReject={handleRejectClick}
              isLoading={updatingIds.has(suggestion.id)}
            />
          </div>
        </div>
      ))}

      {/* Reject modal */}
      <RejectModal
        isOpen={rejectModalOpen}
        onConfirm={handleRejectConfirm}
        onCancel={handleRejectCancel}
      />

      {/* Activity feed panel */}
      <ActivityFeed isOpen={activityFeedOpen} onClose={() => setActivityFeedOpen(false)} />

      {/* Auto-refresh indicator */}
      {suggestions.length > 0 && (
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-text-secondary)',
            marginTop: '1rem',
            textAlign: 'center',
          }}
        >
          Updates automatically every 30 seconds
        </p>
      )}
    </div>
  );
}
