import { createHash } from 'node:crypto';
import { z } from 'zod';

import type {
  ActualsMigrationPredicateObservation,
  ActualsMigrationPreflightInput,
} from '../../shared/contracts/schema-reconcile-receipt-v1.contract';

const MAX_METADATA_BYTES = 256 * 1024;
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const RESTORE_WORKFLOW = '.github/workflows/actuals-isolated-restore-proof.yml';
const RESTORE_WINDOW_MS = 72 * 60 * 60 * 1000;
const SIGNED_STORAGE_HOST = /^productionresultssa[0-9]+\.blob\.core\.windows\.net$/;

type Observation = ActualsMigrationPredicateObservation;
type Fetch = typeof globalThis.fetch;

type RecoveryBinding = Pick<
  ActualsMigrationPreflightInput,
  'mode' | 'repository' | 'candidateSha' | 'provider' | 'recovery'
> & {
  migration: { tag: string; idx: number; when: number; sqlSha256: string };
  manifest: { path: string; sha256: string };
  targetFingerprint: string;
};

class MissingLiveEvidence extends Error {}

const projectResponseSchema = z
  .object({
    project: z
      .object({
        id: z.string(),
        history_retention_seconds: z.number().int().nonnegative(),
      })
      .passthrough(),
  })
  .passthrough();
const snapshotSchema = z
  .object({
    id: z.string(),
    created_at: z.string().datetime({ offset: true }),
    timestamp: z.string().datetime({ offset: true }).optional(),
    source_branch_id: z.string().optional(),
    expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .passthrough();
const snapshotsResponseSchema = z
  .object({
    snapshots: z.array(snapshotSchema),
  })
  .passthrough();
const branchResponseSchema = z
  .object({
    branch: z.object({ id: z.string(), project_id: z.string() }).passthrough(),
  })
  .passthrough();
const endpointResponseSchema = z
  .object({
    endpoint: z
      .object({ id: z.string(), project_id: z.string(), branch_id: z.string() })
      .passthrough(),
  })
  .passthrough();
const databaseResponseSchema = z
  .object({
    database: z
      .object({ name: z.string(), branch_id: z.string(), owner_name: z.string() })
      .passthrough(),
  })
  .passthrough();
const roleResponseSchema = z
  .object({ role: z.object({ name: z.string(), branch_id: z.string() }).passthrough() })
  .passthrough();
const runSchema = z
  .object({
    id: z.number().int().positive(),
    run_attempt: z.number().int().positive(),
    name: z.literal('actuals-isolated-restore-proof'),
    path: z.literal(RESTORE_WORKFLOW),
    head_sha: z.string(),
    status: z.literal('completed'),
    conclusion: z.literal('success'),
    updated_at: z.string().datetime({ offset: true }),
    repository: z.object({ full_name: z.string() }).passthrough(),
  })
  .passthrough();
const artifactSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    expired: z.literal(false),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    created_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
    size_in_bytes: z.number().int().positive().max(MAX_ARTIFACT_BYTES),
    workflow_run: z.object({ id: z.number().int().positive(), head_sha: z.string() }).passthrough(),
  })
  .passthrough();

function missing(predicate: Observation['predicate'], code: string): Observation {
  return { predicate, status: 'missing_live_evidence', code, evidenceRefs: [] };
}

function engineering(
  predicate: Observation['predicate'],
  code: string,
  evidenceRefs: Observation['evidenceRefs']
): Observation {
  return { predicate, status: 'missing_collector_engineering', code, evidenceRefs };
}

function failed(predicate: Observation['predicate'], code: string): Observation {
  return { predicate, status: 'failed', code, evidenceRefs: [] };
}

async function boundedBytes(response: Response, limit: number): Promise<Uint8Array> {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    throw new Error('response exceeds byte limit');
  }
  if (!response.body) throw new Error('response body unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch {
      throw new MissingLiveEvidence();
    }
    const { done, value } = result;
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error('response exceeds byte limit');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function request(
  fetchImpl: Fetch,
  url: URL,
  headers: Record<string, string>,
  redirect: RequestRedirect = 'error'
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers,
      redirect,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MissingLiveEvidence();
  }
  return response;
}

async function jsonGet(
  fetchImpl: Fetch,
  url: URL,
  headers: Record<string, string>
): Promise<unknown> {
  const response = await request(fetchImpl, url, headers);
  if (!response.ok) throw new MissingLiveEvidence();
  try {
    return JSON.parse(new TextDecoder().decode(await boundedBytes(response, MAX_METADATA_BYTES)));
  } catch (error) {
    if (error instanceof MissingLiveEvidence) throw error;
    throw new Error('metadata response invalid');
  }
}

