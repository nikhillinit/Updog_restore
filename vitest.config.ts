import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// Derive project root in ESM-compatible way (no __dirname in Vitest ESM configs)
const projectRoot = dirname(fileURLToPath(import.meta.url));

// Shared alias constant (single source of truth)
// Vitest test.projects don't inherit root-level resolve.alias (Vitest <1.0 behavior)
// so we extract this constant and explicitly add to each project that needs it
const alias = {
  // Primary path aliases (mirrors vite.config.ts)
  // Note: '@/' must come before '@' to match more specific paths first
  '@/core': resolve(projectRoot, './client/src/core'),
  '@/lib': resolve(projectRoot, './client/src/lib'),
  '@/server': resolve(projectRoot, './server'),
  '@/metrics/reserves-metrics': resolve(projectRoot, './tests/mocks/metrics-mock.ts'),
  '@/server/utils/logger': resolve(projectRoot, './tests/mocks/server-logger.ts'),
  '@/': resolve(projectRoot, './client/src/'),
  '@': resolve(projectRoot, './client/src'),

  // Shared and assets
  '@shared/': resolve(projectRoot, './shared/'),
  '@shared': resolve(projectRoot, './shared'),
  '@assets': resolve(projectRoot, './assets'),

  // Schema aliases (matches tsconfig.json)
  '@schema/': resolve(projectRoot, './schema/src/'),
  '@schema': resolve(projectRoot, './schema/src/index.ts'),

  // Test mocks
  '@upstash/redis': resolve(projectRoot, './tests/mocks/upstash-redis.ts'),
};

export default defineConfig({
  resolve: {
    alias, // Use shared constant
  },
  test: {
    reporters: process.env['CI'] ? ['default', 'github-actions'] : ['default'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    testTimeout: 30000, // Increased for Testcontainers startup
    hookTimeout: 20000,
    teardownTimeout: 5000,
    retry: process.env['CI'] ? 2 : 0,
    pool: 'threads', // Try threads instead of forks for React 18
    // CI optimization: Reduce thread count to fix memory mode failures
    maxThreads: process.env['CI'] ? 4 : undefined,
    minThreads: 1,
    // Setup file for global mocks (Sentry, etc.)
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        'migrations/**',
        'scripts/**',
        '.github/**',
        'repo/**',
        'ai-logs/**', // Exclude AI logs from coverage
        'observability/**',
        'workers/**',
        // Test files
        'tests/**',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
      ],
      include: ['client/src/**/*.{js,ts,tsx}', 'server/**/*.{js,ts}', 'shared/**/*.{js,ts}'],
    },
    // Unit tests configuration (default)
    // Keep jsdom as default for React component tests
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true, // enable rAF/timers like a visible tab
        resources: 'usable', // be lenient loading resources
      },
    },
    // Modern test.projects configuration (replaces deprecated environmentMatchGlobs)
    projects: [
      {
        resolve: { alias }, // Explicit alias for server project (projects don't inherit root resolve)
        test: {
          name: 'server',
          environment: 'node',
          // All .test.ts files run in Node environment (perf tests run in dedicated CI job)
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['./tests/setup/test-infrastructure.ts', './tests/setup/node-setup.ts'],
        },
      },
      {
        resolve: { alias }, // Explicit alias for client project (for consistency)
        test: {
          name: 'client',
          environment: 'jsdom',
          // Simplified: All .test.tsx files run in jsdom environment
          include: ['tests/unit/**/*.test.tsx'],
          setupFiles: ['./tests/setup/test-infrastructure.ts', './tests/setup/jsdom-setup.ts'],
          environmentOptions: {
            jsdom: {
              pretendToBeVisual: true, // enable rAF/timers like a visible tab
              resources: 'usable', // be lenient loading resources
            },
          },
        },
      },
    ],
    include: ['tests/unit/**/*.{test,spec}.ts?(x)', ...configDefaults.include], // Include default Vitest patterns
    exclude: [
      // Tests requiring database or external services
      'tests/integration/**/*',
      'tests/rls/**/*',
      'tests/chaos/**/*',
      'tests/api/**/*',
      'tests/migrations/**/*',
      // Tests requiring browser
      'tests/e2e/**/*',
      'tests/a11y/**/*',
      'tests/smoke/**/*',
      'tests/synthetics/**/*',
      'tests/visual/**/*',
      // Load/performance tests (separate CI job)
      'tests/load/**/*',
      'tests/k6/**/*',
      'tests/perf/**/*',
      // Agent tests (missing AI eval modules)
      'tests/agents/**/*',
      // Parallel tests (require specific setup)
      'tests/parallel/**/*',
      // Middleware tests (may require Redis)
      'tests/middleware/**/*',
      // Quarantined tests
      'tests/quarantine/**/*',
      '**/*.quarantine.{test,spec}.ts?(x)',
      // Specific exclusions
      'tests/unit/fund-setup.smoke.test.tsx', // explicitly excluded - requires real browser
    ],
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
    },
  },
});
