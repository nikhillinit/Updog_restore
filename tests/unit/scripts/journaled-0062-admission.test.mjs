import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';

import { loadCurrentForecastBaselineLedger } from '../../../scripts/current-forecast-journaled-migration-range.mjs';
import { computeTargetFingerprint } from '../../../scripts/reconcile-prod-schema.mjs';
import { JOURNALED_0050_0061_TARGETS } from '../../../scripts/run-journaled-0050-0061-migrations.mjs';
import { runJournaled0062Migration } from '../../../scripts/run-journaled-0062-migration.mjs';
import {
  assert0062Admission,
  assert0062OwnerApproval,
  assert0062ProductionEndpoint,
  assert0062Rehearsal,
  assert0062RestoreBranch,
} from '../../../scripts/release/journaled-0062-admission.mjs';

vi.mock('../../../scripts/reconcile-prod-schema.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    auditManifest: async (_client, manifest) => ({
      action: 'SKIP',
      objects:
        manifest.order === 39
          ? [
              [
                'function:vehicle_onboarding_artifact_digest',
                false,
                ['missing-function:vehicle_onboarding_artifact_digest'],
              ],
              [
                'function:vehicle_onboarding_refuse_envelope_source',
                false,
                ['missing-function:vehicle_onboarding_refuse_envelope_source'],
              ],
              ['function:internal_economics_forbid_update', true, []],
              [
                'internal_capital_envelope_versions',
                true,
                ['missing-trigger:vehicle_onboarding_refuse_envelope_source_trigger'],
              ],
              [
                'vehicle_onboarding_commands',
                false,
                [
                  'missing-table:vehicle_onboarding_commands',
                  'missing-trigger:vehicle_onboarding_commands_forbid_update_trigger',
                ],
              ],
            ].map(([table, present, deltas]) => ({
              table,
              present,
              action: deltas.length ? 'REFUSE-FOR-HUMAN' : 'SKIP',
              deltas: deltas.map((decision) => {
                const [kind, name] = decision.split(':');
                return { kind, name };
              }),
            }))
          : [],
    }),
  };
});

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const now = Date.parse('2026-11-18T07:00:00Z');
const candidateSha = 'a'.repeat(40);
const repository = 'example/repository';
const tag = '0062_vehicle_onboarding_commands';
const targetFingerprint = computeTargetFingerprint({
  directHost: 'example.invalid',
  port: 5432,
  database: 'fixture',
  user: 'fixture_admin',
});
const protectedEnv = {
  GITHUB_REPOSITORY: repository,
  GITHUB_RUN_ID: '104',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: candidateSha,
  EXPECTED_SHA: candidateSha,
  GITHUB_ACTOR_ID: '13',
  REPOSITORY_OWNER_ID: '13',
  GITHUB_ACTOR: 'repository-owner',
  GITHUB_TRIGGERING_ACTOR: 'repository-owner',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/prod-schema-reconcile.yml@refs/heads/main`,
  GITHUB_WORKFLOW_SHA: candidateSha,
  GITHUB_REF: 'refs/heads/main',
  PRODUCTION_SCHEMA_TARGET_FINGERPRINT: targetFingerprint,
  ACTUALS_PREFLIGHT_NEON_PROJECT_ID: 'prod-project',
  ACTUALS_PREFLIGHT_NEON_BRANCH_ID: 'br-prod',
  ACTUALS_PREFLIGHT_NEON_ENDPOINT_ID: 'ep-prod',
  PRODUCTION_DATABASE_NAME: 'fixture',
  ACTUALS_PREFLIGHT_DATABASE_ROLE: 'fixture_admin',
  SCHEMA_0062_REHEARSAL_PROJECT_ID: 'sandbox-project',
  SCHEMA_0062_REHEARSAL_PARENT_BRANCH_ID: 'br-sandbox-parent',
  SCHEMA_0062_REHEARSAL_DATABASE_NAME: 'fixture',
  SCHEMA_0062_RECOVERY_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }),
};
const recovery = {
  repository,
  candidateSha,
  applyRunId: '104',
  targetFingerprint,
  projectId: 'prod-project',
  sourceBranchId: 'br-prod',
  endpointId: 'ep-prod',
  database: 'fixture',
  role: 'fixture_admin',
  restoreBranchId: 'br-restore',
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
const envelope = (changes) => {
  const payload = JSON.stringify({ ...recovery, ...changes });
  return JSON.stringify({
    payload,
    signature: sign(null, Buffer.from(payload), privateKey).toString('base64'),
  });
};
const admit = (env = {}, changes = {}) =>
  assert0062Admission({
    env: { ...protectedEnv, SCHEMA_0062_ADMISSION: envelope(changes), ...env },
    now,
  });

describe('0062 admission', () => {
  it('requires separate owner dispatch and signed exact-run proof', () => {
    expect(admit()).toMatchObject(recovery);
    for (const env of [
      { GITHUB_ACTOR_ID: '14' },
      { GITHUB_TRIGGERING_ACTOR: 'different-user' },
      { GITHUB_RUN_ATTEMPT: '2' },
      { GITHUB_EVENT_NAME: 'pull_request' },
      {
        GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/release-production.yml@refs/heads/main`,
      },
      { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) },
      { EXPECTED_SHA: 'b'.repeat(40) },
      { SCHEMA_0062_REHEARSAL_PROJECT_ID: 'prod-project' },
      { SCHEMA_0062_ADMISSION: '' },
      { SCHEMA_0062_RECOVERY_PUBLIC_KEY: 'invalid' },
      { SCHEMA_0062_ADMISSION: envelope().replace('br-restore', 'br-other') },
    ])
      expect(() => admit(env)).toThrow(/0062/);
    for (const changes of [
      { applyRunId: '105' },
      { candidateSha: 'b'.repeat(40) },
      { targetFingerprint: '0'.repeat(64) },
      { reviewedAtMs: now - 31 * 60_000 },
      { isolatedRestoredAtMs: now - 73 * 3_600_000 },
      { restoreBranchId: 'br-prod' },
      { custodySha256: 'missing' },
      { rehearsalArtifactDigest: 'malformed' },
    ])
      expect(() => admit({}, changes)).toThrow(/admission is stale or does not bind/);
  });

  it('requires owner approval of the exact apply run in production-schema', () => {
    const ownerId = '13';
    const approval = {
      state: 'approved',
      user: { id: 13 },
      environments: [{ name: 'production-schema' }],
    };
    expect(() => assert0062OwnerApproval([approval], ownerId)).not.toThrow();
    for (const reviews of [
      [],
      [{ ...approval, user: { id: 14 } }],
      [{ ...approval, user: { id: 'malformed' } }],
      [{ ...approval, environments: [{ name: 'Production' }] }],
      [{ ...approval, state: 'rejected' }],
      null,
    ])
      expect(() => assert0062OwnerApproval(reviews, ownerId)).toThrow(
        /repository owner's approval of this production-schema run/
      );
    expect(() => assert0062OwnerApproval([approval], 'malformed')).toThrow(
      /repository owner's approval of this production-schema run/
    );
  });

  it('keeps the 0062 report payload minimal and redacts identifiers on CLI refusal', async () => {
    const baseline = await loadCurrentForecastBaselineLedger({ migrationsDir: 'migrations' });
    const adr074Baseline = baseline.filter(({ idx }) => idx <= 8 || idx >= 46);
    const ledgerRows = [...adr074Baseline, ...JOURNALED_0050_0061_TARGETS].map(
      ({ hash, when }) => ({ hash, created_at: when })
    );
    const client = {
      host: 'db.example.invalid',
      port: 5432,
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (statement) => {
        if (statement === 'SHOW server_version_num')
          return { rows: [{ server_version_num: 160000 }] };
        if (statement.startsWith('SELECT pg_try_advisory_lock'))
          return { rows: [{ acquired: true }] };
        if (statement.includes('FROM public.drizzle_migrations')) return { rows: ledgerRows };
        return { rows: [] };
      }),
    };
    const result = await runJournaled0062Migration({
      connectionString:
        'postgres://synthetic-user:synthetic-password@db.example.invalid/synthetic-db',
      clientFactory: () => client,
      stdout: { write: vi.fn() },
    });
    expect(result).toEqual({
      preState: 'ready',
      postState: 'ready',
      applied: false,
      migrationRange: [tag],
    });
    const admissionSource = await readFile('scripts/release/journaled-0062-admission.mjs', 'utf8');
    expect(admissionSource).toContain(
      "writeFile('reports/journaled-0062-migration-result.json', `${JSON.stringify(result)}\\n`"
    );

    const directory = await mkdtemp(path.join(os.tmpdir(), 'journaled-0062-cli-'));
    temporaryDirectories.push(directory);
    const syntheticIdentifiers = [
      repository,
      candidateSha,
      'prod-project',
      'br-prod',
      'ep-prod',
      'fixture',
      'fixture_admin',
      'sandbox-project',
      'br-sandbox-parent',
      'br-restore',
    ];
    const runCli = (admission) =>
      spawnSync(process.execPath, ['scripts/release/journaled-0062-admission.mjs'], {
        cwd: process.cwd(),
        env: {
          ...protectedEnv,
          DATABASE_URL:
            'postgres://synthetic-user:synthetic-password@db.example.invalid/synthetic-db',
          SCHEMA_0062_ADMISSION: admission,
          PATH: directory,
        },
        encoding: 'utf8',
        timeout: 10_000,
      });
    const invalid = runCli('{');
    expect(invalid.status).toBe(1);
    for (const identifier of syntheticIdentifiers) expect(invalid.stderr).not.toContain(identifier);

    const currentTime = Date.now();
    const valid = runCli(
      envelope({
        reviewedAtMs: currentTime - 60_000,
        isolatedRestoredAtMs: currentTime - 3_600_000,
      })
    );
    expect(valid.status).toBe(1);
    expect(valid.stderr).toContain('0062 apply failed. Check the exact ledger readback');
    for (const identifier of syntheticIdentifiers) expect(valid.stderr).not.toContain(identifier);
  });

  it('revalidates the provider endpoint and restore reference against approved scope', () => {
    const proof = admit();
    const branch = {
      id: 'br-restore',
      project_id: 'prod-project',
      parent_id: 'br-prod',
      current_state: 'ready',
      created_at: new Date(now - 120_000).toISOString(),
    };
    const endpoint = {
      id: 'ep-prod',
      project_id: 'prod-project',
      branch_id: 'br-prod',
      type: 'read_write',
      disabled: false,
      host: 'example.invalid',
    };
    expect(() => assert0062RestoreBranch({ proof, branch, now })).not.toThrow();
    expect(() => assert0062ProductionEndpoint({ proof, endpoint })).not.toThrow();
    for (const changes of [
      { parent_id: 'br-preview' },
      { current_state: 'init' },
      { created_at: new Date(now - 31 * 60_000).toISOString() },
      { expires_at: new Date(now - 1).toISOString() },
    ])
      expect(() =>
        assert0062RestoreBranch({ proof, branch: { ...branch, ...changes }, now })
      ).toThrow(/restore|recovery/);
    for (const changes of [
      { branch_id: 'br-preview' },
      { disabled: true },
      { host: 'different.invalid' },
      { host: 'example-pooler.invalid' },
    ])
      expect(() =>
        assert0062ProductionEndpoint({ proof, endpoint: { ...endpoint, ...changes } })
      ).toThrow(/live Neon/);
  });

  it('binds exact rehearsal attempt and result to the signed artifact and isolated target', () => {
    const proof = admit();
    const run = {
      id: 96,
      repository: { full_name: repository },
      actor: { id: 13 },
      path: '.github/workflows/current-forecast-neon-rehearsal.yml',
      event: 'workflow_dispatch',
      head_sha: candidateSha,
      head_branch: 'main',
      run_attempt: 1,
      status: 'completed',
      conclusion: 'success',
      updated_at: new Date(now - 300_000).toISOString(),
    };
    const artifact = {
      id: 97,
      workflow_run: { id: 96, head_sha: candidateSha },
      name: `journaled-0062-rehearsal-96-1-${candidateSha}`,
      expired: false,
      digest: recovery.rehearsalArtifactDigest,
    };
    const result = {
      githubRunId: '96',
      githubRunAttempt: 1,
      candidateSha,
      migrationMode: 'journaled-0062',
      projectId: 'sandbox-project',
      parentBranchId: 'br-sandbox-parent',
      rehearsalBranchId: 'br-child',
      databaseName: 'fixture',
      beforeMigrationTail: '0061_durable_create_receipts',
      afterMigrationTail: tag,
      migrationResult: {
        preState: 'ready',
        postState: 'complete',
        applied: true,
        migrationRange: [tag],
      },
    };
    const cases = { proof, run, artifact, result, now };
    expect(() => assert0062Rehearsal(cases)).not.toThrow();
    for (const change of [
      { run: { ...run, run_attempt: 2 } },
      { run: { ...run, head_sha: 'b'.repeat(40) } },
      { run: { ...run, actor: { id: 14 } } },
      { artifact: { ...artifact, digest: `sha256:${'f'.repeat(64)}` } },
      { artifact: { ...artifact, workflow_run: { ...artifact.workflow_run, id: 95 } } },
      { result: { ...result, parentBranchId: 'br-prod' } },
      { result: { ...result, rehearsalBranchId: result.parentBranchId } },
      { result: { ...result, migrationMode: 'journaled-0050-0061' } },
      { result: { ...result, migrationResult: { ...result.migrationResult, applied: false } } },
    ])
      expect(() => assert0062Rehearsal({ ...cases, ...change })).toThrow(
        /exact isolated transition/
      );
  });

  it('connects the workflows through 0062-specific admission, readback, and artifact steps', async () => {
    const prod = YAML.parse(await readFile('.github/workflows/prod-schema-reconcile.yml', 'utf8'));
    const steps = prod.jobs.reconcile.steps;
    const ownerGate = steps.findIndex(({ name }) => name === 'Require owner 0062 dispatch on main');
    const apply = steps.findIndex(({ id }) => id === 'apply');
    expect(ownerGate).toBeGreaterThan(0);
    expect(ownerGate).toBeLessThan(apply);
    expect(steps[ownerGate].if).toBe("inputs.mode == 'apply-journaled-0062'");
    expect(steps[apply].run).toContain('node scripts/release/journaled-0062-admission.mjs');
    expect(steps[apply].run).not.toContain('node scripts/run-journaled-0062-migration.mjs --apply');
    expect(steps.find(({ name }) => name === 'Read back 0062 ledger')?.run).toBe(
      'node scripts/run-journaled-0062-migration.mjs'
    );
    const rehearsal = YAML.parse(
      await readFile('.github/workflows/current-forecast-neon-rehearsal.yml', 'utf8')
    );
    expect(Object.keys(rehearsal.on)).toEqual(['workflow_dispatch']);
    const rehearsalSteps = rehearsal.jobs.rehearse.steps;
    expect(
      rehearsalSteps.findIndex(
        ({ name }) => name === 'Require owner 0062 rehearsal on isolated target'
      )
    ).toBeLessThan(
      rehearsalSteps.findIndex(({ name }) => name === 'Rehearse bounded migration and tests')
    );
    expect(
      rehearsalSteps.find(({ name }) => name === 'Upload exact 0062 rehearsal evidence')?.with.path
    ).toContain('journaled-0062-rehearsal.json');
  });
});
