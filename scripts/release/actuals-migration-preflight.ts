import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import YAML from 'yaml';
import { z } from 'zod';
import {
  ACTUALS_MIGRATION_PREFLIGHT_PREDICATES,
  ActualsDraftMigrationResultV1Schema,
  ActualsRestatementMigrationResultV1Schema,
  ActualsMigrationPreflightInputSchema,
  ActualsMigrationPredicateObservationSchema,
  ActualsMigrationPreflightReportSchema,
  type ActualsMigrationPreflightInput,
  type ActualsMigrationPredicateObservation,
  type ActualsMigrationPreflightReport,
} from '../../shared/contracts/schema-reconcile-receipt-v1.contract';
import { assertDirectDatabaseUrl, readDatabaseIdentity } from '../reconcile-prod-schema.mjs';
import {
  loadActualsDraftMigration,
  runActualsDraftJournaledMigration,
} from '../run-actuals-draft-journaled-migration.mjs';
import {
  ACTUALS_RESTATEMENT_MANIFEST_IDENTITY,
  loadActualsRestatementMigration,
  runActualsRestatementJournaledMigration,
} from '../run-actuals-restatement-journaled-migration.mjs';
import {
  AuthenticatedGithubEvidenceUnavailable,
  collectProtectedBranchEvidence,
  readAuthenticatedGithubJson,
} from './verify-exact-sha-checks.mjs';
import {
  validateConnectionUri,
  validateDatabase,
  validateEndpoint,
} from './rehearse-current-forecast-neon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW = '.github/workflows/prod-schema-reconcile.yml' as const;
export const ACTUALS_SCHEMA_RUN_NAME =
  'actuals-schema:${{ inputs.mode }}:${{ inputs.expected_sha }}';
type Credentials = { githubToken: string; neonApiKey: string };
type Observation = ActualsMigrationPredicateObservation;
type Binding = ActualsMigrationPreflightReport['binding'];
type PreApplyStage = 'binding' | 'source' | 'authority' | 'target' | 'recovery-and-admission';
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const quiet = { write: () => true };
const migrationBindingSchema = ActualsMigrationPreflightReportSchema.shape.binding.shape.migration;
const migrationSourceSchema = migrationBindingSchema
  .omit({ sqlSha256: true })
  .extend({ hash: migrationBindingSchema.shape.sqlSha256 })
  .strip();

export class ActualsMigrationPreApplyRefusal extends Error {
  readonly code = 'ACTUALS_MIGRATION_PRE_APPLY_REFUSED';
  readonly stage: PreApplyStage;
  readonly observation: Observation | undefined;
  readonly report: ActualsMigrationPreflightReport | undefined;

  constructor(
    stage: PreApplyStage,
    evidence: { observation?: Observation; report?: ActualsMigrationPreflightReport } = {}
  ) {
    super(`Actuals migration pre-apply refused at ${stage}`);
    this.name = 'ActualsMigrationPreApplyRefusal';
    this.stage = stage;
    this.observation = evidence.observation;
    this.report = evidence.report;
  }
}

// Candidate policy defines requirements only; it is neither live recovery evidence nor action authority.
const recoveryPolicyRef = {
  source: 'candidate-owner-policy-definition',
  id: 'docs/workflows/PRODUCTION_SCRIPTS.md#actuals-recovery-evidence-requirements',
};
const recoveryAndAdmissionObservations: Observation[] = [
  {
    predicate: 'backup-and-pitr-recoverability',
    status: 'missing_collector_engineering',
    code: 'BACKUP_PITR_COLLECTOR_NOT_IMPLEMENTED',
    evidenceRefs: [],
  },
  {
    predicate: 'restore-freshness-window-definition',
    status: 'verified',
    code: 'SUCCESSFUL_ISOLATED_RESTORE_WITHIN_PRECEDING_72_HOURS_REQUIRED',
    evidenceRefs: [recoveryPolicyRef],
  },
  {
    predicate: 'isolated-restore-evidence',
    status: 'missing_collector_engineering',
    code: 'ISOLATED_RESTORE_COLLECTOR_NOT_IMPLEMENTED',
    evidenceRefs: [],
  },
  {
    predicate: 'custody-role-definitions',
    status: 'unavailable_owner_definition',
    code: 'CUSTODY_POLICY_DEFINED_RETENTION_DURATION_AND_LIVE_RUN_ARTIFACT_BINDINGS_MISSING',
    evidenceRefs: [recoveryPolicyRef],
  },
  {
    predicate: 'exact-live-digest-and-evidence-custody',
    status: 'missing_collector_engineering',
    code: 'RESTORE_DIGEST_CUSTODY_COLLECTOR_NOT_IMPLEMENTED',
    evidenceRefs: [],
  },
  {
    predicate: 'migration-isolation-containment-and-residue',
    status: 'missing_collector_engineering',
    code: 'MIGRATION_ISOLATION_COLLECTOR_NOT_IMPLEMENTED',
    evidenceRefs: [],
  },
  {
    predicate: 'final-runtime-admission',
    status: 'missing_collector_engineering',
    code: 'RUNTIME_ADMISSION_NOT_IMPLEMENTED',
    evidenceRefs: [],
  },
];

