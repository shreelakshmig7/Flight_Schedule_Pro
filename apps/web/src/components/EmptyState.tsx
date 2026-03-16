/**
 * EmptyState.tsx
 * ---------------
 * Agentic Scheduler — FSP Integration — Empty state component
 * ---
 * Client component shown when no suggestions exist in the queue.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-19 — Approval Queue UI
 */

'use client';

export function EmptyState(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        No pending suggestions
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Your approval queue is empty. Pending suggestions will appear here.
      </p>
    </div>
  );
}
