/**
 * page.tsx
 * --------
 * Root page for the Agentic Scheduler console.
 * Redirects to /queue (the approval queue) once auth is implemented in PR-7.
 * For now renders a placeholder that confirms the Next.js scaffold is working.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

export default function HomePage(): JSX.Element {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>
        Agentic Scheduler — FSP
      </h1>
      <p style={{ color: 'var(--color-text-secondary)' }}>
        Scheduler console is loading…
      </p>
    </main>
  );
}
