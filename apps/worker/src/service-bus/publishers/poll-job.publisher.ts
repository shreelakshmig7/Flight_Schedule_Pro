/**
 * poll-job.publisher.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — Poll-jobs queue publisher
 * ---------------------------------------------------------------
 * NestJS injectable publisher that validates and sends PollJobMessage
 * payloads to the poll-jobs Azure Service Bus queue. Enforces the
 * isPollJobMessage type guard before sending and sets the correct TTL.
 *
 * Key exports: PollJobPublisher
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ServiceBusSender } from '@azure/service-bus';
import {
  PollJobMessage,
  isPollJobMessage,
  QUEUE_NAMES,
  MESSAGE_TTL_MS,
} from '@fsp-scheduler/shared-types';
import { ServiceBusService } from '../service-bus.service';

/**
 * Publishes PollJobMessages to the poll-jobs queue.
 */
@Injectable()
export class PollJobPublisher {
  private readonly logger = new Logger(PollJobPublisher.name);
  private readonly sender: ServiceBusSender;

  /**
   * @param serviceBusService - Injected service that owns the SB client
   */
  constructor(private readonly serviceBusService: ServiceBusService) {
    this.sender = this.serviceBusService.createSender(QUEUE_NAMES.POLL_JOBS);
  }

  /**
   * Validates and publishes a PollJobMessage to the poll-jobs queue.
   *
   * @param message - The message to publish
   * @returns Promise resolving when the message is enqueued
   * @throws Error when the message does not pass the isPollJobMessage guard
   */
  async publishPollJob(message: PollJobMessage): Promise<void> {
    if (!isPollJobMessage(message)) {
      throw new Error(
        `Invalid PollJobMessage: failed type guard. operatorId=${String(
          (message as Record<string, unknown>)['operatorId'] ?? 'unknown',
        )}`,
      );
    }

    this.logger.log('Publishing PollJobMessage', {
      service: PollJobPublisher.name,
      operatorId: message.operatorId,
      correlationId: message.correlationId,
      queue: QUEUE_NAMES.POLL_JOBS,
    });

    await this.sender.sendMessages({
      body: message,
      contentType: 'application/json',
      timeToLive: MESSAGE_TTL_MS.POLL_JOBS,
    });
  }
}
