import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import http from 'node:http';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delayTimer } from 'node:timers/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { BootProofDocumentSchema } from '../matrix-schema.mjs';

const thisFile = fileURLToPath(import.meta.url);
const matrixDir = path.resolve(path.dirname(thisFile), '..');
const repoRoot = path.resolve(matrixDir, '../..');
const outputFile = path.join(matrixDir, 'boot-proofs.json');
const syntheticJwt = 'surface-contract-matrix-proof-secret-0123456789';
const syntheticRuntimeSecret = 'surface-proof-runtime-secret-0123456789abcdef';
const PORTS = Object.freeze({ api: 51237, worker: 51238, web: 51239, ml: 51240 });
const HEALTH_PATHS = Object.freeze(['/health', '/live', '/ready', '/metrics', '/stats']);

const stableJson = (value) => JSON.stringify(value, Object.keys(value).sort());
const proofObservedAt = ({ deployment, runtime, boot_status, command_or_artifact, probe, result }) =>
  `proof:${createHash('sha256').update(stableJson({
    deployment,
    runtime,
    boot_status,
    command_or_artifact,
    probe,
    result,
  })).digest('hex')}`;

const VERCEL_BUILD_ENV_KEYS = Object.freeze([
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
]);

const requiredVercelBuildCredentials = (environment = process.env) => Object.fromEntries(
  VERCEL_BUILD_ENV_KEYS.map((key) => [key, environment[key]?.trim()])
);

const sanitizedBaseEnv = (environment = process.env) => ({
  PATH: environment.PATH,
  TZ: 'UTC',
  CI: '1',
  NODE_ENV: 'test',
  _EXPLICIT_NODE_ENV: '1',
  PORT: String(PORTS.api),
  _EXPLICIT_PORT: '1',
  DATABASE_URL: 'postgresql://surface-proof:surface-proof@127.0.0.1:1/surface_proof',
  _EXPLICIT_DATABASE_URL: '1',
  NEON_DATABASE_URL: 'postgresql://surface-proof:surface-proof@127.0.0.1:1/surface_proof',
  _EXPLICIT_NEON_DATABASE_URL: '1',
  REDIS_URL: 'memory://',
  _EXPLICIT_REDIS_URL: '1',
  QUEUE_REDIS_URL: 'redis://127.0.0.1:6399',
  _EXPLICIT_QUEUE_REDIS_URL: '1',
  SESSION_REDIS_URL: 'memory://',
  RATE_LIMIT_REDIS_URL: 'memory://',
  ENABLE_QUEUES: '0',
  _EXPLICIT_ENABLE_QUEUES: '1',
  ALLOW_MEMORY_STORAGE: '1',
  _EXPLICIT_ALLOW_MEMORY_STORAGE: '1',
  JWT_SECRET: syntheticJwt,
  _EXPLICIT_JWT_SECRET: '1',
  JWT_ALG: 'HS256',
  _EXPLICIT_JWT_ALG: '1',
  JWT_ISSUER: 'surface-proof',
  _EXPLICIT_JWT_ISSUER: '1',
  JWT_AUDIENCE: 'surface-proof',
  _EXPLICIT_JWT_AUDIENCE: '1',
  REQUIRE_AUTH: '0',
  DISABLE_AUTH: '1',
  CORS_ORIGIN: 'http://127.0.0.1',
  CLIENT_URL: 'http://127.0.0.1',
  LOG_LEVEL: 'silent',
  HUSKY: '0',
});

export const proofEnv = (overrides = {}, environment = process.env) => ({
  ...sanitizedBaseEnv(environment),
  ...overrides,
});

export const vercelBuildEnvironment = (environment = process.env) => ({
  ...proofEnv({}, environment),
  ...requiredVercelBuildCredentials(environment),
});

export const vercelFunctionProofEnvironment = (environment = process.env) => proofEnv({
  VERCEL: '1',
  VERCEL_ENV: 'production',
  NODE_ENV: 'production',
  ALLOW_MEMORY_STORAGE: '0',
  REDIS_URL: 'redis://127.0.0.1:6399',
  CORS_ORIGIN: 'https://surface-proof.invalid',
  CLIENT_URL: 'https://surface-proof.invalid',
  SESSION_SECRET: syntheticRuntimeSecret,
  HEALTH_KEY: syntheticRuntimeSecret,
  METRICS_KEY: syntheticRuntimeSecret,
  FUND_SCENARIO_HARD_TIMEOUT_MS: '30000',
}, environment);

export const assertStrictVercelBuildCredentials = (environment = process.env) => {
  const credentials = requiredVercelBuildCredentials(environment);
  for (const key of VERCEL_BUILD_ENV_KEYS) {
    if (!credentials[key]) throw new Error(`${key} is required for strict Vercel build proof`);
  }
  return credentials;
};

export const redactChildOutput = (value, environment = process.env) => {
  let redacted = String(value);
  for (const credential of Object.values(requiredVercelBuildCredentials(environment))) {
    if (credential) redacted = redacted.split(credential).join('[REDACTED]');
  }
  return redacted;
};

