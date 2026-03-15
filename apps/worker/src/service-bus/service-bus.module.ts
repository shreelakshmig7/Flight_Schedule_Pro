/**
 * service-bus.module.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — Service Bus NestJS feature module
 * ------------------------------------------------------------------------
 * Wires together the ServiceBusService, all queue publishers, and the
 * DeadLetterHandler. Reads the Azure Service Bus namespace from the
 * AZURE_SERVICE_BUS_NAMESPACE environment variable and injects it into
 * ServiceBusService via a factory provider.
 *
 * Key exports: ServiceBusModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology
 */

import { Module } from '@nestjs/common';
import { SERVICE_BUS_NAMESPACE_ENV_KEY } from '@fsp-scheduler/shared-types';
import { ServiceBusService } from './service-bus.service';
import { PollJobPublisher } from './publishers/poll-job.publisher';
import { ChangeEventPublisher } from './publishers/change-event.publisher';
import { SuggestionResultPublisher } from './publishers/suggestion-result.publisher';
import { DeadLetterHandler } from './dead-letter.handler';

/**
 * Feature module that provides the Azure Service Bus infrastructure to the
 * worker application. Exports all providers so that other feature modules
 * can import ServiceBusModule and inject the publishers or service directly.
 */
@Module({
  providers: [
    {
      provide: ServiceBusService,
      useFactory: (): ServiceBusService => {
        const namespace = process.env[SERVICE_BUS_NAMESPACE_ENV_KEY];
        if (!namespace) {
          throw new Error(
            `Missing required environment variable: ${SERVICE_BUS_NAMESPACE_ENV_KEY}`,
          );
        }
        return new ServiceBusService(namespace);
      },
    },
    PollJobPublisher,
    ChangeEventPublisher,
    SuggestionResultPublisher,
    DeadLetterHandler,
  ],
  exports: [
    ServiceBusService,
    PollJobPublisher,
    ChangeEventPublisher,
    SuggestionResultPublisher,
    DeadLetterHandler,
  ],
})
export class ServiceBusModule {}
