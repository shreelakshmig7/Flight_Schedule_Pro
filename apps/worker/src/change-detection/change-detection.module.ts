/**
 * change-detection.module.ts
 * ---------------------------
 * Agentic Scheduler — FSP Integration — Change Detection feature module
 * ----------------------------------------------------------------------
 * Wires together all change-detection components:
 *   - ReservationDiffService — pure diff/hash utility
 *   - ChangeDetectionService — orchestrates diff, DB updates, and event publication
 *
 * ServiceBusModule is imported to provide ChangeEventPublisher.
 * DatabaseModule and PrismaService are provided globally by AppModule.
 *
 * Key exports: ChangeDetectionModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-9 — Change Detection Engine
 */

import { Module } from '@nestjs/common';
import { ServiceBusModule } from '../service-bus/service-bus.module';
import { ReservationDiffService } from './reservation-diff.service';
import { ChangeDetectionService } from './change-detection.service';

/**
 * Feature module for the change detection engine.
 *
 * Both providers are exported so that PollingModule (PollJobConsumer) and
 * any future downstream modules can inject them directly.
 */
@Module({
  imports: [ServiceBusModule],
  providers: [ReservationDiffService, ChangeDetectionService],
  exports: [ReservationDiffService, ChangeDetectionService],
})
export class ChangeDetectionModule {}
