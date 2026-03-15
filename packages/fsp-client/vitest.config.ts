import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@fsp-scheduler/shared-types': new URL('../shared-types/src/index.ts', import.meta.url).pathname,
    },
  },
});
