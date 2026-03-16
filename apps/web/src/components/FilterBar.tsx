/**
 * FilterBar.tsx
 * ---------
 * Agentic Scheduler — FSP Integration — Queue filter controls
 * ---
 * Client component that provides filter dropdowns and a show history toggle.
 * Manages status, use case type, and history visibility state.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-19 — Approval Queue UI
 */

'use client';

interface FilterBarProps {
  status: string;
  onStatusChange: (status: string) => void;
  useCaseType: string;
  onUseCaseTypeChange: (type: string) => void;
  showHistory: boolean;
  onShowHistoryChange: (show: boolean) => void;
}

export function FilterBar({
  status,
  onStatusChange,
  useCaseType,
  onUseCaseTypeChange,
  showHistory,
  onShowHistoryChange,
}: FilterBarProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '1rem',
        padding: '1rem',
        backgroundColor: 'var(--color-bg-secondary)',
        borderRadius: '8px',
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label
          htmlFor="filter-status"
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          Status
        </label>
        <select
          id="filter-status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text-primary)',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          <option value="PENDING">Pending</option>
          <option value="ALL">All</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label
          htmlFor="filter-usecase"
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          Use Case
        </label>
        <select
          id="filter-usecase"
          value={useCaseType}
          onChange={(e) => onUseCaseTypeChange(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text-primary)',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          <option value="">All</option>
          <option value="WAITLIST_FILL">Waitlist Fill</option>
          <option value="CANCELLATION_FILL">Cancellation Fill</option>
          <option value="NEW_OPENING">New Opening</option>
          <option value="DISCOVERY">Discovery</option>
          <option value="NEXT_LESSON">Next Lesson</option>
        </select>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '0.5rem',
          marginLeft: 'auto',
        }}
      >
        <label
          htmlFor="show-history"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            id="show-history"
            type="checkbox"
            checked={showHistory}
            onChange={(e) => onShowHistoryChange(e.target.checked)}
            style={{
              cursor: 'pointer',
              width: '16px',
              height: '16px',
            }}
          />
          Show history
        </label>
      </div>
    </div>
  );
}
