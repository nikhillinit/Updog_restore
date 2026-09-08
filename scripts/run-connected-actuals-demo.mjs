import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parse } from 'dotenv';

const root = resolve(import.meta.dirname, '..');
const pinnedNode = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
assert.equal(process.versions.node, pinnedNode, `Use Node ${pinnedNode} from .nvmrc`);

// Both Vite and server/config load dotenv files independently of the child environment.
for (const file of ['.env', '.env.local', '.env.preact.local', '.env.test.local']) {
  assert.ok(!existsSync(join(root, file)), `Run in an isolated worktree without ${file}`);
}
const testEnv = {
  NODE_ENV: 'test',
  TZ: 'UTC',
  REDIS_URL: 'memory://',
  SESSION_SECRET: 'test-session-secret-must-be-at-least-32-characters-long',
  JWT_ALG: 'HS256',
  JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-characters-long-for-hs256-validation',
  JWT_ISSUER: 'updog',
  JWT_AUDIENCE: 'updog-app',
};
assert.deepEqual(parse(readFileSync(join(root, '.env.test'))), testEnv);
assert.deepEqual(parse(readFileSync(join(root, '.env.preact'))), {
  VITE_USE_PREACT: '1',
  BUILD_WITH_PREACT: '1',
});
const socket = ['/var/run/docker.sock', join(homedir(), '.docker/run/docker.sock')].find(
  existsSync
);
assert.ok(socket, 'A local Docker Unix socket is required');

const output = process.env.CONNECTED_DEMO_ARTIFACT_DIR
  ? resolve(process.env.CONNECTED_DEMO_ARTIFACT_DIR)
  : mkdtempSync(join(tmpdir(), 'updog-connected-demo-'));
mkdirSync(output, { recursive: true });

// No inherited database URLs, provider credentials, remote Docker host, or demo/auth bypass.
const env = {
  HOME: homedir(),
  PATH: [dirname(process.execPath), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'].join(
    delimiter
  ),
  TMPDIR: tmpdir(),
  ...testEnv,
  CI: '1',
  DOCKER_HOST: `unix://${socket}`,
  TESTCONTAINERS_HOST_OVERRIDE: '127.0.0.1',
  REQUIRE_AUTH: '1',
  ALLOW_MEMORY_STORAGE: '0',
  ENABLE_QUEUES: '0',
  ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
  RUN_DOCKER_ACTUALS_PILOT_PUBLISH: '1',
  RUN_CONNECTED_ACTUALS_DEMO: '1',
  CONNECTED_DEMO_ARTIFACT_DIR: output,
};

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args[0]} failed`);
  return result.stdout.trimEnd();
}
const digest = (value) => createHash('sha256').update(value).digest('hex');
const receipt = {
  observedUtc: new Date().toISOString(),
  root,
  commit: git('rev-parse', 'HEAD'),
  baseTree: git('rev-parse', 'HEAD^{tree}'),
  trackedDiffSha256: digest(git('diff', 'HEAD', '--binary')),
  untrackedFiles: Object.fromEntries(
    git('ls-files', '--others', '--exclude-standard', '-z')
      .split('\0')
      .filter(Boolean)
      .map((file) => [file, digest(readFileSync(join(root, file)))])
  ),
  node: process.version,
  timezone: env.TZ,
  output,
  checks: [],
};
function run(name, args, overrides = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...env, ...overrides },
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
    detached: true,
  });
  if (result.error && result.pid) {
    try {
      process.kill(-result.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  const log = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  receipt.checks.push({ name, args, exitCode: result.status, signal: result.signal });
  writeFileSync(join(output, 'run-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(log);
  if (result.error || result.status !== 0) {
    throw (
      result.error ?? new Error(`${name} failed (${result.status ?? result.signal}); see ${output}`)
    );
  }
}

console.log(`Connected synthetic demo artifacts: ${output}`);
run('clean', ['scripts/clean-spa-dist.mjs']);
run('build', ['node_modules/vite/bin/vite.js', 'build', '--mode', 'preact'], {
  NODE_ENV: 'production',
});
run('connected', [
  'node_modules/vitest/vitest.mjs',
  'run',
  '--config',
  'vitest.config.testcontainers.ts',
  'tests/integration/financial-facts-payload5-consumers.pg.test.ts',
  '--testNamePattern',
  'connected browser actuals publication and forecast',
  '--retry=0',
  '--reporter=default',
  '--reporter=json',
  `--outputFile=${join(output, 'results.json')}`,
]);

const results = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
assert.equal(results.numPassedTests, 1, 'The connected case must run and pass');
assert.equal(results.numFailedTests, 0);
assert.equal(
  results.testResults
    .flatMap((suite) => suite.assertionResults)
    .filter(
      (test) =>
        test.status === 'passed' &&
        test.fullName.endsWith('connected browser actuals publication and forecast')
    ).length,
  1
);
console.log(`Connected synthetic demo passed. Artifacts: ${output}`);
