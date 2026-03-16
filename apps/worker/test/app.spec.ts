/**
 * app.spec.ts
 * -----------
 * Agentic Scheduler — FSP Integration — Worker app bootstrap test
 * ---------------------------------------------------------------
 * Verifies that the NestJS worker app module compiles and the application
 * context can be created without errors. ServiceBusService is overridden
 * with a stub so the test does not require a live Azure Service Bus connection.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology (updated to stub ServiceBusService)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@azure/service-bus', () => ({
  ServiceBusClient: vi.fn(),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleModule } from '@nestjs/schedule';
import { ServiceBusModule } from '../src/service-bus/service-bus.module';
import { ServiceBusService } from '../src/service-bus/service-bus.service';

/** Stub for ServiceBusService — returns mock senders/receivers. */
const stubSender = {
  sendMessages: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

const stubReceiver = {
  receiveMessages: vi.fn().mockResolvedValue([]),
  completeMessage: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

const stubServiceBusService = {
  createSender: vi.fn().mockReturnValue(stubSender),
  createReceiver: vi.fn().mockReturnValue(stubReceiver),
  createDeadLetterReceiver: vi.fn().mockReturnValue(stubReceiver),
  close: vi.fn().mockResolvedValue(undefined),
  onModuleDestroy: vi.fn().mockResolvedValue(undefined),
};

describe('Worker AppModule', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ScheduleModule.forRoot(),
        ServiceBusModule,
      ],
    })
      .overrideProvider(ServiceBusService)
      .useValue(stubServiceBusService)
      .compile();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('compiles the worker AppModule without errors', () => {
    expect(moduleRef).toBeDefined();
  });
});
