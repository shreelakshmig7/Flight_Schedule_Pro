/**
 * service-bus.service.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — Azure Service Bus client wrapper
 * -----------------------------------------------------------------------
 * NestJS injectable service that owns the ServiceBusClient instance and
 * provides factory methods for creating senders and receivers. Uses
 * DefaultAzureCredential so no connection strings are stored in code or
 * environment variables. Implements OnModuleDestroy for graceful shutdown.
 *
 * Key exports: ServiceBusService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import {
  ServiceBusClient,
  ServiceBusSender,
  ServiceBusReceiver,
} from '@azure/service-bus';
import { DefaultAzureCredential } from '@azure/identity';

/**
 * Wrapper around the Azure Service Bus SDK that manages the lifecycle of
 * the client and all senders/receivers created through it.
 */
@Injectable()
export class ServiceBusService implements OnModuleDestroy {
  private readonly logger = new Logger(ServiceBusService.name);
  private readonly client: ServiceBusClient;
  private readonly senders: ServiceBusSender[] = [];
  private readonly receivers: ServiceBusReceiver[] = [];

  /**
   * Creates the ServiceBusClient using DefaultAzureCredential.
   *
   * @param namespace - Fully-qualified Service Bus namespace
   *                    (e.g. "my-ns.servicebus.windows.net")
   */
  constructor(namespace: string) {
    const credential = new DefaultAzureCredential();
    this.client = new ServiceBusClient(namespace, credential);
  }

  /**
   * Creates and tracks a sender for the given queue.
   *
   * @param queueName - Name of the target queue
   * @returns A ServiceBusSender bound to the queue
   */
  createSender(queueName: string): ServiceBusSender {
    const sender = this.client.createSender(queueName);
    this.senders.push(sender);
    return sender;
  }

  /**
   * Creates and tracks a receiver for the given queue.
   *
   * @param queueName - Name of the source queue
   * @returns A ServiceBusReceiver bound to the queue
   */
  createReceiver(queueName: string): ServiceBusReceiver {
    const receiver = this.client.createReceiver(queueName);
    this.receivers.push(receiver);
    return receiver;
  }

  /**
   * Creates and tracks a dead-letter receiver for the given queue.
   *
   * @param queueName - Name of the queue whose DLQ should be read
   * @returns A ServiceBusReceiver targeting the dead-letter sub-queue
   */
  createDeadLetterReceiver(queueName: string): ServiceBusReceiver {
    const receiver = this.client.createReceiver(queueName, {
      subQueueType: 'deadLetter',
    });
    this.receivers.push(receiver);
    return receiver;
  }

  /**
   * Closes all tracked senders and receivers, then closes the client.
   * Called automatically on module destroy.
   *
   * @returns Promise that resolves when all handles are closed
   */
  async close(): Promise<void> {
    this.logger.log('Closing all Service Bus senders and receivers', {
      service: ServiceBusService.name,
      operatorId: 'system',
      correlationId: 'shutdown',
    });

    await Promise.all([
      ...this.senders.map((s) => s.close()),
      ...this.receivers.map((r) => r.close()),
    ]);

    await this.client.close();
  }

  /**
   * NestJS lifecycle hook — invoked before the module is torn down.
   *
   * @returns Promise resolving after all connections are closed
   */
  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
