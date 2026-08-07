import express from 'express';
import fs from 'node:fs';
import { Server as HttpServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalRowId } from '../matrix-schema.mjs';

const INSPECTOR_TIMEOUT_MS = 45_000;
const ROUTER_REGISTRATION_METHODS = [
  'use',
  'route',
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'all',
];
const APPLICATION_REGISTRATION_METHODS = [
  'use',
  'route',
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'all',
];
const REGISTRATION_GATES = [
  'ENABLE_METRICS',
  'ENABLE_PORTFOLIO_INTELLIGENCE',
  'ENABLE_MARGINAL_RESERVE_MOIC',
  'ENABLE_SCENARIO_SEED_PICKER',
  'ENABLE_STAT_GATING',
  'ENABLE_SESSIONS',
  'ENABLE_QUEUES',
  'ENABLE_RUM_V2',
];
const SCHEDULER_KILL_SWITCHES = [
  'ENABLE_QUARTERLY_ANALYSIS',
  'ENABLE_ARTIFACT_RETENTION',
  'ENABLE_VARIANCE_ALERT_AUTOMATION',
];
const EXPLICIT_ENV_MARKERS = [
  '_EXPLICIT_PORT',
  '_EXPLICIT_NODE_ENV',
  '_EXPLICIT_REDIS_URL',
  '_EXPLICIT_QUEUE_REDIS_URL',
  '_EXPLICIT_ENABLE_QUEUES',
  '_EXPLICIT_DATABASE_URL',
  '_EXPLICIT_NEON_DATABASE_URL',
  '_EXPLICIT_ALLOW_MEMORY_STORAGE',
  '_EXPLICIT_JWT_SECRET',
  '_EXPLICIT_JWT_ISSUER',
  '_EXPLICIT_JWT_AUDIENCE',
  '_EXPLICIT_JWT_ALG',
  '_EXPLICIT_JWT_JWKS_URL',
];
const LAYER_TAG = Symbol('surfaceContractRegistrationSequence');

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), '../../..');

