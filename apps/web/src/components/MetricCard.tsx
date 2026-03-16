/**
 * MetricCard.tsx
 * --------------
 * Agentic Scheduler — FSP Integration — Metric card component
 * ----------------------------------------------------------
 * Reusable metric display card showing a title, value, unit,
 * optional subtitle, and sparkline trend visualization.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-24 — Operator Dashboard
 */

'use client';

import type { SparklinePoint } from '@/lib/api-client';
import { SparklineChart } from './SparklineChart';

interface MetricCardProps {
  title: string;
  value: number;
  unit: string;
  subtitle?: string;
  trendPoints?: SparklinePoint[];
}

/**
 * Metric card component displaying a single metric with optional trend.
 */
export function MetricCard({
  title,
  value,
  unit,
  subtitle,
  trendPoints,
}: MetricCardProps): JSX.Element {
  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '1.5rem',
        backgroundColor: '#f9f9f9',
        minHeight: '200px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>{title}</h3>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '1rem' }}>
          <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{value}</span>
          <span style={{ fontSize: '1rem', marginLeft: '0.5rem', color: '#666' }}>
            {unit}
          </span>
        </div>

        {subtitle && (
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#666' }}>
            {subtitle}
          </p>
        )}

        {trendPoints && trendPoints.length > 0 && (
          <div style={{ flex: 1, minHeight: '60px' }}>
            <SparklineChart data={trendPoints} />
          </div>
        )}
      </div>
    </div>
  );
}
