import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@pathlands/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['shared/test/**/*.test.ts', 'client/test/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
