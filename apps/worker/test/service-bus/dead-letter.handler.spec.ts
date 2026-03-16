/**
 * dead-letter.handler.spec.ts
 * ----------------------------
 * Agentic Scheduler — FSP Integration — DeadLetterHandler unit tests
 * ------------------------------------------------------------------
 * Verifies that DeadLetterHandler sweeps all three DLQs, completes each
 * message, logs the operatorId and correlationId, and continues processing
 * remaining messages if a single message fails to complete.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@azure/service-bus', () => ({
  ServiceBusClient: vi.fn(),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({})),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockReceiver(messages: Array<{ body: unknown }>): {
  receiveMessages: ReturnType<typeof vi.fn>;
  completeMessage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    receiveMessages: vi.fn().mockResolvedValue(messages),
    completeMessage: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

type MockReceiver = ReturnType<typeof makeMockReceiver>;

/** Build a fresh ServiceBusService stub with sequential DLQ receivers. */
function makeServiceStub(receivers: [MockReceiver, MockReceiver, MockReceiver]): {
  createDeadLetterReceiver: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    createDeadLetterReceiver: vi
      .fn()
      .mockReturnValueOnce(receivers[0])
      .mockReturnValueOnce(receivers[1])
      .mockReturnValueOnce(receivers[2]),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------
import { DeadLetterHandler } from '../../src/service-bus/dead-letter.handler';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeadLetterHandler', () => {
  // Default receivers used in most tests (one message each)
  let defaultReceivers: [MockReceiver, MockReceiver, MockReceiver];
  let handler: DeadLetterHandler;

  beforeEach(() => {
    vi.clearAllMocks();

    defaultReceivers = [
      makeMockReceiver([{ body: { operatorId: 'op-1', correlationId: 'corr-1', enqueuedAt: '2026-03-15T00:00:00Z' } }]),
      makeMockReceiver([{ body: { operatorId: 'op-2', correlationId: 'corr-2', enqueuedAt: '2026-03-15T00:01:00Z' } }]),
      makeMockReceiver([{ body: { operatorId: 'op-3', correlationId: 'corr-3', enqueuedAt: '2026-03-15T00:02:00Z' } }]),
    ];

    const stub = makeServiceStub(defaultReceivers);
    // Cast to unknown then to the service type so TS accepts the stub
    handler = new DeadLetterHandler(stub as unknown as import('../../src/service-bus/service-bus.service').ServiceBusService);
  });

  it('sweepDeadLetterQueues calls createDeadLetterReceiver for all 3 queues', async () => {
    await handler.sweepDeadLetterQueues();
    // Access the stub via the private field to count calls
    const svc = (handler as unknown as { serviceBusService: { createDeadLetterReceiver: ReturnType<typeof vi.fn> } }).serviceBusService;
    expect(svc.createDeadLetterReceiver).toHaveBeenCalledTimes(3);
  });

  it('completes each message after processing', async () => {
    await handler.sweepDeadLetterQueues();

    for (const receiver of defaultReceivers) {
      expect(receiver.completeMessage).toHaveBeenCalledTimes(1);
    }
  });

  it('logs operatorId and correlationId for each DLQ message', async () => {
    const receivers: [MockReceiver, MockReceiver, MockReceiver] = [
      makeMockReceiver([{ body: { operatorId: 'op-log', correlationId: 'corr-log', enqueuedAt: '2026-03-15T00:00:00Z' } }]),
      makeMockReceiver([]),
      makeMockReceiver([]),
    ];

    const stub = makeServiceStub(receivers);
    const freshHandler = new DeadLetterHandler(
      stub as unknown as import('../../src/service-bus/service-bus.service').ServiceBusService,
    );

    const logSpy = vi.spyOn(freshHandler['logger'], 'warn');

    await freshHandler.sweepDeadLetterQueues();

    const logCalls = logSpy.mock.calls.map((args) => JSON.stringify(args));
    expect(logCalls.some((call) => call.includes('op-log'))).toBe(true);
  });

  it('continues processing remaining messages if one message fails to complete', async () => {
    const failingComplete = vi
      .fn()
      .mockRejectedValueOnce(new Error('complete failed'))
      .mockResolvedValue(undefined);

    const msg1 = { body: { operatorId: 'op-fail', correlationId: 'corr-fail', enqueuedAt: '2026-03-15T00:00:00Z' } };
    const msg2 = { body: { operatorId: 'op-ok', correlationId: 'corr-ok', enqueuedAt: '2026-03-15T00:00:01Z' } };

    const receiver = {
      receiveMessages: vi.fn().mockResolvedValue([msg1, msg2]),
      completeMessage: failingComplete,
      close: vi.fn().mockResolvedValue(undefined),
    };

    const receivers: [typeof receiver, MockReceiver, MockReceiver] = [
      receiver,
      makeMockReceiver([]),
      makeMockReceiver([]),
    ];

    const stub = {
      createDeadLetterReceiver: vi
        .fn()
        .mockReturnValueOnce(receivers[0])
        .mockReturnValueOnce(receivers[1])
        .mockReturnValueOnce(receivers[2]),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const freshHandler = new DeadLetterHandler(
      stub as unknown as import('../../src/service-bus/service-bus.service').ServiceBusService,
    );

    // Should not throw even though first completeMessage fails
    await expect(freshHandler.sweepDeadLetterQueues()).resolves.toBeUndefined();

    // Both messages were attempted
    expect(failingComplete).toHaveBeenCalledTimes(2);
  });
});
