/**
 * main.ts
 * -------
 * Agentic Scheduler — FSP Integration — Worker application entry point
 * --------------------------------------------------------------------
 * Bootstraps the NestJS worker application. The worker does not expose
 * HTTP endpoints for external traffic — it runs background jobs including
 * the polling dispatcher, change detection engine, and suggestion generator.
 * A minimal Fastify server is kept running for internal TCP health checks
 * used by Azure Container Apps liveness probes. A SIGTERM handler ensures
 * graceful shutdown of Service Bus connections and scheduled tasks.
 *
 * Key exports: bootstrap (not exported — entry point only)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-4 — Azure Service Bus Queue Topology (added SIGTERM handler)
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstraps the NestJS worker application and registers a SIGTERM handler
 * for graceful shutdown of all Service Bus connections.
 *
 * @returns A Promise that resolves when the worker is running
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');
  const port = parseInt(process.env['WORKER_PORT'] ?? '3001', 10);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  process.on('SIGTERM', () => {
    logger.log('SIGTERM received — initiating graceful shutdown');
    void app.close();
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`Worker service running on port ${port}`);
}

void bootstrap();
