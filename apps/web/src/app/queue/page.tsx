/**
 * page.tsx
 * --------
 * Agentic Scheduler — FSP Integration — Approval queue page
 * ---
 * Server component that wraps the QueueView client component.
 * Renders the queue page at /queue.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-19 — Approval Queue UI
 */

import { QueueView } from '@/components/QueueView';

export default function QueuePage(): JSX.Element {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <QueueView />
    </main>
  );
}
