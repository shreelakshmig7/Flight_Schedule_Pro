/**
 * prisma.service.ts
 * -----------------
 * Agentic Scheduler — FSP Integration — NestJS PrismaClient wrapper
 * -----------------------------------------------------------------
 * Provides a singleton PrismaClient instance as an injectable NestJS
 * service. The service connects to the database when the NestJS module
 * initialises and cleanly disconnects when the module is destroyed.
 * All consuming apps/worker and apps/api modules import DatabaseModule,
 * which re-exports this service globally.
 *
 * Key exports: PrismaService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-5 — Prisma Schema and Database Migrations
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from './generated/prisma';

/** Service name constant used in log messages. */
const SERVICE_NAME = 'PrismaService';

/**
 * NestJS injectable wrapper around the Prisma generated PrismaClient.
 *
 * Extends PrismaClient so all model accessors (e.g. this.operator.findMany)
 * are available directly on the service instance without an extra property.
 * Lifecycle hooks ensure the database connection is opened at startup and
 * closed gracefully at shutdown.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SERVICE_NAME);

  /** Initialises the service and logs a startup message. */
  constructor() {
    super();
    this.logger.log(`${SERVICE_NAME} initialized`);
  }

  /**
   * Opens the database connection when the NestJS module initialises.
   * If the database is unreachable (firewall, wrong credentials, etc.)
   * the app still starts and logs a warning so that liveness probes pass
   * and all routes register. DB-dependent routes will fail at request time
   * with a clear Prisma error until the database becomes reachable.
   *
   * @returns A Promise that resolves once the connection is established or when connection fails.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (err) {
      this.logger.warn(
        'Database unreachable at startup — app started anyway. ' +
        'DB-dependent routes will fail until the database is reachable.',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Closes the database connection when the NestJS module is destroyed.
   *
   * @returns A Promise that resolves once the connection is closed.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
