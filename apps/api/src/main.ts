/**
 * main.ts
 * -------
 * Agentic Scheduler — FSP Integration — API application entry point
 * -----------------------------------------------------------------
 * Bootstraps the NestJS application using the Fastify adapter. The Fastify
 * adapter is used instead of Express for improved throughput and lower
 * latency, which is important given the multi-tenant polling workload.
 * Listens on the PORT environment variable (default 3000) on all interfaces.
 * If the preferred port is in use, tries the next available port in a small
 * range so dev can start when 3000 is occupied.
 *
 * Key exports: bootstrap (not exported — entry point only)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

import { createServer } from 'net';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/** Disjoint from worker (3001, 3010–3016) and web (3002, 3017–3023) so parallel dev never collides. */
const API_PORT_CANDIDATES = [3000, 3003, 3004, 3005, 3006, 3007, 3008, 3009];

function findAvailablePort(candidates: number[]): Promise<number> {
  return new Promise((resolve, reject) => {
    let index = 0;
    function tryNext(): void {
      if (index >= candidates.length) {
        reject(new Error(`No available port among [${candidates.join(', ')}]`));
        return;
      }
      const p = candidates[index];
      index += 1;
      if (p === undefined) {
        reject(new Error(`No available port among [${candidates.join(', ')}]`));
        return;
      }
      const portToBind = p;
      const server = createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          tryNext();
        } else {
          reject(err);
        }
      });
      server.once('listening', () => {
        server.close(() => resolve(portToBind));
      });
      server.listen(portToBind, '0.0.0.0');
    }
    tryNext();
  });
}

/**
 * Bootstraps the NestJS API application with the Fastify adapter.
 *
 * @returns A Promise that resolves when the application is listening
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const port = await findAvailablePort(API_PORT_CANDIDATES);

  if (port !== API_PORT_CANDIDATES[0]) {
    logger.warn(
      `Port ${API_PORT_CANDIDATES[0]} was in use; API will listen on port ${port}. Set PORT to avoid fallback.`,
    );
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // Enable CORS so the web app can call the API (default origin: port 3002)
  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3002',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port}`);
}

void bootstrap();
