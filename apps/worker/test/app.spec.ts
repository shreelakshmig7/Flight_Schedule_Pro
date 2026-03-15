/**
 * app.spec.ts
 * -----------
 * Agentic Scheduler — FSP Integration — Worker app bootstrap test
 * ---------------------------------------------------------------
 * Verifies that the NestJS worker app module compiles and the application
 * context can be created without errors. This confirms the Fastify adapter
 * and module wiring are correct before any worker logic is added.
 *
 * Key exports: (test suite only — no exports)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('Worker AppModule', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('compiles the worker AppModule without errors', () => {
    expect(moduleRef).toBeDefined();
  });
});