function parseArgs(argv) {
  const args = {
    profile: 'default',
    fsVariant: 'static',
    enableGates: new Map(),
    env: new Map(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--profile') {
      args.profile = argv[++index];
    } else if (argument === '--fs-variant') {
      args.fsVariant = argv[++index];
    } else if (argument === '--enable-gate') {
      args.enableGates.set(argv[++index], '1');
    } else if (argument === '--disable-gate') {
      args.enableGates.set(argv[++index], '0');
    } else if (argument === '--gate' || argument === '--env') {
      const assignment = argv[++index];
      const separator = assignment?.indexOf('=') ?? -1;
      if (separator < 1) throw new Error(`${argument} requires NAME=VALUE`);
      const name = assignment.slice(0, separator);
      const value = assignment.slice(separator + 1);
      if (argument === '--gate') {
        args.enableGates.set(name, value);
      } else {
        args.env.set(name, value);
      }
    } else if (argument === '--help') {
      throw new Error(
        'usage: inspect-runtime.mjs --profile <name> --fs-variant static|api-only [--gate NAME=VALUE] [--env NAME=VALUE]',
      );
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!['static', 'api-only'].includes(args.fsVariant)) {
    throw new Error(`Unknown --fs-variant: ${args.fsVariant}`);
  }
  validateGateNames(args.enableGates.keys());
  applyProfile(args);
  return args;
}

function validateGateNames(names) {
  for (const name of names) {
    if (!REGISTRATION_GATES.includes(name)) {
      throw new Error(`Unresolved registration gate: ${name}`);
    }
  }
}

function applyProfile(args) {
  const profile = args.profile;
  if (!['default', 'development'].includes(profile)) {
    const match = /^gate:([^:]+):(enabled|disabled)$/.exec(profile);
    if (!match || !REGISTRATION_GATES.includes(match[1])) {
      throw new Error(`Unresolved inspector profile or gate: ${profile}`);
    }
    args.enableGates.set(match[1], match[2] === 'enabled' ? '1' : '0');
  }
}

function setHermeticEnvironment(args) {
  const sensitiveName = /(AWS|AZURE|GOOGLE|GCP|OPENAI|ANTHROPIC|DATABASE|REDIS|NATS|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY|SECRET)/i;
  for (const name of Object.keys(process.env)) {
    if (sensitiveName.test(name)) delete process.env[name];
  }

  const nodeEnv = args.profile === 'development' ? 'development' : 'test';
  const jwtSecret = 'surface-contract-inspector-jwt-secret-32-plus';
  const values = {
    NODE_ENV: nodeEnv,
    PORT: '0',
    DATABASE_URL: 'postgresql://mock:mock@127.0.0.1:5432/mock',
    NEON_DATABASE_URL: 'postgresql://mock:mock@127.0.0.1:5432/mock-neon',
    REDIS_URL: 'memory://',
    QUEUE_REDIS_URL: 'memory://',
    RATE_LIMIT_REDIS_URL: 'memory://',
    SESSION_REDIS_URL: 'memory://',
    ENABLE_QUEUES: '0',
    ALLOW_MEMORY_STORAGE: '1',
    JWT_SECRET: jwtSecret,
    JWT_ISSUER: 'surface-contract-inspector',
    JWT_AUDIENCE: 'surface-contract-inspector',
    JWT_ALG: 'HS256',
    REQUIRE_AUTH: '0',
    DISABLE_AUTH: '1',
    USE_VITE_MIDDLEWARE: 'false',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    CORS_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
    OTEL_SDK_DISABLED: 'true',
    OTEL_METRICS_EXPORTER: 'none',
    ...Object.fromEntries(SCHEDULER_KILL_SWITCHES.map((name) => [name, '0'])),
    ...Object.fromEntries(REGISTRATION_GATES.map((name) => [name, '0'])),
  };

  for (const [name, value] of Object.entries(values)) process.env[name] = value;
  for (const marker of EXPLICIT_ENV_MARKERS) process.env[marker] = '1';
  for (const [name, value] of args.enableGates) {
    process.env[name] = value;
    if (name === 'ENABLE_QUEUES') process.env['_EXPLICIT_ENABLE_QUEUES'] = '1';
  }
  for (const [name, value] of args.env) process.env[name] = value;
}

function normalizePath(value) {
  if (!value) return '';
  const normalized = `/${String(value)}`.replace(/\/+/g, '/');
  if (normalized === '/') return '';
  return normalized.replace(/\/+/g, '/').replace(/\/$/, '');
}

function joinRoutePath(prefix, routePath) {
  const joined = `${normalizePath(prefix)}/${String(routePath || '')}`.replace(/\/+/g, '/');
  return joined === '' ? '/' : `/${joined.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function relativeSite(filePath, line) {
  const relative = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  return `${relative}:${line}`;
}

function parseStackSite(stack) {
  for (const line of String(stack || '').split('\n').slice(1)) {
    if (line.includes(currentFile) || line.includes('node_modules/') || line.includes('node:')) {
      continue;
    }
    const match = line.match(/(?:file:\/\/)?([^()\s]+):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const stackPath = match[1].startsWith('file://')
      ? fileURLToPath(match[1])
      : match[1];
    const filePath = path.resolve(stackPath);
    if (!filePath.startsWith(repoRoot + path.sep)) continue;
    return { file: filePath, line: Number(match[2]), site: relativeSite(filePath, match[2]) };
  }
  return { file: 'unknown', line: 0, site: 'unknown:0' };
}

function stackFor(owner) {
  return Array.isArray(owner?.stack) ? owner.stack : [];
}

function defineLayerTag(target, sequence) {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) return;
  if (target[LAYER_TAG] !== undefined) return;
  Object.defineProperty(target, LAYER_TAG, {
    configurable: true,
    enumerable: false,
    value: sequence,
    writable: false,
  });
}

function tagLayerTree(layer, sequence) {
  defineLayerTag(layer, sequence);
  if (layer?.route) {
    defineLayerTag(layer.route, sequence);
    for (const child of layer.route.stack || []) defineLayerTag(child, sequence);
  }
}

function layerTag(layer) {
  return layer?.[LAYER_TAG] ?? layer?.route?.[LAYER_TAG];
}

function getRegistrationPath(method, args) {
  if (method === 'use' || method === 'route') {
    return typeof args[0] === 'string' ? args[0] : '';
  }
  return typeof args[0] === 'string' ? args[0] : '';
}

function installInstrumentation() {
  const registrations = [];
  const paramsByRouter = new WeakMap();
  const restorers = [];
  let sequence = 0;
  let activeRegistration = null;

  const wrap = (target, method, receiver) => {
    const original = target[method];
    if (typeof original !== 'function') return;
    const wrapped = function wrappedRegistration(...args) {
      const before = new Set(stackFor(this));
      const nested = activeRegistration;
      const registration = nested || {
        sequence: ++sequence,
        receiver,
        method,
        path: getRegistrationPath(method, args),
        site: parseStackSite(new Error().stack),
        args,
        owner: this,
        parameter: method === 'param' ? args[0] : undefined,
      };
      if (!nested) registrations.push(registration);
      activeRegistration = registration;
      try {
        return original.apply(this, args);
      } finally {
        activeRegistration = nested;
        for (const layer of stackFor(this)) {
          if (!before.has(layer)) tagLayerTree(layer, registration.sequence);
        }
      }
    };
    Object.defineProperty(wrapped, 'name', { value: original.name, configurable: true });
    target[method] = wrapped;
    restorers.push(() => {
      target[method] = original;
    });
  };

  for (const method of ROUTER_REGISTRATION_METHODS) wrap(express.Router.prototype, method, 'router');
  for (const method of APPLICATION_REGISTRATION_METHODS) wrap(express.application, method, 'application');

  const originalParam = express.Router.prototype.param;
  express.Router.prototype.param = function wrappedParam(name, callback) {
    const site = parseStackSite(new Error().stack);
    const list = paramsByRouter.get(this) || [];
    list.push({ sequence: ++sequence, name, callback, site });
    paramsByRouter.set(this, list);
    return originalParam.call(this, name, callback);
  };
  restorers.push(() => {
    express.Router.prototype.param = originalParam;
  });

  return {
    registrations,
    paramsByRouter,
    restore() {
      while (restorers.length > 0) restorers.pop()();
    },
  };
}

function installTimerContainment() {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeSetInterval = globalThis.setInterval;
  const nativeClearTimeout = globalThis.clearTimeout;
  const nativeClearInterval = globalThis.clearInterval;
  const handles = new Set();

  globalThis.setTimeout = (...args) => {
    const handle = nativeSetTimeout(...args);
    handles.add(handle);
    return handle;
  };
  globalThis.setInterval = (...args) => {
    const handle = nativeSetInterval(...args);
    handles.add(handle);
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    handles.delete(handle);
    return nativeClearTimeout(handle);
  };
  globalThis.clearInterval = (handle) => {
    handles.delete(handle);
    return nativeClearInterval(handle);
  };

  return () => {
    for (const handle of handles) {
      nativeClearTimeout(handle);
      nativeClearInterval(handle);
    }
    handles.clear();
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.setInterval = nativeSetInterval;
    globalThis.clearTimeout = nativeClearTimeout;
    globalThis.clearInterval = nativeClearInterval;
  };
}

function installRequestListenerCapture() {
  const originalOn = HttpServer.prototype.on;
  const listenersByServer = new WeakMap();
  HttpServer.prototype.on = function captureRequestListener(event, listener) {
    if (event === 'request' && typeof listener === 'function') {
      const listeners = listenersByServer.get(this) || [];
      listeners.push(listener);
      listenersByServer.set(this, listeners);
    }
    return originalOn.call(this, event, listener);
  };
  return {
    get(server) {
      return listenersByServer.get(server) || [];
    },
    restore() {
      HttpServer.prototype.on = originalOn;
    },
  };
}

function registrationFor(instrumentation, layer) {
  const sequence = layerTag(layer);
  return instrumentation.registrations.find((registration) => registration.sequence === sequence);
}

function routeMethods(route, registration) {
  if (registration?.method && registration.method !== 'route' && registration.method !== 'use') {
    return [registration.method.toUpperCase() === 'ALL' ? 'ANY' : registration.method.toUpperCase()];
  }
  return Object.keys(route?.methods || {})
    .filter((method) => route.methods[method])
    .map((method) => (method === '_all' ? 'ANY' : method.toUpperCase()));
}

function isErrorHandler(handler) {
  return typeof handler === 'function' && handler.length === 4;
}

function routeDefinitions({
  instrumentation,
  router,
  stack,
  index,
  layer,
  prefix,
  surface,
  includeLocalGuards,
  outerMount,
}) {
  const route = layer.route;
  const registration = registrationFor(instrumentation, layer);
  const methods = routeMethods(route, registration);
  const routePath = joinRoutePath(prefix, route.path);
  const definitions = [];
  const localGuards = includeLocalGuards
    ? stack
        .slice(0, index)
        .filter((candidate) => !candidate.route && registrationFor(instrumentation, candidate))
        .filter((candidate) => registrationFor(instrumentation, candidate)?.method === 'use')
    : [];

  for (const middleware of localGuards) {
    const guardRegistration = registrationFor(instrumentation, middleware);
    for (const method of methods) {
      definitions.push({
        id: canonicalRowId(`api:${method}:${routePath}`),
        method,
        path: routePath,
        role: 'guard',
        kind: 'middleware',
        order: guardRegistration.sequence,
        sequence: guardRegistration.sequence,
        site: guardRegistration.site.site,
        surface,
        ...(outerMount ? {
          outer_mount_site: outerMount.site,
          outer_mount_order: outerMount.order,
        } : {}),
      });
    }
  }

  const handlers = route.stack || [];
  const lastNonErrorIndex = handlers.reduce(
    (lastIndex, handlerLayer, handlerIndex) => isErrorHandler(handlerLayer.handle) ? lastIndex : handlerIndex,
    -1,
  );
  handlers.forEach((handlerLayer, handlerIndex) => {
    if (isErrorHandler(handlerLayer.handle)) return;
    const role = handlerIndex === lastNonErrorIndex ? 'handler' : 'guard';
    const registrationSite = registration?.site?.site || 'unknown:0';
    for (const method of methods) {
      definitions.push({
        id: canonicalRowId(`api:${method}:${routePath}`),
        method,
        path: routePath,
        role,
        kind: role === 'handler' ? 'terminal' : 'middleware',
        order: registration?.sequence ?? Number.MAX_SAFE_INTEGER,
        sequence: registration?.sequence ?? Number.MAX_SAFE_INTEGER,
        handler_index: handlerIndex,
        site: registrationSite,
        surface,
        ...(outerMount ? {
          outer_mount_site: outerMount.site,
          outer_mount_order: outerMount.order,
        } : {}),
      });
    }
  });

  const params = instrumentation.paramsByRouter.get(router) || [];
  for (const parameter of params) {
    if (!routePath.includes(`:${parameter.name}`)) continue;
    for (const method of methods) {
      definitions.unshift({
        id: canonicalRowId(`api:${method}:${routePath}`),
        method,
        path: routePath,
        role: 'guard',
        kind: 'param',
        order: parameter.sequence,
        sequence: parameter.sequence,
        site: parameter.site.site,
        surface,
        ...(outerMount ? {
          outer_mount_site: outerMount.site,
          outer_mount_order: outerMount.order,
        } : {}),
      });
    }
  }

  return definitions;
}

function walkRouter({ instrumentation, router, prefix = '', surface, ancestors = new Set(), outerMount }) {
  if (!router || ancestors.has(router)) return [];
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(router);
  const routes = [];
  const stack = stackFor(router);
  stack.forEach((layer, index) => {
    if (layer.route) {
      routes.push(
        ...routeDefinitions({
          instrumentation,
          router,
          stack,
          index,
          layer,
          prefix,
          surface,
          includeLocalGuards: ancestors.size > 0,
          outerMount,
        }),
      );
      return;
    }
    if (layer.handle?.stack) {
      const registration = registrationFor(instrumentation, layer);
      const mountPath = registration?.method === 'use' ? registration.path : '';
      const nextOuterMount = outerMount || (registration?.site ? {
        site: registration.site.site,
        order: registration.sequence,
      } : undefined);
      routes.push(
        ...walkRouter({
          instrumentation,
          router: layer.handle,
          prefix: joinRoutePath(prefix, mountPath),
          surface,
          ancestors: nextAncestors,
          outerMount: nextOuterMount,
        }),
      );
    }
  });
  return routes;
}

function applyShadowing(routes) {
  const seenTerminal = new Set();
  const ordered = [...routes].sort(
    (left, right) => left.order - right.order || left.handler_index - right.handler_index,
  );
  for (const route of ordered) {
    const key = `${route.surface}:${route.method}:${route.path}`;
    if (route.role === 'handler') {
      if (seenTerminal.has(key)) route.role = 'shadowed';
      else seenTerminal.add(key);
    } else if (seenTerminal.has(key) && route.kind === 'terminal') {
      route.role = 'shadowed';
    }
  }
  return ordered;
}

function extractApplication(httpServer, listenerCapture) {
  const listeners = [
    ...(listenerCapture?.get(httpServer) || []),
    ...(httpServer?.listeners?.('request') || []),
  ];
  const listener = listeners.find(
    (candidate) => typeof candidate === 'function' && (candidate.router || candidate._router),
  );
  if (listener) return listener;
  throw new Error(
    `createServer did not expose an Express request listener; request listeners=${listeners.length} own=${listeners
      .map((candidate) => Reflect.ownKeys(candidate).join(','))
      .join('|')}`,
  );
}

function inspectApplication(app, instrumentation, surface) {
  const router = app.router || app._router;
  if (!router) {
    throw new Error(
      `No Express router found for ${surface}; listener=${app.name || 'anonymous'} own=${Reflect.ownKeys(app).join(',')} proto=${Object.getPrototypeOf(app)?.constructor?.name || 'none'}`,
    );
  }
  return applyShadowing(walkRouter({ instrumentation, router, surface }));
}

async function importAbsolute(relativePath) {
  return import(pathToFileURL(path.resolve(repoRoot, relativePath)).href);
}

async function buildInspection(args, instrumentation, listenerCapture) {
  const originalCwd = process.cwd();
  const isolatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-contract-inspector-'));
  let providers;
  let httpServer;
  try {
    setHermeticEnvironment(args);
    fs.symlinkSync(path.join(repoRoot, 'tsconfig.server.json'), path.join(isolatedCwd, 'tsconfig.server.json'));
    fs.symlinkSync(path.join(repoRoot, 'tsconfig.json'), path.join(isolatedCwd, 'tsconfig.json'));
    if (args.fsVariant === 'static') fs.mkdirSync(path.join(isolatedCwd, 'dist', 'public'), { recursive: true });
    process.chdir(isolatedCwd);

    const appModule = await importAbsolute('server/app.ts');
    const makeAppRoutes = inspectApplication(appModule.makeApp(), instrumentation, 'make_app');

    const configModule = await importAbsolute('server/config/index.ts');
    const config = configModule.loadEnv();
    const providersModule = await importAbsolute('server/providers.ts');
    providers = await providersModule.buildProviders(config);
    const serverModule = await importAbsolute('server/server.ts');
    httpServer = await serverModule.createServer(config, providers);
    const listener = extractApplication(httpServer, listenerCapture);
    const createServerRoutes = inspectApplication(listener, instrumentation, 'create_server');

    const routes = [...makeAppRoutes, ...createServerRoutes].sort(
      (left, right) => left.surface.localeCompare(right.surface) || left.order - right.order,
    );
    return {
      schema_version: 1,
      profile: args.profile,
      fs_variant: args.fsVariant,
      surfaces: [
        { name: 'make_app', runtime: 'make_app', routes: makeAppRoutes },
        { name: 'create_server', runtime: 'create_server', routes: createServerRoutes },
      ],
      routes,
      registration_count: instrumentation.registrations.length,
    };
  } finally {
    if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
    try {
      const websocketModule = await importAbsolute('server/websocket/index.ts');
      websocketModule.cleanupWebSocketServers?.();
    } catch {
      // Cleanup remains best-effort when createServer failed before WebSockets loaded.
    }
    try {
      const completionModule = await importAbsolute('server/services/calc-run-tracking.ts');
      completionModule.resetCompletionHandlers?.();
      const registrationModule = await importAbsolute('server/services/calc-run-completion-handlers.ts');
      registrationModule.resetCompletionHandlerRegistration?.();
    } catch {
      // Completion modules may not have loaded on an early import failure.
    }
    await providers?.teardown?.();
    process.chdir(originalCwd);
    fs.rmSync(isolatedCwd, { recursive: true, force: true });
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const stdout = process.stdout;
  const originalStdoutWrite = stdout.write.bind(stdout);
  stdout.write = (...writeArgs) => process.stderr.write(...writeArgs);
  const restoreTimers = installTimerContainment();
  const instrumentation = installInstrumentation();
  const listenerCapture = installRequestListenerCapture();
  const nativeSetTimeout = globalThis.setTimeout;
  let timeoutHandle;
  try {
    const inspection = await Promise.race([
      buildInspection(args, instrumentation, listenerCapture),
      new Promise((_, reject) => {
        timeoutHandle = nativeSetTimeout(
          () => reject(new Error(`Runtime inspection timed out after ${INSPECTOR_TIMEOUT_MS}ms`)),
          INSPECTOR_TIMEOUT_MS,
        );
      }),
    ]);
    return inspection;
  } finally {
    if (timeoutHandle) globalThis.clearTimeout(timeoutHandle);
    listenerCapture.restore();
    instrumentation.restore();
    restoreTimers();
    stdout.write = originalStdoutWrite;
  }
}

run()
  .then((document) => {
    process.stdout.write(`${JSON.stringify(document)}\n`);
  })
  .catch((error) => {
    process.exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  });
