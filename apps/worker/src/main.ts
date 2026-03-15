/**
 * main.ts
 * -------
 * Agentic Scheduler — FSP Integration — Worker application entry point
 * --------------------------------------------------------------------
 * Bootstraps the NestJS worker application. The worker does not expose
 * HTTP endpoints for external traffic — it runs background jobs including
 * the polling dispatcher, change detection engine, and suggestion generator.
 * A minimal Fastify server is kept running for internal TCP health checks
 * used by Azure Container Apps liveness probes.
 *
 * Key exports: bootstrap (not exported — entry point only)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstraps the NestJS worker application.
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

  await app.listen(port, '0.0.0.0');
  logger.log(`Worker service running on port ${port}`);
}

void bootstrap();
