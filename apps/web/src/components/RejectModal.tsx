/**
 * RejectModal.tsx
 * ---------------
 * Agentic Scheduler — FSP Integration — Rejection reason modal
 * ---
 * Client component that displays a modal requiring a reason before rejecting a suggestion.
 * The reason field is required and validated before submission.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-19 — Approval Queue UI
 */

'use client';

import { useState } from 'react';

interface RejectModalProps {
  isOpen: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function RejectModal({ isOpen, onConfirm, onCancel }: RejectModalProps): JSX.Element | null {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }
    setError('');
    onConfirm(reason);
    setReason('');
  };

  const handleCancel = () => {
    setReason('');
    setError('');
    onCancel();
  };

  return (
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
      onClick={handleCancel}
    >
      <div
        style={{
          backgroundColor: 'var(--color-bg)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          padding: '1.5rem',
          maxWidth: '500px',
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Reject Suggestion</h2>

        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Please provide a reason for rejecting this suggestion.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label
            htmlFor="reject-reason"
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--color-text-primary)',
            }}
          >
            Reason <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError('');
            }}
            placeholder="Enter rejection reason..."
            rows={4}
            style={{
              padding: '0.75rem',
              border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-border)'}`,
              borderRadius: '4px',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              resize: 'vertical',
            }}
          />
          {error && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>{error}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '0.75rem 1.5rem',
              border: `1px solid var(--color-border)`,
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: 'var(--color-text-primary)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                'var(--color-bg-secondary)';
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'var(--color-error)',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            }}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
