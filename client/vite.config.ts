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
