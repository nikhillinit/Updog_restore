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
function forcePreactAlias(): import('vite').Plugin {
  return {
    name: 'force-preact-alias',
    enforce: 'pre',
    resolveId(source) {
      if (!preactOn) return null;
      
      if (source === 'react') return this.resolve('preact/compat', undefined, { skipSelf: true });
      if (source === 'react-dom') return this.resolve('preact/compat', undefined, { skipSelf: true });
      if (source === 'react-dom/client') return this.resolve('preact/compat', undefined, { skipSelf: true });
      if (source === 'react/jsx-runtime' || source === 'react/jsx-dev-runtime') {
        return this.resolve('preact/jsx-runtime', undefined, { skipSelf: true });
      }
      return null;
    },
  };
}

// Forbid React in Preact builds - fail the build if React is detected
function forbidReactInPreactBuild(): import('vite').Plugin {
  const REACT_PATH = /\/node_modules\/react(\/|$)/;
  return {
    name: 'forbid-react-in-preact-build',
    enforce: 'post',
    generateBundle(_, bundle) {
      if (!preactOn) return;
      
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk') {
          // Check for React signatures in code
          if (chunk.code.includes('__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED') ||
              chunk.code.includes('react.production.min')) {
            this.error(`React found in Preact build in ${fileName}. Check aliases/pre-bundling.`);
          }
          
          // Check module paths
          if ('facadeModuleId' in chunk && chunk.facadeModuleId && REACT_PATH.test(chunk.facadeModuleId)) {
            this.error(`React module found in Preact build: ${chunk.facadeModuleId}`);
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    preactOn && forcePreactAlias(),
    preactOn && forbidReactInPreactBuild(),
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
  ].filter(Boolean),
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
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari13.1'],
    cssMinify: 'lightningcss',
    terserOptions: {
      compress: {
        passes: 3,
        pure_getters: true,
        reduce_funcs: true,
        dead_code: true,
        unused: true,
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
        conditionals: true,
        evaluate: true,
        join_vars: true,
        loops: true,
        reduce_vars: true,
        sequences: true,
        side_effects: false,
        switches: true,
        hoist_funs: true,
        hoist_props: true,
        if_return: true,
        inline: 3,
        keep_fargs: false,
        negate_iife: true,
        properties: true,
        collapse_vars: true,
        comparisons: true,
        computed_props: true,
        arguments: true,
      },
      mangle: {
        toplevel: true,
        safari10: false,
        properties: {
          regex: /^_/
        }
      },
      format: {
        comments: false,
        ascii_only: true,
        beautify: false,
        braces: false,
        semicolons: false,
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
          
          // Force ALL d3 modules into vendor-charts to prevent duplication
          if (/(?:^|[/\\])node_modules[/\\](d3|d3-[^/\\]+)[/\\]/.test(id)) return 'vendor-charts';
          
          // Recharts also goes to vendor-charts
          if (id.includes('node_modules/recharts')) return 'vendor-charts';
          
          // Separate large dependencies
          if (id.includes('node_modules/nivo')) return 'vendor-nivo';
          if (id.includes('node_modules/lodash')) return 'vendor-utils';
          if (id.includes('node_modules/@dnd-kit')) return 'vendor-dnd';
          if (id.includes('node_modules/xlsx')) return 'vendor-excel';
          
          // Core React/Preact ecosystem
          if (preactOn) {
            if (id.includes('node_modules/preact')) return 'vendor-preact';
          } else {
            if (id.includes('node_modules/react-dom')) return 'vendor-react';
            if (id.includes('node_modules/react')) return 'vendor-react';
          }
          
          // Split state management and data fetching
          if (id.includes('node_modules/zustand')) return 'vendor-utils';
          if (id.includes('node_modules/@tanstack')) return 'vendor-query';
          if (id.includes('node_modules/react-hook-form')) return 'vendor-forms';
          if (id.includes('node_modules/zod')) return 'vendor-forms';
          
          // Split UI more granularly 
          if (id.includes('node_modules/@radix-ui/react-dialog') || 
              id.includes('node_modules/@radix-ui/react-popover') || 
              id.includes('node_modules/@radix-ui/react-dropdown')) return 'vendor-ui-overlay';
          if (id.includes('node_modules/@radix-ui')) return 'vendor-ui-core';
          if (id.includes('node_modules/@headlessui')) return 'vendor-ui-core';
          
          // Utils and styling
          if (id.includes('node_modules/date-fns')) return 'vendor-utils';
          if (id.includes('node_modules/clsx') || id.includes('tailwind-merge')) return 'vendor-style';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          
          // Animation libraries
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/@react-spring')) return 'vendor-animation';
          
          // Bundle small utils with main chunk for better performance
          if (id.includes('node_modules') && 
              !id.includes('react') && 
              !id.includes('radix') && 
              !id.includes('recharts') &&
              !id.includes('tanstack') &&
              !id.includes('zod') &&
              !id.includes('date-fns') &&
              !id.includes('lodash') &&
              !id.includes('framer') &&
              !id.includes('lucide') &&
              !id.includes('nivo')) {
            // Check file size heuristically - if likely small, don't chunk
            return undefined; // Let small deps stay with main
          }
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
      .concat(preactOn ? ['react', 'react-dom', 'react/jsx-runtime'] : ['preact', 'preact/compat']),
    include: preactOn ? ['preact', 'preact/compat', 'preact/jsx-runtime'] : [],
    esbuildOptions: preactOn ? { define: { 'process.env.NODE_ENV': '"production"' } } : {}
  }
});
