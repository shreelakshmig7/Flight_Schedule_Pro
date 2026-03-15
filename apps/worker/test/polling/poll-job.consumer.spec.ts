/**
 * poll-job.consumer.spec.ts
 * --------------------------
 * Agentic Scheduler — FSP Integration — PollJobConsumer unit tests
 * ---------------------------------------------------------------
 * Covers: successful FSP poll + snapshot storage, 429 handling
 * (pause bucket + re-enqueue), error recovery, and bearer token usage.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 * Updated: PR-9 — Change Detection Engine (added changeDetectionService mock)
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollJobConsumer } from '../../src/polling/poll-job.consumer';
import { TokenBucket } from '../../src/polling/token-bucket';
import { RawSnapshotStore } from '../../src/polling/raw-snapshot.store';
import type { FspReservation, PollJobMessage } from '@fsp-scheduler/shared-types';

/** Builds a minimal PollJobMessage. */
function makePollJobMessage(operatorId = 'op1', fspOperatorId = 1): PollJobMessage {
  return {
    operatorId,
    fspOperatorId,
    tier: 'TIER2',
    correlationId: 'corr-1',
    enqueuedAt: new Date().toISOString(),
    scheduledAt: new Date().toISOString(),
  };
}

/** Minimal FspReservation stub. */
function makeReservation(id: string): FspReservation {
  return {
    reservationId: id,
    operatorId: 'op1',
    startDateTime: new Date().toISOString(),
    endDateTime: new Date().toISOString(),
    status: 'CONFIRMED',
  } as FspReservation;
}

