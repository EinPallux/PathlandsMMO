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
    // Emit to the repo-root `dist/` (not `client/dist`). Vercel's build looks for
    // the output at the repo root, and its Project-Settings output directory can
    // override vercel.json in some project configs — building to the root `dist`
    // makes the location unambiguous so the deploy always finds it.
    outDir: resolve(repoRoot, 'dist'),
    emptyOutDir: true, // required to clean an outDir outside the Vite root
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
