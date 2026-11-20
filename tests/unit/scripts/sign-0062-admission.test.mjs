import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { computeTargetFingerprint } from '../../../scripts/reconcile-prod-schema.mjs';
import { assert0062Admission } from '../../../scripts/release/journaled-0062-admission.mjs';
import { sign0062Admission } from '../../../scripts/release/sign-0062-admission.mjs';

const temporaryDirectories = [];
const now = Date.parse('2026-11-20T18:00:00Z');
const candidateSha = 'a'.repeat(40);
const repository = 'synthetic-owner/synthetic-repository';
const runId = '104';
const publicHost = 'prod-synthetic.example.invalid';
const projectId = 'prod-synthetic-project';
const branchId = 'br-synthetic-production';
const endpointId = 'ep-synthetic-production';
const databaseName = 'synthetic_database';
const roleName = 'synthetic_role';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function fixture() {
  const keys = generateKeyPairSync('ed25519');
  const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const targetFingerprint = computeTargetFingerprint({
    directHost: publicHost,
    port: 5432,
    database: databaseName,
    user: roleName,
  });
  const record = {
    ACTUALS_PREFLIGHT_NEON_PROJECT_ID: projectId,
    ACTUALS_PREFLIGHT_NEON_BRANCH_ID: branchId,
    ACTUALS_PREFLIGHT_NEON_ENDPOINT_ID: endpointId,
    PRODUCTION_DATABASE_NAME: databaseName,
    ACTUALS_PREFLIGHT_DATABASE_ROLE: roleName,
    PRODUCTION_SCHEMA_TARGET_FINGERPRINT: targetFingerprint,
  };
  const payload = {
    repository,
    applyRunId: runId,
    candidateSha,
    targetFingerprint,
    projectId,
    sourceBranchId: branchId,
    endpointId,
    database: databaseName,
    role: roleName,
    restoreBranchId: 'br-synthetic-restore',
    reviewedAtMs: now - 60_000,
    isolatedRestoredAtMs: now - 3_600_000,
    backupPitrSha256: 'a'.repeat(64),
    isolatedRestoreSha256: 'b'.repeat(64),
    custodySha256: 'c'.repeat(64),
    isolationSha256: 'd'.repeat(64),
    rehearsalRunId: '96',
    rehearsalArtifactId: '97',
    rehearsalArtifactDigest: `sha256:${'e'.repeat(64)}`,
  };
  const run = {
    id: Number(runId),
    status: 'waiting',
    run_attempt: 1,
    head_sha: candidateSha,
    head_branch: 'main',
    path: '.github/workflows/prod-schema-reconcile.yml',
    event: 'workflow_dispatch',
    display_title: `actuals-schema:apply-journaled-0062:${candidateSha}`,
    repository: { full_name: repository },
    actor: { id: 42, login: 'synthetic-owner' },
    triggering_actor: { id: 42, login: 'synthetic-owner' },
  };
  const environmentVariables = [
    { name: 'SCHEMA_0062_RECOVERY_PUBLIC_KEY', value: publicKeyPem },
    { name: 'SCHEMA_0062_REHEARSAL_PROJECT_ID', value: 'sandbox-synthetic-project' },
    { name: 'SCHEMA_0062_REHEARSAL_PARENT_BRANCH_ID', value: 'br-synthetic-sandbox' },
    { name: 'SCHEMA_0062_REHEARSAL_DATABASE_NAME', value: databaseName },
  ];
  const github = {
    getRun: async () => run,
    getRepository: async () => ({ full_name: repository, owner: { id: 42 } }),
    getPendingDeployments: async () => [{ environment: { name: 'production-schema' } }],
    getEnvironmentVariables: async () => environmentVariables,
  };
  const endpoint = {
    id: endpointId,
    project_id: projectId,
    branch_id: branchId,
    type: 'read_write',
    disabled: false,
    host: publicHost,
  };
  const neon = {
    getEndpoint: async () => endpoint,
    getDatabases: async () => [{ name: databaseName }],
    getRoles: async () => [{ name: roleName }],
  };
  return {
    keys,
    publicKeyPem,
    privateKeyPem,
    record,
    payload,
    run,
    github,
    endpoint,
    neon,
  };
}

