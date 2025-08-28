import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
    react(), 
    visualizer({ filename: "stats.html", gzipSize: true })
  ],
  esbuild: {
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
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString())
  },
  root: path.resolve(import.meta.dirname, 'client'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    sourcemap: process.env['NODE_ENV'] === 'development',
    rollupOptions: { 
      input: path.resolve(import.meta.dirname, 'client/index.html'),
      output: {
        manualChunks: {
          'vendor-core': ['react', 'react-dom', 'zustand'],
          'vendor-charts': ['recharts'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-forms': ['react-hook-form', 'zod'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'vendor-utils': ['date-fns', 'clsx', 'tailwind-merge'],
          'sentry': ['@sentry/react']  // Isolated Sentry chunk
        },
      }
    }
  },
  resolve: {
    conditions: ["browser", "import", "module", "default"],
    alias: {
      '@': path.resolve(import.meta.dirname, 'client/src'),
      '@/core': path.resolve(import.meta.dirname, 'client/src/core'),
      '@/lib': path.resolve(import.meta.dirname, 'client/src/lib'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@assets': path.resolve(import.meta.dirname, 'assets'),
    },
  },
  optimizeDeps: {
    exclude: ['winston', 'prom-client', 'express', 'fastify', 'serve-static', 'body-parser']
  }
});
