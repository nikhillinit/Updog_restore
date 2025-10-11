import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import os from 'node:os';

const isCI = !!process.env.CI;
const HALF_CORES = Math.max(1, Math.ceil((os.cpus()?.length ?? 2) / 2));

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Core-first: fast, deterministic tests for PR gates
    environment: 'node', // Avoids "fs externalized" warnings

    include: [
      'tests/unit/**/*.{test,spec}.ts?(x)',
      'tests/core/**/*.{test,spec}.ts?(x)',
      'src/**/__tests__/**/*.{test,spec}.ts?(x)', // In-source tests
    ],

    exclude: [
      // Exclude heavy/extended test suites (run in weekly-extended.yml)
      'tests/**/integration/**',
      'tests/**/e2e/**',
      'tests/**/a11y/**',
      'tests/**/visual/**',
      'tests/**/migrations/**',
      'tests/**/smoke/**',
      'tests/**/synthetics/**',
      'tests/**/quarantine/**',
      'tests/**/wizard*',
      'tests/**/monte-carlo*', // Monte Carlo (de-scoped for MVP)
      'tests/**/performance-prediction*', // Prediction engine (de-scoped)
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],

    // Reporters: clean output in CI, rich output locally
    reporters: isCI ? ['dot'] : ['default'],
    silent: isCI,

    // Coverage: disabled for speed (enable in weekly-extended)
    coverage: { enabled: false },

    // Thread pool optimization
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: isCI ? HALF_CORES : undefined,
        minThreads: 1,
      },
    },

    // Timeouts: strict for CI stability
    testTimeout: 10_000,
    hookTimeout: 10_000,

    // Retry: single retry in CI for flaky tests
    retry: isCI ? 1 : 0,

    // Watch exclusions
    watchExclude: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.cache/**',
    ],

    // Setup files: global stubs for heavy deps
    setupFiles: ['tests/setup/core.setup.ts'],

    // Globals: keep enabled for now (incrementally migrate to explicit imports)
    globals: true,
  },
});