export const withVercelCredentialsMasked = async (action, environment = process.env) => {
  const original = Object.fromEntries(VERCEL_BUILD_ENV_KEYS.map((key) => [key, process.env[key]]));
  const redactionEnvironment = requiredVercelBuildCredentials(environment);
  for (const key of VERCEL_BUILD_ENV_KEYS) delete process.env[key];
  try {
    return await action(redactionEnvironment);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const commandResult = (command, args, env, timeout = 180_000) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const npmResult = (script, env, timeout = 180_000) => commandResult('npm', ['run', script], env, timeout);

const tcpReachable = (host, port) => new Promise((resolve) => {
  const socket = net.createConnection({ host, port });
  const finish = (reachable) => {
    socket.destroy();
    resolve(reachable);
  };
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
  socket.setTimeout(100, () => finish(false));
});

const listeningPids = (port) => {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return [...result.stdout.matchAll(/^p(\d+)$/gm)].map((match) => Number(match[1]));
};

const listeningPortsForPid = (pid) => {
  const result = spawnSync('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-FpPn'], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return [...result.stdout.matchAll(/^n[^\n]*:(\d+)$/gm)].map((match) => Number(match[1]));
};

const dockerContainerPid = (containerName) => {
  if (!containerName) return undefined;
  try {
    const pid = Number(execFileSync('docker', ['inspect', '-f', '{{.State.Pid}}', containerName], { encoding: 'utf8' }).trim());
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
};

const socketOwnerPid = (port, containerName) => containerName ? dockerContainerPid(containerName) : listeningPids(port)[0];

const probeHttp = (port, specification) => new Promise((resolve) => {
  const expected = specification.expected_statuses ?? Array.from({ length: 100 }, (_, index) => index + 200);
  const request = http.request({
    hostname: '127.0.0.1',
    port,
    path: specification.path,
    method: specification.method ?? 'GET',
    timeout: 150,
    headers: specification.body === undefined ? undefined : { 'content-type': 'application/json' },
  }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    response.once('end', () => resolve({
      path: specification.path,
      method: specification.method ?? 'GET',
      status: response.statusCode ?? 0,
      ok: expected.includes(response.statusCode ?? 0),
      expected_statuses: expected,
      body: Buffer.concat(chunks).toString('utf8'),
      body_json: (() => {
        try {
          return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return undefined;
        }
      })(),
    }));
  });
  request.on('error', () => resolve({ path: specification.path, method: specification.method ?? 'GET', status: null, ok: false, expected_statuses: expected }));
  request.on('timeout', () => {
    request.destroy();
    resolve({ path: specification.path, method: specification.method ?? 'GET', status: null, ok: false, expected_statuses: expected });
  });
  if (specification.body !== undefined) request.write(JSON.stringify(specification.body));
  request.end();
});

const pause = (milliseconds) => delayTimer(milliseconds);

const terminate = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await pause(100);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
};

const runHttpProcess = async ({ command, args, env, port, paths, containerName }) => {
  let output = '';
  let spawnError;
  const portFreeBeforeSpawn = port === 0 || !(await tcpReachable('127.0.0.1', port));
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.once('error', (error) => { spawnError = error; });
  const expectedCommand = path.basename(command);
  const identityVerified = child.pid > 0
    && path.basename(child.spawnfile ?? '') === expectedCommand
    && child.spawnargs.slice(-args.length).every((argument, index) => argument === args[index]);

  let statuses = [];
  let actualPort = port;
  let childAliveAtProbe = false;
  let socketOwnedByChild = false;
  const readinessDeadline = Date.now() + 60_000;
  while (Date.now() < readinessDeadline) {
    if (actualPort === 0) actualPort = listeningPortsForPid(child.pid)[0] ?? 0;
    if (actualPort > 0) {
      childAliveAtProbe = child.exitCode === null && child.signalCode === null;
      socketOwnedByChild = socketOwnerPid(actualPort, containerName) === (containerName ? dockerContainerPid(containerName) : child.pid);
    }
    if (actualPort > 0 && childAliveAtProbe && socketOwnedByChild) {
      statuses = await Promise.all(paths.map((specification) => probeHttp(actualPort, specification)));
    }
    if (statuses.length === paths.length && paths.length > 0 && statuses.every((status) => status.ok)) break;
    if (child.exitCode !== null || child.signalCode !== null) break;
    await pause(250);
  }
  childAliveAtProbe = child.exitCode === null && child.signalCode === null;
  socketOwnedByChild = actualPort > 0 && socketOwnerPid(actualPort, containerName) === (containerName ? dockerContainerPid(containerName) : child.pid);
  const exited = child.exitCode !== null || child.signalCode !== null;
  await terminate(child);
  return {
    statuses,
    output,
    exited,
    exitCode: child.exitCode,
    signal: child.signalCode,
    spawnError,
    identityVerified,
    actualPort,
    portFreeBeforeSpawn,
    childAliveAtProbe,
    socketOwnedByChild,
    proven: portFreeBeforeSpawn && identityVerified && childAliveAtProbe && socketOwnedByChild
      && statuses.length === paths.length && paths.length > 0 && statuses.every((status) => status.ok),
  };
};

const evidence = ({ deployment, runtime, boot_status, command_or_artifact, probe, result, worker_identity }) => ({
  deployment,
  ...(runtime ? { runtime } : {}),
  boot_status,
  boot_evidence: {
    command_or_artifact,
    probe,
    result,
    observed_at: proofObservedAt({ deployment, runtime, boot_status, command_or_artifact, probe, result }),
  },
  ...(worker_identity ? { worker_identity } : {}),
});

export const workerRuntimeProofs = (workerProcessProof) => {
  if (workerProcessProof.runtime !== 'worker_process'
    || !workerProcessProof.deployment.startsWith('railway-worker-')) {
    throw new Error('Worker runtime proof fan-out requires a Railway worker_process proof');
  }
  return [
    workerProcessProof,
    { ...workerProcessProof, runtime: 'service_listener' },
  ];
};

const unavailableCommandCodes = new Set(['ENOENT', 'EACCES']);

export const bootStatusForCommandResult = (result = {}) => {
  if (result.ok === true) return 'proven';
  return unavailableCommandCodes.has(result.error?.code) ? 'unproven' : 'failed';
};

const commandFailureDetail = (result = {}) => {
  const errorCode = result.error?.code;
  if (errorCode) return ` with error ${errorCode}${errorCode === 'ETIMEDOUT' ? ' (timeout)' : ''}`;
  if (result.signal) return ` with signal ${result.signal}`;
  if (result.status === null) return ' with no exit status';
  return ` with status ${result.status ?? 'unknown'}`;
};

const commandFailureResult = (label, result = {}, environment = process.env) => {
  const output = redactChildOutput(`${result.stderr ?? ''}\n${result.stdout ?? ''}`, environment).trim().replaceAll(/\s+/g, ' ');
  return `${label} failed${commandFailureDetail(result)}${output ? `: ${output.slice(0, 600)}` : ''}`;
};

export const commandFailureEvidence = ({
  deployment,
  runtime,
  command_or_artifact,
  probe,
  label,
  result,
  environment,
}) => evidence({
  deployment,
  runtime,
  boot_status: bootStatusForCommandResult(result),
  command_or_artifact,
  probe,
  result: commandFailureResult(label, result, environment),
});

const failureSummary = (result, fallback) => {
  if (result.ok) return fallback;
  const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.toLowerCase();
  if (output.includes('database_url')) return `${fallback}: database configuration rejected`;
  const missingExport = output.match(/makeapp export missing:([^\n]+)/);
  if (missingExport) return `${fallback}: makeApp exports ${missingExport[1].trim()}`;
  if (output.includes('export missing')) return `${fallback}: expected export missing`;
  if (output.includes('cannot find module')) return `${fallback}: module resolution failed`;
  if (output.includes('syntaxerror')) return `${fallback}: syntax error`;
  if (result.error?.code) return `${fallback}: ${result.error.code}`;
  return `${fallback}: child exited ${result.status ?? result.signal ?? 'unknown'}`;
};

const dockerAvailable = () => commandResult('docker', ['info'], proofEnv(), 10_000).ok;

const dockerCleanup = (name, kind = 'container') => {
  const args = kind === 'network' ? ['network', 'rm', name] : ['rm', '-f', name];
  commandResult('docker', args, proofEnv(), 20_000);
};

const dockerFailure = (label, result) => {
  return commandFailureResult(label, result);
};

export const workerConsumerIsHealthy = ({
  health,
  stats,
  workerType = 'fund-scenario-calc',
  sourceSha,
  deploymentId,
}) => {
  const expectedWorker = health?.workers?.find((worker) => worker.name === workerType);
  const expectedStats = stats?.workers?.find((worker) => worker.name === workerType);
  return Boolean(expectedWorker && expectedStats
    && expectedWorker.status === 'healthy'
    && expectedWorker.isRunning === true
    && (sourceSha === undefined || (
      health?.status === 'healthy'
      && health?.workerType === workerType
      && health?.commit === sourceSha
      && health?.deploymentId === deploymentId
    )));
};

export const workerProofEnvironment = ({ workerType, sourceSha, deploymentId }) => ({
  NODE_ENV: 'production',
  WORKER_TYPE: workerType,
  RAILWAY_SERVICE_NAME: workerType,
  RAILWAY_ENVIRONMENT_NAME: 'production',
  RAILWAY_GIT_COMMIT_SHA: sourceSha,
  RAILWAY_DEPLOYMENT_ID: deploymentId,
  [workerType === 'fund-scenario-calc' ? 'FUND_SCENARIO_HARD_TIMEOUT_MS' : 'CAPITAL_CALL_STATUS_HARD_TIMEOUT_MS']: '30000',
});

export const workerPostgresProofHostname = (postgresName) => `${postgresName}.localhost`;

export const workerProofPlan = ({ workerType, sourceSha, deploymentId }) => ({
  workerEnvironment: workerProofEnvironment({ workerType, sourceSha, deploymentId }),
  steps: [
    'network',
    'redis',
    'postgres',
    ...(workerType === 'capital-call-status' ? ['capital-schema-preparation'] : []),
    'image-build',
    'worker-launch',
  ],
});

export const executeWorkerProofPlan = async ({ steps, execute }) => {
  for (const step of steps) {
    const result = await execute(step);
    if (!result?.ok) return { ok: false, failedStep: step };
  }
  return { ok: true };
};

const railwayWorkerProof = async ({ workerType, deployment, sourceSha }) => {
  const command_or_artifact = `docker build -f Dockerfile.worker; docker run ${workerType} worker with isolated Redis and PostgreSQL`;
  const probe = `Dockerfile.worker runs ${workerType}; GET /health /live /ready /metrics /stats through mapped port with a 30000ms worker timeout`;
  const plannedWorkerIdentity = { workerType, commit: sourceSha, deploymentId: `surface-matrix-${workerType}` };
  const plan = workerProofPlan({ workerType, sourceSha, deploymentId: plannedWorkerIdentity.deploymentId });
  if (!dockerAvailable()) {
    return evidence({
      deployment,
      runtime: 'worker_process',
      boot_status: 'unproven',
      command_or_artifact,
      probe,
      result: 'docker unavailable: docker info could not access a daemon; worker proof was not executable',
    });
  }

  const image = 'surface-matrix-worker-proof:local';
  const network = 'surface-matrix-worker-proof-net';
  const redisName = 'surface-matrix-worker-redis-proof';
  const postgresName = 'surface-matrix-worker-postgres-proof';
  const workerName = `surface-matrix-${workerType}-proof`;
  dockerCleanup(workerName);
  dockerCleanup(redisName);
  dockerCleanup(postgresName);
  dockerCleanup(network, 'network');
  try {
    const networkCreate = commandResult('docker', ['network', 'create', network], proofEnv(), 30_000);
    if (!networkCreate.ok) return evidence({ deployment, runtime: 'worker_process', boot_status: 'failed', command_or_artifact, probe, result: dockerFailure('worker proof network creation', networkCreate) });

    const redis = commandResult('docker', [
      'run', '-d', '--rm', '--name', redisName, '--network', network, 'redis:7-alpine',
    ], proofEnv(), 120_000);
    if (!redis.ok) return evidence({ deployment, runtime: 'worker_process', boot_status: 'failed', command_or_artifact, probe, result: dockerFailure('Redis proof container startup', redis) });

    let redisReady = false;
    const redisDeadline = Date.now() + 60_000;
    while (Date.now() < redisDeadline) {
      const ping = commandResult('docker', ['exec', redisName, 'redis-cli', 'ping'], proofEnv(), 10_000);
      if (ping.ok && ping.stdout.trim() === 'PONG') {
        redisReady = true;
        break;
      }
      await pause(250);
    }
    if (!redisReady) return evidence({ deployment, runtime: 'worker_process', boot_status: 'failed', command_or_artifact, probe, result: 'Redis proof container did not become ready; worker proof was not faked' });

    const schemaPort = 55439;
    const postgres = commandResult('docker', [
      'run', '-d', '--rm', '--name', postgresName, '--network', network,
      '--network-alias', workerPostgresProofHostname(postgresName),
      '-p', `${schemaPort}:5432`,
      '-e', 'POSTGRES_USER=surface-proof',
      '-e', 'POSTGRES_PASSWORD=surface-proof',
      '-e', 'POSTGRES_DB=surface_proof',
      'postgres:16-alpine',
    ], proofEnv(), 120_000);
    if (!postgres.ok) return evidence({ deployment, runtime: 'worker_process', boot_status: 'failed', command_or_artifact, probe, result: dockerFailure('PostgreSQL proof container startup', postgres) });

    let postgresReady = false;
    const postgresDeadline = Date.now() + 60_000;
    while (Date.now() < postgresDeadline) {
      const ready = commandResult('docker', ['exec', postgresName, 'pg_isready', '-U', 'surface-proof', '-d', 'surface_proof'], proofEnv(), 10_000);
      if (ready.ok) {
        postgresReady = true;
        break;
      }
      await pause(250);
    }
    if (!postgresReady) return evidence({ deployment, runtime: 'worker_process', boot_status: 'failed', command_or_artifact, probe, result: 'PostgreSQL proof container did not become ready; worker proof was not faked' });

    if (plan.steps.includes('capital-schema-preparation')) {
      const schemaPrep = npmResult('db:push', proofEnv({
        DATABASE_URL: `postgresql://surface-proof:surface-proof@127.0.0.1:${schemaPort}/surface_proof`,
        _EXPLICIT_DATABASE_URL: '1',
      }), 300_000);
      if (!schemaPrep.ok) return evidence({ deployment, runtime: 'worker_process', boot_status: 'failed', command_or_artifact, probe, result: dockerFailure('capital-call PostgreSQL schema preparation', schemaPrep) });
    }

    const imageBuild = commandResult('docker', ['build', '-f', 'Dockerfile.worker', '-t', image, '.'], proofEnv(), 600_000);
    if (!imageBuild.ok) return evidence({ deployment, runtime: 'worker_process', boot_status: 'failed', command_or_artifact, probe, result: dockerFailure('Dockerfile.worker image build', imageBuild) });

    const run = await runHttpProcess({
      command: 'docker',
      args: [
        'run', '--rm', '--name', workerName, '--network', network,
        '-p', `${PORTS.worker}:9000`,
        ...Object.entries(plan.workerEnvironment).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
        '-e', 'WORKER_HEALTH_PORT=9000',
        '-e', 'ENABLE_QUEUES=1',
        '-e', `QUEUE_REDIS_URL=redis://${redisName}:6379`,
        '-e', `REDIS_URL=redis://${redisName}:6379`,
        '-e', `DATABASE_URL=postgresql://surface-proof:surface-proof@${workerPostgresProofHostname(postgresName)}:5432/surface_proof`,
        image,
      ],
      env: proofEnv(),
      port: PORTS.worker,
      containerName: workerName,
      paths: HEALTH_PATHS.map((requestPath) => ({ path: requestPath, method: 'GET' })),
    });
    const health = run.statuses.find((status) => status.path === '/health')?.body_json;
    const stats = run.statuses.find((status) => status.path === '/stats')?.body_json;
    const consumerRegistered = workerConsumerIsHealthy({
      health,
      stats,
      workerType,
      sourceSha,
      deploymentId: plannedWorkerIdentity.deploymentId,
    });
    const proven = run.proven && consumerRegistered;
    const result = proven
      ? `Dockerfile.worker image stayed alive, Redis connected, and ${workerType} consumer was healthy and registered in /health and /stats`
      : `Dockerfile.worker container proof failed${!consumerRegistered ? `: /health and /stats did not report an exact healthy ${workerType} identity` : ''}${run.output ? `: ${run.output.trim().replaceAll(/\s+/g, ' ').slice(0, 600)}` : ''}`;
    const observedWorkerIdentity = proven
      ? { workerType: health.workerType, commit: health.commit, deploymentId: health.deploymentId }
      : undefined;
    return evidence({ deployment, runtime: 'worker_process', boot_status: proven ? 'proven' : 'failed', command_or_artifact, probe, result, worker_identity: observedWorkerIdentity });
  } finally {
    dockerCleanup(workerName);
    dockerCleanup(redisName);
    dockerCleanup(postgresName);
    dockerCleanup(network, 'network');
  }
};

const runNodeProbe = (code, env, useTsx = false) => commandResult(useTsx ? path.join(repoRoot, 'node_modules/.bin/tsx') : process.execPath,
  useTsx ? ['--tsconfig', path.join(repoRoot, 'tsconfig.server.json'), '-e', code] : ['--input-type=module', '-e', code], env, 120_000);

const VERCEL_API_COMMAND = 'node scripts/build-vercel-api.mjs; import api/_app.generated.mjs and construct makeApp()';
const VERCEL_API_PROBE = 'in-process makeApp() construction from Vercel API bundle; no listener';

export const vercelApiBuildFailureEvidence = (build) => commandFailureEvidence({
  deployment: 'vercel-api',
  runtime: 'make_app',
  command_or_artifact: VERCEL_API_COMMAND,
  probe: VERCEL_API_PROBE,
  label: 'Vercel API bundle build',
  result: build,
});

const vercelApiProof = async () => {
  const command_or_artifact = VERCEL_API_COMMAND;
  const probe = VERCEL_API_PROBE;
  const build = commandResult(process.execPath, ['scripts/build-vercel-api.mjs'], proofEnv(), 300_000);
  if (!build.ok) return vercelApiBuildFailureEvidence(build);
  const code = `import { pathToFileURL } from 'node:url'; const imported = await import(pathToFileURL(${JSON.stringify(path.join(repoRoot, 'api/_app.generated.mjs'))})); if (typeof imported.makeApp !== 'function') throw new Error('makeApp export missing:' + Object.keys(imported).sort().join(',')); const app = imported.makeApp(); if (!app || typeof app.use !== 'function') throw new Error('makeApp did not return Express app'); process.exit(0);`;
  const construction = runNodeProbe(code, proofEnv());
  return evidence({ deployment: 'vercel-api', runtime: 'make_app', boot_status: construction.ok ? 'proven' : 'failed', command_or_artifact, probe, result: construction.ok ? 'makeApp constructed from built bundle' : failureSummary(construction, 'built bundle makeApp construction failed') });
};

const VERCEL_FUNCTION_COMMAND = 'npx --yes vercel@55.0.0 build --prod --yes; .vercel/output/functions/**/*.func/.vc-config.json handler';
const VERCEL_FUNCTION_PROBE = 'enumerate every real Vercel build-output function and invoke its callable handler once';

export const vercelBuildInvocation = () => ({
  command: 'npx',
  args: ['--yes', 'vercel@55.0.0', 'build', '--prod', '--yes'],
});

export const vercelFunctionBuildFailureEvidence = (build) => evidence({
  deployment: 'vercel-api',
  runtime: 'vercel_function',
  boot_status: bootStatusForCommandResult(build),
  command_or_artifact: VERCEL_FUNCTION_COMMAND,
  probe: VERCEL_FUNCTION_PROBE,
  result: dockerFailure('Vercel build-output generation', build),
});

const functionDirectoriesUnder = (root) => {
  let rootStat;
  try {
    rootStat = fs.lstatSync(root);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    return [{ directory: root, error: 'invalid Vercel build-output functions root: unreadable path' }];
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    return [{ directory: root, error: 'invalid Vercel build-output functions root: must be a real directory' }];
  }
  const directories = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.name.endsWith('.func')) {
        directories.push({
          directory: absolute,
          ...(entry.isDirectory() ? {} : { error: 'invalid Vercel function directory: symbolic link or non-directory .func entry' }),
        });
        continue;
      }
      if (entry.isSymbolicLink()) {
        directories.push({ directory: absolute, error: 'invalid Vercel build-output path: symbolic link encountered during function discovery' });
        continue;
      }
      if (entry.isDirectory()) visit(absolute);
    }
  };
  visit(root);
  return directories.sort((left, right) => left.directory.localeCompare(right.directory));
};

