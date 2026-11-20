import { Buffer } from 'node:buffer';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeTargetFingerprint } from '../reconcile-prod-schema.mjs';
import { runJournaled0062Migration } from '../run-journaled-0062-migration.mjs';

const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[1-9][0-9]{0,15}$/;
const NEON_ID = /^[a-z0-9-]{1,60}$/;
const MINUTE = 60_000;
const MAX_ADMISSION_AGE = 30 * MINUTE;
const MAX_RESTORE_AGE = 72 * 60 * MINUTE;
const TAG = '0062_vehicle_onboarding_commands';
const REHEARSAL_WORKFLOW = '.github/workflows/current-forecast-neon-rehearsal.yml';

class AdmissionError extends Error {}

function requireEvidence(condition, message) {
  if (!condition) throw new AdmissionError(message);
}

export function assert0062Admission({ env, now = Date.now() }) {
  const {
    SCHEMA_0062_ADMISSION: envelope,
    SCHEMA_0062_RECOVERY_PUBLIC_KEY: publicKey,
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: applyRunId,
    GITHUB_RUN_ATTEMPT: attempt,
    GITHUB_SHA: candidateSha,
    EXPECTED_SHA: expectedSha,
    GITHUB_ACTOR_ID: actorId,
    REPOSITORY_OWNER_ID: ownerId,
    GITHUB_ACTOR: actor,
    GITHUB_TRIGGERING_ACTOR: triggeringActor,
    GITHUB_EVENT_NAME: event,
    GITHUB_WORKFLOW_REF: workflowRef,
    GITHUB_WORKFLOW_SHA: workflowSha,
    GITHUB_REF: ref,
    PRODUCTION_SCHEMA_TARGET_FINGERPRINT: targetFingerprint,
    ACTUALS_PREFLIGHT_NEON_PROJECT_ID: projectId,
    ACTUALS_PREFLIGHT_NEON_BRANCH_ID: sourceBranchId,
    ACTUALS_PREFLIGHT_NEON_ENDPOINT_ID: endpointId,
    PRODUCTION_DATABASE_NAME: database,
    ACTUALS_PREFLIGHT_DATABASE_ROLE: role,
    SCHEMA_0062_REHEARSAL_PROJECT_ID: rehearsalProjectId,
    SCHEMA_0062_REHEARSAL_PARENT_BRANCH_ID: rehearsalParentBranchId,
    SCHEMA_0062_REHEARSAL_DATABASE_NAME: rehearsalDatabaseName,
  } = env;
  requireEvidence(
    event === 'workflow_dispatch' &&
      ref === 'refs/heads/main' &&
      workflowRef === `${repository}/.github/workflows/prod-schema-reconcile.yml@refs/heads/main` &&
      workflowSha === candidateSha &&
      attempt === '1' &&
      ID.test(actorId ?? '') &&
      actorId === ownerId &&
      actor &&
      actor === triggeringActor &&
      SHA.test(candidateSha ?? '') &&
      candidateSha === expectedSha &&
      /^[\w.-]+\/[\w.-]+$/.test(repository ?? '') &&
      ID.test(applyRunId ?? '') &&
      HASH.test(targetFingerprint ?? ''),
    '0062 requires a fresh owner dispatch on exact main and a configured target fingerprint'
  );
  requireEvidence(
    [projectId, sourceBranchId, endpointId, rehearsalProjectId, rehearsalParentBranchId].every(
      (id) => NEON_ID.test(id ?? '')
    ) &&
      rehearsalProjectId !== projectId &&
      [database, rehearsalDatabaseName].every((name) => /^[A-Za-z0-9_-]{1,63}$/.test(name ?? '')) &&
      /^[A-Za-z0-9_.-]{1,63}$/.test(role ?? ''),
    '0062 protected production and isolated rehearsal targets are missing or overlap'
  );

  let proof;
  try {
    requireEvidence(envelope?.length > 0 && envelope.length <= 8192, 'invalid envelope size');
    const { payload, signature } = JSON.parse(envelope);
    const key = createPublicKey(publicKey);
    requireEvidence(
      typeof payload === 'string' &&
        /^[A-Za-z0-9+/]{86}==$/.test(signature ?? '') &&
        key.asymmetricKeyType === 'ed25519' &&
        verify(null, Buffer.from(payload, 'utf8'), key, Buffer.from(signature, 'base64')),
      'invalid admission signature'
    );
    proof = JSON.parse(payload);
  } catch {
    throw new AdmissionError('0062 signed recovery admission is missing or invalid');
  }

  const validTime = (time, age) => Number.isSafeInteger(time) && time <= now && now - time <= age;
  requireEvidence(
    proof?.repository === repository &&
      proof.applyRunId === applyRunId &&
      proof.candidateSha === candidateSha &&
      proof.targetFingerprint === targetFingerprint &&
      proof.projectId === projectId &&
      proof.sourceBranchId === sourceBranchId &&
      proof.endpointId === endpointId &&
      proof.database === database &&
      proof.role === role &&
      typeof proof.restoreBranchId === 'string' &&
      NEON_ID.test(proof.restoreBranchId) &&
      proof.restoreBranchId !== sourceBranchId &&
      validTime(proof.reviewedAtMs, MAX_ADMISSION_AGE) &&
      validTime(proof.isolatedRestoredAtMs, MAX_RESTORE_AGE) &&
      proof.isolatedRestoredAtMs <= proof.reviewedAtMs &&
      [
        proof.backupPitrSha256,
        proof.isolatedRestoreSha256,
        proof.custodySha256,
        proof.isolationSha256,
      ].every((digest) => typeof digest === 'string' && HASH.test(digest)) &&
      [proof.rehearsalRunId, proof.rehearsalArtifactId].every(
        (id) => typeof id === 'string' && ID.test(id)
      ) &&
      /^sha256:[a-f0-9]{64}$/.test(proof.rehearsalArtifactDigest ?? ''),
    '0062 recovery admission is stale or does not bind the exact run, source, safe targets and evidence'
  );

  return { ...proof, actorId, rehearsalProjectId, rehearsalParentBranchId, rehearsalDatabaseName };
}

