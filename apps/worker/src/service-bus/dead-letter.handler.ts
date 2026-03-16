/**
 * dead-letter.handler.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — Dead-letter queue sweeper
 * ----------------------------------------------------------------
 * NestJS injectable service that runs on a cron schedule to drain the
 * dead-letter sub-queues of all three Service Bus queues. Each DLQ
 * message is logged (operatorId + correlationId only — no rawDiff) and
 * then completed so it is removed from the DLQ. Errors on individual
 * messages are caught so remaining messages are always processed.
 *
 * Key exports: DeadLetterHandler
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus';
import {
  QUEUE_NAMES,
  DEAD_LETTER_SWEEP_INTERVAL_MINUTES,
} from '@fsp-scheduler/shared-types';
import { ServiceBusService } from './service-bus.service';

/** Cron expression derived from the sweep interval constant (every N minutes). */
const SWEEP_CRON = `0/${DEAD_LETTER_SWEEP_INTERVAL_MINUTES} * * * *`;

/**
 * Sweeps dead-letter queues for all Service Bus queues and logs each
 * dead-lettered message before marking it complete.
 */
@Injectable()
export class DeadLetterHandler {
  /** Exposed as protected so tests can spy on log calls. */
  protected readonly logger = new Logger(DeadLetterHandler.name);

  /**
   * @param serviceBusService - Injected service that owns the SB client
   */
  constructor(private readonly serviceBusService: ServiceBusService) {}

  /**
   * Cron job that runs every DEAD_LETTER_SWEEP_INTERVAL_MINUTES minutes.
   * Reads all available messages from the DLQ of each queue, logs them,
   * and calls completeMessage so they are removed from the DLQ.
   *
   * @returns Promise resolving when all DLQs have been swept
   */
  @Cron(SWEEP_CRON)
  async sweepDeadLetterQueues(): Promise<void> {
    this.logger.log('Starting dead-letter sweep', {
      service: DeadLetterHandler.name,
      operatorId: 'system',
      correlationId: 'dlq-sweep',
    });

    const queues = [
      QUEUE_NAMES.POLL_JOBS,
      QUEUE_NAMES.CHANGE_EVENTS,
      QUEUE_NAMES.SUGGESTION_RESULTS,
    ] as const;

    for (const queueName of queues) {
      await this.sweepQueue(queueName);
    }

    this.logger.log('Dead-letter sweep complete', {
      service: DeadLetterHandler.name,
      operatorId: 'system',
      correlationId: 'dlq-sweep',
    });
  }

  /**
   * Sweeps the DLQ for a single queue name.
   *
   * @param queueName - The queue whose DLQ should be drained
   * @returns Promise resolving when all available DLQ messages are processed
   */
  private async sweepQueue(queueName: string): Promise<void> {
    const receiver: ServiceBusReceiver =
      this.serviceBusService.createDeadLetterReceiver(queueName);

    try {
      const messages: ServiceBusReceivedMessage[] =
        await receiver.receiveMessages(100);

      for (const message of messages) {
        await this.processDeadLetterMessage(receiver, message, queueName);
      }
    } finally {
      await receiver.close();
    }
  }

  /**
   * Logs a single dead-lettered message (operatorId + correlationId only)
   * and then marks it as complete so it is removed from the DLQ.
   * Errors during completeMessage are caught and logged so the sweep
   * continues for remaining messages.
   *
   * @param receiver  - The DLQ receiver that delivered the message
   * @param message   - The dead-lettered message to process
   * @param queueName - Source queue name (for log context)
   * @returns Promise resolving after the message is processed (or error logged)
   */
  private async processDeadLetterMessage(
    receiver: ServiceBusReceiver,
    message: ServiceBusReceivedMessage,
    queueName: string,
  ): Promise<void> {
    const body = message.body as Record<string, unknown> | undefined;
    const operatorId =
      typeof body?.['operatorId'] === 'string' ? body['operatorId'] : 'unknown';
    const correlationId =
      typeof body?.['correlationId'] === 'string'
        ? body['correlationId']
        : 'unknown';

    this.logger.warn('Dead-lettered message found', {
      service: DeadLetterHandler.name,
      operatorId,
      correlationId,
      queue: queueName,
      deadLetterReason: message.deadLetterReason,
      deadLetterErrorDescription: message.deadLetterErrorDescription,
    });

    try {
      await receiver.completeMessage(message);
    } catch (error: unknown) {
      this.logger.error('Failed to complete dead-lettered message', {
        service: DeadLetterHandler.name,
        operatorId,
        correlationId,
        queue: queueName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
