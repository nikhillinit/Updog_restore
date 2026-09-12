#!/usr/bin/env node
/* global AbortController, AbortSignal, fetch, process, console, setTimeout, clearTimeout */
/** Dedicated disposable PostgreSQL/API/UI/browser evidence runner. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createPortProbe } from 'node:net';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const BASE_URL = 'http://127.0.0.1:5173';
const API_URL = 'http://127.0.0.1:5000';
const SPEC = 'tests/e2e/fund-scenario-capital-planning.spec.ts';
const CONFIG_SCHEMA = 'f115-capital-e2e-config/1.0.0';
const secrets = new Set();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = (file) => hash(fs.readFileSync(file));
const now = () => new Date().toISOString();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  let text = String(value);
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/g, '[REDACTED_DATABASE_URL]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]');
}

function writeEvidence(directory, name, value) {
  const file = path.join(directory, name);
  fs.writeFileSync(
    file,
    JSON.stringify(value, (_key, v) => (typeof v === 'string' ? redact(v) : v), 2) + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    }
  );
  return { path: file, sha256: fileHash(file) };
}

function cleanEnvironment() {
  const allowed =
    /^(?:PATH|HOME|TMPDIR|TEMP|TMP|USER|LOGNAME|SHELL|LANG|LC_[A-Z_]+|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|TESTCONTAINERS_[A-Z_]+|COLIMA_HOME|XDG_RUNTIME_DIR)$/;
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key)));
}

function replaceEnvironment(environment) {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, environment);
}

async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${milliseconds} ms`)),
          milliseconds
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function selectedTests(report, requirePassed = false) {
  assert.equal(report.errors?.length ?? 0, 0, 'Playwright reported collection/runtime errors');
  const tests = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      const file = spec.file.replaceAll('\\', '/');
      assert(
        file === SPEC || file === SPEC.replace(/^tests\//, ''),
        `Unexpected collected file: ${file}`
      );
      for (const test of spec.tests) {
        assert.equal(test.projectName, 'core');
        if (requirePassed) {
          assert.equal(test.status, 'expected', `Nonpassing test: ${spec.title}`);
          assert.equal(test.results.length, 1, `Repeated test: ${spec.title}`);
          assert.equal(test.results[0].status, 'passed', `Skipped/failed test: ${spec.title}`);
        }
        tests.push({
          project: test.projectName,
          file,
          title: spec.title,
          line: spec.line,
          column: spec.column,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites ?? []) visit(suite);
  assert(tests.length > 0, 'Intended-spec collection is empty');
  assert.equal(
    new Set(tests.map((test) => JSON.stringify(test))).size,
    tests.length,
    'Duplicate collected tests'
  );
  if (requirePassed) {
    assert.equal(report.stats.expected, tests.length);
    for (const status of ['skipped', 'unexpected', 'flaky']) assert.equal(report.stats[status], 0);
  }
  return tests;
}

function assertCleanProcessExit(result, forced = false) {
  assert.equal(result.code, 0, `${result.label} exited unsuccessfully`);
  assert.equal(result.signal, null, `${result.label} was terminated by a signal`);
  assert.equal(result.spawnError, null, `${result.label} failed to spawn`);
  assert.equal(forced, false, `${result.label} required forced termination`);
}

function assertUIShutdown(acknowledgement, request) {
  assert(request?.id, 'UI shutdown request was not recorded');
  assert.equal(
    acknowledgement?.requestId,
    request.id,
    'UI acknowledged a different shutdown request'
  );
  assert.equal(acknowledgement.exitCode, 0, 'UI close failed');
  assert.equal(acknowledgement.closed, true, 'UI close completion was not observed');
  assert.equal(acknowledgement.httpListening, false, 'UI HTTP listener remains open');
  assert(acknowledgement.closedAt >= request.sentAt, 'UI close predates its shutdown request');
}

async function removeOwnedContainer(getClient, containerId) {
  assert.match(
    containerId,
    /^[a-f0-9]{64}$/,
    'Cleanup requires the exact created Docker container ID'
  );
  const { container: client } = await getClient();
  const handle = client.getById(containerId);
  const events = [];
  const absent = (error) => error?.statusCode === 404;
  let inspected;
  try {
    inspected = await client.inspect(handle);
  } catch (error) {
    if (!absent(error)) throw error;
    return {
      containerId,
      absent: true,
      events: [{ operation: 'inspect', status: 'already_absent', observedAt: now() }],
    };
  }
  assert.equal(inspected.Id, containerId, 'Docker inspection returned a different container');
  events.push({
    operation: 'inspect',
    status: inspected.State.Running ? 'running' : 'stopped',
    observedAt: now(),
  });
  if (inspected.State.Running) {
    try {
      await client.stop(handle, { timeout: 10_000 });
      events.push({ operation: 'stop', status: 'completed', observedAt: now() });
    } catch (error) {
      if (!absent(error)) throw error;
      events.push({ operation: 'stop', status: 'already_absent', observedAt: now() });
    }
  }
  try {
    await client.remove(handle, { removeVolumes: true });
    events.push({ operation: 'remove', status: 'completed', observedAt: now() });
  } catch (error) {
    if (!absent(error)) throw error;
    events.push({ operation: 'remove', status: 'already_absent', observedAt: now() });
  }
  try {
    await client.inspect(handle);
    assert.fail(`Owned container remains after cleanup: ${containerId}`);
  } catch (error) {
    if (!absent(error)) throw error;
  }
  events.push({ operation: 'inspect', status: 'absent', observedAt: now() });
  return { containerId, absent: true, events };
}

async function selfCheck() {
  const specimen = {
    suites: [
      {
        specs: [
          {
            file: SPEC,
            title: 'real browser proof',
            line: 1,
            column: 1,
            tests: [{ projectName: 'core', status: 'expected', results: [{ status: 'passed' }] }],
          },
        ],
      },
    ],
    errors: [],
    stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
  };
  assert.equal(selectedTests(specimen, true).length, 1);
  assert.throws(() => selectedTests({ suites: [], errors: [] }));
  const wrongProject = JSON.parse(JSON.stringify(specimen));
  wrongProject.suites[0].specs[0].tests[0].projectName = 'smoke';
  assert.throws(() => selectedTests(wrongProject));
  const skipped = JSON.parse(JSON.stringify(specimen));
  skipped.suites[0].specs[0].tests[0].results[0].status = 'skipped';
  assert.throws(() => selectedTests(skipped, true));
  secrets.add('self-check-password');
  assert.equal(redact('self-check-password'), '[REDACTED]');
  assert(!redact('postgresql://user:password@127.0.0.1/db').includes('password'));
  secrets.delete('self-check-password');
  const uiExit = { label: 'ui', code: 0, signal: null, spawnError: null };
  assertCleanProcessExit(uiExit);
  for (const patch of [{ code: 1 }, { signal: 'SIGTERM' }, { spawnError: 'spawn failed' }]) {
    assert.throws(() => assertCleanProcessExit({ ...uiExit, ...patch }));
  }
  assert.throws(() => assertCleanProcessExit(uiExit, true));
  const request = { id: 'self-check-shutdown', sentAt: '2026-09-11T00:00:00.000Z' };
  const acknowledgement = {
    requestId: request.id,
    exitCode: 0,
    closed: true,
    httpListening: false,
    closedAt: '2026-09-11T00:00:00.001Z',
  };
  assertUIShutdown(acknowledgement, request);
  for (const patch of [
    { requestId: 'different' },
    { closed: false },
    { exitCode: 1 },
    { httpListening: true },
  ]) {
    assert.throws(() => assertUIShutdown({ ...acknowledgement, ...patch }, request));
  }
  const containerId = 'a'.repeat(64);
  const operations = [];
  let removed = false;
  const notFound = () => Object.assign(new Error('No such container'), { statusCode: 404 });
  const client = {
    getById: (id) => {
      assert.equal(id, containerId);
      return id;
    },
    inspect: async (id) => {
      assert.equal(id, containerId);
      if (removed) throw notFound();
      return { Id: id, State: { Running: true } };
    },
    stop: async (id) => {
      assert.equal(id, containerId);
      operations.push('stop');
    },
    remove: async (id) => {
      assert.equal(id, containerId);
      operations.push('remove');
      removed = true;
    },
  };
  assert.equal(
    (await removeOwnedContainer(async () => ({ container: client }), containerId)).absent,
    true
  );
  assert.deepEqual(operations, ['stop', 'remove']);
  assert.equal(
    (await removeOwnedContainer(async () => ({ container: client }), containerId)).absent,
    true
  );
  assert.deepEqual(
    operations,
    ['stop', 'remove'],
    'Already absent cleanup must not mutate another container'
  );
  console.log('F115 runner self-check passed; no runtime started.');
}

async function apiChild() {
  assert.equal(process.version, 'v22.23.2');
  assert(process.send, 'API child requires its runner IPC channel');
  const environment = { ...process.env };
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'SESSION_SECRET']) secrets.add(environment[key]);
  let database;
  let circuit;
  let redis;
  let server;
  let shutdown;
  const closures = {};
  const send = (message) =>
    new Promise((resolve, reject) => {
      if (!process.connected) return reject(new Error('Runner IPC channel is disconnected'));
      process.send(message, (error) => (error ? reject(error) : resolve()));
    });
  const close = (exitCode) =>
    (shutdown ??= (async () => {
      const errors = [];
      for (const [name, operation] of [
        [
          'http',
          async () => {
            if (!server?.listening) return;
            await new Promise((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
              server.closeIdleConnections();
            });
          },
        ],
        ['database', () => database?.closeDatabasePool()],
        ['pgCircuit', () => circuit?.closePool()],
        ['redisCircuit', () => redis?.closeRedis()],
      ]) {
        try {
          await bounded(Promise.resolve().then(operation), 10_000, `API ${name} close`);
          closures[name] = { status: 'closed', observedAt: now() };
        } catch (error) {
          closures[name] = { status: 'failed', error: redact(error) };
          errors.push(redact(error));
        }
      }
      const code = errors.length ? 1 : exitCode;
      try {
        await send({
          kind: 'shutdown-complete',
          closures,
          errors,
          exitCode: code,
          observedAt: now(),
        });
      } finally {
        process.exit(code);
      }
    })());
  process.on('message', (message) => {
    if (message?.kind === 'shutdown') void close(0);
  });
  process.on('disconnect', () => {
    void close(1);
  });
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      void close(1);
    });
  try {
    // Load dotenv once, then restore the runner's explicit environment before lazy config resolution.
    const configuration = await import(
      pathToFileURL(path.join(ROOT, 'server/config/index.ts')).href
    );
    replaceEnvironment(environment);
    database = await import(pathToFileURL(path.join(ROOT, 'server/db.ts')).href);
    circuit = await import(pathToFileURL(path.join(ROOT, 'server/db/pg-circuit.ts')).href);
    redis = await import(pathToFileURL(path.join(ROOT, 'server/db/redis-circuit.ts')).href);
    const { makeApp } = await import(pathToFileURL(path.join(ROOT, 'server/app.ts')).href);
    const config = configuration.getConfig();
    assert.equal(config.NODE_ENV, 'test');
    assert.equal(config.DATABASE_URL, environment.DATABASE_URL);
    assert.equal(process.env.REQUIRE_AUTH, '1');
    assert.equal(process.env.DISABLE_AUTH, undefined);
    assert.equal(process.env.ALLOW_MEMORY_STORAGE, '0');
    assert.equal(process.env.DEMO_MODE, '0');
    assert.equal(process.env.ENABLE_QUEUES, '0');
    assert.equal(process.env.ENABLE_IN_PROCESS_QUEUE_WORKERS, '0');
    assert(database.pool, 'API unexpectedly selected a memory database');
    const identity = (
      await database.pool.query(
        'SELECT current_database() AS database,current_user AS role,pg_backend_pid() AS backend_pid'
      )
    ).rows[0];
    server = createHttpServer(makeApp());
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(5000, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    await send({
      kind: 'ready',
      pid: process.pid,
      nodeVersion: process.version,
      apiURL: API_URL,
      database: identity,
      authRequired: true,
      memoryStorage: false,
      queuesEnabled: false,
      readyAt: now(),
    });
  } catch (error) {
    await send({ kind: 'startup-error', error: redact(error.stack ?? error) }).catch(() => {});
    await close(1);
  }
}

async function uiChild() {
  assert.equal(process.version, 'v22.23.2');
  assert.equal(
    process.env.NODE_ENV,
    'production',
    'UI must use the real-session application router'
  );
  assert(process.send, 'UI child requires its runner IPC channel');
  let server;
  let shutdown;
  const send = (message) =>
    new Promise((resolve, reject) => {
      if (!process.connected) return reject(new Error('Runner IPC channel is disconnected'));
      process.send(message, (error) => (error ? reject(error) : resolve()));
    });
  const close = (exitCode, requestId = null) =>
    (shutdown ??= (async () => {
      let closed = false;
      let error;
      try {
        assert(server, 'UI server was not created');
        await bounded(server.close(), 15_000, 'Vite server close');
        assert.equal(server.httpServer?.listening, false, 'Vite HTTP listener remains open');
        closed = true;
      } catch (failure) {
        error = redact(failure.stack ?? failure);
      }
      const code = closed ? exitCode : 1;
      try {
        await send({
          kind: 'shutdown-complete',
          requestId,
          exitCode: code,
          closed,
          httpListening: server?.httpServer?.listening ?? null,
          closedAt: now(),
          error: error ?? null,
        });
      } finally {
        process.exit(code);
      }
    })());
  process.on('message', (message) => {
    if (message?.kind === 'shutdown') void close(0, message.requestId);
  });
  process.on('disconnect', () => {
    void close(1);
  });
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      void close(1);
    });
  try {
    const { createServer } = await import('vite');
    server = await createServer({
      configFile: path.join(ROOT, 'vite.config.ts'),
      mode: 'test',
      server: { host: '127.0.0.1', port: 5173, strictPort: true },
    });
    assert.equal(server.config.env.PROD, true);
    assert.equal(server.config.env.DEV, false);
    assert.equal(server.config.env.MODE, 'test');
    await server.listen();
    const address = server.httpServer?.address();
    assert(address && typeof address !== 'string', 'UI has no TCP listener');
    assert.equal(address.address, '127.0.0.1');
    assert.equal(address.port, 5173);
    await send({
      kind: 'ready',
      pid: process.pid,
      nodeVersion: process.version,
      baseURL: BASE_URL,
      mode: server.config.env.MODE,
      prod: server.config.env.PROD,
      dev: server.config.env.DEV,
      readyAt: now(),
    });
  } catch (error) {
    await send({ kind: 'startup-error', error: redact(error.stack ?? error) }).catch(() => {});
    await close(1);
  }
}

async function assertFreePort(port) {
  const probe = createPortProbe();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen({ port, host: '127.0.0.1', exclusive: true }, resolve);
  });
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve()))
  );
}

function sourceAndPackageMetadataManifest() {
  const tracked = execFileSync(
    'git',
    ['ls-files', '-z', '--', 'client/src', 'server', 'shared', 'migrations'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    }
  )
    .split('\0')
    .filter(Boolean);
  const files = new Set([
    ...tracked,
    SPEC,
    'tests/e2e/fixtures/fund-scenario-capital-planning.ts',
    'tests/fixtures/capital-planning/fixtures.ts',
    'scripts/run-f115-capital-planning-e2e.mjs',
    'playwright.config.ts',
    'vite.config.ts',
    'vite.proxy-policy.ts',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.shared.json',
    ...[
      'vite',
      'playwright',
      '@playwright/test',
      'pg',
      '@testcontainers/postgresql',
      'testcontainers',
      'drizzle-orm',
      'tsx',
      'bcryptjs',
    ].map((name) => `node_modules/${name}/package.json`),
  ]);
  return Object.fromEntries(
    [...files].sort().map((file) => [file, fileHash(path.join(ROOT, file))])
  );
}

async function run(evidenceDir, grep) {
  assert.equal(process.version, 'v22.23.2', 'Use the pinned Node 22.23.2 runner');
  assert.equal(process.env.TZ, 'UTC', 'TZ=UTC is required');
  assert(!process.env.BASE_URL || process.env.BASE_URL === BASE_URL, 'Unexpected BASE_URL');
  assert(
    evidenceDir && path.isAbsolute(evidenceDir),
    '--evidence-dir must be a fresh absolute path'
  );
  evidenceDir = path.join(fs.realpathSync(path.dirname(evidenceDir)), path.basename(evidenceDir));
  assert(
    evidenceDir !== ROOT && !evidenceDir.startsWith(ROOT + path.sep),
    'Evidence must be outside the worktree'
  );
  fs.mkdirSync(evidenceDir, { mode: 0o700 });
  const runId = randomUUID();
  const privateConfigPath = path.join(evidenceDir, 'private-config.json');
  const environment = cleanEnvironment();
  const removedEnvironmentNames = Object.keys(process.env)
    .filter((key) => !(key in environment))
    .sort();
  const controller = new AbortController();
  const managed = [];
  const generatedReports = new Set();
  let container;
  let getRuntimeClient;
  let pool;
  let failure;
  let api;
  let ui;
  const lifecycle = {
    startedAt: now(),
    processes: [],
    apiShutdown: null,
    uiShutdown: null,
    poolClosed: false,
    containerStopped: false,
    privateConfigDeleted: false,
    errors: [],
  };
  const report = {
    schemaVersion: 'f115-capital-e2e-run/1.0.0',
    runId,
    status: 'RUNNING',
    nodeVersion: process.version,
    baseURL: BASE_URL,
    apiURL: API_URL,
    evidenceDir,
    testScope: grep ? 'FOCUSED_DIAGNOSTIC' : 'FULL_SPEC',
    testGrep: grep ?? null,
    lifecycle,
    credentialRedactions: [],
    dependencyByteIdentity: {
      status: 'NOT_ESTABLISHED_BY_RUNNER',
      owner: 'root final admission',
      requirement: 'Verify the full post-install dependency inventory before and after runtime.',
    },
  };
  function sanitizeReport(file) {
    if (!fs.existsSync(file)) return;
    const original = fs.readFileSync(file, 'utf8');
    const sanitized = redact(original);
    if (original !== sanitized) {
      fs.writeFileSync(file, sanitized, { mode: 0o600 });
      report.credentialRedactions.push({
        path: file,
        originalSha256: hash(original),
        sha256: hash(sanitized),
      });
    }
  }
  const interrupted = (signal) => controller.abort(new Error(`Runner interrupted by ${signal}`));
  const onInt = () => interrupted('SIGINT');
  const onTerm = () => interrupted('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  const race = async (promise) => {
    controller.signal.throwIfAborted();
    let listener;
    try {
      return await Promise.race([
        promise,
        new Promise((_resolve, reject) => {
          listener = () => reject(controller.signal.reason);
          controller.signal.addEventListener('abort', listener, { once: true });
        }),
      ]);
    } finally {
      controller.signal.removeEventListener('abort', listener);
    }
  };
  function start(label, args, env, service = false, ipc = false) {
    const log = path.join(evidenceDir, `${label}.log`);
    fs.writeFileSync(log, '', { flag: 'wx', mode: 0o600 });
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])],
    });
    const record = { label, child, log, args, stopping: false, result: null, startedAt: now() };
    const flushers = [];
    for (const stream of [child.stdout, child.stderr]) {
      const decoder = new StringDecoder('utf8');
      let pending = '';
      const flush = (final = false) => {
        const end = final ? pending.length : pending.lastIndexOf('\n') + 1;
        if (end > 0) fs.appendFileSync(log, redact(pending.slice(0, end)));
        pending = pending.slice(end);
      };
      stream.on('data', (chunk) => {
        pending += decoder.write(chunk);
        flush();
      });
      flushers.push(() => {
        pending += decoder.end();
        flush(true);
      });
    }
    child.on('error', (error) => {
      record.spawnError = redact(error);
    });
    record.exit = new Promise((resolve) =>
      child.once('close', (code, signal) => {
        for (const flush of flushers) flush();
        record.result = {
          label,
          pid: child.pid ?? null,
          code,
          signal,
          spawnError: record.spawnError ?? null,
          startedAt: record.startedAt,
          exitedAt: now(),
          log,
          logSha256: fileHash(log),
          argv: args,
        };
        if (service && !record.stopping)
          controller.abort(new Error(`${label} exited unexpectedly: ${code}/${signal}`));
        resolve(record.result);
      })
    );
    managed.push(record);
    return record;
  }
  async function command(label, args, env) {
    generatedReports.add(env.PLAYWRIGHT_JSON_OUTPUT_FILE);
    const child = start(label, args, env);
    const result = await race(bounded(child.exit, 30 * 60_000, label));
    sanitizeReport(env.PLAYWRIGHT_JSON_OUTPUT_FILE);
    writeEvidence(evidenceDir, `${label}-command.json`, result);
    assert.equal(result.code, 0, `${label} failed; inspect ${result.log}`);
    assert.equal(result.signal, null);
  }
  try {
    replaceEnvironment({ ...environment, TZ: 'UTC', NODE_ENV: 'test' });
    const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    const inputs = sourceAndPackageMetadataManifest();
    report.source = writeEvidence(evidenceDir, 'candidate-source-manifest.json', {
      expectedCommit,
      scope:
        'Application sources, runner/fixture/config files, and installed package metadata only; excludes dependency implementation bytes.',
      inputs,
    });
    report.removedEnvironmentNames = removedEnvironmentNames;
    await Promise.all([assertFreePort(5000), assertFreePort(5173)]);
    const [
      { PostgreSqlContainer },
      { Wait, getContainerRuntimeClient },
      { Pool },
      { drizzle },
      { migrate },
      bcrypt,
      { tsImport },
    ] = await Promise.all([
      import('@testcontainers/postgresql'),
      import('testcontainers'),
      import('pg'),
      import('drizzle-orm/node-postgres'),
      import('drizzle-orm/node-postgres/migrator'),
      import('bcryptjs'),
      import('tsx/esm/api'),
    ]);
    const databasePassword = randomUUID();
    const password = `${randomUUID()}-${randomUUID()}`;
    const sessionSecret = `${randomUUID()}-${randomUUID()}`;
    for (const secret of [databasePassword, password, sessionSecret]) secrets.add(secret);
    getRuntimeClient = getContainerRuntimeClient;
    class OwnedPostgreSqlContainer extends PostgreSqlContainer {
      containerCreated(containerId) {
        Object.assign(lifecycle, { containerId, containerCreatedAt: now() });
        writeEvidence(evidenceDir, 'container-created.json', {
          containerId,
          createdAt: lifecycle.containerCreatedAt,
        });
        return Promise.resolve();
      }
    }
    container = await new OwnedPostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase(`f115_${runId.replaceAll('-', '')}`)
      .withUsername('f115_browser')
      .withPassword(databasePassword)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(60_000)
      .start();
    assert.equal(
      container.getId(),
      lifecycle.containerId,
      'Started container differs from created identity'
    );
    const databaseUrl = container.getConnectionUri();
    secrets.add(databaseUrl);
    pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 5_000,
    });
    controller.signal.throwIfAborted();
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    const journalFile = path.join(ROOT, 'migrations/meta/_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    const migrationFiles = journal.entries.map((entry) => ({
      name: `${entry.tag}.sql`,
      sha256: fileHash(path.join(ROOT, 'migrations', `${entry.tag}.sql`)),
    }));
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(ROOT, 'migrations'),
      migrationsTable: 'drizzle_migrations',
      migrationsSchema: 'drizzle',
    });
    const sharedMigrations = [];
    for (const file of fs
      .readdirSync(path.join(ROOT, 'shared/migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const sql = fs.readFileSync(path.join(ROOT, 'shared/migrations', file));
      await pool.query(sql.toString('utf8'));
      sharedMigrations.push({ name: file, sha256: hash(sql), status: 'applied' });
    }
    const databaseIdentity = (
      await pool.query('SELECT current_database() AS database,current_user AS role')
    ).rows[0];
    const applied = (
      await pool.query('SELECT hash,created_at FROM drizzle.drizzle_migrations ORDER BY created_at')
    ).rows;
    assert.equal(
      applied.length,
      journal.entries.length,
      'Migration ledger differs from canonical journal'
    );
    report.migrations = writeEvidence(evidenceDir, 'migrations.json', {
      databaseIdentity,
      journalSha256: fileHash(journalFile),
      canonical: migrationFiles,
      shared: sharedMigrations,
      applied,
      extensions: (
        await pool.query(
          "SELECT extname,extversion FROM pg_extension WHERE extname IN ('pgcrypto','vector') ORDER BY extname"
        )
      ).rows,
    });
    const { makeCapitalRawConfig } = await tsImport(
      pathToFileURL(path.join(ROOT, 'tests/fixtures/capital-planning/fixtures.ts')).href,
      import.meta.url
    );
    const primary = makeCapitalRawConfig();
    const secondary = makeCapitalRawConfig();
    secondary.fundSize = 100_000_000;
    secondary.fundLife = 10;
    secondary.investmentPeriod = 10;
    secondary.fundedFromFeesPct = 0;
    secondary.economicsAssumptions.gpCommitmentModel.commitmentAmount = 10_000_000;
    secondary.economicsAssumptions.feeModel.tiers[0].rate = 0.018;
    secondary.economicsAssumptions.feeModel.tiers[0].endYear = 10;
    secondary.economicsAssumptions.expenseModel.annualExpenses[0].amount = 200_000;
    secondary.economicsAssumptions.expenseModel.annualExpenses[0].endYear = 10;
    secondary.capitalPlanAllocations[0].capitalAllocationPct = 1;
    secondary.capitalPlanAllocations[0].initialCheckAmount = 1_000_000;
    secondary.pipelineProfiles[0].stages[0].roundSize = 2_000_000;
    secondary.pipelineProfiles[0].stages[0].valuation = 10_000_000;
    secondary.pipelineProfiles[0].stages[0].graduationRate = 0.5;
    const username = `f115-${runId}@example.invalid`;
    const client = await pool.connect();
    let user;
    const seeded = [];
    try {
      await client.query('BEGIN');
      user = (
        await client.query(
          "INSERT INTO users(username,password,role,is_active) VALUES($1,$2,'partner',true) RETURNING id,username,role,is_active",
          [username, await bcrypt.hash(password, 12)]
        )
      ).rows[0];
      for (const [index, raw] of [primary, secondary].entries()) {
        const fund = (
          await client.query(
            "INSERT INTO funds(name,size,base_currency,management_fee,carry_percentage,vintage_year) VALUES($1,$2,'USD','0.0200','0.2000',2026) RETURNING id,size,base_currency",
            [`F115 synthetic ${runId} ${index}`, String(raw.fundSize)]
          )
        ).rows[0];
        const source = (
          await client.query(
            'INSERT INTO fundconfigs(fund_id,version,config,is_draft,is_published,published_at) VALUES($1,1,$2::jsonb,false,true,$3) RETURNING id,fund_id,version,published_at,config',
            [fund.id, JSON.stringify(raw), '2026-01-01T00:00:00.000Z']
          )
        ).rows[0];
        await client.query('INSERT INTO user_fund_grants(user_id,fund_id) VALUES($1,$2)', [
          user.id,
          fund.id,
        ]);
        assert.deepEqual(source.config, raw, 'Seed changed raw source bytes/values');
        seeded.push({ fund, source });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const config = {
      schemaVersion: CONFIG_SCHEMA,
      runId,
      evidenceDir,
      baseURL: BASE_URL,
      databaseUrl,
      username,
      password,
      userId: user.id,
      fundId: seeded[0].fund.id,
      expectedCommit,
      secondaryFundId: seeded[1].fund.id,
    };
    fs.writeFileSync(privateConfigPath, JSON.stringify(config), { flag: 'wx', mode: 0o600 });
    assert.equal(fs.statSync(privateConfigPath).mode & 0o777, 0o600);
    report.seed = writeEvidence(evidenceDir, 'seed.json', {
      user,
      funds: seeded,
      databaseIdentity,
      grants: (
        await pool.query(
          'SELECT user_id,fund_id FROM user_fund_grants WHERE user_id=$1 ORDER BY fund_id',
          [user.id]
        )
      ).rows,
    });
    const apiEnv = {
      ...environment,
      TZ: 'UTC',
      NODE_ENV: 'test',
      _EXPLICIT_NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '5000',
      _EXPLICIT_PORT: '5000',
      DATABASE_URL: databaseUrl,
      _EXPLICIT_DATABASE_URL: databaseUrl,
      USE_REAL_DB_IN_VITEST: '1',
      ALLOW_MEMORY_STORAGE: '0',
      _EXPLICIT_ALLOW_MEMORY_STORAGE: '0',
      REQUIRE_AUTH: '1',
      DEMO_MODE: '0',
      ENABLE_QUEUES: '0',
      _EXPLICIT_ENABLE_QUEUES: '0',
      ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
      _EXPLICIT_ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
      REDIS_URL: 'memory://',
      _EXPLICIT_REDIS_URL: 'memory://',
      QUEUE_REDIS_URL: 'memory://',
      _EXPLICIT_QUEUE_REDIS_URL: 'memory://',
      JWT_SECRET: sessionSecret,
      _EXPLICIT_JWT_SECRET: sessionSecret,
      SESSION_SECRET: sessionSecret,
      JWT_ISSUER: 'updog-api',
      _EXPLICIT_JWT_ISSUER: 'updog-api',
      JWT_AUDIENCE: 'updog-client',
      _EXPLICIT_JWT_AUDIENCE: 'updog-client',
      JWT_ALG: 'HS256',
      _EXPLICIT_JWT_ALG: 'HS256',
      CLIENT_URL: BASE_URL,
      CORS_ORIGIN: BASE_URL,
      ALLOWED_ORIGINS: BASE_URL,
      COMMIT_REF: expectedCommit,
      TSX_TSCONFIG_PATH: path.join(ROOT, 'tsconfig.json'),
      LOG_LEVEL: 'error',
    };
    api = start('api', ['--import', 'tsx', SELF, '--api-child'], apiEnv, true, true);
    const ready = await race(
      bounded(
        new Promise((resolve, reject) => {
          api.child.on('message', (message) => {
            if (message.kind === 'ready') resolve(message);
            if (message.kind === 'startup-error') reject(new Error(message.error));
            if (message.kind === 'shutdown-complete') lifecycle.apiShutdown = message;
          });
        }),
        120_000,
        'API readiness'
      )
    );
    assert.equal(ready.database.database, databaseIdentity.database);
    assert.equal(ready.database.role, databaseIdentity.role);
    report.apiReady = writeEvidence(evidenceDir, 'api-ready.json', ready);
    const uiEnv = {
      ...environment,
      TZ: 'UTC',
      NODE_ENV: 'production',
      CI: 'true',
      VITE_API_URL: API_URL,
      VITE_API_PORT: '5000',
      VITE_CLIENT_PORT: '5173',
      VITE_E2E_DEMO_ENABLED: '',
    };
    ui = start('ui', [SELF, '--ui-child'], uiEnv, true, true);
    const uiReady = await race(
      bounded(
        new Promise((resolve, reject) => {
          ui.child.on('message', (message) => {
            if (message.kind === 'ready') resolve(message);
            if (message.kind === 'startup-error') reject(new Error(message.error));
            if (message.kind === 'shutdown-complete') lifecycle.uiShutdown = message;
          });
        }),
        120_000,
        'UI readiness'
      )
    );
    assert.equal(uiReady.baseURL, BASE_URL);
    assert.equal(uiReady.prod, true);
    assert.equal(uiReady.dev, false);
    assert.equal(uiReady.mode, 'test');
    report.uiReady = writeEvidence(evidenceDir, 'ui-ready.json', uiReady);
    const health = {};
    for (const [label, url] of [
      ['api', API_URL],
      ['proxy', BASE_URL],
    ]) {
      const deadline = Date.now() + 120_000;
      let observed;
      while (Date.now() < deadline) {
        controller.signal.throwIfAborted();
        try {
          const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(5_000) });
          if (response.ok) {
            observed = await response.json();
            break;
          }
        } catch {
          /* Startup is bounded by the deadline and child exit observation. */
        }
        await race(delay(250));
      }
      assert(observed, `${label} health did not become ready`);
      assert.equal(observed.commit_sha, expectedCommit);
      health[label] = observed;
    }
    const denied = await fetch(`${API_URL}/api/funds/${config.fundId}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(denied.status, 401, 'API must require real authentication');
    report.health = writeEvidence(evidenceDir, 'health-wiring.json', {
      ...health,
      unauthenticatedStatus: denied.status,
    });
    const baseArgs = [
      path.join(ROOT, 'node_modules/@playwright/test/cli.js'),
      'test',
      SPEC,
      '--project=core',
      '--no-deps',
      '--reporter=line,json',
      '--retries=0',
      '--workers=1',
      '--trace=off',
    ];
    if (grep) baseArgs.push('--grep', grep);
    const browserEnv = {
      ...environment,
      TZ: 'UTC',
      CI: '1',
      BASE_URL,
      F115_CAPITAL_E2E_CONFIG: privateConfigPath,
    };
    const collectionPath = path.join(evidenceDir, 'collection.json');
    await command(
      'playwright-list',
      [...baseArgs, '--list', '--output', path.join(evidenceDir, 'collection-output')],
      { ...browserEnv, PLAYWRIGHT_JSON_OUTPUT_FILE: collectionPath }
    );
    const collection = selectedTests(JSON.parse(fs.readFileSync(collectionPath, 'utf8')));
    report.collection = writeEvidence(evidenceDir, 'collection-proof.json', {
      tests: collection,
      reportSha256: fileHash(collectionPath),
    });
    const resultsPath = path.join(evidenceDir, 'browser-results.json');
    await command(
      'playwright',
      [...baseArgs, '--output', path.join(evidenceDir, 'browser-output')],
      { ...browserEnv, PLAYWRIGHT_JSON_OUTPUT_FILE: resultsPath }
    );
    const passed = selectedTests(JSON.parse(fs.readFileSync(resultsPath, 'utf8')), true);
    assert.deepEqual(passed, collection, 'Execution differs from intended-spec collection');
    report.browser = {
      testsPassed: passed.length,
      resultPath: resultsPath,
      resultSha256: fileHash(resultsPath),
    };
    assert.deepEqual(
      sourceAndPackageMetadataManifest(),
      inputs,
      'Source files or installed package metadata changed during the browser run'
    );
    assert.equal(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      expectedCommit
    );
    report.sourceAndPackageMetadataUnchanged = true;
  } catch (error) {
    failure = redact(error.stack ?? error);
  } finally {
    for (const record of managed) record.stopping = true;
    for (const record of [...managed].reverse()) {
      try {
        if (!record.result) {
          if ((record === api || record === ui) && record.child.connected) {
            record.shutdownRequest = { id: randomUUID(), sentAt: now() };
            record.child.send({ kind: 'shutdown', requestId: record.shutdownRequest.id });
          } else record.child.kill('SIGTERM');
          try {
            await bounded(
              record.exit,
              record === api || record === ui ? 45_000 : 10_000,
              `${record.label} exit`
            );
          } catch (error) {
            record.forced = true;
            lifecycle.errors.push(redact(error));
            record.child.kill('SIGKILL');
            await bounded(record.exit, 10_000, `${record.label} forced exit`);
          }
        }
        lifecycle.processes.push({
          ...record.result,
          forced: record.forced ?? false,
          shutdownRequest: record.shutdownRequest ?? null,
        });
        if (record === api || record.label === 'ui') {
          assertCleanProcessExit(record.result, record.forced ?? false);
        }
        if (record === api) {
          assert.equal(record.result.code, 0, 'API shutdown failed');
          assert.equal(lifecycle.apiShutdown?.exitCode, 0, 'API drain acknowledgement missing');
          for (const name of ['http', 'database', 'pgCircuit', 'redisCircuit']) {
            assert.equal(
              lifecycle.apiShutdown.closures[name]?.status,
              'closed',
              `API ${name} cleanup unproven`
            );
          }
        }
        if (record === ui) assertUIShutdown(lifecycle.uiShutdown, record.shutdownRequest);
      } catch (error) {
        lifecycle.errors.push(redact(error));
      }
    }
    for (const file of generatedReports) {
      try {
        sanitizeReport(file);
      } catch (error) {
        lifecycle.errors.push(redact(error));
      }
    }
    if (pool) {
      try {
        await bounded(pool.end(), 10_000, 'Runner database pool close');
        Object.assign(lifecycle, { poolClosed: true });
      } catch (error) {
        lifecycle.errors.push(redact(error));
      }
    }
    if (container) {
      try {
        await bounded(container.stop({ timeout: 10_000 }), 30_000, 'PostgreSQL container stop');
      } catch (error) {
        lifecycle.errors.push(redact(error));
      }
    }
    if (lifecycle.containerId) {
      try {
        const cleanup = await bounded(
          removeOwnedContainer(getRuntimeClient, lifecycle.containerId),
          30_000,
          'Owned PostgreSQL container removal/absence verification'
        );
        Object.assign(lifecycle, { containerCleanup: cleanup, containerStopped: cleanup.absent });
      } catch (error) {
        lifecycle.errors.push(redact(error));
      }
    }
    try {
      if (fs.existsSync(privateConfigPath)) fs.unlinkSync(privateConfigPath);
      Object.assign(lifecycle, { privateConfigDeleted: !fs.existsSync(privateConfigPath) });
    } catch (error) {
      lifecycle.errors.push(redact(error));
    }
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
    Object.assign(lifecycle, { finishedAt: now() });
    report.status = failure || lifecycle.errors.length ? 'FAILED' : 'PASS_BROWSER_AND_CLEANUP';
    if (failure) report.error = failure;
    writeEvidence(evidenceDir, 'lifecycle.json', lifecycle);
    writeEvidence(evidenceDir, 'runner-report.json', report);
  }
  assert.equal(
    report.status,
    'PASS_BROWSER_AND_CLEANUP',
    `B10 runner failed; see ${path.join(evidenceDir, 'runner-report.json')}`
  );
  console.log(`B10 browser and cleanup passed: ${evidenceDir}`);
}

const { values } = parseArgs({
  options: {
    'api-child': { type: 'boolean' },
    'ui-child': { type: 'boolean' },
    'self-check': { type: 'boolean' },
    'evidence-dir': { type: 'string' },
    grep: { type: 'string' },
  },
});
try {
  if (values['api-child']) await apiChild();
  else if (values['ui-child']) await uiChild();
  else if (values['self-check']) await selfCheck();
  else await run(values['evidence-dir'], values.grep);
} catch (error) {
  console.error(redact(error.stack ?? error));
  process.exitCode = 1;
}