const invalidVercelHandler = (message) => ({ entry: undefined, error: `invalid .vc-config.json handler: ${message}` });

const resolveVercelFunctionHandler = (directory) => {
  const configPath = path.join(directory, '.vc-config.json');
  let config;
  try {
    const configStat = fs.lstatSync(configPath);
    if (!configStat.isFile() || configStat.isSymbolicLink()) return invalidVercelHandler('.vc-config.json must be a regular non-symlink file');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    const detail = error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
      ? 'missing .vc-config.json'
      : 'unreadable .vc-config.json';
    return invalidVercelHandler(detail);
  }
  if (
    config === null
    || typeof config !== 'object'
    || Array.isArray(config)
    || Object.getPrototypeOf(config) !== Object.prototype
  ) {
    return invalidVercelHandler('.vc-config.json must be a plain object');
  }
  if (config.runtime !== 'nodejs22.x') {
    return invalidVercelHandler('runtime must be nodejs22.x');
  }
  const handler = config?.handler;
  if (typeof handler !== 'string' || handler.trim().length === 0 || handler.includes('\0')) {
    return invalidVercelHandler('must be a non-empty path string');
  }
  const portableHandler = handler.replaceAll('\\', '/');
  if (path.isAbsolute(handler) || path.win32.isAbsolute(handler) || path.posix.isAbsolute(portableHandler)) {
    return invalidVercelHandler('must be a safe relative path');
  }
  const entry = path.resolve(directory, portableHandler);
  const relative = path.relative(directory, entry);
  if (relative === '' || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    return invalidVercelHandler('must be a safe relative path');
  }
  const segments = relative.split(path.sep);
  let current = directory;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return invalidVercelHandler('handler file is missing');
      }
      return invalidVercelHandler('handler path is unreadable');
    }
    if (stat.isSymbolicLink()) return invalidVercelHandler('handler path contains a symbolic link');
    if (index === segments.length - 1 && !stat.isFile()) return invalidVercelHandler('handler must be a regular file');
    if (index < segments.length - 1 && !stat.isDirectory()) return invalidVercelHandler('handler path component must be a directory');
  }
  return { entry };
};

