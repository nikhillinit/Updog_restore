import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Core-first: run deterministic engine, selectors, services used by Settings MVP
    environment: 'node', // avoids "fs externalized" warnings in unit setup
    include: [
      'src/**/*.{test,spec}.ts?(x)', // For in-source tests
      'tests/**/*.{test,spec}.ts?(x)', // For traditional test structure
    ],
    globals: false, // Disable globals for better performance and isolation
    exclude: [
      'tests/**/fund-setup-utils.*',               // wizard (de-scoped)
      'tests/**/monte-carlo*',                     // Monte-Carlo (de-scoped)
      'tests/**/services/performance-prediction*', // prediction engine (de-scoped)
    ],
    reporters: ['default'],
    watch: false,
  },
});
