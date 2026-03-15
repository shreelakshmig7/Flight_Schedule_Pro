import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
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