export const vercelBuildOutputFunctions = (functionsRoot = path.join(repoRoot, '.vercel', 'output', 'functions')) =>
  functionDirectoriesUnder(functionsRoot).map(({ directory, error }) => ({
    name: path.relative(functionsRoot, directory).replace(/\.func$/, '').split(path.sep).join('/'),
    directory,
    ...(error ? { entry: undefined, error } : resolveVercelFunctionHandler(directory)),
  }));

export const mockVercelResponse = () => {
  const response = {
    statusCode: 200,
    headers: {},
    writableEnded: false,
    finished: false,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    removeHeader(name) { delete this.headers[String(name).toLowerCase()]; },
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; Object.assign(this.headers, headers); return this; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json() { this.writableEnded = true; this.finished = true; return this; },
    send() { this.writableEnded = true; this.finished = true; return this; },
    write() { return true; },
    end() { this.writableEnded = true; this.finished = true; return this; },
    on() { return this; },
    once() { return this; },
  };
  return response;
};

const waitForVercelResponse = async (response, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  while (!response.writableEnded && !response.finished && Date.now() < deadline) await pause(25);
  if (!response.writableEnded && !response.finished) throw new Error('function response did not complete before timeout');
};

export const invokeVercelFunction = async ({ name, entry, error: entryError, responseTimeout = 20_000 }) => {
  if (entryError) return { name, ok: false, result: entryError };
  if (!entry) return { name, ok: false, result: 'build-output function has no resolved handler entrypoint' };
  try {
    const imported = await import(pathToFileURL(entry).href);
    const handler = imported.default ?? imported.handler;
    if (typeof handler !== 'function') return { name, ok: false, result: 'handler-export-missing' };
    const request = {
      method: 'GET',
      url: name.startsWith('api/') ? `/${name}` : `/${name}`,
      originalUrl: name.startsWith('api/') ? `/${name}` : `/${name}`,
      headers: { host: '127.0.0.1' },
      query: {},
      body: {},
      socket: { remoteAddress: '127.0.0.1' },
      on() { return this; },
      once() { return this; },
    };
    const response = mockVercelResponse();
    let timeoutHandle;
    try {
      await new Promise((resolve, reject) => {
        timeoutHandle = globalThis.setTimeout(
          () => reject(new Error('function invocation timed out')),
          responseTimeout,
        );
        Promise.resolve()
          .then(() => handler(request, response))
          .then(() => waitForVercelResponse(response, responseTimeout))
          .then(resolve, reject);
      });
    } finally {
      if (timeoutHandle) globalThis.clearTimeout(timeoutHandle);
    }
    const completed = response.writableEnded || response.finished;
    const acceptableStatus = Number.isInteger(response.statusCode)
      && response.statusCode >= 200
      && response.statusCode < 500;
    if (!completed || !acceptableStatus) {
      return {
        name,
        ok: false,
        result: 'handler-response-invalid',
      };
    }
    return { name, ok: true, result: 'handler-response-completed' };
  } catch {
    return { name, ok: false, result: 'handler-invocation-failed' };
  }
};

