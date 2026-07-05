// Flat ESLint config for the Pathlands monorepo.
// Enforces TS strictness and — critically — the MMO-readiness boundary:
// shared/ must stay pure (no DOM, Three.js, React, Node, Math.random, Date.now).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'client/vite.config.ts',
      'vitest.config.ts',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  // shared/ is the deterministic, platform-free simulation core. Guard the boundary.
  {
    files: ['shared/src/**/*.ts'],
    languageOptions: {
      globals: {},
    },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'shared/ must stay platform-free (no DOM).' },
        { name: 'document', message: 'shared/ must stay platform-free (no DOM).' },
        { name: 'navigator', message: 'shared/ must stay platform-free (no DOM).' },
        { name: 'process', message: 'shared/ must stay platform-free (no Node APIs).' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'No Math.random() in simulation code — use the seeded RNG from shared/core/rng.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'No wall-clock time in simulation code — the sim advances on fixed ticks.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: 'shared/ must not import Three.js.' },
            { name: 'react', message: 'shared/ must not import React.' },
          ],
          patterns: ['three/*', 'react/*', '@pathlands/client', '@pathlands/client/*'],
        },
      ],
    },
  },
  // Client engine touches the DOM and Three.js; give it browser + worker globals.
  {
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.worker,
      },
    },
  },
  // Test files and config get node globals.
  {
    files: ['**/*.test.ts', '**/*.config.ts', 'scripts/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
