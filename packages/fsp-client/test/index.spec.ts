/**
 * index.spec.ts
 * -------------
 * Agentic Scheduler — FSP Integration — fsp-client package export test
 * ---------------------------------------------------------------------
 * Verifies that the fsp-client package is importable and that the package
 * compiles without TypeScript errors. Full service implementations are
 * tested in PR-6.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

import * as fspClient from '../src/index';

describe('@fsp-scheduler/fsp-client', () => {
  it('exports a non-null module', () => {
    expect(fspClient).toBeDefined();
  });

  it('exports PACKAGE_NAME constant', () => {
    expect(fspClient.PACKAGE_NAME).toBe('@fsp-scheduler/fsp-client');
  });
});
