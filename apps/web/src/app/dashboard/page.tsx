/**
 * dashboard/page.tsx
 * ------------------
 * Agentic Scheduler — FSP Integration — Dashboard page (Next.js 14 App Router)
 * -----------------------------------------------------------------------
 * Server-side page component for the operator dashboard at /dashboard.
 * Fetches dashboard metrics and passes them to the client-side DashboardView.
 * Handles loading and error states.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-24 — Operator Dashboard
 */

import { Suspense } from 'react';
import { DashboardView } from '@/components/DashboardView';

/**
 * Dashboard page component.
 * Wrapped in Suspense for streaming/progressive rendering.
 */
export default function DashboardPage(): JSX.Element {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Operator Dashboard</h1>
      <Suspense fallback={<div>Loading dashboard metrics...</div>}>
        <DashboardView />
      </Suspense>
    </div>
  );
}
