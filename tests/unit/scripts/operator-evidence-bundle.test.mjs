import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  MAX_OPERATOR_EVIDENCE_B64_CHARS,
  OPERATOR_EVIDENCE_FIELDS,
  decodeOperatorEvidenceBundle,
  encodeOperatorEvidenceBundle,
} from '../../../scripts/release/operator-evidence-bundle.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/release/operator-evidence-bundle.mjs');
const COMMIT = 'a'.repeat(40);
const FUND_DEPLOYMENT = 'fund_deployment_1';
const CAPITAL_DEPLOYMENT = 'capital-deployment-1';
const TIMESTAMP = '2026-08-12T12:00:00.000Z';

const test = (name, fn, timeout) => it(name, { retry: 0, ...(timeout ? { timeout } : {}) }, fn);
const testEach = (table, name, fn) => it.each(table)(name, { retry: 0 }, fn);

function workerHealth(workerType, deploymentId, overrides = {}) {
  const {
    worker: workerOverrides = {},
    metrics: metricsOverrides = {},
    ...healthOverrides
  } = overrides;
  const worker = {
    name: workerType,
    status: 'healthy',
    isRunning: true,
    jobsProcessed: 7,
    lastJobTime: TIMESTAMP,
    ...(workerType === 'capital-call-status' ? { exhaustedOutboxCount: 0 } : {}),
    ...workerOverrides,
  };

  return {
    status: 'healthy',
    timestamp: TIMESTAMP,
    uptime: 42.5,
    version: '1.5.0',
    commit: COMMIT,
    environment: 'production',
    workerType,
    deploymentId,
    workers: [worker],
    metrics: {
      totalJobsProcessed: 9,
      totalErrors: 0,
      ...metricsOverrides,
    },
    ...healthOverrides,
  };
}

function workerReady(workerType, deploymentId, overrides = {}) {
  return {
    status: 'ready',
    timestamp: TIMESTAMP,
    workerType,
    commit: COMMIT,
    deploymentId,
    ...overrides,
  };
}

function validBundle(overrides = {}) {
  return {
    fundHealth: workerHealth('fund-scenario-calc', FUND_DEPLOYMENT, overrides.fundHealth),
    fundReady: workerReady('fund-scenario-calc', FUND_DEPLOYMENT, overrides.fundReady),
    capitalHealth: workerHealth('capital-call-status', CAPITAL_DEPLOYMENT, overrides.capitalHealth),
    capitalReady: workerReady('capital-call-status', CAPITAL_DEPLOYMENT, overrides.capitalReady),
    ...overrides,
  };
}

function replaceAt(value, pathParts, replacement) {
  const clone = JSON.parse(JSON.stringify(value));
  let cursor = clone;
  for (const part of pathParts.slice(0, -1)) cursor = cursor[part];
  cursor[pathParts.at(-1)] = replacement;
  return clone;
}

function encodedJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

async function tempRoot() {
  return mkdtemp(path.join(os.tmpdir(), 'operator-evidence-test-'));
}

async function runCli(args, options = {}) {
  return execFileAsync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    maxBuffer: 128 * 1024,
  });
}