function neonUrl(resource: string): URL {
  const url = new URL(`https://console.neon.tech/api/v2${resource}`);
  if (url.origin !== 'https://console.neon.tech' || !url.pathname.startsWith('/api/v2/projects/')) {
    throw new Error('provider resource invalid');
  }
  return url;
}

function githubUrl(repository: string, resource: string): URL {
  const url = new URL(`https://api.github.com/repos/${repository}${resource}`);
  if (
    url.origin !== 'https://api.github.com' ||
    !url.pathname.startsWith(`/repos/${repository}/`) ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== ''
  ) {
    throw new Error('GitHub resource invalid');
  }
  return url;
}

async function exactSnapshot(
  fetchImpl: Fetch,
  projectId: string,
  snapshotId: string,
  headers: Record<string, string>
) {
  const response = snapshotsResponseSchema.parse(
    await jsonGet(fetchImpl, neonUrl(`/projects/${projectId}/snapshots`), headers)
  );
  const matches = response.snapshots.filter((snapshot) => snapshot.id === snapshotId);
  if (matches.length === 0) throw new MissingLiveEvidence();
  if (matches.length !== 1) throw new Error('snapshot identity duplicated');
  return matches[0]!;
}

async function artifactBytes(
  fetchImpl: Fetch,
  repository: string,
  artifactId: string,
  githubToken: string
): Promise<Uint8Array> {
  const api = await request(
    fetchImpl,
    githubUrl(repository, `/actions/artifacts/${artifactId}/zip`),
    { Accept: 'application/vnd.github+json', Authorization: `Bearer ${githubToken}` },
    'manual'
  );
  if (api.status !== 302) throw new MissingLiveEvidence();
  const location = api.headers.get('location');
  if (!location) throw new MissingLiveEvidence();
  const signed = new URL(location);
  if (
    signed.protocol !== 'https:' ||
    !SIGNED_STORAGE_HOST.test(signed.hostname) ||
    signed.port !== '' ||
    signed.username !== '' ||
    signed.password !== ''
  ) {
    throw new Error('artifact redirect invalid');
  }
  const response = await request(fetchImpl, signed, {}, 'error');
  if (!response.ok || response.status >= 300) throw new MissingLiveEvidence();
  return boundedBytes(response, MAX_ARTIFACT_BYTES);
}

