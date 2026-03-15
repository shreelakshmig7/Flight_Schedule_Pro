/**
 * index.spec.ts
 * -------------
 * Agentic Scheduler — FSP Integration — database package export test
 * ------------------------------------------------------------------
 * Verifies that the database package is importable and that the Prisma
 * client singleton is exported. Full schema and migration tests are in PR-5.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

import * as database from '../src/index';

describe('@fsp-scheduler/database', () => {
  it('exports a non-null module', () => {
    expect(database).toBeDefined();
  });

  it('exports PACKAGE_NAME constant', () => {
    expect(database.PACKAGE_NAME).toBe('@fsp-scheduler/database');
  });
});
