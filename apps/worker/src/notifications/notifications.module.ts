/**
 * notifications.module.ts
 * -----------------------
 * Agentic Scheduler — FSP Integration — Notifications NestJS module
 * ------------------------------------------------------------------
 * Declares and exports the EmailService and SmsService for use by other
 * worker modules. The SMS provider is selected at module creation time
 * via the SMS_PROVIDER environment variable using SmsProviderFactory.
 *
 * Key exports: NotificationsModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-17 — Email Notifications
 * Updated: PR-18 — SMS Notifications (added SmsService, ISmsProvider)
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@fsp-scheduler/database';
import { FspClientModule } from '@fsp-scheduler/fsp-client';
import { EmailService } from './email.service';
import { SmsService, SMS_PROVIDER_TOKEN } from './sms.service';
import { SmsProviderFactory } from './sms-provider.factory';

/**
 * NestJS module that provides the EmailService and SmsService to other
 * worker modules. Import this module in any feature module that needs to
 * dispatch notifications after suggestion approval.
 */
@Module({
  imports: [DatabaseModule, FspClientModule],
  providers: [
    EmailService,
    {
      provide: SMS_PROVIDER_TOKEN,
      useFactory: () => {
        const providerName = process.env['SMS_PROVIDER'] ?? 'azure';
        return SmsProviderFactory.create(providerName);
      },
    },
    SmsService,
  ],
  exports: [EmailService, SmsService],
})
export class NotificationsModule {}
