/**
 * layout.tsx
 * ----------
 * Root layout for the Agentic Scheduler console (Next.js 14 App Router).
 * Provides the HTML shell, global CSS variables for dark mode support,
 * and font configuration. All page-level components are rendered inside
 * the {children} slot.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agentic Scheduler — FSP',
  description: 'Flight school scheduling automation console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
