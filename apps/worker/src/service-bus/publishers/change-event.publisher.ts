/**
 * change-event.publisher.ts
 * --------------------------
 * Agentic Scheduler — FSP Integration — Change-events queue publisher
 * -------------------------------------------------------------------
 * NestJS injectable publisher that sends ChangeEventMessage payloads to
 * the change-events Azure Service Bus queue. Sets the correct TTL and
 * content type for all messages. Note: rawDiff is never logged.
 *
 * Key exports: ChangeEventPublisher
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ServiceBusSender } from '@azure/service-bus';
import {
  ChangeEventMessage,
  QUEUE_NAMES,
  MESSAGE_TTL_MS,
} from '@fsp-scheduler/shared-types';
import { ServiceBusService } from '../service-bus.service';

/**
 * Publishes ChangeEventMessages to the change-events queue.
 */
@Injectable()
export class ChangeEventPublisher {
  private readonly logger = new Logger(ChangeEventPublisher.name);
  private readonly sender: ServiceBusSender;

  /**
   * @param serviceBusService - Injected service that owns the SB client
   */
  constructor(private readonly serviceBusService: ServiceBusService) {
    this.sender = this.serviceBusService.createSender(QUEUE_NAMES.CHANGE_EVENTS);
  }

  /**
   * Publishes a ChangeEventMessage to the change-events queue.
   * rawDiff content is never included in log output.
   *
   * @param message - The change event message to publish
   * @returns Promise resolving when the message is enqueued
   */
  async publishChangeEvent(message: ChangeEventMessage): Promise<void> {
    this.logger.log('Publishing ChangeEventMessage', {
      service: ChangeEventPublisher.name,
      operatorId: message.operatorId,
      correlationId: message.correlationId,
      queue: QUEUE_NAMES.CHANGE_EVENTS,
      changeType: message.changeType,
      reservationId: message.reservationId,
    });

    await this.sender.sendMessages({
      body: message,
      contentType: 'application/json',
      timeToLive: MESSAGE_TTL_MS.CHANGE_EVENTS,
    });
  }
}
