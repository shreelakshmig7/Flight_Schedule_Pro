/**
 * DashboardView.tsx
 * -----------------
 * Agentic Scheduler — FSP Integration — Dashboard client component
 * -------------------------------------------------------
 * Main dashboard view component. Fetches metrics from the API and
 * displays them as a grid of metric cards with sparkline trends.
 * Handles responsive layout from 375px to 1440px wide.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-24 — Operator Dashboard
 */

'use client';

import { useEffect, useState } from 'react';
import { fetchDashboardMetrics } from '@/lib/api-client';
import type { DashboardMetrics } from '@/lib/api-client';
import { MetricCard } from './MetricCard';

/**
 * Dashboard view component.
 * Fetches and displays all dashboard metrics in a responsive grid.
 */
export function DashboardView(): JSX.Element {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchDashboardMetrics();
        setMetrics(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load dashboard metrics';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadMetrics();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Loading metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'red', padding: '2rem' }}>
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>No metrics available</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem',
        minHeight: '100vh',
        padding: '1rem',
      }}
    >
      <MetricCard
        title="Aircraft Utilisation"
        value={metrics.cUtil.value}
        unit="%"
        trendPoints={metrics.cUtil.trendPoints}
      />

      <MetricCard
        title="Acceptance Rate"
        value={metrics.acceptanceRate.value}
        unit="%"
        subtitle={`Previous: ${metrics.acceptanceRate.previousPeriod}%`}
        trendPoints={metrics.acceptanceRate.trendPoints}
      />

      <MetricCard
        title="Time to Fill"
        value={metrics.timeToFill.value}
        unit="seconds"
        trendPoints={metrics.timeToFill.trendPoints}
      />

      <MetricCard
        title="Weekly Flight Hours"
        value={metrics.weeklyFlightHours.thisWeek}
        unit="hours"
        subtitle={`Previous: ${metrics.weeklyFlightHours.previousWeek} hours`}
      />

      <div
        style={{
          gridColumn: 'span 1',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '1.5rem',
          backgroundColor: '#f9f9f9',
        }}
      >
        <h3>Queue Health</h3>
        <div style={{ marginTop: '1rem' }}>
          <p>Total PENDING: {metrics.queueHealth.total}</p>
          {Object.entries(metrics.queueHealth.counts).map(([useCase, count]) => (
            <div key={useCase} style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              <strong>{useCase}:</strong> {count}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          gridColumn: 'span 1',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '1.5rem',
          backgroundColor: '#f9f9f9',
          fontSize: '0.85rem',
          color: '#666',
        }}
      >
        <p>Last updated: {new Date(metrics.lastUpdated).toLocaleString()}</p>
      </div>
    </div>
  );
}
