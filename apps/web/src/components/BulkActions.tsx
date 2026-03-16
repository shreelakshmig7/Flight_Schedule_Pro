/**
 * BulkActions.tsx
 * ---------------
 * Agentic Scheduler — FSP Integration — Bulk actions component
 * ---------------------------------------------------------------
 * Displays bulk approve and reject buttons with progress indicators.
 * Shows number of selected suggestions and manages action state.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-20 — Bulk Approve/Decline and Activity Feed
 */

'use client';

import { useState } from 'react';
import {
  bulkApproveSuggestions,
  bulkRejectSuggestions,
} from '../lib/api-client';

export interface BulkActionsProps {
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  onActionComplete: () => void;
  onError: (error: string) => void;
}

/**
 * Bulk actions component with approve/reject buttons.
 */
export function BulkActions({
  selectedIds,
  onSelectedChange,
  onActionComplete,
  onError,
}: BulkActionsProps): JSX.Element {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: selectedIds.length });

    try {
      await bulkApproveSuggestions(selectedIds);
      setProgress({ current: selectedIds.length, total: selectedIds.length });

      // Clear selection and refresh
      onSelectedChange([]);
      setTimeout(() => {
        onActionComplete();
      }, 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to bulk approve';
      onError(message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.length === 0 || !rejectReason.trim()) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: selectedIds.length });

    try {
      await bulkRejectSuggestions(selectedIds, rejectReason);
      setProgress({ current: selectedIds.length, total: selectedIds.length });

      // Clear selection and refresh
      onSelectedChange([]);
      setShowRejectReason(false);
      setRejectReason('');
      setTimeout(() => {
        onActionComplete();
      }, 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to bulk reject';
      onError(message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleCancelReject = () => {
    setShowRejectReason(false);
    setRejectReason('');
  };

  if (selectedIds.length === 0) {
    return <div />;
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        padding: '1rem',
        backgroundColor: 'var(--color-bg-secondary)',
        borderRadius: '4px',
        marginBottom: '1rem',
        alignItems: 'center',
      }}
    >
      {/* Selection info */}
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>
          {selectedIds.length} suggestion{selectedIds.length !== 1 ? 's' : ''} selected
        </p>
        {progress && (
          <div
            style={{
              marginTop: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            Processing: {progress.current} of {progress.total}
          </div>
        )}
      </div>

      {/* Reject reason modal (if visible) */}
      {showRejectReason && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '2rem',
              minWidth: '400px',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 1rem 0' }}>Reject {selectedIds.length} Suggestions</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Provide a reason for rejecting these suggestions. The same reason will be applied to all selected items.
            </p>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="E.g., Operator preference, schedule conflict, etc."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid var(--color-border)',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                marginBottom: '1rem',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancelReject}
                disabled={isProcessing}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'transparent',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  opacity: isProcessing ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkReject}
                disabled={isProcessing || !rejectReason.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'var(--color-error)',
                  color: '#fff',
                  cursor: isProcessing || !rejectReason.trim() ? 'not-allowed' : 'pointer',
                  opacity: isProcessing || !rejectReason.trim() ? 0.5 : 1,
                }}
              >
                {isProcessing ? 'Processing...' : 'Reject All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={handleBulkApprove}
          disabled={isProcessing}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: 'var(--color-success)',
            color: '#fff',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            opacity: isProcessing ? 0.5 : 1,
          }}
        >
          {isProcessing ? 'Approving...' : 'Approve All'}
        </button>
        <button
          onClick={() => setShowRejectReason(true)}
          disabled={isProcessing}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: 'var(--color-error)',
            color: '#fff',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            opacity: isProcessing ? 0.5 : 1,
          }}
        >
          {isProcessing ? 'Rejecting...' : 'Reject All'}
        </button>
      </div>
    </div>
  );
}
