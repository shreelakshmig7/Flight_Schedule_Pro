/**
 * main.ts
 * -------
 * Agentic Scheduler — FSP Integration — API application entry point
 * -----------------------------------------------------------------
 * Bootstraps the NestJS application using the Fastify adapter. The Fastify
 * adapter is used instead of Express for improved throughput and lower
 * latency, which is important given the multi-tenant polling workload.
 * Listens on the PORT environment variable (default 3000) on all interfaces.
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
 * Bootstraps the NestJS API application with the Fastify adapter.
 *
 * @returns A Promise that resolves when the application is listening
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const port = parseInt(process.env['PORT'] ?? '3000', 10);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // Enable CORS so the web app (port 3002) can call the API (port 3000)
  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3002',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Listen on all interfaces so Container Apps can route traffic
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port}`);
}

void bootstrap();