function independentEnv(envelope, values) {
  const { record, publicKeyPem } = values;
  return {
    SCHEMA_0062_ADMISSION: envelope,
    SCHEMA_0062_RECOVERY_PUBLIC_KEY: publicKeyPem,
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: candidateSha,
    EXPECTED_SHA: candidateSha,
    GITHUB_ACTOR_ID: '42',
    REPOSITORY_OWNER_ID: '42',
    GITHUB_ACTOR: 'synthetic-owner',
    GITHUB_TRIGGERING_ACTOR: 'synthetic-owner',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/prod-schema-reconcile.yml@refs/heads/main`,
    GITHUB_WORKFLOW_SHA: candidateSha,
    GITHUB_REF: 'refs/heads/main',
    ...record,
    SCHEMA_0062_REHEARSAL_PROJECT_ID: 'sandbox-synthetic-project',
    SCHEMA_0062_REHEARSAL_PARENT_BRANCH_ID: 'br-synthetic-sandbox',
    SCHEMA_0062_REHEARSAL_DATABASE_NAME: databaseName,
  };
}

function signFixture(values, changes = {}) {
  return sign0062Admission({
    payloadText: JSON.stringify({ ...values.payload, ...changes }),
    privateKeyPem: values.privateKeyPem,
    record: values.record,
    runId,
    repository,
    github: values.github,
    neon: values.neon,
    now,
  });
}

describe('sign0062Admission', () => {
  it('produces an envelope that passes the independent admission validator', async () => {
    const values = fixture();
    const result = await signFixture(values);
    const parsed = JSON.parse(result);

    expect(parsed.payload).toBe(JSON.stringify(values.payload));
    expect(
      verify(
        null,
        Buffer.from(parsed.payload, 'utf8'),
        createPublicKey(values.publicKeyPem),
        Buffer.from(parsed.signature, 'base64')
      )
    ).toBe(true);
    expect(assert0062Admission({ env: independentEnv(result, values), now })).toMatchObject(
      values.payload
    );
  });

  it('refuses a private key that does not match the configured public key', async () => {
    const values = fixture();
    const wrongKey = generateKeyPairSync('ed25519').privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });

    await expect(
      sign0062Admission({
        payloadText: JSON.stringify(values.payload),
        privateKeyPem: wrongKey,
        record: values.record,
        runId,
        repository,
        github: values.github,
        neon: values.neon,
        now,
      })
    ).rejects.toThrow();
  });

  it('refuses an envelope whose signed payload was edited', async () => {
    const values = fixture();
    const result = JSON.parse(await signFixture(values));
    result.payload = JSON.stringify({ ...values.payload, role: 'tampered_role' });

    expect(() =>
      assert0062Admission({ env: independentEnv(JSON.stringify(result), values), now })
    ).toThrow();
  });

  it('refuses a payload missing a required field', async () => {
    const values = fixture();
    const payload = { ...values.payload };
    delete payload.role;

    await expect(
      sign0062Admission({
        payloadText: JSON.stringify(payload),
        privateKeyPem: values.privateKeyPem,
        record: values.record,
        runId,
        repository,
        github: values.github,
        neon: values.neon,
        now,
      })
    ).rejects.toThrow();
  });

  it('refuses a stale reviewedAtMs', async () => {
    const values = fixture();

    await expect(signFixture(values, { reviewedAtMs: now - 30 * 60_000 - 1 })).rejects.toThrow();
  });

  it.each([
    ['projectId', 'other-synthetic-project'],
    ['sourceBranchId', 'br-other-synthetic-branch'],
    ['endpointId', 'ep-other-synthetic-endpoint'],
    ['database', 'other_synthetic_database'],
    ['role', 'other_synthetic_role'],
    ['targetFingerprint', 'f'.repeat(64)],
  ])('refuses payload %s that differs from the record', async (field, value) => {
    const values = fixture();

    await expect(signFixture(values, { [field]: value })).rejects.toThrow();
  });

  it('refuses a run with another display title', async () => {
    const values = fixture();
    values.run.display_title = `actuals-schema:audit:${candidateSha}`;

    await expect(signFixture(values)).rejects.toThrow();
  });

  it('refuses a run that is not waiting', async () => {
    const values = fixture();
    values.run.status = 'in_progress';

    await expect(signFixture(values)).rejects.toThrow();
  });

  it('refuses a pending deployment for another environment', async () => {
    const values = fixture();
    values.github.getPendingDeployments = async () => [
      { environment: { name: 'synthetic-other-environment' } },
    ];

    await expect(signFixture(values)).rejects.toThrow();
  });

  it.each([
    ['project_id', 'other-synthetic-project'],
    ['branch_id', 'br-other-synthetic-branch'],
    ['id', 'ep-other-synthetic-endpoint'],
  ])('refuses live endpoint %s mismatch', async (field, value) => {
    const values = fixture();
    values.endpoint[field] = value;

    await expect(signFixture(values)).rejects.toThrow();
  });

  it('refuses a pooler endpoint host', async () => {
    const values = fixture();
    values.endpoint.host = 'prod-synthetic-pooler.example.invalid';

    await expect(signFixture(values)).rejects.toThrow();
  });

  it('refuses a live endpoint whose fingerprint differs from the record', async () => {
    const values = fixture();
    values.endpoint.host = 'other-synthetic.example.invalid';

    await expect(signFixture(values)).rejects.toThrow();
  });

  it('refuses a database absent from the production branch', async () => {
    const values = fixture();
    values.neon.getDatabases = async () => [{ name: 'other_synthetic_database' }];

    await expect(signFixture(values)).rejects.toThrow();
  });

  it('refuses a role absent from the production branch', async () => {
    const values = fixture();
    values.neon.getRoles = async () => [{ name: 'other_synthetic_role' }];

    await expect(signFixture(values)).rejects.toThrow();
  });

  it('refuses a record with a missing key', async () => {
    const values = fixture();
    const record = { ...values.record };
    delete record.ACTUALS_PREFLIGHT_DATABASE_ROLE;

    await expect(
      sign0062Admission({
        payloadText: JSON.stringify(values.payload),
        privateKeyPem: values.privateKeyPem,
        record,
        runId,
        repository,
        github: values.github,
        neon: values.neon,
        now,
      })
    ).rejects.toThrow();
  });

  it('refuses a record with an extra key', async () => {
    const values = fixture();

    await expect(
      sign0062Admission({
        payloadText: JSON.stringify(values.payload),
        privateKeyPem: values.privateKeyPem,
        record: { ...values.record, syntheticExtra: 'synthetic-value' },
        runId,
        repository,
        github: values.github,
        neon: values.neon,
        now,
      })
    ).rejects.toThrow();
  });
});

describe('sign-0062-admission CLI', () => {
  it('keeps refusal output empty of synthetic identifiers for an input inside the repository', async () => {
    const inside = await mkdtemp(path.join(process.cwd(), '.tmp-sign0062-'));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'sign0062-'));
    temporaryDirectories.push(inside, outside);
    const payloadPath = path.join(inside, 'payload.json');
    const privateKeyPath = path.join(outside, 'private.pem');
    const recordPath = path.join(outside, 'record.json');
    await Promise.all([
      writeFile(payloadPath, '{}'),
      writeFile(privateKeyPath, 'synthetic-private-key', { mode: 0o600 }),
      writeFile(recordPath, JSON.stringify({ production: 'synthetic-record-value' })),
    ]);

    const result = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/release/sign-0062-admission.mjs'),
        '--repo',
        repository,
        '--run-id',
        '987654321',
        '--payload',
        payloadPath,
        '--private-key',
        privateKeyPath,
        '--record',
        recordPath,
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000 }
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('0062 admission signing refused\n');
    for (const identifier of [repository, '987654321', 'synthetic-record-value']) {
      expect(result.stderr).not.toContain(identifier);
    }
  });

  it('refuses a group-readable private key file', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'sign0062-'));
    temporaryDirectories.push(outside);
    const payloadPath = path.join(outside, 'payload.json');
    const privateKeyPath = path.join(outside, 'private.pem');
    const recordPath = path.join(outside, 'record.json');
    await Promise.all([
      writeFile(payloadPath, '{}'),
      writeFile(privateKeyPath, 'synthetic-private-key', { mode: 0o644 }),
      writeFile(recordPath, '{}'),
    ]);
    await chmod(privateKeyPath, 0o644);

    const result = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/release/sign-0062-admission.mjs'),
        '--repo',
        repository,
        '--run-id',
        runId,
        '--payload',
        payloadPath,
        '--private-key',
        privateKeyPath,
        '--record',
        recordPath,
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000 }
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('0062 admission signing refused\n');
  });
});