// A reachable positive evaluation is useful for contract tests. It is not an apply capability.
export function evaluateActualsMigrationAdmission(observations: unknown): 'pass' | 'blocked' {
  const parsed = z.array(ActualsMigrationPredicateObservationSchema).safeParse(observations);
  if (!parsed.success || parsed.data.length !== ACTUALS_MIGRATION_PREFLIGHT_PREDICATES.length)
    return 'blocked';
  return ACTUALS_MIGRATION_PREFLIGHT_PREDICATES.every((predicate) => {
    const matches = parsed.data.filter((item) => item.predicate === predicate);
    return (
      matches.length === 1 &&
      matches[0]!.status === 'verified' &&
      matches[0]!.evidenceRefs.length > 0
    );
  })
    ? 'pass'
    : 'blocked';
}

async function deriveBinding(input: ActualsMigrationPreflightInput): Promise<Binding> {
  assertDirectDatabaseUrl(input.databaseUrl);
  const restatement = input.mode === 'apply-actuals-restatement-0057';
  const migration = migrationSourceSchema.parse(
    await (restatement ? loadActualsRestatementMigration : loadActualsDraftMigration)({
      migrationsDir: path.join(root, 'migrations'),
    })
  );
  const manifestPath = restatement
    ? ACTUALS_RESTATEMENT_MANIFEST_IDENTITY.path
    : 'scripts/prod-schema-manifests/33-actuals-draft-revisions.json';
  const bytes = await readFile(path.join(root, manifestPath));
  const manifestHash = sha256(bytes);
  if (restatement && manifestHash !== ACTUALS_RESTATEMENT_MANIFEST_IDENTITY.hash)
    throw new Error('0057 manifest source mismatch');
  const endpoint = new URL(input.databaseUrl);
  const { databaseUrl: _databaseUrl, ...publicInput } = input;
  return {
    ...publicInput,
    workflowPath: WORKFLOW,
    migration: {
      tag: migration.tag,
      idx: migration.idx,
      when: migration.when,
      sqlSha256: migration.hash,
    },
    manifest: { path: manifestPath, sha256: manifestHash },
    targetFingerprint: sha256(
      JSON.stringify({
        directHost: endpoint.hostname.toLowerCase(),
        port: endpoint.port || '5432',
        database: input.provider.databaseName,
        user: input.provider.roleName,
      })
    ),
  };
}

const githubContent = z
  .object({ type: z.literal('file'), encoding: z.literal('base64'), content: z.string() })
  .passthrough();
async function githubFile(binding: Binding, githubToken: string, sourcePath: string) {
  const response = await readAuthenticatedGithubJson({
    repository: binding.repository,
    resource: `/contents/${sourcePath}?ref=${binding.candidateSha}`,
    githubToken,
  });
  const body: unknown = response.body;
  return Buffer.from(githubContent.parse(body).content, 'base64');
}

