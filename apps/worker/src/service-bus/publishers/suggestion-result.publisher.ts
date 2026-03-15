/**
 * suggestion-result.publisher.ts
 * --------------------------------
 * Agentic Scheduler — FSP Integration — Suggestion-results queue publisher
 * -------------------------------------------------------------------------
 * NestJS injectable publisher that sends SuggestionResultMessage payloads
 * to the suggestion-results Azure Service Bus queue. Sets the correct TTL
 * and content type for all messages.
 *
 * Key exports: SuggestionResultPublisher
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ServiceBusSender } from '@azure/service-bus';
import {
  SuggestionResultMessage,
  QUEUE_NAMES,
  MESSAGE_TTL_MS,
} from '@fsp-scheduler/shared-types';
import { ServiceBusService } from '../service-bus.service';

/**
 * Publishes SuggestionResultMessages to the suggestion-results queue.
 */
@Injectable()
export class SuggestionResultPublisher {
  private readonly logger = new Logger(SuggestionResultPublisher.name);
  private readonly sender: ServiceBusSender;

  /**
   * @param serviceBusService - Injected service that owns the SB client
   */
  constructor(private readonly serviceBusService: ServiceBusService) {
    this.sender = this.serviceBusService.createSender(QUEUE_NAMES.SUGGESTION_RESULTS);
  }

  /**
   * Publishes a SuggestionResultMessage to the suggestion-results queue.
   *
   * @param message - The suggestion result message to publish
   * @returns Promise resolving when the message is enqueued
   */
  async publishSuggestionResult(message: SuggestionResultMessage): Promise<void> {
    this.logger.log('Publishing SuggestionResultMessage', {
      service: SuggestionResultPublisher.name,
      operatorId: message.operatorId,
      correlationId: message.correlationId,
      queue: QUEUE_NAMES.SUGGESTION_RESULTS,
      suggestionId: message.suggestionId,
      status: message.status,
    });

    await this.sender.sendMessages({
      body: message,
      contentType: 'application/json',
      timeToLive: MESSAGE_TTL_MS.SUGGESTION_RESULTS,
    });
  }
}
