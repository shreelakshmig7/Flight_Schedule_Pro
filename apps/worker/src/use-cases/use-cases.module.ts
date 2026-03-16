/**
 * use-cases.module.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — Use Cases aggregation NestJS module
 * ---------------------------------------------------------------------------
 * Aggregates all use-case feature modules and provides the shared
 * ChangeEventConsumer that routes Service Bus messages to the appropriate
 * use-case handler.
 *
 * Use-case routing:
 *   NEW_OPENING       → WaitlistUseCaseService   (PR-13)
 *   CANCELLATION      → RescheduleUseCaseService (PR-14)
 *   DISCOVERY_REQUEST → DiscoveryUseCaseService  (PR-15)
 *   STATUS_CHANGE     → logged and discarded     (future PR)
 *
 * Imports:
 *   - ServiceBusModule  — provides ServiceBusService for the consumer
 *   - WaitlistModule    — provides WaitlistUseCaseService
 *   - RescheduleModule  — provides RescheduleUseCaseService
 *   - DiscoveryModule   — provides DiscoveryUseCaseService
 *
 * Key exports: UseCasesModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-14 — Use Case B — Reschedule
 * Updated: PR-15 — Use Case C — Discovery (added DiscoveryModule)
 */

import { Module } from '@nestjs/common';
import { ServiceBusModule } from '../service-bus/service-bus.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { RescheduleModule } from './reschedule/reschedule.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { ChangeEventConsumer } from './change-event.consumer';

/**
 * Aggregation module for all use-case feature modules.
 *
 * Provides the ChangeEventConsumer which subscribes to the change-events
 * queue and routes events to the appropriate handler based on changeType.
 */
@Module({
  imports: [ServiceBusModule, WaitlistModule, RescheduleModule, DiscoveryModule],
  providers: [ChangeEventConsumer],
})
export class UseCasesModule {}
