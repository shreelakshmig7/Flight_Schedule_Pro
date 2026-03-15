/**
 * health.spec.ts
 * --------------
 * Agentic Scheduler — FSP Integration — Health endpoint integration test
 * ----------------------------------------------------------------------
 * Verifies that the NestJS API bootstraps correctly with the Fastify adapter
 * and returns { status: "ok" } with HTTP 200 on GET /health. This is the
 * liveness probe used by Azure Container Apps. Uses a focused test module
 * that imports only HealthController with no auth guard, since /health is
 * decorated with @Public() and does not require authentication.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 * Updated: PR-5 — Mock PrismaService to avoid DATABASE_URL requirement in tests
 * Updated: PR-7 — Use focused test module without APP_GUARD for health check
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { HealthController } from '../src/health/health.controller';

describe('Health Check (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns { status: "ok" } with HTTP 200', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });
});
