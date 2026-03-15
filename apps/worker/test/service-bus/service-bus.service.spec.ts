/**
 * service-bus.service.spec.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — ServiceBusService unit tests
 * -------------------------------------------------------------------
 * Verifies that ServiceBusService correctly delegates to the Azure
 * Service Bus SDK for creating senders/receivers and that close()
 * shuts down all open handles and the client on module destroy.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @azure/service-bus before importing the service under test
// ---------------------------------------------------------------------------
const mockSenderClose = vi.fn().mockResolvedValue(undefined);
const mockReceiverClose = vi.fn().mockResolvedValue(undefined);
const mockClientClose = vi.fn().mockResolvedValue(undefined);

const mockCreateSender = vi.fn().mockReturnValue({ close: mockSenderClose });
const mockCreateReceiver = vi.fn().mockReturnValue({ close: mockReceiverClose });

vi.mock('@azure/service-bus', () => ({
  ServiceBusClient: vi.fn().mockImplementation(() => ({
    createSender: mockCreateSender,
    createReceiver: mockCreateReceiver,
    close: mockClientClose,
  })),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({})),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks are established
// ---------------------------------------------------------------------------
import { ServiceBusService } from '../../src/service-bus/service-bus.service';

describe('ServiceBusService', () => {
  let service: ServiceBusService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ServiceBusService('my-namespace.servicebus.windows.net');
  });

  it('createSender returns a sender for the given queue', () => {
    const sender = service.createSender('poll-jobs');
    expect(mockCreateSender).toHaveBeenCalledWith('poll-jobs');
    expect(sender).toBeDefined();
  });

  it('createReceiver returns a receiver for the given queue', () => {
    const receiver = service.createReceiver('change-events');
    expect(mockCreateReceiver).toHaveBeenCalledWith('change-events');
    expect(receiver).toBeDefined();
  });

  it('createDeadLetterReceiver returns a DLQ receiver for the given queue', () => {
    const receiver = service.createDeadLetterReceiver('suggestion-results');
    expect(mockCreateReceiver).toHaveBeenCalledWith('suggestion-results', {
      subQueueType: 'deadLetter',
    });
    expect(receiver).toBeDefined();
  });

  it('close() closes all open senders and receivers and the client', async () => {
    // Open one sender and two receivers
    service.createSender('poll-jobs');
    service.createReceiver('change-events');
    service.createDeadLetterReceiver('suggestion-results');

    await service.close();

    expect(mockSenderClose).toHaveBeenCalledTimes(1);
    expect(mockReceiverClose).toHaveBeenCalledTimes(2);
    expect(mockClientClose).toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy calls close()', async () => {
    const closeSpy = vi.spyOn(service, 'close').mockResolvedValue(undefined);
    await service.onModuleDestroy();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
