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

import { Module, Logger } from '@nestjs/common';
import { SERVICE_BUS_NAMESPACE_ENV_KEY } from '@fsp-scheduler/shared-types';
import { ServiceBusService } from './service-bus.service';
import { PollJobPublisher } from './publishers/poll-job.publisher';
import { ChangeEventPublisher } from './publishers/change-event.publisher';
import { SuggestionResultPublisher } from './publishers/suggestion-result.publisher';
import { DeadLetterHandler } from './dead-letter.handler';

/** Logger used by the factory provider before the module is fully initialised. */
const factoryLogger = new Logger('ServiceBusModule');

/**
 * Feature module that provides the Azure Service Bus infrastructure to the
 * worker application. Exports all providers so that other feature modules
 * can import ServiceBusModule and inject the publishers or service directly.
 *
 * When the AZURE_SERVICE_BUS_NAMESPACE env var is absent (typical in local
 * development) the factory creates the service with a placeholder namespace.
 * The real Azure SDK call will only fail if message publishing is actually
 * attempted, which keeps the worker bootable for local dev/testing.
 */
@Module({
  providers: [
    {
      provide: ServiceBusService,
      useFactory: (): ServiceBusService => {
        const namespace = process.env[SERVICE_BUS_NAMESPACE_ENV_KEY];
        if (!namespace) {
          factoryLogger.warn(
            `Environment variable ${SERVICE_BUS_NAMESPACE_ENV_KEY} is not set. ` +
            'Service Bus operations will fail at runtime. ' +
            'Set the variable to a valid namespace for production use.',
          );
          return new ServiceBusService('local-dev-placeholder.servicebus.windows.net');
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
