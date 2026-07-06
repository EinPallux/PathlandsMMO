import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// The repo-root public/ holds the 2D asset renders used as UI art (ART_GUIDE §5).
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: resolve(repoRoot, 'public'),
  resolve: {
    alias: {
      '@pathlands/shared': resolve(repoRoot, 'shared/src/index.ts'),
      '@': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src'),
    },
  },
  build: {
    // Standard client-local output. `pnpm build` then mirrors it to the repo-root
    // `dist/` (scripts/mirror-dist.mjs) so Vercel finds the output whether its Root
    // Directory resolves the output at `client/dist` or repo-root `dist`.
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 3072,
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
    port: 5173,
  },
});