export function assert0062Rehearsal({ proof, run, artifact, result, now = Date.now() }) {
  const timestamp = Date.parse(run?.updated_at);
  requireEvidence(
    String(run?.id) === proof.rehearsalRunId &&
      run?.repository?.full_name === proof.repository &&
      run.path === REHEARSAL_WORKFLOW &&
      run.event === 'workflow_dispatch' &&
      run.head_branch === 'main' &&
      run.head_sha === proof.candidateSha &&
      run.run_attempt === 1 &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      String(run.actor?.id) === proof.actorId &&
      Number.isFinite(timestamp) &&
      timestamp <= proof.reviewedAtMs &&
      now - timestamp <= MAX_RESTORE_AGE &&
      String(artifact?.id) === proof.rehearsalArtifactId &&
      String(artifact.workflow_run?.id) === proof.rehearsalRunId &&
      artifact.workflow_run?.head_sha === proof.candidateSha &&
      artifact.name ===
        `journaled-0062-rehearsal-${proof.rehearsalRunId}-1-${proof.candidateSha}` &&
      artifact.expired === false &&
      artifact.digest === proof.rehearsalArtifactDigest &&
      result?.githubRunId === proof.rehearsalRunId &&
      result.githubRunAttempt === 1 &&
      result.candidateSha === proof.candidateSha &&
      result.migrationMode === 'journaled-0062' &&
      result.projectId === proof.rehearsalProjectId &&
      result.parentBranchId === proof.rehearsalParentBranchId &&
      typeof result.rehearsalBranchId === 'string' &&
      NEON_ID.test(result.rehearsalBranchId) &&
      result.rehearsalBranchId !== proof.rehearsalParentBranchId &&
      result.databaseName === proof.rehearsalDatabaseName &&
      result.beforeMigrationTail === '0061_durable_create_receipts' &&
      result.afterMigrationTail === TAG &&
      result.migrationResult?.preState === 'ready' &&
      result.migrationResult?.postState === 'complete' &&
      result.migrationResult?.applied === true &&
      JSON.stringify(result.migrationResult?.migrationRange) === JSON.stringify([TAG]),
    '0062 rehearsal run, artifact or result does not prove the exact isolated transition'
  );
}

export function assert0062RestoreBranch({ proof, branch, now = Date.now() }) {
  const createdAt = Date.parse(branch?.created_at);
  requireEvidence(
    branch?.id === proof.restoreBranchId &&
      branch.project_id === proof.projectId &&
      branch.parent_id === proof.sourceBranchId &&
      branch.current_state === 'ready' &&
      Number.isFinite(createdAt) &&
      createdAt <= proof.reviewedAtMs &&
      now - createdAt <= MAX_ADMISSION_AGE &&
      (branch.expires_at == null || Date.parse(branch.expires_at) > now),
    '0062 recovery reference is missing, stale or outside the exact production parent'
  );
}