async function collectSource(binding: Binding, credentials: Credentials): Promise<Observation> {
  const result = await collectProtectedBranchEvidence({
    repository: binding.repository,
    candidateSha: binding.candidateSha,
    githubToken: credentials.githubToken,
  });
  for (const sourcePath of [
    `migrations/${binding.migration.tag}.sql`,
    'migrations/meta/_journal.json',
    binding.manifest.path,
  ]) {
    if (
      sha256(await githubFile(binding, credentials.githubToken, sourcePath)) !==
      sha256(await readFile(path.join(root, sourcePath)))
    ) {
      throw new Error('Local migration source differs from authenticated candidate source');
    }
  }
  return {
    predicate: 'current-protected-source-and-ci',
    status: 'verified',
    code: 'VERIFIED',
    evidenceRefs: result.workflows.map(
      (item: { workflowRunId: number; workflowJobId: number; checkRunId: number }) => ({
        source: 'github-api',
        id: `${binding.repository}:run:${item.workflowRunId}:job:${item.workflowJobId}:check:${item.checkRunId}`,
      })
    ),
  };
}

const actorSchema = z
  .object({ id: z.number().int().positive(), login: z.string().min(1) })
  .passthrough();
const repositorySchema = z
  .object({ id: z.number().int().positive(), full_name: z.string(), owner: actorSchema })
  .passthrough();
const runSchema = z
  .object({
    id: z.number().int().positive(),
    repository: repositorySchema,
    actor: actorSchema,
    triggering_actor: actorSchema,
    event: z.literal('workflow_dispatch'),
    head_sha: z.string(),
    head_branch: z.literal('main'),
    path: z.string(),
    run_attempt: z.literal(1),
    display_title: z.string(),
    status: z.literal('in_progress'),
  })
  .passthrough();

async function collectDispatch(binding: Binding, credentials: Credentials): Promise<Observation> {
  const get = async (resource: string): Promise<unknown> =>
    (
      await readAuthenticatedGithubJson({
        repository: binding.repository,
        resource,
        githubToken: credentials.githubToken,
      })
    ).body;
  const repository = repositorySchema.parse(await get(''));
  const run = runSchema.parse(await get(`/actions/runs/${binding.runId}`));
  if (
    String(run.id) !== binding.runId ||
    run.repository.id !== repository.id ||
    run.repository.full_name !== binding.repository ||
    repository.full_name !== binding.repository ||
    run.actor.id !== repository.owner.id ||
    run.triggering_actor.id !== repository.owner.id ||
    run.head_sha !== binding.candidateSha ||
    run.path !== WORKFLOW ||
    run.display_title !== `actuals-schema:${binding.mode}:${binding.candidateSha}`
  ) {
    throw new Error('Authenticated dispatch does not match owner/action/source');
  }
  const source = await githubFile(binding, credentials.githubToken, WORKFLOW);
  const workflow = YAML.parse(source.toString('utf8')) as { 'run-name'?: unknown };
  if (
    workflow['run-name'] !== ACTUALS_SCHEMA_RUN_NAME ||
    sha256(source) !== sha256(await readFile(path.join(root, WORKFLOW)))
  ) {
    throw new Error('Authenticated workflow source does not bind exact action run name');
  }
  const main = z
    .object({ sha: z.string() })
    .passthrough()
    .parse(await get('/commits/main'));
  if (main.sha !== binding.candidateSha) throw new Error('Dispatch source is no longer live main');
  return {
    predicate: 'exact-body-migration-authority',
    status: 'verified',
    code: 'VERIFIED',
    evidenceRefs: [
      {
        source: 'github-api',
        id: `${binding.repository}:dispatch:${binding.runId}:attempt:1:owner:${repository.owner.id}`,
      },
    ],
  };
}

