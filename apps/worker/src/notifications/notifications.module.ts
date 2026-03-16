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
import { DatabaseModule, PrismaService } from '@fsp-scheduler/database';
import { FspClientModule, StudentsService } from '@fsp-scheduler/fsp-client';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { SmsProviderFactory } from './sms-provider.factory';
import type { ISmsProvider } from './sms-provider.interface';

/**
 * Custom provider token for ISmsProvider injection.
 */
const SMS_PROVIDER_TOKEN = 'ISmsProvider';

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
    {
      provide: SmsService,
      useFactory: (prisma: unknown, studentsService: unknown, smsProvider: unknown) => {
        return new SmsService(
          prisma as PrismaService,
          studentsService as StudentsService,
          smsProvider as ISmsProvider,
        );
      },
      inject: ['PrismaService', 'StudentsService', SMS_PROVIDER_TOKEN],
    },
  ],
  exports: [EmailService, SmsService],
})
export class NotificationsModule {}
