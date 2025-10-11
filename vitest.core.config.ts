import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Core-first: run deterministic engine, selectors, services used by Settings MVP
    environment: 'node', // avoids "fs externalized" warnings in unit setup
    include: ['tests/**/*.{test,spec}.ts?(x)'],
    exclude: [
      'tests/**/fund-setup-utils.*',               // wizard (de-scoped)
      'tests/**/monte-carlo*',                     // Monte-Carlo (de-scoped)
      'tests/**/services/performance-prediction*', // prediction engine (de-scoped)
    ],
    reporters: ['default'],
    watch: false,
  },
});