class TargetEvidenceUnavailable extends Error {}
async function neon(resource: string, token: string): Promise<unknown> {
  if (!token) throw new TargetEvidenceUnavailable();
  let response: Response;
  try {
    response = await fetch(`https://console.neon.tech/api/v2${resource}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
  } catch {
    throw new TargetEvidenceUnavailable();
  }
  if (!response.ok) throw new TargetEvidenceUnavailable();
  return response.json();
}

async function collectTarget(
  input: ActualsMigrationPreflightInput,
  binding: Binding,
  credentials: Credentials
): Promise<Observation> {
  const expected = input.provider;
  const rootPath = `/projects/${expected.projectId}`;
  const project = z
    .object({ project: z.object({ id: z.string() }).passthrough() })
    .parse(await neon(rootPath, credentials.neonApiKey));
  const branch = z
    .object({ branch: z.object({ id: z.string(), project_id: z.string() }).passthrough() })
    .parse(await neon(`${rootPath}/branches/${expected.branchId}`, credentials.neonApiKey));
  if (
    project.project.id !== expected.projectId ||
    branch.branch.id !== expected.branchId ||
    branch.branch.project_id !== expected.projectId
  )
    throw new Error('Neon project or branch mismatch');
  const endpoint = z
    .object({ endpoint: z.record(z.unknown()) })
    .parse(await neon(`${rootPath}/endpoints/${expected.endpointId}`, credentials.neonApiKey));
  const verifiedEndpoint = validateEndpoint(endpoint.endpoint, {
    projectId: expected.projectId,
    branchId: expected.branchId,
    identity: 'Production',
    requireReady: true,
  });
  if (verifiedEndpoint.endpointId !== expected.endpointId)
    throw new Error('Neon endpoint ID mismatch');
  const database = z
    .object({ database: z.record(z.unknown()) })
    .parse(
      await neon(
        `${rootPath}/branches/${expected.branchId}/databases/${expected.databaseName}`,
        credentials.neonApiKey
      )
    );
  const role = validateDatabase(database.database, {
    branchId: expected.branchId,
    databaseName: expected.databaseName,
    identity: 'Production',
  });
  if (role !== expected.roleName) throw new Error('Neon database owner mismatch');
  validateConnectionUri(input.databaseUrl, {
    databaseName: expected.databaseName,
    roleName: expected.roleName,
    endpointHost: verifiedEndpoint.host,
    identity: 'Production',
  });
  const client = new pg.Client({
    connectionString: input.databaseUrl,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  try {
    try {
      await client.connect();
    } catch {
      throw new TargetEvidenceUnavailable();
    }
    const identity = await readDatabaseIdentity(client);
    if (identity.database !== expected.databaseName || identity.user !== expected.roleName)
      throw new Error('Live database identity mismatch');
  } finally {
    await client.end();
  }
  const rawResult = await (
    input.mode === 'apply-actuals-draft-0056'
      ? runActualsDraftJournaledMigration
      : runActualsRestatementJournaledMigration
  )({
    connectionString: input.databaseUrl,
    apply: false,
    localTestCapability: undefined,
    stdout: quiet,
  });
  const result = (
    input.mode === 'apply-actuals-draft-0056'
      ? ActualsDraftMigrationResultV1Schema
      : ActualsRestatementMigrationResultV1Schema
  ).parse(rawResult);
  if (result.applied || result.targetFingerprint !== binding.targetFingerprint)
    throw new Error('Bounded migration read-only target mismatch');
  return {
    predicate: 'protected-provider-and-database-identity',
    status: 'verified',
    code: 'VERIFIED',
    evidenceRefs: [
      {
        source: 'neon-api-and-postgres',
        id: `${expected.projectId}:${expected.branchId}:${expected.endpointId}:${binding.targetFingerprint}:${result.preState.state}`,
      },
    ],
  };
}

async function observe(
  predicate: Observation['predicate'],
  collect: () => Promise<Observation>
): Promise<Observation> {
  try {
    return await collect();
  } catch (error) {
    const databaseTransportUnavailable =
      predicate === 'protected-provider-and-database-identity' &&
      error instanceof Error &&
      (error.message === 'Query read timeout' ||
        ('code' in error &&
          ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE'].includes(
            String(error.code)
          )));
    const unavailable =
      error instanceof AuthenticatedGithubEvidenceUnavailable ||
      error instanceof TargetEvidenceUnavailable ||
      databaseTransportUnavailable;
    return {
      predicate,
      status: unavailable ? 'missing_live_evidence' : 'failed',
      code: unavailable
        ? predicate === 'protected-provider-and-database-identity'
          ? 'AUTHENTICATED_TARGET_EVIDENCE_UNAVAILABLE'
          : 'AUTHENTICATED_GITHUB_EVIDENCE_UNAVAILABLE'
        : predicate === 'current-protected-source-and-ci'
          ? 'SOURCE_OR_PROTECTED_CI_MISMATCH'
          : predicate === 'exact-body-migration-authority'
            ? 'DISPATCH_ACTION_SOURCE_MISMATCH'
            : 'PROVIDER_DATABASE_IDENTITY_MISMATCH',
      evidenceRefs: [],
    };
  }
}

function buildPreflightReport(binding: Binding, available: Observation[]) {
  const observations = [
    ...available,
    ...recoveryAndAdmissionObservations.map((item) => ({
      ...item,
      evidenceRefs: item.evidenceRefs.map((reference) => ({ ...reference })),
    })),
  ];
  return ActualsMigrationPreflightReportSchema.parse({
    schemaVersion: 'actuals-migration-preflight/1.0.0',
    binding,
    evaluation: evaluateActualsMigrationAdmission(observations),
    observations,
  });
}

// Production/default transports only. No caller proof JSON, collector ports, or apply handle accepted.
export async function collectActualsMigrationPreflight(
  rawInput: ActualsMigrationPreflightInput,
  credentials: Credentials
): Promise<ActualsMigrationPreflightReport> {
  const input = ActualsMigrationPreflightInputSchema.parse(rawInput);
  const binding = await deriveBinding(input);
  const observations = [
    await observe('current-protected-source-and-ci', () => collectSource(binding, credentials)),
    await observe('exact-body-migration-authority', () => collectDispatch(binding, credentials)),
    await observe('protected-provider-and-database-identity', () =>
      collectTarget(input, binding, credentials)
    ),
  ];
  return buildPreflightReport(binding, observations);
}

// The prior report supplies an identity to compare, never authority. Every available
// predicate is freshly collected in mutation-guard order and stops on its first refusal.
// This function issues no apply capability and cannot waive missing recovery evidence.
export async function revalidateActualsMigrationBeforeApply(
  rawPriorReport: unknown,
  rawInput: ActualsMigrationPreflightInput,
  credentials: Credentials
): Promise<ActualsMigrationPreflightReport> {
  let input: ActualsMigrationPreflightInput;
  let binding: Binding;
  try {
    input = ActualsMigrationPreflightInputSchema.parse(rawInput);
    binding = await deriveBinding(input);
    const prior = ActualsMigrationPreflightReportSchema.parse(rawPriorReport);
    if (!isDeepStrictEqual(prior.binding, binding)) throw new Error('Binding changed');
  } catch {
    throw new ActualsMigrationPreApplyRefusal('binding');
  }
  const observations: Observation[] = [];
  const stages = [
    {
      stage: 'source',
      predicate: 'current-protected-source-and-ci',
      collect: () => collectSource(binding, credentials),
    },
    {
      stage: 'authority',
      predicate: 'exact-body-migration-authority',
      collect: () => collectDispatch(binding, credentials),
    },
    {
      stage: 'target',
      predicate: 'protected-provider-and-database-identity',
      collect: () => collectTarget(input, binding, credentials),
    },
  ] as const;
  for (const { stage, predicate, collect } of stages) {
    const observation = await observe(predicate, collect);
    if (observation.status !== 'verified') {
      throw new ActualsMigrationPreApplyRefusal(stage, { observation });
    }
    observations.push(observation);
  }
  const report = buildPreflightReport(binding, observations);
  if (report.evaluation !== 'pass') {
    throw new ActualsMigrationPreApplyRefusal('recovery-and-admission', { report });
  }
  return report;
}

export function actualsMigrationInputFromEnvironment(
  mode: ActualsMigrationPreflightInput['mode'],
  environment: NodeJS.ProcessEnv
): ActualsMigrationPreflightInput {
  return ActualsMigrationPreflightInputSchema.parse({
    mode,
    repository: environment['GITHUB_REPOSITORY'],
    candidateSha: environment['ACTUALS_PREFLIGHT_SOURCE_SHA'],
    runId: environment['GITHUB_RUN_ID'],
    runAttempt: Number(environment['GITHUB_RUN_ATTEMPT']),
    databaseUrl: environment['PRODUCTION_DATABASE_URL'],
    provider: {
      projectId: environment['ACTUALS_PREFLIGHT_NEON_PROJECT_ID'],
      branchId: environment['ACTUALS_PREFLIGHT_NEON_BRANCH_ID'],
      endpointId: environment['ACTUALS_PREFLIGHT_NEON_ENDPOINT_ID'],
      databaseName: environment['PRODUCTION_DATABASE_NAME'],
      roleName: environment['ACTUALS_PREFLIGHT_DATABASE_ROLE'],
    },
  });
}
