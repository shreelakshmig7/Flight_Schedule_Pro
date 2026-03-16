/**
 * index.ts
 * --------
 * Agentic Scheduler — FSP Integration — database package entry point
 * ------------------------------------------------------------------
 * Exports the NestJS DatabaseModule, the injectable PrismaService, and all
 * Prisma-generated types from the generated client. Apps import from
 * @fsp-scheduler/database so they are never coupled to the internal
 * generated/ path.
 *
 * Key exports: DatabaseModule, PrismaService, Prisma (namespace), PACKAGE_NAME
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-5 — Prisma Schema and Database Migrations
 */

/** Package identifier — used in bootstrap tests. */
export const PACKAGE_NAME = '@fsp-scheduler/database';

export { DatabaseModule } from './database.module';
export { PrismaService } from './prisma.service';

// Re-export every Prisma-generated type so consumers import from one place.
export { Prisma, PrismaClient } from './generated/prisma';
export type {
  Operator,
  Suggestion,
  AuditLog,
  DiscoveryProspect,
  Communication,
} from './generated/prisma';