describe('operator evidence bundle API', () => {
  test('exports fixed fields and encoded bundle constants', () => {
    expect(OPERATOR_EVIDENCE_FIELDS).toEqual([
      'fundHealth',
      'fundReady',
      'capitalHealth',
      'capitalReady',
    ]);
    expect(Object.isFrozen(OPERATOR_EVIDENCE_FIELDS)).toBe(true);
    expect(MAX_OPERATOR_EVIDENCE_B64_CHARS).toBe(60_000);
  });

  test('accepts exactly four strict production evidence objects', () => {
    const bundle = validBundle();
    expect(decodeOperatorEvidenceBundle(encodeOperatorEvidenceBundle(bundle))).toEqual(bundle);
  });

  test('normalizes through the schemas and does not preserve arbitrary source ordering', () => {
    const bundle = validBundle();
    const source = {
      capitalReady: bundle.capitalReady,
      fundReady: bundle.fundReady,
      capitalHealth: bundle.capitalHealth,
      fundHealth: bundle.fundHealth,
    };
    const normalized = decodeOperatorEvidenceBundle(encodeOperatorEvidenceBundle(source));
    expect(normalized).toEqual(bundle);
    expect(Object.keys(normalized)).toEqual(OPERATOR_EVIDENCE_FIELDS);
  });

  testEach([
    ['missing bundle field', () => {
      const value = validBundle();
      delete value.fundReady;
      return value;
    }],
    ['extra bundle field', () => ({ ...validBundle(), extra: true })],
    ['unknown health field', () => replaceAt(validBundle(), ['fundHealth', 'extra'], true)],
    ['unknown worker field', () => replaceAt(validBundle(), ['fundHealth', 'workers', 0, 'extra'], true)],
    ['wrong worker pairing', () => replaceAt(validBundle(), ['fundHealth', 'workerType'], 'capital-call-status')],
    ['array bundle', () => [validBundle()] ],
    ['primitive bundle', () => 'operator evidence'],
    ['unhealthy state', () => replaceAt(validBundle(), ['fundHealth', 'status'], 'unhealthy')],
    ['not-ready state', () => replaceAt(validBundle(), ['fundReady', 'status'], 'not_ready')],
    ['invalid health timestamp', () => replaceAt(validBundle(), ['fundHealth', 'timestamp'], 'not-a-timestamp')],
    ['invalid worker timestamp', () => replaceAt(validBundle(), ['fundHealth', 'workers', 0, 'lastJobTime'], 'not-a-timestamp')],
    ['unsafe jobs count', () => replaceAt(validBundle(), ['fundHealth', 'workers', 0, 'jobsProcessed'], Number.MAX_SAFE_INTEGER + 1)],
    ['negative uptime', () => replaceAt(validBundle(), ['fundHealth', 'uptime'], -1)],
    ['health/readiness commit mismatch', () => replaceAt(validBundle(), ['fundReady', 'commit'], 'b'.repeat(40))],
    ['health/readiness deployment mismatch', () => replaceAt(validBundle(), ['capitalReady', 'deploymentId'], 'other-deployment')],
    ['cross-worker commit mismatch', () => replaceAt(validBundle(), ['capitalHealth', 'commit'], 'b'.repeat(40))],
    ['duplicate deployment identity', () => replaceAt(validBundle(), ['capitalHealth', 'deploymentId'], FUND_DEPLOYMENT)],
    ['fund worker exhaustedOutboxCount', () => replaceAt(validBundle(), ['fundHealth', 'workers', 0, 'exhaustedOutboxCount'], 0)],
  ], 'rejects %s', (_name, makeValue) => {
    expect(() => encodeOperatorEvidenceBundle(makeValue())).toThrow(/operator evidence rejected/i);
  });

  test('rejects empty, malformed, and non-canonical encoded input', () => {
    for (const encoded of ['', 'not-base64!', 'eA', 'eA===', 'eA=']) {
      expect(() => decodeOperatorEvidenceBundle(encoded)).toThrow(/operator evidence rejected/i);
    }
    expect(() => decodeOperatorEvidenceBundle(encodedJson('not an object'))).toThrow(
      /operator evidence rejected/i
    );
    expect(() =>
      decodeOperatorEvidenceBundle(Buffer.from('{', 'utf8').toString('base64'))
    ).toThrow(/operator evidence rejected/i);
  });

  testEach([
    ['Authorization', 'redacted'],
    ['cookie', 'redacted'],
    ['PASSWORD', 'redacted'],
    ['passwd', 'redacted'],
    ['secret', 'redacted'],
    ['token', 'redacted'],
    ['api-key', 'redacted'],
    ['database_url', 'redacted'],
    ['redis_url', 'redacted'],
    ['connection-string', 'redacted'],
  ], 'rejects recursive secret-shaped key %s', (key, value) => {
    const source = validBundle();
    source.fundHealth.workers[0].metadata = { [key]: value };
    expect(() => encodeOperatorEvidenceBundle(source)).toThrow(/operator evidence rejected/i);
  });

  testEach([
    'Bearer ghp_example',
    'Basic dXNlcjpwYXNz',
    'postgresql://user:password@db.example.test:5432/app',
    'redis://:password@redis.example.test:6379',
    'https://user:password@example.test/path',
    'https://credential@example.test/path',
    '-----BEGIN PRIVATE KEY-----',
    'ghp_1234567890abcdef',
    'github_pat_1234567890abcdef',
  ], 'rejects secret-shaped value %s', (value) => {
    const source = replaceAt(validBundle(), ['fundHealth', 'version'], value);
    expect(() => encodeOperatorEvidenceBundle(source)).toThrow(/operator evidence rejected/i);
  });

  test('rejects source size, aggregate size, depth, and schema string bounds', () => {
    const overlarge = validBundle();
    overlarge.extra = 'x'.repeat(44_001);
    expect(() => encodeOperatorEvidenceBundle(overlarge)).toThrow(/operator evidence rejected/i);

    const deep = validBundle();
    deep.extra = { one: { two: { three: { four: { five: true } } } } };
    expect(() => encodeOperatorEvidenceBundle(deep)).toThrow(/operator evidence rejected/i);

    const longVersion = replaceAt(validBundle(), ['fundHealth', 'version'], 'v'.repeat(65));
    expect(() => encodeOperatorEvidenceBundle(longVersion)).toThrow(/operator evidence rejected/i);
  });

  test('rejects decoded output above the aggregate byte bound before schema parsing', () => {
    const oversized = Buffer.from(JSON.stringify({ oversized: 'x'.repeat(44_001) }), 'utf8');
    expect(oversized.length).toBeGreaterThan(44_000);
    expect(() => decodeOperatorEvidenceBundle(oversized.toString('base64'))).toThrow(
      /operator evidence rejected/i
    );
  });

  test('enforces encoded output limit contract', () => {
    expect(MAX_OPERATOR_EVIDENCE_B64_CHARS).toBe(60_000);
    expect(encodeOperatorEvidenceBundle(validBundle()).length).toBeLessThan(
      MAX_OPERATOR_EVIDENCE_B64_CHARS
    );
  });

  test('rejects encoded input above the character limit before decoding', () => {
    expect(() =>
      decodeOperatorEvidenceBundle('A'.repeat(MAX_OPERATOR_EVIDENCE_B64_CHARS + 4))
    ).toThrow(/operator evidence rejected/i);
  });
});

