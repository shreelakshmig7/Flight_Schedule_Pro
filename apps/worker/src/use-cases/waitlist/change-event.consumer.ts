/**
 * change-event.consumer.ts
 * -------------------------
 * Agentic Scheduler — FSP Integration — Change-events queue consumer
 * ------------------------------------------------------------------
 * Subscribes to the `change-events` Azure Service Bus queue and routes
 * each received message to the appropriate use-case handler based on
 * the `changeType` field:
 *
 *   NEW_OPENING   → WaitlistUseCaseService.processNewOpening()
 *   CANCELLATION  → (PR-14: RescheduleUseCaseService — not yet implemented)
 *   STATUS_CHANGE → (future use case — logged and discarded)
 *
 * Flow per message:
 *   1. Validate the message body as a ChangeEventMessage.
 *   2. Route to the appropriate handler.
 *   3. On success: complete the message (Service Bus removes it from queue).
 *   4. On error: log and complete (message is dead-lettered by Service Bus
 *      after maxDeliveryCount attempts).
 *
 * Key exports: ChangeEventConsumer
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-13 — Use Case A — Waitlist
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus';
import {
  isChangeEventMessage,
  QUEUE_NAMES,
} from '@fsp-scheduler/shared-types';
import { ServiceBusService } from '../../service-bus/service-bus.service';
import { WaitlistUseCaseService } from './waitlist-use-case.service';

/**
 * Consumes messages from the change-events Service Bus queue and dispatches
 * them to the appropriate use-case handler.
 *
 * Currently handles NEW_OPENING events for the waitlist use case.
 * CANCELLATION and STATUS_CHANGE events are logged and discarded until
 * PR-14 and PR-15 are implemented.
 */
@Injectable()
export class ChangeEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChangeEventConsumer.name);
  private receiver: ServiceBusReceiver | null = null;

  /**
   * @param serviceBusService     - Owns the Azure Service Bus client.
   * @param waitlistUseCaseService - Handler for NEW_OPENING events.
   */
  constructor(
    private readonly serviceBusService: ServiceBusService,
    private readonly waitlistUseCaseService: WaitlistUseCaseService,
  ) {}

  /** Subscribes to the change-events queue when the module initialises. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async onModuleInit(): Promise<void> {
    this.receiver = this.serviceBusService.createReceiver(QUEUE_NAMES.CHANGE_EVENTS);

    this.receiver.subscribe({
      processMessage: (msg) => this.processMessage(msg),
      // eslint-disable-next-line @typescript-eslint/require-await
      processError: async (args) => {
        this.logger.error(
          `Error from change-events receiver: ${args.error.message}`,
          { service: ChangeEventConsumer.name, errorSource: args.errorSource },
        );
      },
    });

    this.logger.log('ChangeEventConsumer subscribed to change-events queue');
  }

  /** Closes the receiver when the module is destroyed (graceful shutdown). */
  async onModuleDestroy(): Promise<void> {
    if (this.receiver) {
      await this.receiver.close();
      this.receiver = null;
    }
  }

  // ── Private: message handler ────────────────────────────────────────────────

  /**
   * Processes a single ChangeEventMessage from the queue.
   *
   * Validates the message, routes by changeType, then completes the
   * Service Bus message. On any error the message is completed (not
   * abandoned) so Service Bus dead-letters it after maxDeliveryCount.
   *
   * @param msg - Raw Service Bus received message.
   */
  private async processMessage(msg: ServiceBusReceivedMessage): Promise<void> {
    const body = msg.body as unknown;

    if (!isChangeEventMessage(body)) {
      this.logger.warn(
        `Received non-ChangeEventMessage on change-events queue — completing`,
        { service: ChangeEventConsumer.name, deliveryCount: msg.deliveryCount },
      );
      await this.receiver?.completeMessage(msg);
      return;
    }

    this.logger.log(
      `Received ${body.changeType} event for operator ${body.operatorId}`,
      {
        service: ChangeEventConsumer.name,
        operatorId: body.operatorId,
        correlationId: body.correlationId,
        changeType: body.changeType,
      },
    );

    try {
      switch (body.changeType) {
        case 'NEW_OPENING':
          await this.waitlistUseCaseService.processNewOpening(body);
          break;

        case 'CANCELLATION':
          // PR-14 — RescheduleUseCaseService (not yet implemented)
          this.logger.log(
            `CANCELLATION event received — RescheduleUseCaseService not yet wired (PR-14)`,
            { service: ChangeEventConsumer.name, operatorId: body.operatorId },
          );
          break;

        case 'STATUS_CHANGE':
          // Future use case — no handler in this PR
          this.logger.debug(
            `STATUS_CHANGE event received — no handler registered`,
            { service: ChangeEventConsumer.name, operatorId: body.operatorId },
          );
          break;

        default:
          this.logger.warn(
            `Unknown changeType received: ${(body as { changeType: string }).changeType}`,
          );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error processing ${body.changeType} event: ${message}`,
        { service: ChangeEventConsumer.name, operatorId: body.operatorId },
      );
    } finally {
      await this.receiver?.completeMessage(msg);
    }
  }
}
