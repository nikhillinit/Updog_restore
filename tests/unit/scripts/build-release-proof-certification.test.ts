import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseReleaseProofCertification } from '../../../shared/contracts/release-proof-certification-v1.contract';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const SCRIPT = path.join(ROOT, 'scripts', 'release', 'build-release-proof-certification.ts');

const SHA = 'a'.repeat(40);
const hex = (digit: string) => digit.repeat(64);
const RUN_ID = '17178572726';
const CHARACTERIZATION_NAME = `release-canary-residue-characterization-v1-${RUN_ID}-1-${SHA}`;

function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    GITHUB_REPOSITORY: 'press-on/updog',
    GITHUB_RUN_ID: RUN_ID,
    GITHUB_RUN_ATTEMPT: '1',
    CERT_SOURCE_SHA: SHA,
    CALLER_WORKFLOW_REF: 'press-on/updog/.github/workflows/release-production.yml@refs/heads/main',
    PROOF_WORKFLOW_REF: `press-on/updog/.github/workflows/release-proof.yml@${SHA}`,
    FULL_RELEASE_PROOF_RESULT: 'success',
    PROVIDER_IDENTITY_RESULT: 'skipped',
    CHARACTERIZATION_RESULT: 'success',
    G3_EXACT_SHA_VERDICT_RESULT: 'success',
    MATRIX_SUMMARY_SHA256: hex('1'),
    RELEASE_CHECK_SUMMARY_SHA256: hex('2'),
    CHARACTERIZATION_ARTIFACT_ID: '4242',
    CHARACTERIZATION_ARTIFACT_NAME: CHARACTERIZATION_NAME,
    CHARACTERIZATION_ARTIFACT_DIGEST: hex('3'),
    CHARACTERIZATION_FILE_SHA256: hex('4'),
    CHARACTERIZATION_SOURCE_SHA: SHA,
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

describe('build-release-proof-certification', { timeout: 120_000 }, () => {
  let workdir = '';
  let output = '';

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(os.tmpdir(), 'cert-builder-'));
    output = path.join(workdir, 'certification.json');
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('builds a success certification, writes 0600, and prints only the documented line', async () => {
    const result = await runBuilder(['--output', output], baseEnv());
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['certificationFileSha256', 'overallConclusion']);
    expect(parsed['overallConclusion']).toBe('success');

    const fileContent = await readFile(output, 'utf8');
    const certification = parseReleaseProofCertification(JSON.parse(fileContent));
    expect(certification.overallConclusion).toBe('success');
    expect(certification.characterizationArtifact?.artifactArchiveSha256).toBe(hex('3'));
    expect(createHash('sha256').update(fileContent).digest('hex')).toBe(
      parsed['certificationFileSha256']
    );
    expect((await stat(output)).mode & 0o777).toBe(0o600);
  });

  it('emits a null characterization artifact and failure when the five envs are all empty', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({
        CHARACTERIZATION_ARTIFACT_ID: '',
        CHARACTERIZATION_ARTIFACT_NAME: '',
        CHARACTERIZATION_ARTIFACT_DIGEST: '',
        CHARACTERIZATION_FILE_SHA256: '',
        CHARACTERIZATION_SOURCE_SHA: '',
      })
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect((JSON.parse(result.stdout) as { overallConclusion: string }).overallConclusion).toBe(
      'failure'
    );
    const certification = parseReleaseProofCertification(
      JSON.parse(await readFile(output, 'utf8'))
    );
    expect(certification.characterizationArtifact).toBeNull();
    expect(certification.overallConclusion).toBe('failure');
  });

  it('emits null summaries and failure when both summary envs are empty on a failed proof', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({
        FULL_RELEASE_PROOF_RESULT: 'failure',
        MATRIX_SUMMARY_SHA256: '',
        RELEASE_CHECK_SUMMARY_SHA256: '',
      })
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect((JSON.parse(result.stdout) as { overallConclusion: string }).overallConclusion).toBe(
      'failure'
    );
    const certification = parseReleaseProofCertification(
      JSON.parse(await readFile(output, 'utf8'))
    );
    expect(certification.summaries).toBeNull();
    expect(certification.overallConclusion).toBe('failure');
  });

  it('rejects empty summary envs when the full release proof succeeded', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({ MATRIX_SUMMARY_SHA256: '', RELEASE_CHECK_SUMMARY_SHA256: '' })
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('required when the full release proof succeeded');
    await expect(stat(output)).rejects.toThrow();
  });

  it('rejects a partially populated summary environment', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({ FULL_RELEASE_PROOF_RESULT: 'failure', MATRIX_SUMMARY_SHA256: '' })
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('all set or all empty');
    await expect(stat(output)).rejects.toThrow();
  });

  it('rejects a partially populated characterization environment', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({ CHARACTERIZATION_ARTIFACT_ID: '', CHARACTERIZATION_ARTIFACT_NAME: '' })
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('all set or all empty');
    await expect(stat(output)).rejects.toThrow();
  });

  it('derives overallConclusion failure when a required conclusion is not success', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({ FULL_RELEASE_PROOF_RESULT: 'failure' })
    );
    expect(result.code).toBe(0);
    expect((JSON.parse(result.stdout) as { overallConclusion: string }).overallConclusion).toBe(
      'failure'
    );
    const certification = parseReleaseProofCertification(
      JSON.parse(await readFile(output, 'utf8'))
    );
    expect(certification.conclusions.fullReleaseProof).toBe('failure');
    expect(certification.overallConclusion).toBe('failure');
  });

  it('strips a sha256: prefix from the characterization digest', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({ CHARACTERIZATION_ARTIFACT_DIGEST: `sha256:${hex('7')}` })
    );
    expect(result.code).toBe(0);
    const certification = parseReleaseProofCertification(
      JSON.parse(await readFile(output, 'utf8'))
    );
    expect(certification.characterizationArtifact?.artifactArchiveSha256).toBe(hex('7'));
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

  it('rejects a missing required environment variable by name only', async () => {
    const result = await runBuilder(['--output', output], baseEnv({ GITHUB_REPOSITORY: '' }));
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('GITHUB_REPOSITORY is required');
  });

  it('reports contract violations by path without echoing environment values', async () => {
    const result = await runBuilder(
      ['--output', output],
      baseEnv({ CERT_SOURCE_SHA: 'LEAKYVALUE-not-a-sha' })
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Contract validation failed at:');
    expect(result.stderr).toContain('sourceSha');
    expect(result.stderr).not.toContain('LEAKYVALUE');
    await expect(stat(output)).rejects.toThrow();
  });

  it('refuses to overwrite an existing output file and leaves it unchanged', async () => {
    await writeFile(output, 'sentinel', 'utf8');
    const result = await runBuilder(['--output', output], baseEnv());
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('already exists');
    expect(await readFile(output, 'utf8')).toBe('sentinel');
  });
});