const VERCEL_FUNCTION_CHILD_CODE = String.raw`
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const [name, entry, timeoutArgument] = process.argv.slice(1);
const responseTimeout = Number(timeoutArgument);
const report = (result) => {
  fs.writeFileSync(3, JSON.stringify(result));
  process.exit(0);
};
const response = {
  statusCode: 200,
  headers: {},
  writableEnded: false,
  finished: false,
  setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
  getHeader(name) { return this.headers[String(name).toLowerCase()]; },
  removeHeader(name) { delete this.headers[String(name).toLowerCase()]; },
  writeHead(statusCode, headers = {}) { this.statusCode = statusCode; Object.assign(this.headers, headers); return this; },
  status(statusCode) { this.statusCode = statusCode; return this; },
  json() { this.writableEnded = true; this.finished = true; return this; },
  send() { this.writableEnded = true; this.finished = true; return this; },
  write() { return true; },
  end() { this.writableEnded = true; this.finished = true; return this; },
  on() { return this; },
  once() { return this; },
};
const request = {
  method: 'GET',
  url: '/' + name,
  originalUrl: '/' + name,
  headers: { host: '127.0.0.1' },
  query: {},
  body: {},
  socket: { remoteAddress: '127.0.0.1' },
  on() { return this; },
  once() { return this; },
};
const waitForResponse = async () => {
  const deadline = Date.now() + responseTimeout;
  while (!response.writableEnded && !response.finished && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!response.writableEnded && !response.finished) throw new Error('function response did not complete before timeout');
};
try {
  const imported = await import(pathToFileURL(entry).href);
  const handler = imported.default ?? imported.handler;
  if (typeof handler !== 'function') {
    report({ name, ok: false, result: 'handler-export-missing' });
  } else {
    let timeoutHandle;
    try {
      await new Promise((resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('function invocation timed out')), responseTimeout);
        Promise.resolve().then(() => handler(request, response)).then(() => waitForResponse()).then(resolve, reject);
      });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
    const completed = response.writableEnded || response.finished;
    const acceptableStatus = Number.isInteger(response.statusCode) && response.statusCode >= 200 && response.statusCode < 500;
    report(completed && acceptableStatus
      ? { name, ok: true, result: 'handler-response-completed' }
      : { name, ok: false, result: 'handler-response-invalid' });
  }
} catch {
  report({ name, ok: false, result: 'handler-invocation-failed' });
}
`;

