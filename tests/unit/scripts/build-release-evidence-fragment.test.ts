import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RELEASE_CANARY_RESERVED_RESIDUE } from '../../../shared/contracts/release-canary-residue-characterization-v1.contract';
import {
  parseReleaseEvidenceFragment,
  sha256CanonicalJsonOfPayload,
} from '../../../shared/contracts/release-evidence-fragment-v1.contract';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const SCRIPT = path.join(ROOT, 'scripts', 'release', 'build-release-evidence-fragment.ts');

const SHA = 'a'.repeat(40);
const RUN_ID = '17178572726';
const MEASUREMENT_PAYLOAD = { residue: { ...RELEASE_CANARY_RESERVED_RESIDUE } };

function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    GITHUB_RUN_ID: RUN_ID,
    GITHUB_RUN_ATTEMPT: '1',
    FRAGMENT_SOURCE_SHA: SHA,
    ...overrides,
  };
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runBuilder(
  args: readonly string[],
  env: Record<string, string>
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(TSX, [SCRIPT, ...args], {
      cwd: ROOT,
      env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

describe('build-release-evidence-fragment', { timeout: 120_000 }, () => {
  let workdir = '';
  let output = '';
  let payloadFile = '';

  const measurementArgs = () => [
    '--kind',
    'policy-measurement',
    '--payload-file',
    payloadFile,
    '--producer-job',
    'staged-smoke',
    '--output',
    output,
  ];

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(os.tmpdir(), 'fragment-builder-'));
    output = path.join(workdir, 'fragment.json');
    payloadFile = path.join(workdir, 'payload.json');
    await writeFile(payloadFile, JSON.stringify(MEASUREMENT_PAYLOAD), 'utf8');
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('builds a policy-measurement fragment, writes 0600, prints only the documented line', async () => {
    const result = await runBuilder(measurementArgs(), baseEnv());
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['fileSha256', 'payloadSha256']);
    expect(parsed['payloadSha256']).toBe(sha256CanonicalJsonOfPayload(MEASUREMENT_PAYLOAD));

    const fileContent = await readFile(output, 'utf8');
    const fragment = parseReleaseEvidenceFragment(JSON.parse(fileContent));
    expect(fragment.kind).toBe('policy-measurement');
    expect(fragment.runId).toBe(RUN_ID);
    expect(fragment.runAttempt).toBe(1);
    expect(fragment.sourceSha).toBe(SHA);
    expect(fragment.producerJob).toBe('staged-smoke');
    expect(fragment.payload).toEqual(MEASUREMENT_PAYLOAD);
    expect(createHash('sha256').update(fileContent).digest('hex')).toBe(parsed['fileSha256']);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
  });

  it('rejects a producer job that does not match the kind', async () => {
    const result = await runBuilder(
      [
        '--kind',
        'policy-measurement',
        '--payload-file',
        payloadFile,
        '--producer-job',
        'promote',
        '--output',
        output,
      ],
      baseEnv()
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Producer job does not match fragment kind');
    await expect(stat(output)).rejects.toThrow();
  });

  it('rejects an unknown kind', async () => {
    const result = await runBuilder(
      [
        '--kind',
        'bogus-kind',
        '--payload-file',
        payloadFile,
        '--producer-job',
        'staged-smoke',
        '--output',
        output,
      ],
      baseEnv()
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Unknown fragment kind');
  });

  it('rejects malformed argv: unknown, duplicate, missing flags, and positionals', async () => {
    const unknown = await runBuilder([...measurementArgs(), '--bogus', 'x'], baseEnv());
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('Unknown flag');

    const duplicate = await runBuilder([...measurementArgs(), '--kind', 'schema'], baseEnv());
    expect(duplicate.code).toBe(1);
    expect(duplicate.stderr).toContain('Duplicate flag');

    const missing = await runBuilder(
      ['--kind', 'policy-measurement', '--payload-file', payloadFile, '--output', output],
      baseEnv()
    );
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('--producer-job is required');

    const positional = await runBuilder([...measurementArgs(), 'stray'], baseEnv());
    expect(positional.code).toBe(1);
    expect(positional.stderr).toContain('Positional arguments are not accepted');
  });

  it('rejects a missing required environment variable by name only', async () => {
    const result = await runBuilder(measurementArgs(), baseEnv({ FRAGMENT_SOURCE_SHA: '' }));
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('FRAGMENT_SOURCE_SHA is required');
  });

  it('reports payload contract violations by path without echoing payload content', async () => {
    await rm(payloadFile);
    await writeFile(payloadFile, JSON.stringify({ bogus: 'SENSITIVE-MARKER' }), 'utf8');
    const result = await runBuilder(
      [
        '--kind',
        'baseline',
        '--payload-file',
        payloadFile,
        '--producer-job',
        'baseline-policy-preflight',
        '--output',
        output,
      ],
      baseEnv()
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Contract validation failed at:');
    expect(result.stderr).not.toContain('SENSITIVE-MARKER');
    expect(result.stderr).not.toContain('bogus');
    await expect(stat(output)).rejects.toThrow();
  });

  it('rejects secret-shaped payload values before contract validation, by path only', async () => {
    await rm(payloadFile);
    await writeFile(
      payloadFile,
      JSON.stringify({ artifactName: 'postgres://canary:hunter2@db.internal/prod' }),
      'utf8'
    );
    const result = await runBuilder(measurementArgs(), baseEnv());
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Secret-shaped or oversized payload content');
    expect(result.stderr).toContain('$.artifactName: secret-shaped string value');
    expect(result.stderr).not.toContain('postgres://');
    expect(result.stderr).not.toContain('hunter2');
    await expect(stat(output)).rejects.toThrow();
  });

  it('rejects a payload file larger than 1MB', async () => {
    await rm(payloadFile);
    await writeFile(payloadFile, JSON.stringify({ pad: 'x'.repeat(1_100_000) }), 'utf8');
    const result = await runBuilder(measurementArgs(), baseEnv());
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('exceeds the 1MB limit');
  });

  it('rejects a payload file that is not valid JSON without echoing its content', async () => {
    await rm(payloadFile);
    await writeFile(payloadFile, '{"broken": SENSITIVE', 'utf8');
    const result = await runBuilder(measurementArgs(), baseEnv());
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not valid JSON');
    expect(result.stderr).not.toContain('SENSITIVE');
  });

  it('refuses to overwrite an existing output file and leaves it unchanged', async () => {
    await writeFile(output, 'sentinel', 'utf8');
    const result = await runBuilder(measurementArgs(), baseEnv());
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('already exists');
    expect(await readFile(output, 'utf8')).toBe('sentinel');
  });
});
