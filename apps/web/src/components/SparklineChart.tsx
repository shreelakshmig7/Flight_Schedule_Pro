/**
 * SparklineChart.tsx
 * ------------------
 * Agentic Scheduler — FSP Integration — Sparkline chart component
 * ----------------------------------------------------
 * Simple sparkline visualization for trend data.
 * Renders a basic SVG line chart showing 7-day trend.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-24 — Operator Dashboard
 */

'use client';

import type { SparklinePoint } from '@/lib/api-client';

interface SparklineChartProps {
  data: SparklinePoint[];
  height?: number;
}

/**
 * Simple sparkline chart component.
 * Renders a minimal SVG line chart for trend visualization.
 */
export function SparklineChart({ data, height = 60 }: SparklineChartProps): JSX.Element {
  if (!data || data.length === 0) {
    return <div style={{ height: `${height}px`, color: '#999' }}>No data</div>;
  }

  const width = 250;
  const padding = 5;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;

  const values = data.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  // Generate points for the line
  const points = data
    .map((d, i) => {
      const x = padding + (i / (data.length - 1 || 1)) * chartWidth;
      const y =
        padding +
        chartHeight -
        ((d.value - minValue) / range) * chartHeight;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      style={{
        border: '1px solid #eee',
        borderRadius: '4px',
        backgroundColor: '#fff',
      }}
    >
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Gradient fill under line */}
      <polygon
        points={`${padding},${padding + chartHeight} ${points} ${padding + chartWidth},${padding + chartHeight}`}
        fill="url(#gradient)"
        opacity="0.2"
      />

      {/* Gradient definition */}
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#3b82f6" opacity="0" />
        </linearGradient>
      </defs>

      {/* Data points */}
      {data.map((d, i) => {
        const x = padding + (i / (data.length - 1 || 1)) * chartWidth;
        const y =
          padding +
          chartHeight -
          ((d.value - minValue) / range) * chartHeight;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="2"
            fill="#3b82f6"
          />
        );
      })}
    </svg>
  );
}
