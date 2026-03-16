/**
 * polling-dispatcher.service.spec.ts
 * ------------------------------------
 * Agentic Scheduler — FSP Integration — PollingDispatcherService unit tests
 * --------------------------------------------------------------------------
 * Covers: operator registration on init, PollJobMessage publication,
 * deduplication, reschedule on tier change, and operator deregistration.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollingDispatcherService } from '../../src/polling/polling-dispatcher.service';
import type { PollJobPublisher } from '../../src/service-bus/publishers/poll-job.publisher';
import type { PrismaService } from '@fsp-scheduler/database';

/** Minimal operator row returned by prisma. */
const makeOperatorRow = (operatorId: string, fspOperatorId: number, tier = 'TIER2'): {
  id: string; operatorId: string; fspOperatorId: number; pollingTier: string; isActive: boolean;
} => ({
  id: `db-${fspOperatorId}`,
  operatorId,
  fspOperatorId,
  pollingTier: tier,
  isActive: true,
});

describe('PollingDispatcherService', () => {
  let publisher: { publishPollJob: ReturnType<typeof vi.fn> };
  let prisma: { operator: { findMany: ReturnType<typeof vi.fn> } };
  let service: PollingDispatcherService;

  beforeEach(() => {
    vi.useFakeTimers();

    publisher = { publishPollJob: vi.fn().mockResolvedValue(undefined) };
    prisma = { operator: { findMany: vi.fn() } };

    service = new PollingDispatcherService(
      publisher as unknown as PollJobPublisher,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it('loads all active operators on init and starts polling', async () => {
    prisma.operator.findMany.mockResolvedValue([
      makeOperatorRow('op1', 1, 'TIER2'),
      makeOperatorRow('op2', 2, 'TIER1'),
    ]);

    await service.onModuleInit();

    // Both operators should be registered
    expect(service.getRegisteredOperatorIds()).toContain('op1');
    expect(service.getRegisteredOperatorIds()).toContain('op2');
  });

  it('publishes a PollJobMessage for each registered operator at their interval', async () => {
    prisma.operator.findMany.mockResolvedValue([
      makeOperatorRow('op1', 1, 'TIER2'),
    ]);

    await service.onModuleInit();

    // Fast-forward past the TIER2 interval (300 s = 300 000 ms)
    await vi.advanceTimersByTimeAsync(300_001);

    expect(publisher.publishPollJob).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'op1',
        fspOperatorId: 1,
        tier: 'TIER2',
      }),
    );
  });

  it('does not publish duplicate jobs for the same operator when already in-flight', async () => {
    prisma.operator.findMany.mockResolvedValue([
      makeOperatorRow('op1', 1, 'TIER2'),
    ]);

    // Simulate publisher hanging (never resolves) so job stays in-flight
    publisher.publishPollJob.mockImplementation(() => new Promise(() => {}));

    await service.onModuleInit();

    // Advance past one interval — first job enqueued but not resolved
    await vi.advanceTimersByTimeAsync(300_001);

    // Advance past a second interval — should NOT enqueue again
    await vi.advanceTimersByTimeAsync(300_001);

    expect(publisher.publishPollJob).toHaveBeenCalledTimes(1);
  });

  it('register() adds a new operator without restarting the worker', async () => {
    prisma.operator.findMany.mockResolvedValue([]);
    await service.onModuleInit();

    service.register('newOp', 42, 'TIER1');

    expect(service.getRegisteredOperatorIds()).toContain('newOp');
  });

  it('unregister() removes an operator and stops its polling', async () => {
    prisma.operator.findMany.mockResolvedValue([
      makeOperatorRow('op1', 1, 'TIER2'),
    ]);

    await service.onModuleInit();

    service.unregister('op1');

    expect(service.getRegisteredOperatorIds()).not.toContain('op1');
  });

  it('reschedule() changes the polling interval for an operator', async () => {
    prisma.operator.findMany.mockResolvedValue([
      makeOperatorRow('op1', 1, 'TIER3'),
    ]);

    await service.onModuleInit();

    // Reschedule to TIER1 (60s interval)
    service.reschedule('op1', 'TIER1');

    expect(service.getRegisteredOperatorIds()).toContain('op1');

    // Advance past the TIER1 interval (60s)
    await vi.advanceTimersByTimeAsync(60_001);

    expect(publisher.publishPollJob).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'op1',
        tier: 'TIER1',
      }),
    );
  });

  it('reschedule() is a no-op for unknown operatorIds', async () => {
    prisma.operator.findMany.mockResolvedValue([]);
    await service.onModuleInit();

    // Should not throw
    expect(() => service.reschedule('unknown', 'TIER1')).not.toThrow();
  });

  it('clears all timers on module destroy', async () => {
    prisma.operator.findMany.mockResolvedValue([
      makeOperatorRow('op1', 1, 'TIER1'),
    ]);

    await service.onModuleInit();
    service.onModuleDestroy();

    // After destroy, no more publish calls should fire
    await vi.advanceTimersByTimeAsync(120_001);

    expect(publisher.publishPollJob).not.toHaveBeenCalled();
  });
});
