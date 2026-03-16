/**
 * database.module.ts
 * ------------------
 * Agentic Scheduler — FSP Integration — NestJS global database module
 * --------------------------------------------------------------------
 * Declares and exports PrismaService as a NestJS global module so any
 * feature module across apps/api and apps/worker can inject PrismaService
 * without explicitly importing DatabaseModule each time.
 * Import this module once in the root AppModule of each application.
 *
 * Key exports: DatabaseModule
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-5 — Prisma Schema and Database Migrations
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global NestJS module that registers PrismaService as a singleton provider
 * and re-exports it so downstream modules can inject it without re-importing
 * DatabaseModule.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
