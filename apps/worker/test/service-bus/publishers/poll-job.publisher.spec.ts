/**
 * poll-job.publisher.spec.ts
 * ---------------------------
 * Agentic Scheduler — FSP Integration — PollJobPublisher unit tests
 * -----------------------------------------------------------------
 * Verifies that PollJobPublisher validates the message, sends it with
 * the correct contentType and timeToLive, and calls sendMessages exactly
 * once. Also verifies that invalid messages (missing required fields)
 * cause an error to be thrown.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MESSAGE_TTL_MS } from '@fsp-scheduler/shared-types';
import type { PollJobMessage } from '@fsp-scheduler/shared-types';

const mockSendMessages = vi.fn().mockResolvedValue(undefined);
const mockSender = { sendMessages: mockSendMessages };

vi.mock('@azure/service-bus', () => ({
  ServiceBusClient: vi.fn(),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../../src/service-bus/service-bus.service', () => ({
  ServiceBusService: vi.fn().mockImplementation(() => ({
    createSender: vi.fn().mockReturnValue(mockSender),
  })),
}));

import { ServiceBusService } from '../../../src/service-bus/service-bus.service';
import { PollJobPublisher } from '../../../src/service-bus/publishers/poll-job.publisher';

const VALID_POLL_JOB_MESSAGE: PollJobMessage = {
  operatorId: 'op-001',
  correlationId: 'corr-001',
  enqueuedAt: '2026-03-15T10:00:00.000Z',
  fspOperatorId: 10,
  tier: 'TIER2',
  scheduledAt: '2026-03-15T10:05:00.000Z',
};

describe('PollJobPublisher', () => {
  let publisher: PollJobPublisher;
  let serviceBusService: ServiceBusService;

  beforeEach(() => {
    vi.clearAllMocks();
    serviceBusService = new ServiceBusService('ns.servicebus.windows.net');
    publisher = new PollJobPublisher(serviceBusService);
  });

  it('sends a valid PollJobMessage with correct body, contentType, and timeToLive', async () => {
    await publisher.publishPollJob(VALID_POLL_JOB_MESSAGE);

    expect(mockSendMessages).toHaveBeenCalledTimes(1);
    const [sentMsg] = mockSendMessages.mock.calls[0] as [{ body: unknown; contentType: string; timeToLive: number }];
    expect(sentMsg.body).toEqual(VALID_POLL_JOB_MESSAGE);
    expect(sentMsg.contentType).toBe('application/json');
    expect(sentMsg.timeToLive).toBe(MESSAGE_TTL_MS.POLL_JOBS);
  });

  it('throws when the message is missing the tier field', async () => {
    const invalid = { ...VALID_POLL_JOB_MESSAGE } as Record<string, unknown>;
    delete invalid['tier'];
    await expect(publisher.publishPollJob(invalid as PollJobMessage)).rejects.toThrow();
  });

  it('calls sender.sendMessages exactly once for a valid message', async () => {
    await publisher.publishPollJob(VALID_POLL_JOB_MESSAGE);
    expect(mockSendMessages).toHaveBeenCalledTimes(1);
  });
});
