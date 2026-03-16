/**
 * sms-provider.interface.ts
 * -------------------------
 * Agentic Scheduler — FSP Integration — SMS provider abstraction
 * ---------------------------------------------------------------
 * Defines the ISmsProvider interface that all SMS provider implementations
 * must satisfy. The SmsService depends only on this interface — never on a
 * concrete provider — to enable runtime provider selection via SMS_PROVIDER
 * environment variable.
 *
 * Key exports: ISmsProvider, SmsSendResult
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-18 — SMS Notifications
 */

/**
 * Result of an SMS send attempt from any provider.
 */
export interface SmsSendResult {
  /** Provider-assigned message ID for tracking, or null if send failed. */
  messageId: string | null;
  /** Delivery status: SENT if accepted by provider, FAILED otherwise. */
  status: 'SENT' | 'FAILED';
}

/**
 * Abstraction layer for SMS providers. Concrete implementations exist for
 * Azure Communication Services and Twilio. Business logic injects this
 * interface — never a concrete provider class.
 */
export interface ISmsProvider {
  /**
   * Sends an SMS message to the specified recipient.
   *
   * @param to         - Recipient phone number in E.164 format.
   * @param body       - SMS message body (max 160 characters).
   * @param operatorId - Operator string ID for logging context.
   * @returns SmsSendResult with messageId and status.
   */
  sendSms(to: string, body: string, operatorId: string): Promise<SmsSendResult>;
}
