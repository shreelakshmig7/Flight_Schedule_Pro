/**
 * change-event.publisher.spec.ts
 * --------------------------------
 * Agentic Scheduler — FSP Integration — ChangeEventPublisher unit tests
 * ----------------------------------------------------------------------
 * Verifies that ChangeEventPublisher sends a ChangeEventMessage with the
 * correct contentType and timeToLive, and that sendMessages is invoked
 * exactly once per publish call.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MESSAGE_TTL_MS } from '@fsp-scheduler/shared-types';
import type { ChangeEventMessage } from '@fsp-scheduler/shared-types';

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
import { ChangeEventPublisher } from '../../../src/service-bus/publishers/change-event.publisher';

const VALID_CHANGE_EVENT_MESSAGE: ChangeEventMessage = {
  operatorId: 'op-002',
  correlationId: 'corr-002',
  enqueuedAt: '2026-03-15T11:00:00.000Z',
  fspOperatorId: 20,
  changeType: 'NEW_OPENING',
  reservationId: 'res-456',
  detectedAt: '2026-03-15T10:59:00.000Z',
  rawDiff: { slotStatus: 'OPEN' },
};

describe('ChangeEventPublisher', () => {
  let publisher: ChangeEventPublisher;
  let serviceBusService: ServiceBusService;

  beforeEach(() => {
    vi.clearAllMocks();
    serviceBusService = new ServiceBusService('ns.servicebus.windows.net');
    publisher = new ChangeEventPublisher(serviceBusService);
  });

  it('sends a valid ChangeEventMessage with correct body, contentType, and timeToLive', async () => {
    await publisher.publishChangeEvent(VALID_CHANGE_EVENT_MESSAGE);

    expect(mockSendMessages).toHaveBeenCalledTimes(1);
    const [sentMsg] = mockSendMessages.mock.calls[0] as [{ body: unknown; contentType: string; timeToLive: number }];
    expect(sentMsg.body).toEqual(VALID_CHANGE_EVENT_MESSAGE);
    expect(sentMsg.contentType).toBe('application/json');
    expect(sentMsg.timeToLive).toBe(MESSAGE_TTL_MS.CHANGE_EVENTS);
  });

  it('calls sender.sendMessages exactly once', async () => {
    await publisher.publishChangeEvent(VALID_CHANGE_EVENT_MESSAGE);
    expect(mockSendMessages).toHaveBeenCalledTimes(1);
  });
});