describe('operator evidence bundle CLI', () => {
  test('encode emits exactly one base64 line and no decoded body', async () => {
    const root = await tempRoot();
    try {
      const bundle = validBundle();
      const paths = {
        fundHealth: path.join(root, 'fund-health.json'),
        fundReady: path.join(root, 'fund-ready.json'),
        capitalHealth: path.join(root, 'capital-health.json'),
        capitalReady: path.join(root, 'capital-ready.json'),
      };
      for (const field of OPERATOR_EVIDENCE_FIELDS) {
        await writeFile(paths[field], JSON.stringify(bundle[field]));
      }

      const { stdout, stderr } = await runCli([
        'encode',
        '--fund-health', paths.fundHealth,
        '--fund-ready', paths.fundReady,
        '--capital-health', paths.capitalHealth,
        '--capital-ready', paths.capitalReady,
      ]);
      expect(stderr).toBe('');
      expect(stdout).toMatch(/^[A-Za-z0-9+/]+=*\n$/);
      expect(stdout.trim()).not.toContain('healthy');
      expect(stdout.trim()).not.toContain(COMMIT);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('encode rejects a symlink and a source file above 12,000 bytes before reading', async () => {
    const root = await tempRoot();
    try {
      const bundle = validBundle();
      const files = Object.fromEntries(OPERATOR_EVIDENCE_FIELDS.map((field) => [
        field,
        path.join(root, `${field}.json`),
      ]));
      for (const field of OPERATOR_EVIDENCE_FIELDS) await writeFile(files[field], JSON.stringify(bundle[field]));
      const symlink = path.join(root, 'symlink.json');
      await writeFile(path.join(root, 'target.json'), JSON.stringify(bundle.fundHealth));
      await import('node:fs/promises').then(({ symlink: createSymlink }) =>
        createSymlink(path.join(root, 'target.json'), symlink)
      );
      const symlinkResult = await runCli([
        'encode', '--fund-health', symlink, '--fund-ready', files.fundReady,
        '--capital-health', files.capitalHealth, '--capital-ready', files.capitalReady,
      ]).catch((error) => error);
      expect(symlinkResult.stderr).not.toContain('target.json');
      expect(symlinkResult.stderr).toMatch(/operator evidence command failed/i);

      await writeFile(files.fundHealth, 'x'.repeat(12_001));
      const largeResult = await runCli([
        'encode', '--fund-health', files.fundHealth, '--fund-ready', files.fundReady,
        '--capital-health', files.capitalHealth, '--capital-ready', files.capitalReady,
      ]).catch((error) => error);
      expect(largeResult.stderr).toMatch(/operator evidence command failed/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('decode reads encoded evidence only from the environment and writes four 0600 files in a 0700 directory', async () => {
    const root = await tempRoot();
    const output = path.join(root, 'decoded');
    try {
      const encoded = encodeOperatorEvidenceBundle(validBundle());
      const { stdout, stderr } = await runCli(['decode', '--output-dir', output], {
        env: { OPERATOR_EVIDENCE_B64: encoded },
      });
      expect(stderr).toBe('');
      expect(stdout).toBe('operator evidence decoded\n');
      expect((await stat(output)).mode & 0o777).toBe(0o700);
      expect((await readdir(output)).sort()).toEqual([
        'capital-health.json',
        'capital-ready.json',
        'fund-health.json',
        'fund-ready.json',
      ]);
      for (const filename of await readdir(output)) {
        expect((await stat(path.join(output, filename))).mode & 0o777).toBe(0o600);
      }
      expect(JSON.parse(await readFile(path.join(output, 'fund-health.json'), 'utf8'))).toEqual(
        validBundle().fundHealth
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('decode rejects preexisting output, symlink output, argv evidence, and secret output', async () => {
    const root = await tempRoot();
    try {
      const encoded = encodeOperatorEvidenceBundle(validBundle());
      const existing = path.join(root, 'existing');
      await writeFile(existing, 'existing');
      const existingResult = await runCli(['decode', '--output-dir', existing], {
        env: { OPERATOR_EVIDENCE_B64: encoded },
      }).catch((error) => error);
      expect(existingResult.stderr).toMatch(/operator evidence command failed/i);

      const target = path.join(root, 'target');
      const symlink = path.join(root, 'symlink');
      await writeFile(target, 'target');
      await import('node:fs/promises').then(({ symlink: createSymlink }) =>
        createSymlink(target, symlink)
      );
      const symlinkResult = await runCli(['decode', '--output-dir', symlink], {
        env: { OPERATOR_EVIDENCE_B64: encoded },
      }).catch((error) => error);
      expect(symlinkResult.stderr).toMatch(/operator evidence command failed/i);

      const argvResult = await runCli(['decode', '--output-dir', path.join(root, 'argv'), encoded], {
        env: { OPERATOR_EVIDENCE_B64: '' },
      }).catch((error) => error);
      expect(argvResult.stderr).toMatch(/operator evidence command failed/i);
      expect(argvResult.stderr).not.toContain(encoded);

      const secretBundle = replaceAt(validBundle(), ['fundHealth', 'version'], 'Bearer ghp_secret');
      const secretResult = await runCli(['decode', '--output-dir', path.join(root, 'secret')], {
        env: { OPERATOR_EVIDENCE_B64: encodedJson(secretBundle) },
      }).catch((error) => error);
      expect(secretResult.stderr).not.toContain('ghp_secret');
      expect(secretResult.stdout).not.toContain('ghp_secret');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('creates output directory only after successful validation', async () => {
    const root = await tempRoot();
    try {
      const output = path.join(root, 'decoded');
      const encoded = encodeOperatorEvidenceBundle(validBundle());
      const result = await runCli(['decode', '--output-dir', output], {
        env: { OPERATOR_EVIDENCE_B64: encoded },
      });
      expect(result.stdout).toBe('operator evidence decoded\n');
      await expect(lstat(output)).resolves.toBeTruthy();

      const rejectedOutput = path.join(root, 'rejected');
      const rejectedResult = await runCli(['decode', '--output-dir', rejectedOutput], {
        env: { OPERATOR_EVIDENCE_B64: encodedJson({ not: 'a bundle' }) },
      }).catch((error) => error);
      expect(rejectedResult.stderr).toMatch(/operator evidence command failed/i);
      await expect(lstat(rejectedOutput)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
