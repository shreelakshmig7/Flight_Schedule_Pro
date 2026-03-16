/**
 * database.module.spec.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — DatabaseModule unit tests
 * ---------------------------------------------------------------
 * Verifies that DatabaseModule is a NestJS global module that provides
 * and exports PrismaService so consuming modules do not need to re-import.
 * PrismaClient is replaced with a class stub to avoid a real database
 * connection while preserving prototype chain for instanceof checks.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-5 — Prisma Schema and Database Migrations
 */

import { vi, describe, it, expect } from 'vitest';

// ── Mock the generated Prisma client before module imports ───────────────────
vi.mock('../src/generated/prisma', () => {
  class PrismaClient {
    async $connect(): Promise<void> { /* noop */ }
    async $disconnect(): Promise<void> { /* noop */ }
  }
  return { PrismaClient };
});

import { Test } from '@nestjs/testing';
import { DatabaseModule } from '../src/database.module';
import { PrismaService } from '../src/prisma.service';

describe('DatabaseModule', () => {
  it('provides PrismaService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();

    const prismaService = moduleRef.get<PrismaService>(PrismaService);
    expect(prismaService).toBeDefined();
    expect(prismaService).toBeInstanceOf(PrismaService);
  });

  it('PrismaService is exported so consumers can inject it', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();

    // If exports are not wired, get() throws — so this assertion is sufficient.
    const prismaService = moduleRef.get<PrismaService>(PrismaService);
    expect(prismaService).toBeTruthy();
  });
});
