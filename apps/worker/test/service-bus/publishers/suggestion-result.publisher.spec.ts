/**
 * suggestion-result.publisher.spec.ts
 * -------------------------------------
 * Agentic Scheduler — FSP Integration — SuggestionResultPublisher unit tests
 * ---------------------------------------------------------------------------
 * Verifies that SuggestionResultPublisher sends a SuggestionResultMessage
 * with the correct contentType and timeToLive, and that sendMessages is
 * called exactly once per publish call.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MESSAGE_TTL_MS } from '@fsp-scheduler/shared-types';
import type { SuggestionResultMessage } from '@fsp-scheduler/shared-types';

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
import { SuggestionResultPublisher } from '../../../src/service-bus/publishers/suggestion-result.publisher';

const VALID_SUGGESTION_RESULT_MESSAGE: SuggestionResultMessage = {
  operatorId: 'op-003',
  correlationId: 'corr-003',
  enqueuedAt: '2026-03-15T12:00:00.000Z',
  suggestionId: 'sug-100',
  useCaseType: 'FILL_GAP',
  status: 'CREATED',
  createdAt: '2026-03-15T12:00:01.000Z',
};

describe('SuggestionResultPublisher', () => {
  let publisher: SuggestionResultPublisher;
  let serviceBusService: ServiceBusService;

  beforeEach(() => {
    vi.clearAllMocks();
    serviceBusService = new ServiceBusService('ns.servicebus.windows.net');
    publisher = new SuggestionResultPublisher(serviceBusService);
  });

  it('sends a valid SuggestionResultMessage with correct body, contentType, and timeToLive', async () => {
    await publisher.publishSuggestionResult(VALID_SUGGESTION_RESULT_MESSAGE);

    expect(mockSendMessages).toHaveBeenCalledTimes(1);
    const [sentMsg] = mockSendMessages.mock.calls[0] as [{ body: unknown; contentType: string; timeToLive: number }];
    expect(sentMsg.body).toEqual(VALID_SUGGESTION_RESULT_MESSAGE);
    expect(sentMsg.contentType).toBe('application/json');
    expect(sentMsg.timeToLive).toBe(MESSAGE_TTL_MS.SUGGESTION_RESULTS);
  });

  it('calls sender.sendMessages exactly once', async () => {
    await publisher.publishSuggestionResult(VALID_SUGGESTION_RESULT_MESSAGE);
    expect(mockSendMessages).toHaveBeenCalledTimes(1);
  });
});
