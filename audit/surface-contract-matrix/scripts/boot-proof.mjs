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

const sanitizedBaseEnv = () => ({
  PATH: process.env.PATH,
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

const proofEnv = (overrides = {}) => ({ ...sanitizedBaseEnv(), ...overrides });

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

const evidence = ({ deployment, runtime, boot_status, command_or_artifact, probe, result }) => ({
  deployment,
  ...(runtime ? { runtime } : {}),
  boot_status,
  boot_evidence: {
    command_or_artifact,
    probe,
    result,
    observed_at: proofObservedAt({ deployment, runtime, boot_status, command_or_artifact, probe, result }),
  },
});

const failedBuildResult = (script, build) => build.ok
  ? undefined
  : `npm run ${script} failed${build.status === null ? ' by timeout' : ` with status ${build.status ?? build.signal ?? 'unknown'}`}`;

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
  const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.trim().replaceAll(/\s+/g, ' ');
  const errorCode = result.error?.code;
  const detail = errorCode
    ? ` with error ${errorCode}${errorCode === 'ETIMEDOUT' ? ' (timeout)' : ''}`
    : result.status === null
      ? ' by timeout'
      : ` with status ${result.status ?? result.signal ?? 'unknown'}`;
  return `${label} failed${detail}${output ? `: ${output.slice(0, 600)}` : ''}`;
};

const unavailableCommandCodes = new Set(['ENOENT', 'EACCES']);

export const bootStatusForCommandResult = (result = {}) => {
  if (result.ok === true) return 'proven';
  return unavailableCommandCodes.has(result.error?.code) ? 'unproven' : 'failed';
};

export const workerConsumerIsHealthy = ({ health, stats }) => {
  const expectedWorker = health?.workers?.find((worker) => worker.name === 'fund-scenario-calc');
  const expectedStats = stats?.workers?.find((worker) => worker.name === 'fund-scenario-calc');
  return Boolean(expectedWorker && expectedStats
    && expectedWorker.status === 'healthy'
    && expectedWorker.isRunning === true);
};

const dockerfileLine = (file, keyword) => fs.readFileSync(path.join(repoRoot, file), 'utf8')
  .split('\n')
  .findLast((line) => line.trim().toUpperCase().startsWith(keyword));

const railwayApiExpectedEntrypoint = Object.freeze(['dumb-init', '--']);
const railwayApiExpectedCmd = Object.freeze(['node', 'dist/index.js']);

const parseExecFormDirective = (value, keyword) => {
  const line = String(value ?? '').trim();
  if (!line.toUpperCase().startsWith(keyword)) return undefined;
  const payload = line.slice(keyword.length).trim();
  if (!payload.startsWith('[')) return undefined;
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
};

export const railwayApiDockerfileContractCheck = ({ entrypoint, cmd, content } = {}) => {
  const dockerfile = String(content ?? '');
  const resolvedEntrypoint = entrypoint ?? dockerfile.split('\n').findLast((line) => line.trim().toUpperCase().startsWith('ENTRYPOINT'));
  const resolvedCmd = cmd ?? dockerfile.split('\n').findLast((line) => line.trim().toUpperCase().startsWith('CMD'));
  const actualEntrypoint = parseExecFormDirective(resolvedEntrypoint, 'ENTRYPOINT');
  const actualCmd = parseExecFormDirective(resolvedCmd, 'CMD');
  const ok = JSON.stringify(actualEntrypoint) === JSON.stringify(railwayApiExpectedEntrypoint)
    && JSON.stringify(actualCmd) === JSON.stringify(railwayApiExpectedCmd);
  return {
    ok,
    expected: {
      entrypoint: [...railwayApiExpectedEntrypoint],
      cmd: [...railwayApiExpectedCmd],
    },
    actual: {
      entrypoint: actualEntrypoint,
      cmd: actualCmd,
    },
    result: ok
      ? 'Dockerfile.railway ENTRYPOINT and CMD match the exact container launch contract'
      : 'Dockerfile.railway ENTRYPOINT/CMD do not match the exact container launch contract',
  };
};

export const railwayApiRuntimeOutcome = ({
  dockerAvailable: hasDocker,
  containerListener = false,
  localListener,
  listener,
} = {}) => {
  if (hasDocker !== true) {
    const localObservation = localListener === true
      ? 'local dist/index.js listener responded'
      : localListener === false
        ? 'local dist/index.js listener did not respond'
        : 'local dist/index.js listener was not executed';
    return {
      boot_status: 'unproven',
      result: `docker unavailable; ${localObservation}; Dockerfile.railway container contract remains unproven`,
    };
  }
  const containerObserved = listener ?? containerListener;
  return containerObserved
    ? {
        boot_status: 'proven',
        result: 'HTTP listener responded from Dockerfile.railway container entrypoint',
      }
    : {
        boot_status: 'failed',
        result: 'Dockerfile.railway container executed but its HTTP listener did not satisfy the probe',
      };
};

const railwayApiProof = async () => {
  const command_or_artifact = 'npm run build:prod; Dockerfile.railway ENTRYPOINT ["dumb-init","--"] + CMD ["node","dist/index.js"]';
  const probe = 'GET /health; expected HTTP 2xx; 404/405 are failures';
  const build = npmResult('build:prod', proofEnv());
  if (!build.ok) return evidence({ deployment: 'railway-api', boot_status: 'failed', command_or_artifact, probe, result: failedBuildResult('build:prod', build) });
  const entrypoint = dockerfileLine('Dockerfile.railway', 'ENTRYPOINT');
  const cmd = dockerfileLine('Dockerfile.railway', 'CMD');
  const contract = railwayApiDockerfileContractCheck({ entrypoint, cmd });
  if (!contract.ok) return evidence({ deployment: 'railway-api', boot_status: 'failed', command_or_artifact, probe, result: contract.result });

  let run;
  const hasDocker = dockerAvailable();
  if (hasDocker) {
    const image = commandResult('docker', ['build', '-f', 'Dockerfile.railway', '-t', 'surface-matrix-railway-api-proof:local', '.'], proofEnv(), 300_000);
    if (!image.ok) return evidence({ deployment: 'railway-api', boot_status: 'failed', command_or_artifact, probe, result: 'Dockerfile.railway image build failed' });
    run = await runHttpProcess({
      command: 'docker',
      args: ['run', '--rm', '--name', 'surface-matrix-railway-api-proof', '-p', `${PORTS.api}:${PORTS.api}`, 'surface-matrix-railway-api-proof:local'],
      env: proofEnv({ PORT: String(PORTS.api), _EXPLICIT_PORT: '1' }),
      port: PORTS.api,
      containerName: 'surface-matrix-railway-api-proof',
      paths: [{ path: '/health', method: 'GET' }],
    });
  } else {
    run = await runHttpProcess({
      command: process.execPath,
      args: ['dist/index.js'],
      env: proofEnv({ PORT: '0', _EXPLICIT_PORT: '1' }),
      port: 0,
      paths: [{ path: '/health', method: 'GET' }],
    });
  }
  const outcome = railwayApiRuntimeOutcome({
    dockerAvailable: hasDocker,
    containerListener: hasDocker ? run.proven : false,
    localListener: hasDocker ? undefined : run.proven,
  });
  return evidence({ deployment: 'railway-api', boot_status: outcome.boot_status, command_or_artifact, probe, result: outcome.result });
};

const railwayWorkerProof = async () => {
  const command_or_artifact = 'docker build -f Dockerfile.worker; docker run Dockerfile.worker with Redis and PostgreSQL containers on isolated network';
  const probe = 'Dockerfile.worker image runs fund-scenario-calc worker; GET /health /live /ready /metrics /stats through mapped port; expected HTTP 2xx; 404/405 are failures';
  if (!dockerAvailable()) {
    return evidence({
      deployment: 'railway-worker',
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
  const workerName = 'surface-matrix-worker-proof';
  dockerCleanup(workerName);
  dockerCleanup(redisName);
  dockerCleanup(postgresName);
  dockerCleanup(network, 'network');
  try {
    const networkCreate = commandResult('docker', ['network', 'create', network], proofEnv(), 30_000);
    if (!networkCreate.ok) return evidence({ deployment: 'railway-worker', boot_status: 'failed', command_or_artifact, probe, result: dockerFailure('worker proof network creation', networkCreate) });

    const redis = commandResult('docker', [
      'run', '-d', '--rm', '--name', redisName, '--network', network, 'redis:7-alpine',
    ], proofEnv(), 120_000);
    if (!redis.ok) return evidence({ deployment: 'railway-worker', boot_status: 'failed', command_or_artifact, probe, result: dockerFailure('Redis proof container startup', redis) });

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
    if (!redisReady) return evidence({ deployment: 'railway-worker', boot_status: 'failed', command_or_artifact, probe, result: 'Redis proof container did not become ready; worker proof was not faked' });

    const postgres = commandResult('docker', [
      'run', '-d', '--rm', '--name', postgresName, '--network', network,
      '-e', 'POSTGRES_USER=surface-proof',
      '-e', 'POSTGRES_PASSWORD=surface-proof',
      '-e', 'POSTGRES_DB=surface_proof',
      'postgres:16-alpine',
    ], proofEnv(), 120_000);
    if (!postgres.ok) return evidence({ deployment: 'railway-worker', boot_status: 'failed', command_or_artifact, probe, result: dockerFailure('PostgreSQL proof container startup', postgres) });

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
    if (!postgresReady) return evidence({ deployment: 'railway-worker', boot_status: 'failed', command_or_artifact, probe, result: 'PostgreSQL proof container did not become ready; worker proof was not faked' });

    const imageBuild = commandResult('docker', ['build', '-f', 'Dockerfile.worker', '-t', image, '.'], proofEnv(), 600_000);
    if (!imageBuild.ok) return evidence({ deployment: 'railway-worker', boot_status: 'failed', command_or_artifact, probe, result: dockerFailure('Dockerfile.worker image build', imageBuild) });

    const run = await runHttpProcess({
      command: 'docker',
      args: [
        'run', '--rm', '--name', workerName, '--network', network,
        '-p', `${PORTS.worker}:9000`,
        '-e', 'NODE_ENV=production',
        '-e', 'WORKER_TYPE=fund-scenario-calc',
        '-e', 'WORKER_HEALTH_PORT=9000',
        '-e', 'ENABLE_QUEUES=1',
        '-e', `QUEUE_REDIS_URL=redis://${redisName}:6379`,
        '-e', `REDIS_URL=redis://${redisName}:6379`,
        '-e', `DATABASE_URL=postgresql://surface-proof:surface-proof@${postgresName}:5432/surface_proof`,
        image,
      ],
      env: proofEnv(),
      port: PORTS.worker,
      containerName: workerName,
      paths: HEALTH_PATHS.map((requestPath) => ({ path: requestPath, method: 'GET' })),
    });
    const health = run.statuses.find((status) => status.path === '/health')?.body_json;
    const stats = run.statuses.find((status) => status.path === '/stats')?.body_json;
    const consumerRegistered = workerConsumerIsHealthy({ health, stats });
    const proven = run.proven && consumerRegistered;
    const result = proven
      ? 'Dockerfile.worker image stayed alive, Redis connected, and fund-scenario-calc consumer was healthy and registered in /health and /stats'
      : `Dockerfile.worker container proof failed${!consumerRegistered ? ': /health and /stats did not report a running fund-scenario-calc consumer' : ''}${run.output ? `: ${run.output.trim().replaceAll(/\s+/g, ' ').slice(0, 600)}` : ''}`;
    return evidence({ deployment: 'railway-worker', boot_status: proven ? 'proven' : 'failed', command_or_artifact, probe, result });
  } finally {
    dockerCleanup(workerName);
    dockerCleanup(redisName);
    dockerCleanup(postgresName);
    dockerCleanup(network, 'network');
  }
};

const runNodeProbe = (code, env, useTsx = false) => commandResult(useTsx ? path.join(repoRoot, 'node_modules/.bin/tsx') : process.execPath,
  useTsx ? ['--tsconfig', path.join(repoRoot, 'tsconfig.server.json'), '-e', code] : ['--input-type=module', '-e', code], env, 120_000);

const vercelApiProof = async () => {
  const command_or_artifact = 'node scripts/build-vercel-api.mjs; import api/_app.generated.mjs and construct makeApp()';
  const probe = 'in-process makeApp() construction from Vercel API bundle; no listener';
  const build = commandResult(process.execPath, ['scripts/build-vercel-api.mjs'], proofEnv(), 300_000);
  if (!build.ok) return evidence({ deployment: 'vercel-api', runtime: 'make_app', boot_status: 'failed', command_or_artifact, probe, result: 'Vercel API bundle build failed' });
  const code = `import { pathToFileURL } from 'node:url'; const imported = await import(pathToFileURL(${JSON.stringify(path.join(repoRoot, 'api/_app.generated.mjs'))})); if (typeof imported.makeApp !== 'function') throw new Error('makeApp export missing:' + Object.keys(imported).sort().join(',')); const app = imported.makeApp(); if (!app || typeof app.use !== 'function') throw new Error('makeApp did not return Express app'); process.exit(0);`;
  const construction = runNodeProbe(code, proofEnv());
  return evidence({ deployment: 'vercel-api', runtime: 'make_app', boot_status: construction.ok ? 'proven' : 'failed', command_or_artifact, probe, result: construction.ok ? 'makeApp constructed from built bundle' : failureSummary(construction, 'built bundle makeApp construction failed') });
};

const VERCEL_FUNCTION_COMMAND = 'vercel build; .vercel/output/functions/**/*.func/index.(js|mjs|cjs)';
const VERCEL_FUNCTION_PROBE = 'enumerate every real Vercel build-output function and invoke its callable handler once';

export const vercelFunctionBuildFailureEvidence = (build) => evidence({
  deployment: 'vercel-api',
  runtime: 'vercel_function',
  boot_status: bootStatusForCommandResult(build),
  command_or_artifact: VERCEL_FUNCTION_COMMAND,
  probe: VERCEL_FUNCTION_PROBE,
  result: dockerFailure('Vercel build-output generation', build),
});

const filesUnder = (root) => {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(absolute);
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
};

const vercelBuildOutputFunctions = () => {
  const functionsRoot = path.join(repoRoot, '.vercel', 'output', 'functions');
  const functionDirectories = [...new Set(filesUnder(functionsRoot)
    .filter((file) => path.basename(path.dirname(file)).endsWith('.func'))
    .map((file) => path.dirname(file)))].sort((left, right) => left.localeCompare(right));
  return functionDirectories.map((directory) => {
    const entry = filesUnder(directory).find((file) => ['index.js', 'index.mjs', 'index.cjs'].includes(path.basename(file)));
    return {
      name: path.relative(functionsRoot, directory).replace(/\.func$/, '').split(path.sep).join('/'),
      directory,
      entry,
    };
  });
};

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

export const invokeVercelFunction = async ({ name, entry, responseTimeout = 20_000 }) => {
  if (!entry) return { name, ok: false, result: 'build-output function has no index entrypoint' };
  try {
    const imported = await import(pathToFileURL(entry).href);
    const handler = imported.default ?? imported.handler;
    if (typeof handler !== 'function') return { name, ok: false, result: 'build-output function has no callable default/handler export' };
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
        result: `function response incomplete or unacceptable: completed=${completed} status=${response.statusCode}`,
      };
    }
    return { name, ok: true, result: `invoked build-output function; completed response status ${response.statusCode}` };
  } catch (error) {
    return { name, ok: false, result: `invocation failed: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const vercelFunctionProof = async () => {
  const command_or_artifact = VERCEL_FUNCTION_COMMAND;
  const probe = VERCEL_FUNCTION_PROBE;
  const build = commandResult('vercel', ['build', '--yes'], proofEnv(), 600_000);
  if (!build.ok) return vercelFunctionBuildFailureEvidence(build);
  const functions = vercelBuildOutputFunctions();
  if (functions.length === 0) return evidence({ deployment: 'vercel-api', runtime: 'vercel_function', boot_status: 'failed', command_or_artifact, probe, result: 'Vercel build completed but emitted no .vercel/output/functions entries' });
  const invocations = await Promise.all(functions.map(invokeVercelFunction));
  const failed = invocations.filter((invocation) => !invocation.ok);
  const result = `invoked ${invocations.length} build-output function(s): ${invocations.map((invocation) => `${invocation.name}=${invocation.ok ? 'ok' : 'failed'}`).join(', ')}${failed.length > 0 ? `; ${failed.map((invocation) => invocation.result).join('; ')}` : ''}`;
  return evidence({ deployment: 'vercel-api', runtime: 'vercel_function', boot_status: failed.length === 0 ? 'proven' : 'failed', command_or_artifact, probe, result });
};

const vercelWebProof = async () => {
  const command_or_artifact = 'npm run build:web; dist/public/index.html';
  const probe = 'emitted SPA entry HTML references its actual hashed JavaScript bundle';
  const build = npmResult('build:web', proofEnv());
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

const railwayWebProof = async (railwayApi) => {
  const command_or_artifact = 'npm run build:web plus proven railway-api listener';
  let probe = 'GET actual emitted hashed SPA asset and GET /fund-setup; expected HTTP 2xx; 404/405 are failures';
  if (railwayApi.boot_status !== 'proven') return evidence({ deployment: 'railway-web', boot_status: 'unproven', command_or_artifact, probe, result: `dependency railway-api is ${railwayApi.boot_status}; Railway web proof not executable` });
  const build = npmResult('build:web', proofEnv({ PORT: String(PORTS.web), _EXPLICIT_PORT: '1' }));
  if (!build.ok) return evidence({ deployment: 'railway-web', boot_status: 'failed', command_or_artifact, probe, result: 'web build failed' });
  const indexFile = path.join(repoRoot, 'dist/public/index.html');
  const html = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : '';
  const assetPath = emittedSpaAssetPath(html);
  probe = `GET ${assetPath || '<missing-emitted-hash>.js'} and GET /fund-setup; expected HTTP 2xx; 404/405 are failures`;
  if (!assetPath) return evidence({ deployment: 'railway-web', boot_status: 'failed', command_or_artifact, probe, result: 'dist/public/index.html has no emitted hashed script URL' });
  const run = await runHttpProcess({ command: process.execPath, args: ['dist/index.js'], env: proofEnv({ PORT: '0', _EXPLICIT_PORT: '1' }), port: 0, paths: [{ path: assetPath, method: 'GET' }, { path: '/fund-setup', method: 'GET' }] });
  const ok = run.proven;
  return evidence({ deployment: 'railway-web', boot_status: ok ? 'proven' : 'failed', command_or_artifact, probe, result: ok ? 'asset and deep-link responses observed' : 'asset/deep-link probe failed' });
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

const run = async () => {
  const railwayApi = await railwayApiProof();
  const proofs = [
    railwayApi,
    await railwayWorkerProof(),
    await vercelApiProof(),
    await vercelFunctionProof(),
    await vercelWebProof(),
    await railwayWebProof(railwayApi),
    await mlServiceProof(),
  ].sort((left, right) => `${left.deployment}|${left.runtime ?? '*'}`.localeCompare(`${right.deployment}|${right.runtime ?? '*'}`));
  const document = BootProofDocumentSchema.parse({ schema_version: '1.0.0', proofs });
  fs.writeFileSync(outputFile, `${JSON.stringify(document, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
