/**
 * page.tsx
 * --------
 * Root page for the Agentic Scheduler console.
 * Redirects to /queue (the approval queue).
 * Implemented in PR-19 — Approval Queue UI.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-19 — Approval Queue UI
 */

import { redirect } from 'next/navigation';

export default function HomePage(): JSX.Element {
  redirect('/queue');
}