const childOutput = (result, index) => {
  const output = result.output?.[index];
  if (typeof output === 'string') return output;
  return Buffer.isBuffer(output) ? output.toString('utf8') : '';
};

const validChildInvocation = (value, name) => value
  && typeof value === 'object'
  && value.name === name
  && typeof value.ok === 'boolean'
  && typeof value.result === 'string';

const isolatedFunctionCwd = (directory, entry) => {
  const cwd = directory ?? path.dirname(entry);
  try {
    const stat = fs.lstatSync(cwd);
    return stat.isDirectory() && !stat.isSymbolicLink() ? cwd : undefined;
  } catch {
    return undefined;
  }
};

const childFailureResult = (result) => [
  'isolated-handler-child-failed',
  Number.isInteger(result.status) ? `status=${result.status}` : undefined,
  result.error?.code ? `error=${result.error.code}` : undefined,
  result.signal ? `signal=${result.signal}` : undefined,
].filter(Boolean).join(' ');

export const invokeVercelFunctionInIsolatedChild = ({
  name,
  entry,
  directory,
  error: entryError,
  responseTimeout = 20_000,
  redactionEnvironment = process.env,
}) => {
  if (entryError) return { name, ok: false, result: entryError };
  if (!entry) return { name, ok: false, result: 'build-output function has no resolved handler entrypoint' };
  const cwd = isolatedFunctionCwd(directory, entry);
  if (!cwd) return { name, ok: false, result: 'isolated-handler-invalid-working-directory' };
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval', VERCEL_FUNCTION_CHILD_CODE,
    '--',
    name,
    entry,
    String(responseTimeout),
  ], {
    cwd,
    env: vercelFunctionProofEnvironment(),
    encoding: 'utf8',
    timeout: Math.min(Math.max(responseTimeout + 1_000, 1_000), 30_000),
    killSignal: 'SIGKILL',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
  });
  const protocol = childOutput(result, 3);
  if (result.error || result.status !== 0) {
    return {
      name,
      ok: false,
      result: redactChildOutput(childFailureResult(result), redactionEnvironment),
    };
  }
  try {
    const invocation = JSON.parse(protocol);
    if (!validChildInvocation(invocation, name)) throw new Error('invalid result');
    return { ...invocation, result: redactChildOutput(invocation.result, redactionEnvironment) };
  } catch {
    return {
      name,
      ok: false,
      result: redactChildOutput('isolated-handler-invalid-protocol', redactionEnvironment),
    };
  }
};

