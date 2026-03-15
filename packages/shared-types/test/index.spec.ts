/**
 * index.spec.ts
 * -------------
 * Agentic Scheduler — FSP Integration — shared-types package export test
 * -----------------------------------------------------------------------
 * Verifies that the shared-types package exports are importable and that
 * the package compiles without TypeScript errors. This is the baseline
 * contract test that all consuming apps depend on.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

import * as sharedTypes from '../src/index';

describe('@fsp-scheduler/shared-types', () => {
  it('exports a non-null module', () => {
    expect(sharedTypes).toBeDefined();
  });

  it('exports PACKAGE_NAME constant', () => {
    expect(sharedTypes.PACKAGE_NAME).toBe('@fsp-scheduler/shared-types');
  });
});
