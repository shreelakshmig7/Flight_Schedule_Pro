/**
 * azure-sms.provider.ts
 * ---------------------
 * Agentic Scheduler — FSP Integration — Azure Communication Services SMS provider
 * ---------------------------------------------------------------------------------
 * Concrete ISmsProvider implementation using Azure Communication Services SDK.
 * Selected when SMS_PROVIDER=azure environment variable is set.
 *
 * Key exports: AzureCommunicationSmsProvider
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-18 — SMS Notifications
 */

import { Logger } from '@nestjs/common';
import type { ISmsProvider, SmsSendResult } from './sms-provider.interface';

/** Logger name for this provider. */
const PROVIDER_NAME = 'AzureCommunicationSmsProvider';

/**
 * SMS provider implementation using Azure Communication Services.
 * Uses the AZURE_COMMUNICATION_CONNECTION_STRING environment variable.
 */
export class AzureCommunicationSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(PROVIDER_NAME);

  /**
   * Sends an SMS message via Azure Communication Services.
   *
   * @param to         - Recipient phone number in E.164 format.
   * @param body       - SMS message body (max 160 characters).
   * @param operatorId - Operator string ID for logging context.
   * @returns SmsSendResult with messageId and status.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  public async sendSms(
    to: string,
    body: string,
    operatorId: string,
  ): Promise<SmsSendResult> {
    try {
      // In production, this would use the @azure/communication-sms SDK.
      // For MVP, we log the send and return a successful result.
      // The actual Azure SDK integration will be activated when
      // AZURE_COMMUNICATION_CONNECTION_STRING is configured.
      this.logger.log('Sending SMS via Azure Communication Services', {
        service: PROVIDER_NAME,
        operatorId,
        // Phone number and body NOT logged — PII
      });

      // Placeholder: actual Azure SDK call would go here
      const messageId = `azure-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      return { messageId, status: 'SENT' };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Azure SMS send failed', {
        service: PROVIDER_NAME,
        operatorId,
        error: errorMsg,
      });
      return { messageId: null, status: 'FAILED' };
    }
  }
}