const vercelFunctionProof = async () => {
  const command_or_artifact = VERCEL_FUNCTION_COMMAND;
  const probe = VERCEL_FUNCTION_PROBE;
  const invocation = vercelBuildInvocation();
  const build = commandResult(invocation.command, invocation.args, vercelBuildEnvironment(), 600_000);
  if (!build.ok) return vercelFunctionBuildFailureEvidence(build);
  const functions = vercelBuildOutputFunctions();
  if (functions.length === 0) return evidence({ deployment: 'vercel-api', runtime: 'vercel_function', boot_status: 'failed', command_or_artifact, probe, result: 'Vercel build completed but emitted no .vercel/output/functions entries' });
  const redactionEnvironment = requiredVercelBuildCredentials();
  const invocations = functions.map((functionEntry) => invokeVercelFunctionInIsolatedChild({
    ...functionEntry,
    redactionEnvironment,
  }));
  const failed = invocations.filter((invocation) => !invocation.ok);
  const result = `invoked ${invocations.length} build-output function(s): ${invocations.map((invocation) => `${invocation.name}=${invocation.ok ? 'ok' : 'failed'}`).join(', ')}${failed.length > 0 ? `; ${failed.map((invocation) => invocation.result).join('; ')}` : ''}`;
  return evidence({ deployment: 'vercel-api', runtime: 'vercel_function', boot_status: failed.length === 0 ? 'proven' : 'failed', command_or_artifact, probe, result });
};

const VERCEL_WEB_COMMAND = 'npm run build:web; dist/public/index.html';
const VERCEL_WEB_PROBE = 'emitted SPA entry HTML references its actual hashed JavaScript bundle';

export const vercelWebBuildFailureEvidence = (build) => commandFailureEvidence({
  deployment: 'vercel-web',
  command_or_artifact: VERCEL_WEB_COMMAND,
  probe: VERCEL_WEB_PROBE,
  label: 'npm run build:web',
  result: build,
});

const vercelWebProof = async () => {
  const command_or_artifact = VERCEL_WEB_COMMAND;
  const probe = VERCEL_WEB_PROBE;
  const build = npmResult('build:web', proofEnv());
  if (!build.ok) return vercelWebBuildFailureEvidence(build);
  const indexFile = path.join(repoRoot, 'dist/public/index.html');
  const html = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : '';
  const hasBundle = Boolean(emittedSpaAssetPath(html));
  const ok = build.ok && hasBundle;
  return evidence({ deployment: 'vercel-web', boot_status: ok ? 'proven' : 'failed', command_or_artifact, probe, result: ok ? 'SPA entry references emitted bundle' : 'web build or SPA bundle reference failed' });
};

