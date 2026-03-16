/**
 * page.tsx (config route)
 * ----------------------
 * Agentic Scheduler — FSP Integration — Configuration page route
 * ------
 * Next.js 14 App Router page component for the /config route.
 * Renders the main ConfigPage component.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-21 — Operator Configuration UI
 */

import { ConfigPage } from '@/components/ConfigPage';

export const metadata = {
  title: 'Operator Configuration',
  description: 'Configure scheduling policies, priority weights, and notifications',
};

export default function Config(): JSX.Element {
  return <ConfigPage />;
}
