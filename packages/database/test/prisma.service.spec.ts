/**
 * prisma.service.spec.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — PrismaService unit tests
 * --------------------------------------------------------------
 * Verifies that PrismaService correctly connects on module init and
 * disconnects on module destroy without touching a real database.
 * $connect and $disconnect are spied upon directly on the service instance
 * after construction so class inheritance is preserved.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-5 — Prisma Schema and Database Migrations
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mock the generated Prisma client before any imports ──────────────────────
// Use a class mock so that PrismaService extends PrismaClient still works
// and the prototype chain is preserved.
vi.mock('../src/generated/prisma', () => {
  class PrismaClient {
    async $connect(): Promise<void> { /* noop */ }
    async $disconnect(): Promise<void> { /* noop */ }
  }
  return { PrismaClient };
});

import { PrismaService } from '../src/prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  let connectSpy: ReturnType<typeof vi.spyOn>;
  let disconnectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    service = new PrismaService();
    // Spy on the inherited $connect / $disconnect methods
    connectSpy = vi.spyOn(service, '$connect').mockResolvedValue(undefined);
    disconnectSpy = vi.spyOn(service, '$disconnect').mockResolvedValue(undefined);
  });

  it('should be defined and injectable', () => {
    expect(service).toBeDefined();
  });

  it('calls $connect on onModuleInit', async () => {
    await service.onModuleInit();
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('calls $disconnect on onModuleDestroy', async () => {
    await service.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