const emittedSpaAssetPath = (html) => {
  const match = String(html).match(/(?:src|href)=["']([^"']*assets\/[^"']+\.js(?:\?[^"']*)?)["']/i);
  return match?.[1] || undefined;
};

const mlServiceProof = async () => {
  const command_or_artifact = 'Dockerfile ml-service/Dockerfile with uvicorn app:app --host 0.0.0.0 --port 8088';
  const probe = 'GET /health and GET /model/info expect 2xx; POST /predict and POST /train send {} and expect 422 validation; 404/405 are failures';
  if (!dockerAvailable()) return evidence({ deployment: 'ml-service-local', boot_status: 'unproven', command_or_artifact, probe, result: 'docker unavailable' });
  const image = commandResult('docker', ['build', '-f', 'ml-service/Dockerfile', '-t', 'surface-matrix-ml-proof:local', 'ml-service'], proofEnv(), 300_000);
  if (!image.ok) return evidence({ deployment: 'ml-service-local', boot_status: 'failed', command_or_artifact, probe, result: 'ML service Docker image build failed' });
  const run = await runHttpProcess({ command: 'docker', args: ['run', '--rm', '--name', 'surface-matrix-ml-proof', '-p', '8088:8088', 'surface-matrix-ml-proof:local'], env: proofEnv(), port: 8088, containerName: 'surface-matrix-ml-proof', paths: [
    { path: '/health', method: 'GET' },
    { path: '/predict', method: 'POST', body: {}, expected_statuses: [422] },
    { path: '/train', method: 'POST', body: {}, expected_statuses: [422] },
    { path: '/model/info', method: 'GET' },
  ] });
  const ok = run.proven;
  return evidence({ deployment: 'ml-service-local', boot_status: ok ? 'proven' : 'failed', command_or_artifact, probe, result: ok ? 'FastAPI listener responded on all four paths' : 'FastAPI path probe failed' });
};

export const REQUIRED_G3_PROOF_KEYS = Object.freeze([
  'vercel-api|make_app',
  'vercel-api|vercel_function',
  'railway-worker-fund-scenario-calc|worker_process',
  'railway-worker-capital-call-status|worker_process',
]);

export const resolveBootProofOutput = (requestedOutput) => {
  const output = path.resolve(repoRoot, requestedOutput || outputFile);
  const parent = path.dirname(output);
  if (!fs.existsSync(parent) || !fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink()) {
    throw new Error(`Boot-proof output parent must be a real directory: ${parent}`);
  }
  if (fs.existsSync(output)) {
    const stat = fs.lstatSync(output);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Boot-proof output must be a regular non-symlink file: ${output}`);
    }
  }
  return output;
};

export const assertRequiredG3Proofs = (document) => {
  const proofs = new Map();
  const duplicates = [];
  for (const proof of document.proofs) {
    const key = `${proof.deployment}|${proof.runtime ?? '*'}`;
    if (proofs.has(key)) duplicates.push(key);
    proofs.set(key, proof);
  }
  const failures = REQUIRED_G3_PROOF_KEYS.filter((key) => proofs.get(key)?.boot_status !== 'proven');
  if (duplicates.length > 0) throw new Error(`G3 boot proof duplicate key: ${[...new Set(duplicates)].join(', ')}`);
  if (failures.length > 0) throw new Error(`G3 boot proof incomplete: ${failures.join(', ')}`);
};

const sourceSha = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();

const collectBootProofs = async ({ sourceSha: currentSourceSha }) => {
  const fundWorkerProof = await railwayWorkerProof({
    workerType: 'fund-scenario-calc',
    deployment: 'railway-worker-fund-scenario-calc',
    sourceSha: currentSourceSha,
  });
  const capitalWorkerProof = await railwayWorkerProof({
    workerType: 'capital-call-status',
    deployment: 'railway-worker-capital-call-status',
    sourceSha: currentSourceSha,
  });
  return [
    evidence({
      deployment: 'local-process',
      boot_status: 'unproven',
      command_or_artifact: 'local runtime inventory only',
      probe: 'no production boot proof is required for local-process surfaces',
      result: 'local-process evidence is intentionally unproven',
    }),
    ...workerRuntimeProofs(fundWorkerProof),
    ...workerRuntimeProofs(capitalWorkerProof),
    await vercelApiProof(),
    await vercelFunctionProof(),
    await vercelWebProof(),
    await mlServiceProof(),
  ];
};

export const runBootProof = async ({
  output,
  requireG3 = false,
  collectProofs = collectBootProofs,
  sourceSha: expectedSourceSha,
  environment = process.env,
} = {}) => {
  const outputPath = resolveBootProofOutput(output);
  if (requireG3) assertStrictVercelBuildCredentials(environment);
  const currentSourceSha = expectedSourceSha ?? sourceSha();
  const proofs = (await collectProofs({ sourceSha: currentSourceSha }))
    .sort((left, right) => `${left.deployment}|${left.runtime ?? '*'}`.localeCompare(`${right.deployment}|${right.runtime ?? '*'}`));
  const document = BootProofDocumentSchema.parse({ schema_version: '1.1.0', source_sha: currentSourceSha, proofs });
  if (requireG3) assertRequiredG3Proofs(document);
  fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
};

const parseArgs = (argv) => {
  const args = { output: undefined, requireG3: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--require-g3') args.requireG3 = true;
    else if (argv[index] === '--output') {
      args.output = argv[index + 1];
      if (!args.output || args.output.startsWith('--')) throw new Error('--output requires a path');
      index += 1;
    } else throw new Error(`Unknown boot-proof argument: ${argv[index]}`);
  }
  return args;
};

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const args = parseArgs(process.argv.slice(2));
  runBootProof(args).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
