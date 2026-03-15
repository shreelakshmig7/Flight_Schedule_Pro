/**
 * vitest.config.ts
 * ----------------
 * Agentic Scheduler — FSP Integration — API Vitest configuration
 * -------------------------------------------------------------
 * Configures Vitest for the api app. Uses the SWC plugin to enable
 * TypeScript decorator metadata emission (emitDecoratorMetadata), which
 * is required by NestJS dependency injection at runtime. Also sets up
 * path aliases so workspace packages resolve correctly in tests.
 *
 * Key exports: default (Vitest config)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-7 — Authentication and Multi-Tenant Middleware (added SWC plugin + setupFiles)
 */

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.spec.ts'],
    // Provide a dummy DATABASE_URL so PrismaClient can be instantiated in tests
    // without a real database. The PrismaService is overridden with a no-op mock
    // in individual tests so $connect is never actually called.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
    },
  },
  resolve: {
    alias: {
      '@fsp-scheduler/shared-types': new URL('../../packages/shared-types/src/index.ts', import.meta.url).pathname,
      '@fsp-scheduler/database': new URL('../../packages/database/src/index.ts', import.meta.url).pathname,
      '@fsp-scheduler/fsp-client': new URL('../../packages/fsp-client/src/index.ts', import.meta.url).pathname,
    },
  },
});
