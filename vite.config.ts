/// <reference types="vite/client" />
import preact from '@preact/preset-vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';
import type http from 'http';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath } from 'url';
import { defineConfig, type Plugin } from 'vite';
import virtual from 'vite-plugin-virtual';
import tsconfigPaths from 'vite-tsconfig-paths';

// Comprehensive winston mock
const winstonMock = `
export const format = {
  combine: (...args) => ({}),
  timestamp: () => ({}),
  errors: () => ({}),
  splat: () => ({}),
  json: () => ({}),
  simple: () => ({}),
  colorize: () => ({}),
  printf: (fn) => ({}),
  metadata: () => ({}),
  align: () => ({}),
  cli: () => ({}),
  padLevels: () => ({}),
  prettyPrint: () => ({}),
  uncolorize: () => ({})
};

export const transports = {
  Console: class Console {
    constructor(options) {}
  },
  File: class File {
    constructor(options) {}
  },
  Http: class Http {
    constructor(options) {}
  },
  Stream: class Stream {
    constructor(options) {}
  }
};

export const createLogger = (options) => ({
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  verbose: () => {},
  silly: () => {},
  log: () => {},
  add: () => {},
  remove: () => {},
  clear: () => {},
  close: () => {},
  on: () => {},
  child: () => createLogger()
});

export const addColors = () => {};
export const Logger = createLogger;
export const Container = class Container {
  constructor() {
    this.loggers = new Map();
  }
  add(id, options) {
    const logger = createLogger(options);
    this.loggers.set(id, logger);
    return logger;
  }
  get(id) {
    return this.loggers.get(id);
  }
  has(id) {
    return this.loggers.has(id);
  }
};

const container = new Container();
export { container };

export default { 
  format, 
  transports, 
  createLogger, 
  addColors, 
  Logger,
  Container,
  container
};
`;

// Comprehensive prom-client mock
const promClientMock = `
export const register = {
  metrics: () => Promise.resolve(''),
  contentType: 'text/plain',
  clear: () => {},
  getMetricsAsJSON: () => [],
  getSingleMetric: () => undefined,
  registerMetric: () => {},
  removeSingleMetric: () => {},
  getSingleMetricAsString: () => ''
};

export class Counter {
  constructor(config) {
    this.name = config.name;
  }
  inc(labels, value) {}
  reset() {}
  get() { return { values: [] }; }
  remove() {}
}

export class Gauge {
  constructor(config) {
    this.name = config.name;
  }
  set(labels, value) {}
  inc(labels, value) {}
  dec(labels, value) {}
  setToCurrentTime() {}
  startTimer() { return () => {}; }
  reset() {}
  get() { return { values: [] }; }
  remove() {}
}

export class Histogram {
  constructor(config) {
    this.name = config.name;
  }
  observe(labels, value) {}
  startTimer() { return () => {}; }
  reset() {}
  get() { return { values: [] }; }
  remove() {}
}

export class Summary {
  constructor(config) {
    this.name = config.name;
  }
  observe(labels, value) {}
  startTimer() { return () => {}; }
  reset() {}
  get() { return { values: [] }; }
  remove() {}
}

export const collectDefaultMetrics = (config) => {};
export const Registry = class Registry {
  constructor() {}
  registerMetric() {}
  clear() {}
  metrics() { return Promise.resolve(''); }
  getMetricsAsJSON() { return []; }
};

export default { 
  register, 
  Counter, 
  Gauge, 
  Histogram, 
  Summary, 
  collectDefaultMetrics,
  Registry
};
`;

// Get build-time values using native file operations
const rootDir = path.dirname(fileURLToPath(import.meta.url));

const getGitSha = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

const getAppVersion = () => {
  try {
    const packagePath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { version?: string };
    return pkg.version || 'unknown';
  } catch {
    return '1.3.2';
  }
};

// Configuration moved inside defineConfig to access mode parameter

const sentryOn = !!process.env['VITE_SENTRY_DSN'];
const sentryNoop = path.resolve(import.meta.dirname, 'client/src/monitoring/noop.ts');

// Preact aliases defined inline below (see resolve.alias)