describe('PollJobConsumer', () => {
  let tokenBucket: TokenBucket;
  let snapshotStore: RawSnapshotStore;
  let reservationsService: { listReservations: ReturnType<typeof vi.fn> };
  let coreClient: { setBearerToken: ReturnType<typeof vi.fn> };
  let pollJobPublisher: { publishPollJob: ReturnType<typeof vi.fn> };
  let tokenStore: { getToken: ReturnType<typeof vi.fn> };
  let changeDetectionService: { processSnapshot: ReturnType<typeof vi.fn> };
  let service: PollJobConsumer;

  beforeEach(() => {
    tokenBucket = new TokenBucket();
    snapshotStore = new RawSnapshotStore();

    reservationsService = {
      listReservations: vi.fn(),
    };

    coreClient = {
      setBearerToken: vi.fn(),
    };

    pollJobPublisher = {
      publishPollJob: vi.fn().mockResolvedValue(undefined),
    };

    tokenStore = {
      getToken: vi.fn().mockReturnValue('bearer-token'),
    };

    changeDetectionService = {
      processSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    service = new PollJobConsumer(
      tokenBucket,
      snapshotStore,
      reservationsService as never,
      coreClient as never,
      pollJobPublisher as never,
      tokenStore as never,
      changeDetectionService as never,
    );
  });

  it('stores the FSP response reservations in RawSnapshotStore on successful poll', async () => {
    const reservations = [makeReservation('r1'), makeReservation('r2')];
    reservationsService.listReservations.mockResolvedValue({
      success: true,
      data: { reservations },
    });

    const message = makePollJobMessage();
    await service.processMessage(message);

    expect(snapshotStore.get('op1')).toEqual(reservations);
  });

  it('calls changeDetectionService.processSnapshot with previous and new reservations on successful poll', async () => {
    const reservations = [makeReservation('r1'), makeReservation('r2')];
    reservationsService.listReservations.mockResolvedValue({
      success: true,
      data: { reservations },
    });

    const message = makePollJobMessage('op1', 1);
    await service.processMessage(message);

    expect(changeDetectionService.processSnapshot).toHaveBeenCalledWith(
      'op1',
      1,
      [], // previous snapshot (empty — first poll)
      reservations,
    );
  });

  it('does NOT call changeDetectionService.processSnapshot when FSP returns 429', async () => {
    reservationsService.listReservations.mockResolvedValue({
      success: false,
      error: 'Rate limit exceeded',
      data: null,
      fspErrors: [{ message: 'Too Many Requests', code: '429' }],
    });

    await service.processMessage(makePollJobMessage());

    expect(changeDetectionService.processSnapshot).not.toHaveBeenCalled();
  });

  it('does NOT call changeDetectionService.processSnapshot on non-429 FSP errors', async () => {
    reservationsService.listReservations.mockResolvedValue({
      success: false,
      error: 'Internal server error',
      data: null,
    });

    await service.processMessage(makePollJobMessage());

    expect(changeDetectionService.processSnapshot).not.toHaveBeenCalled();
  });

  it('calls FSP listReservations with the string fspOperatorId', async () => {
    reservationsService.listReservations.mockResolvedValue({
      success: true,
      data: { reservations: [] },
    });

    const message = makePollJobMessage('op1', 42);
    await service.processMessage(message);

    expect(reservationsService.listReservations).toHaveBeenCalledWith('42', {});
  });

  it('sets bearer token on the core client before calling FSP', async () => {
    tokenStore.getToken.mockReturnValue('my-token');
    reservationsService.listReservations.mockResolvedValue({
      success: true,
      data: { reservations: [] },
    });

    await service.processMessage(makePollJobMessage('op1', 1));

    expect(coreClient.setBearerToken).toHaveBeenCalledWith('my-token');
  });

  it('pauses the token bucket when FSP returns 429', async () => {
    reservationsService.listReservations.mockResolvedValue({
      success: false,
      error: 'Rate limit exceeded',
      data: null,
      fspErrors: [{ message: 'Too Many Requests', code: '429' }],
    });

    const pauseSpy = vi.spyOn(tokenBucket, 'pause');
    await service.processMessage(makePollJobMessage());

    expect(pauseSpy).toHaveBeenCalled();
  });

  it('re-enqueues the poll job when FSP returns 429', async () => {
    reservationsService.listReservations.mockResolvedValue({
      success: false,
      error: 'Rate limit exceeded',
      data: null,
      fspErrors: [{ message: 'Too Many Requests', code: '429' }],
    });

    const message = makePollJobMessage('op1', 1);
    await service.processMessage(message);

    expect(pollJobPublisher.publishPollJob).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'op1',
        fspOperatorId: 1,
      }),
    );
  });

  it('does NOT store a snapshot when FSP returns 429', async () => {
    reservationsService.listReservations.mockResolvedValue({
      success: false,
      error: 'Rate limit exceeded',
      data: null,
      fspErrors: [{ message: 'Too Many Requests', code: '429' }],
    });

    await service.processMessage(makePollJobMessage());

    expect(snapshotStore.get('op1')).toBeNull();
  });

  it('does not store a snapshot when FSP returns a non-429 error', async () => {
    reservationsService.listReservations.mockResolvedValue({
      success: false,
      error: 'Internal server error',
      data: null,
    });

    await service.processMessage(makePollJobMessage());

    expect(snapshotStore.get('op1')).toBeNull();
  });

  it('does not pause bucket on non-429 FSP errors', async () => {
    reservationsService.listReservations.mockResolvedValue({
      success: false,
      error: 'Internal server error',
      data: null,
    });

    const pauseSpy = vi.spyOn(tokenBucket, 'pause');
    await service.processMessage(makePollJobMessage());

    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it('skips FSP call when no bearer token is available', async () => {
    tokenStore.getToken.mockReturnValue(null);

    await expect(service.processMessage(makePollJobMessage())).resolves.not.toThrow();
    expect(reservationsService.listReservations).not.toHaveBeenCalled();
  });

  it('is429Error identifies a 429 FSP error code', () => {
    expect(
      service.is429Error({
        success: false,
        error: 'rate limit',
        data: null,
        fspErrors: [{ message: 'Too Many Requests', code: '429' }],
      }),
    ).toBe(true);
  });

  it('is429Error returns false for non-429 errors', () => {
    expect(
      service.is429Error({
        success: false,
        error: 'server error',
        data: null,
        fspErrors: [{ message: 'Internal Server Error', code: '500' }],
      }),
    ).toBe(false);
  });

  it('is429Error returns false for successful results', () => {
    expect(service.is429Error({ success: true, data: {} })).toBe(false);
  });
});
