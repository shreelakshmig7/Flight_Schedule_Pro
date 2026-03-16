/**
 * ConfidenceBar.tsx
 * -----------------
 * Agentic Scheduler — FSP Integration — Confidence score visualization
 * ---
 * Client component that displays a confidence score as a percentage bar.
 * Shows a warning indicator when score < 0.6.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-19 — Approval Queue UI
 */

'use client';

interface ConfidenceBarProps {
  score: number; // 0–1
}

export function ConfidenceBar({ score }: ConfidenceBarProps): JSX.Element {
  const percentage = Math.round(score * 100);
  const isLow = score < 0.6;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div
        style={{
          flex: 1,
          height: '24px',
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            backgroundColor: isLow ? 'var(--color-warning)' : 'var(--color-success)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span
        style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          minWidth: '3rem',
          color: isLow ? 'var(--color-warning)' : 'var(--color-text-primary)',
        }}
      >
        {percentage}%
      </span>
      {isLow && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-warning)',
            color: '#fff',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}
          title="Low confidence — review carefully"
        >
          !
        </span>
      )}
    </div>
  );
}
