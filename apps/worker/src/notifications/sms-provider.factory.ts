/**
 * sms-provider.factory.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — SMS provider factory
 * ------------------------------------------------------------
 * Reads the SMS_PROVIDER environment variable and returns the correct
 * ISmsProvider implementation. Business logic never imports a concrete
 * provider directly — only this factory or the ISmsProvider interface.
 *
 * Key exports: SmsProviderFactory
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-18 — SMS Notifications
 */

import type { ISmsProvider } from './sms-provider.interface';
import { AzureCommunicationSmsProvider } from './azure-sms.provider';
import { TwilioSmsProvider } from './twilio-sms.provider';

/**
 * Factory that creates the appropriate ISmsProvider based on configuration.
 */
export class SmsProviderFactory {
  /**
   * Creates an ISmsProvider instance based on the provider name.
   *
   * @param providerName - Provider identifier: 'twilio' or 'azure'.
   * @returns An ISmsProvider implementation.
   */
  static create(providerName: string): ISmsProvider {
    switch (providerName.toLowerCase()) {
      case 'twilio':
        return new TwilioSmsProvider();
      case 'azure':
        return new AzureCommunicationSmsProvider();
      default:
        return new AzureCommunicationSmsProvider();
    }
  }
}