export async function collectActualsRecoveryEvidence({
  binding,
  credentials,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}: {
  binding: RecoveryBinding;
  credentials: { githubToken: string; neonApiKey: string };
  fetchImpl?: Fetch;
  now?: () => number;
}): Promise<Observation[]> {
  const freshness: Observation = {
    predicate: 'restore-freshness-window-definition',
    status: 'verified',
    code: 'SUCCESSFUL_ISOLATED_RESTORE_WITHIN_PRECEDING_72_HOURS_REQUIRED',
    evidenceRefs: [
      {
        source: 'candidate-owner-policy-definition',
        id: 'docs/workflows/PRODUCTION_SCRIPTS.md#actuals-recovery-evidence-requirements',
      },
    ],
  };
  const custody: Observation = {
    predicate: 'custody-role-definitions',
    status: 'unavailable_owner_definition',
    code: 'CUSTODY_POLICY_DEFINED_RETENTION_DURATION_MISSING',
    evidenceRefs: freshness.evidenceRefs,
  };
  const absent = [
    missing('backup-and-pitr-recoverability', 'BACKUP_PITR_LIVE_EVIDENCE_MISSING'),
    freshness,
    missing('isolated-restore-evidence', 'ISOLATED_RESTORE_LIVE_EVIDENCE_MISSING'),
    custody,
    missing('exact-live-digest-and-evidence-custody', 'RESTORE_DIGEST_LIVE_EVIDENCE_MISSING'),
    missing(
      'migration-isolation-containment-and-residue',
      'MIGRATION_ISOLATION_LIVE_EVIDENCE_MISSING'
    ),
  ];
  const recovery = binding.recovery;
  if (
    !recovery?.source ||
    !recovery.restoreTarget ||
    !recovery.proof ||
    !credentials.githubToken ||
    !credentials.neonApiKey
  ) {
    return absent;
  }

  const observations = [...absent];
  const collectedAt = now();
  if (!Number.isFinite(collectedAt)) throw new Error('collector clock invalid');
  const set = (observation: Observation) => {
    const index = observations.findIndex((item) => item.predicate === observation.predicate);
    if (index === -1) {
      throw new Error(`recovery observation predicate missing: ${observation.predicate}`);
    }
    observations[index] = observation;
  };
  const neonHeaders = { Authorization: `Bearer ${credentials.neonApiKey}` };
  const githubHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${credentials.githubToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const project = projectResponseSchema.parse(
      await jsonGet(fetchImpl, neonUrl(`/projects/${binding.provider.projectId}`), neonHeaders)
    ).project;
    const source = await exactSnapshot(
      fetchImpl,
      binding.provider.projectId,
      recovery.source.snapshotId,
      neonHeaders
    );
    const recoveryPoint = Date.parse(recovery.source.recoveryPoint);
    const createdAt = Date.parse(source.created_at);
    const snapshotTime = source.timestamp ? Date.parse(source.timestamp) : Number.NaN;
    const expiresAt = source.expires_at ? Date.parse(source.expires_at) : Number.NaN;
    if (
      project.id !== binding.provider.projectId ||
      source.id !== recovery.source.snapshotId ||
      recovery.source.branchId !== binding.provider.branchId ||
      !source.source_branch_id ||
      source.source_branch_id !== recovery.source.branchId ||
      !Number.isFinite(snapshotTime) ||
      snapshotTime !== recoveryPoint ||
      createdAt > collectedAt ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= collectedAt ||
      recoveryPoint > collectedAt ||
      recoveryPoint < collectedAt - project.history_retention_seconds * 1000
    ) {
      throw new Error('source snapshot binding mismatch');
    }
    set(
      engineering('backup-and-pitr-recoverability', 'BACKUP_PITR_PRODUCER_PROOF_CONTRACT_MISSING', [
        {
          source: 'neon-api',
          id: `${project.id}:snapshot:${source.id}:source:${source.source_branch_id}:point:${source.timestamp}`,
        },
      ])
    );
  } catch (error) {
    set(
      error instanceof MissingLiveEvidence
        ? missing('backup-and-pitr-recoverability', 'BACKUP_PITR_LIVE_EVIDENCE_MISSING')
        : failed('backup-and-pitr-recoverability', 'BACKUP_PITR_EVIDENCE_CONTRADICTS_BINDING')
    );
  }

  let restoreTargetVerified = false;
  try {
    const target = recovery.restoreTarget;
    if (
      target.projectId === binding.provider.projectId &&
      (target.branchId === binding.provider.branchId ||
        target.endpointId === binding.provider.endpointId)
    ) {
      throw new Error('restore target is production target');
    }
    const [branch, endpoint, database, role] = await Promise.all([
      jsonGet(
        fetchImpl,
        neonUrl(`/projects/${target.projectId}/branches/${target.branchId}`),
        neonHeaders
      ).then((value) => branchResponseSchema.parse(value).branch),
      jsonGet(
        fetchImpl,
        neonUrl(`/projects/${target.projectId}/endpoints/${target.endpointId}`),
        neonHeaders
      ).then((value) => endpointResponseSchema.parse(value).endpoint),
      jsonGet(
        fetchImpl,
        neonUrl(
          `/projects/${target.projectId}/branches/${target.branchId}/databases/${target.databaseName}`
        ),
        neonHeaders
      ).then((value) => databaseResponseSchema.parse(value).database),
      jsonGet(
        fetchImpl,
        neonUrl(
          `/projects/${target.projectId}/branches/${target.branchId}/roles/${target.roleName}`
        ),
        neonHeaders
      ).then((value) => roleResponseSchema.parse(value).role),
    ]);
    if (
      branch.id !== target.branchId ||
      branch.project_id !== target.projectId ||
      endpoint.id !== target.endpointId ||
      endpoint.project_id !== target.projectId ||
      endpoint.branch_id !== target.branchId ||
      database.name !== target.databaseName ||
      database.owner_name !== target.roleName ||
      database.branch_id !== target.branchId ||
      role.name !== target.roleName ||
      role.branch_id !== target.branchId
    ) {
      throw new Error('restore target binding mismatch');
    }
    restoreTargetVerified = true;
  } catch (error) {
    set(
      error instanceof MissingLiveEvidence
        ? missing('isolated-restore-evidence', 'ISOLATED_RESTORE_TARGET_LIVE_EVIDENCE_MISSING')
        : failed('isolated-restore-evidence', 'ISOLATED_RESTORE_TARGET_CONTRADICTS_BINDING')
    );
  }

  if (!restoreTargetVerified) return observations;

  try {
    const proof = recovery.proof;
    const run = runSchema.parse(
      await jsonGet(
        fetchImpl,
        githubUrl(binding.repository, `/actions/runs/${proof.runId}`),
        githubHeaders
      )
    );
    const updatedAt = Date.parse(run.updated_at);
    const age = collectedAt - updatedAt;
    if (
      String(run.id) !== proof.runId ||
      run.run_attempt !== proof.runAttempt ||
      run.head_sha !== binding.candidateSha ||
      run.repository.full_name !== binding.repository ||
      age < 0 ||
      age > RESTORE_WINDOW_MS
    ) {
      throw new Error('restore run binding mismatch');
    }
    set(
      engineering('isolated-restore-evidence', 'ISOLATED_RESTORE_PRODUCER_PROOF_CONTRACT_MISSING', [
        {
          source: 'github-api',
          id: `${binding.repository}:workflow:${RESTORE_WORKFLOW}:run:${run.id}:attempt:${run.run_attempt}:sha:${run.head_sha}`,
        },
        {
          source: 'neon-api',
          id: `${recovery.restoreTarget.projectId}:${recovery.restoreTarget.branchId}:${recovery.restoreTarget.endpointId}`,
        },
      ])
    );

    const artifact = artifactSchema.parse(
      await jsonGet(
        fetchImpl,
        githubUrl(binding.repository, `/actions/artifacts/${proof.artifactId}`),
        githubHeaders
      )
    );
    if (
      String(artifact.id) !== proof.artifactId ||
      artifact.name !== proof.artifactName ||
      artifact.digest !== `sha256:${proof.artifactSha256}` ||
      String(artifact.workflow_run.id) !== proof.runId ||
      artifact.workflow_run.head_sha !== binding.candidateSha ||
      Date.parse(artifact.created_at) > collectedAt ||
      Date.parse(artifact.expires_at) <= collectedAt
    ) {
      throw new Error('artifact metadata binding mismatch');
    }
    const bytes = await artifactBytes(
      fetchImpl,
      binding.repository,
      proof.artifactId,
      credentials.githubToken
    );
    if (
      bytes.byteLength !== artifact.size_in_bytes ||
      createHash('sha256').update(bytes).digest('hex') !== proof.artifactSha256
    ) {
      throw new Error('artifact bytes digest mismatch');
    }
    // GitHub artifact metadata binds run ID and source SHA, but does not expose the producing run attempt.
    // Keep the separately observed run attempt in the run reference; artifact admission needs a producer contract.
    const artifactRef = {
      source: 'github-api-and-signed-storage',
      id: `${binding.repository}:run:${proof.runId}:artifact:${proof.artifactId}:sha256:${proof.artifactSha256}`,
    };
    set(
      engineering(
        'exact-live-digest-and-evidence-custody',
        'RESTORE_ARTIFACT_ATTEMPT_BINDING_UNAVAILABLE',
        [artifactRef]
      )
    );
    set(
      engineering(
        'migration-isolation-containment-and-residue',
        'MIGRATION_ISOLATION_ATTEMPT_AND_PRODUCER_BINDING_UNAVAILABLE',
        [
          artifactRef,
          {
            source: 'local-source-binding',
            id: `${binding.mode}:${binding.migration.tag}:${binding.migration.sqlSha256}:${binding.manifest.path}:${binding.manifest.sha256}:${binding.targetFingerprint}`,
          },
        ]
      )
    );
  } catch (error) {
    const status = error instanceof MissingLiveEvidence ? 'missing_live_evidence' : 'failed';
    if (
      observations.find((item) => item.predicate === 'isolated-restore-evidence')?.status ===
      'missing_live_evidence'
    ) {
      set(
        status === 'missing_live_evidence'
          ? missing('isolated-restore-evidence', 'ISOLATED_RESTORE_LIVE_EVIDENCE_MISSING')
          : failed('isolated-restore-evidence', 'ISOLATED_RESTORE_EVIDENCE_CONTRADICTS_BINDING')
      );
    }
    set(
      status === 'missing_live_evidence'
        ? missing('exact-live-digest-and-evidence-custody', 'RESTORE_DIGEST_LIVE_EVIDENCE_MISSING')
        : failed(
            'exact-live-digest-and-evidence-custody',
            'RESTORE_DIGEST_EVIDENCE_CONTRADICTS_BINDING'
          )
    );
    set(
      status === 'missing_live_evidence'
        ? missing(
            'migration-isolation-containment-and-residue',
            'MIGRATION_ISOLATION_LIVE_EVIDENCE_MISSING'
          )
        : failed(
            'migration-isolation-containment-and-residue',
            'MIGRATION_ISOLATION_EVIDENCE_CONTRADICTS_BINDING'
          )
    );
  }

  return observations;
}
