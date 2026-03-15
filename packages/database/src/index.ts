/**
 * index.ts
 * --------
 * Agentic Scheduler — FSP Integration — database package entry point
 * ------------------------------------------------------------------
 * Exports the singleton Prisma client instance used by apps/api and
 * apps/worker. The full Prisma schema is defined in prisma/schema.prisma
 * and the client is generated from it. This package is the only place
 * in the monorepo that instantiates PrismaClient.
 *
 * Key exports: prisma (singleton PrismaClient), PACKAGE_NAME
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

/** Package identifier — used in bootstrap tests. */
export const PACKAGE_NAME = '@fsp-scheduler/database' as const;

// PrismaClient singleton and generated types are added in PR-5.
// The Prisma schema (prisma/schema.prisma) defining all five entities
// is also added in PR-5: operators, suggestions, audit_log,
// discovery_prospects, communications.
