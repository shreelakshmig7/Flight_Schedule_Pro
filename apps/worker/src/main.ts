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

import { createServer } from 'net';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const WORKER_PORT_DEFAULT = 3001;
/** Disjoint from API (3000, 3003–3009) and web (3002, 3017–3023) so parallel dev never collides. */
const WORKER_PORT_CANDIDATES = [3001, 3010, 3011, 3012, 3013, 3014, 3015, 3016];

/**
 * Returns the first port from the candidate list that is free to bind.
 */
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
 * Bootstraps the NestJS worker application and registers a SIGTERM handler
 * for graceful shutdown of all Service Bus connections.
 *
 * @returns A Promise that resolves when the worker is running
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');
  const port = await findAvailablePort(WORKER_PORT_CANDIDATES);

  if (port !== WORKER_PORT_CANDIDATES[0]) {
    logger.warn(
      `Port ${WORKER_PORT_CANDIDATES[0]} was in use; worker will listen on port ${port}. Set WORKER_PORT to avoid fallback.`,
    );
  }

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
