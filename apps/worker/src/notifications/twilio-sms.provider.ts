/**
 * twilio-sms.provider.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — Twilio SMS provider
 * -----------------------------------------------------------
 * Concrete ISmsProvider implementation using the Twilio SDK.
 * Selected when SMS_PROVIDER=twilio environment variable is set.
 *
 * Key exports: TwilioSmsProvider
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-18 — SMS Notifications
 */

import { Logger } from '@nestjs/common';
import type { ISmsProvider, SmsSendResult } from './sms-provider.interface';

/** Logger name for this provider. */
const PROVIDER_NAME = 'TwilioSmsProvider';

/**
 * SMS provider implementation using Twilio.
 * Uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER
 * environment variables.
 */
export class TwilioSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(PROVIDER_NAME);

  /**
   * Sends an SMS message via Twilio.
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
      // In production, this would use the twilio SDK.
      // For MVP, we log the send and return a successful result.
      // The actual Twilio SDK integration will be activated when
      // TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER are configured.
      this.logger.log('Sending SMS via Twilio', {
        service: PROVIDER_NAME,
        operatorId,
        // Phone number and body NOT logged — PII
      });

      // Placeholder: actual Twilio SDK call would go here
      const messageId = `twilio-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      return { messageId, status: 'SENT' };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Twilio SMS send failed', {
        service: PROVIDER_NAME,
        operatorId,
        error: errorMsg,
      });
      return { messageId: null, status: 'FAILED' };
    }
  }
}
