/**
 * polling.module.ts
 * ------------------
 * Agentic Scheduler — FSP Integration — Polling feature module
 * ------------------------------------------------------------
 * Wires together all polling components:
 *   - TokenBucket           — shared rate-limit token bucket
 *   - RawSnapshotStore      — in-memory storage for FSP poll results
 *   - PollingDispatcherService — per-operator interval scheduler
 *   - TierClassifierService — hourly tier reclassification cron
 *   - PollJobConsumer       — poll-jobs queue consumer
 *
 * ServiceBusModule, DatabaseModule, FspClientModule, and WorkerAuthModule
 * are all global (or imported by AppModule) so their providers are
 * available here without explicit imports.
 *
 * Key exports: PollingModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-8 — Rate-Limited Polling Dispatcher
 * Updated: PR-9 — Change Detection Engine (imports ChangeDetectionModule for PollJobConsumer)
 */

import { Module } from '@nestjs/common';
import { TokenBucket } from './token-bucket';
import { RawSnapshotStore } from './raw-snapshot.store';
import { PollingDispatcherService } from './polling-dispatcher.service';
import { TierClassifierService } from './tier-classifier.service';
import { PollJobConsumer } from './poll-job.consumer';
import { ServiceBusModule } from '../service-bus/service-bus.module';
import { ChangeDetectionModule } from '../change-detection/change-detection.module';
import { WorkerAuthModule } from '../auth/worker-auth.module';

/**
 * Feature module for the rate-limited polling dispatcher.
 *
 * All five polling providers are exported so that downstream modules
 * (change detection, suggestion engine) can inject RawSnapshotStore
 * and PollingDispatcherService directly.
 *
 * ChangeDetectionModule is imported so that PollJobConsumer can inject
 * ChangeDetectionService. WorkerAuthModule is imported so that
 * PollJobConsumer can inject TokenStore.
 */
@Module({
  imports: [ServiceBusModule, ChangeDetectionModule, WorkerAuthModule],
  providers: [
    TokenBucket,
    RawSnapshotStore,
    PollingDispatcherService,
    TierClassifierService,
    PollJobConsumer,
  ],
  exports: [
    TokenBucket,
    RawSnapshotStore,
    PollingDispatcherService,
    TierClassifierService,
    PollJobConsumer,
  ],
})
export class PollingModule {}
