import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
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
    },
  },
});
