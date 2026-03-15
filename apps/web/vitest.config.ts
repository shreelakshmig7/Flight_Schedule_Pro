import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx'],
  },
  resolve: {
    alias: {
      '@fsp-scheduler/shared-types': new URL('../../packages/shared-types/src/index.ts', import.meta.url).pathname,
    },
  },
});
