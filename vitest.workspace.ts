import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/api/vitest.config.ts',
  'apps/worker/vitest.config.ts',
  'packages/fsp-client/vitest.config.ts',
  'packages/shared-types/vitest.config.ts',
  'packages/database/vitest.config.ts',
  'apps/web/vitest.config.ts',
]);
