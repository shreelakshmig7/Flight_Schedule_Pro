/**
 * discovery.module.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — Use Case C (Discovery) NestJS module
 * ---------------------------------------------------------------------------
 * Wires together all components required for the Discovery use case:
 *   - DiscoveryUseCaseService — core business logic for DISCOVERY_REQUEST events
 *
 * Imports:
 *   - LlmModule — provides RationaleGenerator
 *
 * All FSP service classes (FindATimeService, CivilTwilightService, etc.) are
 * provided globally by FspClientModule (already imported in AppModule).
 *
 * The ChangeEventConsumer is provided by UseCasesModule which imports this
 * module and supplies the shared queue consumer.
 *
 * Key exports: DiscoveryModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-15 — Use Case C — Discovery
 */

import { Module } from '@nestjs/common';
import { LlmModule } from '../../llm/llm.module';
import { DiscoveryUseCaseService } from './discovery-use-case.service';

/**
 * Feature module for Use Case C — Discovery.
 *
 * Registers the DiscoveryUseCaseService. FSP clients are available globally
 * via FspClientModule, and PrismaService via DatabaseModule.
 */
@Module({
  imports: [LlmModule],
  providers: [DiscoveryUseCaseService],
  exports: [DiscoveryUseCaseService],
})
export class DiscoveryModule {}
