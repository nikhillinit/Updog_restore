import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseReleaseProofLineage } from '../../../shared/contracts/release-proof-lineage-v1.contract';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const SCRIPT = path.join(ROOT, 'scripts', 'release', 'build-release-proof-lineage.ts');

const SHA = 'a'.repeat(40);
const hex = (digit: string) => digit.repeat(64);
const RUN_ID = '17178572726';
const CERTIFICATION_NAME = `release-proof-certification-v1-${RUN_ID}-1-${SHA}`;

function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    GITHUB_REPOSITORY: 'press-on/updog',
    GITHUB_RUN_ID: RUN_ID,
    GITHUB_RUN_ATTEMPT: '1',
    CERT_SOURCE_SHA: SHA,
    CALLER_WORKFLOW_REF: 'press-on/updog/.github/workflows/release-production.yml@refs/heads/main',
    PROOF_WORKFLOW_REF: `press-on/updog/.github/workflows/release-proof.yml@${SHA}`,
    PROOF_CONCLUSION: 'success',
    CERTIFICATION_ARTIFACT_ID: '9001',
    CERTIFICATION_ARTIFACT_NAME: CERTIFICATION_NAME,
    CERTIFICATION_ARTIFACT_DIGEST: hex('5'),
    CERTIFICATION_FILE_SHA256: hex('6'),
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

describe('build-release-proof-lineage', { timeout: 120_000 }, () => {
  let workdir = '';
  let output = '';

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(os.tmpdir(), 'lineage-builder-'));
    output = path.join(workdir, 'lineage.json');
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('builds the lineage record, writes 0600, and prints only the documented line', async () => {
    const result = await runBuilder(['--output', output], baseEnv());
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['lineageFileSha256']);

    const fileContent = await readFile(output, 'utf8');
    const lineage = parseReleaseProofLineage(JSON.parse(fileContent));
    expect(lineage.conclusion).toBe('success');
    expect(lineage.certificationArtifact.artifactName).toBe(CERTIFICATION_NAME);
    expect(createHash('sha256').update(fileContent).digest('hex')).toBe(
      parsed['lineageFileSha256']
    );
    expect((await stat(output)).mode & 0o777).toBe(0o600);
  });

  it('strips a sha256: prefix from the certification digest', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({ CERTIFICATION_ARTIFACT_DIGEST: `sha256:${hex('8')}` })
    );
    expect(result.code).toBe(0);
    const lineage = parseReleaseProofLineage(JSON.parse(await readFile(output, 'utf8')));
    expect(lineage.certificationArtifact.artifactArchiveSha256).toBe(hex('8'));
  });

  it('rejects a missing required environment variable by name only', async () => {
    const result = await runBuilder(['--output', output], baseEnv({ PROOF_CONCLUSION: '' }));
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('PROOF_CONCLUSION is required');
    await expect(stat(output)).rejects.toThrow();
  });

  it('reports a certification-name template violation by path without echoing values', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({ CERTIFICATION_ARTIFACT_NAME: 'LEAKYNAME-wrong-template' })
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Contract validation failed at:');
    expect(result.stderr).toContain('certificationArtifact.artifactName');
    expect(result.stderr).not.toContain('LEAKYNAME');
    await expect(stat(output)).rejects.toThrow();
  });

  it('rejects malformed argv: unknown, duplicate, missing flags, and positionals', async () => {
    const unknown = await runBuilder(['--output', output, '--bogus', 'x'], baseEnv());
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('Unknown flag');

    const duplicate = await runBuilder(['--output', output, '--output', output], baseEnv());
    expect(duplicate.code).toBe(1);
    expect(duplicate.stderr).toContain('Duplicate flag');

    const missing = await runBuilder([], baseEnv());
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('--output is required');

    const positional = await runBuilder([output], baseEnv());
    expect(positional.code).toBe(1);
    expect(positional.stderr).toContain('Positional arguments are not accepted');
  });

  it('refuses to overwrite an existing output file and leaves it unchanged', async () => {
    await writeFile(output, 'sentinel', 'utf8');
    const result = await runBuilder(['--output', output], baseEnv());
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('already exists');
    expect(await readFile(output, 'utf8')).toBe('sentinel');
  });
});
