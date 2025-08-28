import { defineConfig } from 'vite';
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

const preactOn = process.env.BUILD_WITH_PREACT === '1';
const sentryOn = !!process.env.VITE_SENTRY_DSN;
const sentryNoop = path.resolve(import.meta.dirname, 'client/src/monitoring/noop.ts');

// Force Preact alias before any other resolution logic
function forcePreactAlias() {
  return {
    name: 'force-preact-alias',
    enforce: 'pre' as const,
    resolveId(source: string) {
      if (!preactOn) return null;

      // jsx runtimes
      if (source === 'react/jsx-runtime' || source === 'react/jsx-dev-runtime') {
        return this.resolve('preact/jsx-runtime', undefined, { skipSelf: true });
      }

      // react-dom variants
      if (source === 'react-dom/client' || source === 'react-dom/test-utils' || source === 'react-dom') {
        return this.resolve('preact/compat', undefined, { skipSelf: true });
      }

      if (source === 'react') {
        return this.resolve('preact/compat', undefined, { skipSelf: true });
      }

      return null;
    }
  };
}

export default defineConfig({
  plugins: [
    forcePreactAlias(),
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
    preactOn ? preact({ devToolsInProd: false }) : react(),
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
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
    '__SENTRY__': JSON.stringify(Boolean(process.env.VITE_SENTRY_DSN))
  },
  root: path.resolve(import.meta.dirname, 'client'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    sourcemap: process.env['NODE_ENV'] === 'development',
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 2,
        pure_getters: true,
        reduce_funcs: true,
        dead_code: true,
        unused: true,
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
        conditionals: true,
        evaluate: true,
      },
      mangle: {
        toplevel: true,
        safari10: false,
      },
      format: {
        comments: false,
      },
    },
    reportCompressedSize: false,
    chunkSizeWarningLimit: 500,
    rollupOptions: { 
      input: path.resolve(import.meta.dirname, 'client/index.html'),
      output: {
        manualChunks(id) {
          // Sentry dynamic loading
          if (id.includes('node_modules/@sentry')) return 'sentry';
          
          // Don't split d3 separately - let it stay with recharts
          // if (id.includes('node_modules/d3')) return 'vendor-d3';
          if (id.includes('node_modules/nivo')) return 'vendor-nivo';
          if (id.includes('node_modules/lodash')) return 'vendor-lodash';
          if (id.includes('node_modules/@dnd-kit')) return 'vendor-dnd';
          if (id.includes('node_modules/xlsx')) return 'vendor-excel';
          
          // Combine all recharts into one chunk
          if (id.includes('node_modules/recharts')) return 'vendor-charts';
          
          // Core React/Preact ecosystem
          if (preactOn && id.includes('node_modules/preact')) return 'vendor-preact';
          
          // Guard against old react mappings when not using preact
          if (!preactOn && id.includes('node_modules/react-dom')) return 'vendor-react';
          if (!preactOn && id.includes('node_modules/react')) return 'vendor-react';
          if (id.includes('node_modules/zustand')) return 'vendor-state';
          
          // Data fetching & forms
          if (id.includes('node_modules/@tanstack')) return 'vendor-query';
          if (id.includes('node_modules/react-hook-form')) return 'vendor-forms';
          if (id.includes('node_modules/zod')) return 'vendor-forms';
          
          // UI components
          if (id.includes('node_modules/@radix-ui')) return 'vendor-ui';
          if (id.includes('node_modules/@headlessui')) return 'vendor-ui';
          
          // Utils
          if (id.includes('node_modules/date-fns')) return 'vendor-date';
          if (id.includes('node_modules/clsx') || id.includes('tailwind-merge')) return 'vendor-style';
          
          // Don't create vendor-misc - let small deps stay with their importers
        },
      }
    }
  },
  resolve: {
    conditions: ["browser", "import", "module", "default"],
    alias: [
      // --- Preact swap (comprehensive regex patterns) ---
      preactOn && { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
      preactOn && { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/jsx-runtime' },
      preactOn && { find: /^react-dom\/client$/, replacement: 'preact/compat' },
      preactOn && { find: /^react-dom\/test-utils$/, replacement: 'preact/test-utils' },
      preactOn && { find: /^react-dom$/, replacement: 'preact/compat' },
      preactOn && { find: /^react$/, replacement: 'preact/compat' },
      
      // Sentry no-op (when disabled)
      !sentryOn && { find: /^@sentry\//, replacement: sentryNoop },
      
      // Path aliases
      { find: '@', replacement: path.resolve(import.meta.dirname, 'client/src') },
      { find: '@/core', replacement: path.resolve(import.meta.dirname, 'client/src/core') },
      { find: '@/lib', replacement: path.resolve(import.meta.dirname, 'client/src/lib') },
      { find: '@shared', replacement: path.resolve(import.meta.dirname, 'shared') },
      { find: '@assets', replacement: path.resolve(import.meta.dirname, 'assets') },
    ].filter(Boolean) as any,
    dedupe: preactOn ? ['react', 'react-dom', 'preact', 'preact/compat'] : [],
  },
  optimizeDeps: {
    exclude: ['winston', 'prom-client', 'express', 'fastify', 'serve-static', 'body-parser', '@sentry/browser', '@sentry/react']
      .concat(preactOn ? ['react', 'react-dom'] : ['preact', 'preact/compat']),
    include: preactOn ? ['preact', 'preact/compat'] : [],
    esbuildOptions: preactOn ? { define: { 'process.env.NODE_ENV': '"production"' } } : {}
  }
});
