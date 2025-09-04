import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import preact from '@preact/preset-vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { visualizer } from 'rollup-plugin-visualizer';
import virtual from 'vite-plugin-virtual';
import tsconfigPaths from 'vite-tsconfig-paths';
import { execSync } from 'child_process';

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
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return '1.3.2';
  }
};

const usePreact =
  process.env['BUILD_WITH_PREACT'] === '1' ||
  process.env['BUILD_WITH_PREACT'] === 'true';

const sentryOn = !!process.env['VITE_SENTRY_DSN'];
const sentryNoop = path.resolve(import.meta.dirname, 'client/src/monitoring/noop.ts');

// Preact alias set covers all common React entry points (incl. automatic JSX runtime)
const preactAliases = [
  { find: 'react', replacement: 'preact/compat' },
  { find: 'react-dom/test-utils', replacement: 'preact/test-utils' },
  { find: 'react-dom/client', replacement: 'preact/compat' },
  { find: 'react-dom', replacement: 'preact/compat' },
  { find: 'react/jsx-runtime', replacement: 'preact/jsx-runtime' },
  { find: 'react/jsx-dev-runtime', replacement: 'preact/jsx-dev-runtime' },
];

export default defineConfig({
  plugins: [
    // Use absolute path so Vite doesn't ever look for "client/client/tsconfig.json"
    tsconfigPaths({
      projects: [path.resolve(import.meta.dirname, 'client/tsconfig.json')],
      // ignoreConfigErrors: true // (optional) uncomment if a transient parse error blocks local runs
    }),
    virtual({ 
      "winston": winstonMock,
      "prom-client": promClientMock
    }), 
    // Conditional React/Preact plugin
    usePreact ? preact({ devtoolsInProd: false }) : react(),
    // Vite's default chunking is sufficient - manual chunking removed to prevent TDZ issues
    visualizer({ filename: "stats.html", gzipSize: true })
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
    tsconfigRaw: {
      compilerOptions: {
        skipLibCheck: true,
        noImplicitAny: false,
        strictNullChecks: false,
        strictFunctionTypes: false,
        strictPropertyInitialization: false,
        noImplicitThis: false,
        noImplicitReturns: false,
        alwaysStrict: false
      }
    }
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(getAppVersion()),
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(process.env['GITHUB_SHA'] || getGitSha()),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
    '__SENTRY__': JSON.stringify(Boolean(process.env['VITE_SENTRY_DSN'])),
    '__DEV__': 'false', // Strip dev-only blocks
    'process.env.DEBUG': 'false', // Strip debug blocks
    'process.env.NODE_ENV': JSON.stringify('production') // Ensure production mode
  },
  root: path.resolve(import.meta.dirname, 'client'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    sourcemap: process.env['NODE_ENV'] === 'development',
    minify: 'esbuild',
    target: 'esnext', // Most aggressive target
    cssMinify: 'lightningcss',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 500,
    modulePreload: {
      // Only preload critical modules, not charts
      resolveDependencies: (filename, deps, { hostId, hostType }) => {
        return deps.filter(dep => !dep.includes('vendor-charts') && !dep.includes('vendor-nivo'));
      }
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
        manualChunks(id) {
          // Sentry dynamic loading
          if (id.includes('node_modules/@sentry')) return 'sentry';
          
          // Core React/Preact ecosystem + state + charts together
          // FIX: Keep React, state management, and charts in same chunk to prevent TDZ errors
          if (usePreact) {
            if (id.includes('node_modules/preact')) return 'vendor-preact';
          } else {
            if (id.includes('node_modules/react-dom')) return 'vendor-react';
            if (id.includes('node_modules/react')) return 'vendor-react';
          }
          
          // REMOVED: Manual chart/state chunking to fix TDZ "Cannot access 'zu' before initialization"
          // Let Vite handle React + zustand + charts together to maintain proper initialization order
          
          // Only split truly independent large libraries to avoid TDZ issues
          // Keep most dependencies together with React/state/charts via splitVendorChunkPlugin
          
          // Large independent libraries (no React dependencies)
          if (id.includes('node_modules/lodash')) return 'vendor-utils';
          if (id.includes('node_modules/date-fns')) return 'vendor-utils';
          
          // Let splitVendorChunkPlugin handle the rest safely
        },
      }
    }
  },
  resolve: {
    conditions: ["browser", "import", "module", "default"],
    alias: [
      // Preact substitution when enabled
      ...(usePreact ? preactAliases : []),
      
      // Sentry no-op (when disabled)
      !sentryOn && { find: /^@sentry\//, replacement: sentryNoop },
      
      // Path aliases
      { find: '@', replacement: path.resolve(import.meta.dirname, 'client/src') },
      { find: '@/core', replacement: path.resolve(import.meta.dirname, 'client/src/core') },
      { find: '@/lib', replacement: path.resolve(import.meta.dirname, 'client/src/lib') },
      { find: '@shared', replacement: path.resolve(import.meta.dirname, 'shared') },
      { find: '@assets', replacement: path.resolve(import.meta.dirname, 'assets') },
    ].filter(Boolean),
    dedupe: usePreact ? ['react', 'react-dom'] : [],
  },
  optimizeDeps: usePreact
    ? {
        // Prevent esbuild pre-bundling of React if some dep lists it loosely
        exclude: ['winston', 'prom-client', 'express', 'fastify', 'serve-static', 'body-parser', '@sentry/browser', '@sentry/react', 'react', 'react-dom', 'react-dom/client'],
        include: ['preact', 'preact/hooks', 'preact/compat'],
      }
    : {
        exclude: ['winston', 'prom-client', 'express', 'fastify', 'serve-static', 'body-parser', '@sentry/browser', '@sentry/react'],
      }
});