export default defineConfig(({ mode }: { mode: string }) => {
  const usePreact =
    process.env['BUILD_WITH_PREACT'] === '1' ||
    process.env['BUILD_WITH_PREACT'] === 'true' ||
    process.env['VITE_USE_PREACT'] === '1' ||
    mode === 'preact';

  const parsePort = (value: string | undefined, fallback: number) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };

  const clientPort = parsePort(process.env['VITE_CLIENT_PORT'], 5173);
  const apiPort = parsePort(process.env['VITE_API_PORT'] ?? process.env['PORT'], 5000);
  const apiTarget = process.env['VITE_API_URL'] ?? `http://localhost:${apiPort}`;

  return {
    base: '/', // Ensure absolute paths for assets
    server: {
      port: clientPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    plugins: [
      // Dev telemetry stub - always returns 204 for telemetry endpoints
      {
        name: 'dev-telemetry-stub',
        configureServer(server: {
          middlewares: {
            use: (
              path: string,
              handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
            ) => void;
          };
        }) {
          server.middlewares.use(
            '/api/telemetry/wizard',
            async (req: http.IncomingMessage, res: http.ServerResponse) => {
              try {
                let body = '';
                for await (const chunk of req) body += chunk;
                if (body) JSON.parse(body); // validate JSON without crashing dev
                res.statusCode = 204;
                res.end();
              } catch {
                res.statusCode = 400;
                res.end('Bad payload');
              }
            }
          );
        },
      },
      // Use absolute path so Vite doesn't ever look for "client/client/tsconfig.json"
      tsconfigPaths({
        projects: [path.resolve(import.meta.dirname, 'client/tsconfig.json')],
        // ignoreConfigErrors: true // (optional) uncomment if a transient parse error blocks local runs
      }),
      virtual({
        winston: winstonMock,
        'prom-client': promClientMock,
      }),
      // Conditional React/Preact plugin
      usePreact ? preact({ devtoolsInProd: false }) : react(),
      // Bundle visualization with detailed size metrics
      visualizer({
        filename: 'dist/stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
      // JSON data for programmatic analysis (Tier C)
      visualizer({
        filename: 'dist/stats.json',
        template: 'raw-data',
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean) as Plugin[],
    esbuild: {
      legalComments: 'none', // Remove all legal comments
      // Remove only non-critical console calls
      pure: ['console.log', 'console.info', 'console.debug', 'console.trace'],
      // Always drop debugger statements
      drop: ['debugger'],
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      treeShaking: true,
      target: 'esnext',
      // ESBuild transpilation settings - type checking is handled by tsc (npm run check)
      // Keeping skipLibCheck for faster builds; strict settings enforced at tsc level
      tsconfigRaw: {
        compilerOptions: {
          skipLibCheck: true,
          // Align with tsconfig.json strict settings for transpilation consistency
          noImplicitAny: true,
          strictNullChecks: true,
          strictFunctionTypes: true,
          strictPropertyInitialization: true,
          noImplicitThis: true,
          noImplicitReturns: true,
          alwaysStrict: true,
        },
      },
    },
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(getAppVersion()),
      'import.meta.env.VITE_GIT_SHA': JSON.stringify(process.env['GITHUB_SHA'] || getGitSha()),
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
      __SENTRY__: JSON.stringify(Boolean(process.env['VITE_SENTRY_DSN'])),
      __DEV__: 'false', // Strip dev-only blocks
      'process.env.DEBUG': 'false', // Strip debug blocks
      'process.env.NODE_ENV': JSON.stringify('production'), // Ensure production mode
    },
    root: path.resolve(import.meta.dirname, 'client'),
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
      sourcemap: process.env['VITE_SOURCEMAP'] === 'true' ? true : true, // Always enable source maps for profiling (keeping environment option)
      minify: 'esbuild',
      target: 'es2020', // More compatible target for production
      cssMinify: 'lightningcss',
      reportCompressedSize: false, // Skip compression size reporting for faster builds
      chunkSizeWarningLimit: 500,
      manifest: true, // Generate manifest for bundle analysis
      modulePreload: {
        // Only preload critical modules, not charts
        resolveDependencies: (
          _filename: string,
          deps: string[],
          { hostId: _hostId, hostType: _hostType }: { hostId: string; hostType: string }
        ) => {
          return deps.filter(
            (dep) => !dep.includes('vendor-charts') && !dep.includes('vendor-nivo')
          );
        },
      },
      rollupOptions: {
        input: path.resolve(import.meta.dirname, 'client/index.html'),
        treeshake: {
          moduleSideEffects: 'no-external',
          propertyReadSideEffects: false,
        },
        output: {
          // Aggressive output settings
          compact: true,
          generatedCode: {
            arrowFunctions: true,
            constBindings: true,
            objectShorthand: true,
          },
          minifyInternalExports: true,
          manualChunks: undefined,
        },
      },
    },
    resolve: {
      conditions: ['browser', 'import', 'module', 'default'],
      alias: [
        // CRITICAL: Proper Preact aliasing for production builds (not in optimizeDeps!)
        ...(usePreact
          ? [
              { find: 'react', replacement: 'preact/compat' },
              { find: 'react-dom', replacement: 'preact/compat' },
              { find: 'react-dom/test-utils', replacement: 'preact/test-utils' },
              { find: 'react-dom/client', replacement: 'preact/compat' },
              // CRITICAL: JSX runtime aliases - missing these breaks hooks with Preact
              { find: 'react/jsx-runtime', replacement: 'preact/jsx-runtime' },
              { find: 'react/jsx-dev-runtime', replacement: 'preact/jsx-dev-runtime' },
            ]
          : []),

        // Sentry no-op (when disabled)
        !sentryOn && { find: /^@sentry\//, replacement: sentryNoop },

        // Path aliases
        { find: '@', replacement: path.resolve(import.meta.dirname, 'client/src') },
        { find: '@/core', replacement: path.resolve(import.meta.dirname, 'client/src/core') },
        { find: '@/lib', replacement: path.resolve(import.meta.dirname, 'client/src/lib') },
        { find: '@shared', replacement: path.resolve(import.meta.dirname, 'shared') },
        { find: '@assets', replacement: path.resolve(import.meta.dirname, 'assets') },
      ].filter(Boolean),
      dedupe: usePreact
        ? ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']
        : ['react', 'react-dom'],
    },
    optimizeDeps: usePreact
      ? {
          // Keep dev prebundle from pulling React by accident
          exclude: [
            'winston',
            'prom-client',
            'express',
            'fastify',
            'serve-static',
            'body-parser',
            '@sentry/browser',
            '@sentry/react',
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
          ],
          include: ['preact', 'preact/hooks', 'preact/compat', 'preact/jsx-runtime'],
          // REMOVED: esbuildOptions.alias - aliases belong in resolve.alias for production builds
        }
      : {
          exclude: [
            'winston',
            'prom-client',
            'express',
            'fastify',
            'serve-static',
            'body-parser',
            '@sentry/browser',
            '@sentry/react',
          ],
        },
  }; // end of return object
}); // end of defineConfig