export function assert0062ProductionEndpoint({ proof, endpoint }) {
  requireEvidence(
    endpoint?.id === proof.endpointId &&
      endpoint.project_id === proof.projectId &&
      endpoint.branch_id === proof.sourceBranchId &&
      endpoint.type === 'read_write' &&
      !endpoint.disabled &&
      /^[a-zA-Z0-9.-]+$/.test(endpoint.host ?? '') &&
      !endpoint.host.toLowerCase().includes('pooler') &&
      computeTargetFingerprint({
        directHost: endpoint.host,
        port: 5432,
        database: proof.database,
        user: proof.role,
      }) === proof.targetFingerprint,
    '0062 protected target does not match the live Neon read-write endpoint'
  );
}

export function assert0062OwnerApproval(reviews, ownerId) {
  requireEvidence(
    ID.test(ownerId ?? '') &&
      Array.isArray(reviews) &&
      reviews.some(
        (review) =>
          review?.state === 'approved' &&
          String(review.user?.id) === ownerId &&
          review.environments?.some((environment) => environment?.name === 'production-schema')
      ),
    "0062 requires the repository owner's approval of this production-schema run"
  );
}

function ghApi(endpoint) {
  return execFileSync('gh', ['api', endpoint], {
    timeout: 20_000,
    maxBuffer: 256 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

async function applyWithAdmission(env) {
  const proof = assert0062Admission({ env });
  const base = `repos/${proof.repository}`;
  const approvals = JSON.parse(ghApi(`${base}/actions/runs/${proof.applyRunId}/approvals`));
  assert0062OwnerApproval(approvals, proof.actorId);
  const run = JSON.parse(ghApi(`${base}/actions/runs/${proof.rehearsalRunId}`));
  const artifact = JSON.parse(ghApi(`${base}/actions/artifacts/${proof.rehearsalArtifactId}`));
  const archive = ghApi(`${base}/actions/artifacts/${proof.rehearsalArtifactId}/zip`);
  requireEvidence(
    `sha256:${createHash('sha256').update(archive).digest('hex')}` ===
      proof.rehearsalArtifactDigest,
    '0062 rehearsal archive digest mismatch'
  );
  const directory = await mkdtemp(path.join(tmpdir(), 'journaled-0062-evidence-'));
  try {
    const zip = path.join(directory, 'rehearsal.zip');
    await writeFile(zip, archive, { mode: 0o600 });
    const unzip = (command, ...args) =>
      execFileSync(command, args, { encoding: 'utf8', timeout: 5_000, maxBuffer: 16 * 1024 });
    requireEvidence(
      unzip('zipinfo', '-1', zip).trim() === 'journaled-0062-rehearsal.json',
      '0062 rehearsal archive inventory mismatch'
    );
    const result = JSON.parse(unzip('unzip', '-p', zip, 'journaled-0062-rehearsal.json'));
    assert0062Rehearsal({ proof, run, artifact, result });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const readNeon = async (route) => {
    requireEvidence(
      env.NEON_API_KEY,
      '0062 requires read access to the exact production and restore targets'
    );
    const response = await fetch(
      `https://console.neon.tech/api/v2/projects/${proof.projectId}/${route}`,
      {
        headers: { Authorization: `Bearer ${env.NEON_API_KEY}` },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      }
    );
    requireEvidence(response.ok, '0062 Neon target revalidation failed');
    return response.json();
  };

  const fence = async () => {
    assert0062Admission({ env });
    const [production, restore] = await Promise.all([
      readNeon(`endpoints/${proof.endpointId}`),
      readNeon(`branches/${proof.restoreBranchId}`),
    ]);
    assert0062ProductionEndpoint({ proof, endpoint: production.endpoint });
    assert0062RestoreBranch({ proof, branch: restore.branch });
    const branch = JSON.parse(ghApi(`${base}/branches/main`));
    requireEvidence(
      branch?.protected === true && branch.commit?.sha === proof.candidateSha,
      '0062 live protected main moved or lost protection'
    );
    assert0062Admission({ env });
  };

  await fence();
  const result = await runJournaled0062Migration({
    connectionString: env.DATABASE_URL,
    apply: true,
    expectedTargetFingerprint: proof.targetFingerprint,
    beforeMutation: fence,
  });
  await writeFile('reports/journaled-0062-migration-result.json', `${JSON.stringify(result)}\n`, {
    mode: 0o600,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyWithAdmission(process.env).catch((error) => {
    // Errors from child tools or the database can contain protected configuration.
    const message =
      error instanceof AdmissionError
        ? error.message
        : '0062 apply failed. Check the exact ledger readback before redispatch.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
