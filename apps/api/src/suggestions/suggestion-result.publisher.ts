/**
 * suggestion-result.publisher.ts
 * --------------------------------
 * Agentic Scheduler — FSP Integration — Suggestion-results queue publisher (API)
 * ---------------------------------------------------------------------------------
 * Lightweight publisher used by the API app to enqueue a SuggestionResultMessage
 * on the `suggestion-results` Azure Service Bus queue whenever an operator
 * approves a suggestion. The worker then consumes this message to execute the
 * appropriate use-case handler (APPROVED → CREATED).
 *
 * Key exports: SuggestionResultPublisher
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-10 — Suggestion State Machine
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import { DefaultAzureCredential } from '@azure/identity';
import {
  QUEUE_NAMES,
  MESSAGE_TTL_MS,
  SERVICE_BUS_NAMESPACE_ENV_KEY,
} from '@fsp-scheduler/shared-types';
import type { SuggestionResultMessage } from '@fsp-scheduler/shared-types';

/** Logger name for this publisher. */
const PUBLISHER_NAME = 'SuggestionResultPublisher';

/**
 * NestJS injectable that owns a dedicated ServiceBusClient and sender for the
 * `suggestion-results` queue. Uses DefaultAzureCredential — no connection
 * strings stored in code or environment variables.
 *
 * Instantiated by SuggestionsModule. Implements OnModuleDestroy for graceful
 * shutdown so no in-flight messages are lost on container restart.
 */
@Injectable()
export class SuggestionResultPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(PUBLISHER_NAME);
  private readonly client: ServiceBusClient;
  private readonly sender: ServiceBusSender;

  constructor() {
    const namespace = process.env[SERVICE_BUS_NAMESPACE_ENV_KEY];
    if (!namespace) {
      throw new Error(
        `Missing required environment variable: ${SERVICE_BUS_NAMESPACE_ENV_KEY}`,
      );
    }
    const credential = new DefaultAzureCredential();
    this.client = new ServiceBusClient(namespace, credential);
    this.sender = this.client.createSender(QUEUE_NAMES.SUGGESTION_RESULTS);
  }

  /**
   * Publishes a SuggestionResultMessage to the `suggestion-results` queue.
   *
   * Called immediately after a suggestion is transitioned to APPROVED so the
   * worker can pick it up and execute the use-case handler.
   *
   * @param message - The fully-populated SuggestionResultMessage to enqueue.
   * @returns Promise resolving once the message is accepted by the broker.
   */
  public async publishSuggestionResult(message: SuggestionResultMessage): Promise<void> {
    this.logger.log('Publishing SuggestionResultMessage to suggestion-results queue', {
      service: PUBLISHER_NAME,
      operatorId: message.operatorId,
      correlationId: message.correlationId,
      suggestionId: message.suggestionId,
      status: message.status,
    });

    await this.sender.sendMessages({
      body: message,
      contentType: 'application/json',
      timeToLive: MESSAGE_TTL_MS.SUGGESTION_RESULTS,
    });
  }

  /**
   * Gracefully closes the sender and client on module teardown.
   *
   * @returns Promise resolving when all connections are closed.
   */
  public async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing SuggestionResultPublisher sender and client');
    await this.sender.close();
    await this.client.close();
  }
}
