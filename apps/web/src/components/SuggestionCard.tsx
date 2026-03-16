/**
 * SuggestionCard.tsx
 * ---------
 * Agentic Scheduler — FSP Integration — Suggestion card component
 * ---
 * Client component that displays a single suggestion with all details:
 * use case type badge, student/instructor/aircraft info, rationale,
 * confidence bar, constraints, time remaining, and approve/reject buttons.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-19 — Approval Queue UI
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { ConfidenceBar } from './ConfidenceBar';
import type { Suggestion } from '../lib/api-client';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isLoading?: boolean;
}

/**
 * Utility: format ISO timestamp to readable date/time string.
 */
function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

/**
 * Utility: get color for use case type badge.
 */
function getBadgeColor(useCaseType: string): string {
  switch (useCaseType) {
    case 'WAITLIST_FILL':
      return 'var(--color-accent)';
    case 'CANCELLATION_FILL':
      return 'var(--color-warning)';
    case 'NEW_OPENING':
      return 'var(--color-success)';
    case 'DISCOVERY':
      return 'var(--color-accent)';
    case 'NEXT_LESSON':
      return 'var(--color-success)';
    default:
      return 'var(--color-text-secondary)';
  }
}

/**
 * Utility: calculate human-readable time remaining before expiry.
 */
function getTimeRemaining(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'No expiry';

  try {
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const msRemaining = expiryDate.getTime() - now.getTime();

    if (msRemaining <= 0) return 'Expired';

    const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hoursRemaining > 0) {
      return `${hoursRemaining}h ${minutesRemaining}m remaining`;
    }
    return `${minutesRemaining}m remaining`;
  } catch {
    return 'Unknown';
  }
}

export function SuggestionCard({
  suggestion,
  onApprove,
  onReject,
  isLoading = false,
}: SuggestionCardProps): JSX.Element {
  // Parse the LLM response to extract rationale, confidence, and constraint results
  let rationale = 'No rationale available';
  let confidence = 0.5;
  let constraintResults: Record<string, boolean> = {};

  if (suggestion.llmResponse) {
    try {
      const llmData = JSON.parse(suggestion.llmResponse);
      rationale = llmData.rationale || rationale;
      confidence = llmData.confidence ?? 0.5;
      constraintResults = llmData.constraintResults || {};
    } catch {
      // Fallback to default if parsing fails
    }
  }

  const candidateData = suggestion.candidatePayload || {};
  const studentName = `${candidateData.studentFirstName || 'Unknown'} ${candidateData.studentLastName || ''}`.trim();
  const instructorName = candidateData.instructorName || 'Unknown';
  const aircraftTail = candidateData.aircraftTail || 'Unknown';
  const locationName = candidateData.locationName || 'Unknown';
  const slotStart = candidateData.slotStart ? formatDateTime(candidateData.slotStart as string) : 'Unknown';

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '1.5rem',
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        marginBottom: '1rem',
      }}
    >
      {/* Header with badge and status */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              backgroundColor: getBadgeColor(suggestion.useCaseType),
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {suggestion.useCaseType}
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              padding: '0.25rem 0.75rem',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: '4px',
            }}
          >
            {suggestion.status}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          {getTimeRemaining(suggestion.expiresAt)}
        </span>
      </div>

      {/* Student and scheduling details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 0.25rem 0' }}>
            Student
          </p>
          <p style={{fontSize:'1rem',fontWeight:'bold',margin:'0'}}>{studentName}</p>
        </div>

        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 0.25rem 0' }}>
            Proposed Time
          </p>
          <p style={{fontSize:'1rem',fontWeight:'bold',margin:'0'}}>{slotStart}</p>
        </div>

        {/* @ts-expect-error - style typing issue with React */}
        <div><p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 0.25rem 0' }}>Instructor</p><p style={{fontSize:'1rem',fontWeight:'bold',margin:'0'}}>{instructorName}</p></div>
        {/* @ts-expect-error - style typing issue with React */}
        <div><p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 0.25rem 0' }}>Aircraft</p><p style={{fontSize:'1rem',fontWeight:'bold',margin:'0'}}>{aircraftTail}</p></div>
        {/* @ts-expect-error - style typing issue with React */}
        <div><p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 0.25rem 0' }}>Location</p><p style={{fontSize:'1rem',fontWeight:'bold',margin:'0'}}>{locationName}</p></div>
      </div>

      {/* Rationale */}
      <div>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem 0', fontWeight: 600 }}>
          Rationale
        </p>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            lineHeight: 1.5,
            color: 'var(--color-text-primary)',
          }}
        >
          {rationale}
        </p>
      </div>

      {/* Confidence score */}
      <div>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem 0', fontWeight: 600 }}>
          Confidence
        </p>
        <ConfidenceBar score={confidence} />
      </div>

      {/* Constraint results */}
      {Object.keys(constraintResults).length > 0 && (
        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem 0', fontWeight: 600 }}>
            Constraints
          </p>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            {Object.entries(constraintResults).map(([constraint, passed]) => (
              <li
                key={constraint}
                style={{
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: passed ? 'var(--color-success)' : 'var(--color-error)',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'currentColor',
                  }}
                />
                {constraint}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      {suggestion.status === 'PENDING' && (
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end',
            marginTop: '0.5rem',
          }}
        >
          <button
            onClick={() => onReject(suggestion.id)}
            disabled={isLoading}
            style={{
              padding: '0.75rem 1.5rem',
              border: `1px solid var(--color-error)`,
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: 'var(--color-error)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              if (!isLoading) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-error)';
                (e.currentTarget as HTMLButtonElement).style.color = '#fff';
              }
            }}
            onMouseOut={(e) => {
              if (!isLoading) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-error)';
              }
            }}
          >
            Reject
          </button>
          <button
            onClick={() => onApprove(suggestion.id)}
            disabled={isLoading}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'var(--color-success)',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              if (!isLoading) {
                (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
              }
            }}
            onMouseOut={(e) => {
              if (!isLoading) {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              }
            }}
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
}
