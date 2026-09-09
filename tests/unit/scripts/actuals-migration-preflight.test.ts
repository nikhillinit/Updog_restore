import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTUALS_MIGRATION_PREFLIGHT_PREDICATES,
  ActualsMigrationPreflightReportSchema,
  type ActualsMigrationPreflightInput,
} from '../../../shared/contracts/schema-reconcile-receipt-v1.contract';
import {
  ACTUALS_SCHEMA_RUN_NAME,
  collectActualsMigrationPreflight,
  evaluateActualsMigrationAdmission,
  revalidateActualsMigrationBeforeApply,
} from '../../../scripts/release/actuals-migration-preflight';
import { aggregateProtectedBranchEvidence } from '../../../scripts/release/verify-exact-sha-checks.mjs';

const mocks = vi.hoisted(() => ({
  identity: { database: 'updog', user: 'migration_owner', host: '127.0.0.1' },
  connect: vi.fn(),
  end: vi.fn(),
  query: vi.fn(),
  draft: vi.fn(),
  restatement: vi.fn(),
}));
vi.mock('pg', () => ({
  default: {
    Client: class {
      connect = mocks.connect;
      end = mocks.end;
      query = mocks.query;
    },
  },
}));
vi.mock('../../../scripts/run-actuals-draft-journaled-migration.mjs', async (original) => ({
  ...(await original<
    typeof import('../../../scripts/run-actuals-draft-journaled-migration.mjs')
  >()),
  runActualsDraftJournaledMigration: mocks.draft,
}));
vi.mock('../../../scripts/run-actuals-restatement-journaled-migration.mjs', async (original) => ({
  ...(await original<
    typeof import('../../../scripts/run-actuals-restatement-journaled-migration.mjs')
  >()),
  runActualsRestatementJournaledMigration: mocks.restatement,
}));

const input: ActualsMigrationPreflightInput = {
  mode: 'apply-actuals-restatement-0057',
  repository: 'fixture-owner/fixture-repo',
  candidateSha: 'a'.repeat(40),
  runId: '123',
  runAttempt: 1,
  databaseUrl: 'postgresql://migration_owner:private-password@ep-target.neon.tech/updog',
  provider: {
    projectId: 'project-target',
    branchId: 'branch-target',
    endpointId: 'ep-target',
    databaseName: 'updog',
    roleName: 'migration_owner',
  },
};
const inputWithRecovery: ActualsMigrationPreflightInput = {
  ...input,
  recovery: {
    source: {
      snapshotId: 'snapshot-source',
      branchId: input.provider.branchId,
      recoveryPoint: '2026-09-09T06:00:00.000Z',
    },
    restoreTarget: { ...input.provider },
    proof: {
      runId: '456',
      runAttempt: 1,
      artifactId: '789',
      artifactName: 'actuals-isolated-restore-proof',
      artifactSha256: 'c'.repeat(64),
    },
  },
};
const credentials = { githubToken: 'private-github-token', neonApiKey: 'private-neon-token' };
const recoveryPolicyRef = {
  source: 'candidate-owner-policy-definition',
  id: 'docs/workflows/PRODUCTION_SCRIPTS.md#actuals-recovery-evidence-requirements',
};
const repository = { id: 1, full_name: input.repository, owner: { id: 7, login: 'fixture-owner' } };
const targetFingerprint = createHash('sha256')
  .update(
    JSON.stringify({
      directHost: 'ep-target.neon.tech',
      port: '5432',
      database: 'updog',
      user: 'migration_owner',
    })
  )
  .digest('hex');
const migration = {
  draft: {
    tag: '0056_actuals_draft_revisions',
    idx: 57,
    when: 1788825600000,
    hash: '94fd8537ee7afbee9f0d5b19bfa9cfd78263096c89ee4ef0ae015ad268ed04cf',
  },
  restatement: {
    tag: '0057_actuals_restatement_commands',
    idx: 58,
    when: 1788912000000,
    hash: '3f424f67d5a7fe87c6e8eeb2b25d129c0278aa18596c6a3bf9b5ef91df46d577',
  },
};
function runnerResult(kind: 'draft' | 'restatement') {
  return {
    migration: migration[kind],
    targetFingerprint,
    preState: {
      baselineKind: 'canonical',
      state: 'ready',
      appliedTargetCount: 0,
      lastAppliedTag:
        kind === 'draft'
          ? '0055_current_forecast_recompute_commands'
          : '0056_actuals_draft_revisions',
    },
    postState: 'ready',
    applied: false,
  };
}
function ciEvidence() {
  return {
    repository: input.repository,
    candidateSha: input.candidateSha,
    protection: {
      required_status_checks: {
        contexts: ['CI Gate Status'],
        checks: [{ context: 'CI Gate Status', app_id: 15368 }],
      },
    },
    checkRuns: [
      {
        id: 20,
        name: 'CI Gate Status',
        head_sha: input.candidateSha,
        app: { id: 15368 },
        details_url: `https://github.com/${input.repository}/actions/runs/100/job/101`,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-08T00:00:00.000Z',
      },
    ],
    workflows: [{ id: 10, path: '.github/workflows/ci-unified.yml', state: 'active' }],
    workflowRuns: [
      {
        id: 100,
        head_sha: input.candidateSha,
        repository,
        workflow_id: 10,
        path: '.github/workflows/ci-unified.yml',
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        run_attempt: 1,
      },
    ],
    workflowJobs: [
      {
        id: 101,
        run_id: 100,
        name: 'CI Gate Status',
        head_sha: input.candidateSha,
        run_attempt: 1,
        status: 'completed',
        conclusion: 'success',
      },
    ],
  };
}
type ResponseFixture = { body: unknown; status?: number; headers?: Record<string, string> };
type Alter = (url: URL, fixture: ResponseFixture) => ResponseFixture;
function installTransport(mode = input.mode, alter: Alter = (_url, fixture) => fixture) {
  const evidence = ciEvidence();
  const transport = vi.fn(async (rawUrl: string, init: RequestInit) => {
    const url = new URL(rawUrl);
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeDefined();
    let body: unknown;
    if (url.origin === 'https://api.github.com') {
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${credentials.githubToken}` });
      const resource = url.pathname.slice(`/repos/${input.repository}`.length);
      if (resource === '') body = repository;
      else if (resource === '/commits/main') body = { sha: input.candidateSha };
      else if (resource === '/branches/main/protection') body = evidence.protection;
      else if (resource.endsWith('/check-runs')) body = { check_runs: evidence.checkRuns };
      else if (resource === '/actions/workflows') body = { workflows: evidence.workflows };
      else if (resource === '/actions/runs/100') body = evidence.workflowRuns[0];
      else if (resource === '/actions/jobs/101') body = evidence.workflowJobs[0];
      else if (resource === '/actions/runs/123')
        body = {
          id: 123,
          repository,
          actor: repository.owner,
          triggering_actor: repository.owner,
          event: 'workflow_dispatch',
          head_sha: input.candidateSha,
          head_branch: 'main',
          path: '.github/workflows/prod-schema-reconcile.yml',
          run_attempt: 1,
          display_title: `actuals-schema:${mode}:${input.candidateSha}`,
          status: 'in_progress',
        };
      else if (resource.startsWith('/contents/')) {
        expect(url.searchParams.get('ref')).toBe(input.candidateSha);
        body = {
          type: 'file',
          encoding: 'base64',
          content: (await readFile(resource.slice('/contents/'.length))).toString('base64'),
        };
      } else throw new Error(`Unexpected GitHub fixture path ${resource}`);
    } else {
      expect(url.origin).toBe('https://console.neon.tech');
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${credentials.neonApiKey}` });
      if (url.pathname === '/api/v2/projects/project-target')
        body = { project: { id: 'project-target' } };
      else if (url.pathname.endsWith('/branches/branch-target'))
        body = { branch: { id: 'branch-target', project_id: 'project-target' } };
      else if (url.pathname.endsWith('/endpoints/ep-target'))
        body = {
          endpoint: {
            id: 'ep-target',
            project_id: 'project-target',
            branch_id: 'branch-target',
            type: 'read_write',
            host: 'ep-target.neon.tech',
            disabled: false,
            current_state: 'active',
          },
        };
      else if (url.pathname.endsWith('/databases/updog'))
        body = {
          database: { branch_id: 'branch-target', name: 'updog', owner_name: 'migration_owner' },
        };
      else throw new Error(`Unexpected Neon fixture path ${url.pathname}`);
    }
    const changed = alter(url, { body });
    return new Response(JSON.stringify(changed.body), {
      status: changed.status ?? 200,
      headers: changed.headers,
    });
  });
  vi.stubGlobal('fetch', transport);
  return transport;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity = { database: 'updog', user: 'migration_owner', host: '127.0.0.1' };
  mocks.connect.mockResolvedValue(undefined);
  mocks.end.mockResolvedValue(undefined);
  mocks.query.mockImplementation(async (sql: string) => {
    expect(sql).toContain('SELECT current_database()');
    return { rows: [mocks.identity] };
  });
  mocks.draft.mockResolvedValue(runnerResult('draft'));
  mocks.restatement.mockResolvedValue(runnerResult('restatement'));
});
afterEach(() => vi.unstubAllGlobals());

describe('authenticated available actuals migration verifiers', () => {
  it.each(['apply-actuals-draft-0056', 'apply-actuals-restatement-0057'] as const)(
    'verifies available %s predicates without inventing production admission',
    async (mode) => {
      const transport = installTransport(mode);
      const report = await collectActualsMigrationPreflight({ ...input, mode }, credentials);
      expect(report.observations.slice(0, 3).map((item) => item.status)).toEqual([
        'verified',
        'verified',
        'verified',
      ]);
      expect(report.evaluation).toBe('blocked');
      expect(report.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            predicate: 'backup-and-pitr-recoverability',
            status: 'missing_live_evidence',
          }),
          expect.objectContaining({
            predicate: 'restore-freshness-window-definition',
            status: 'verified',
            code: 'SUCCESSFUL_ISOLATED_RESTORE_WITHIN_PRECEDING_72_HOURS_REQUIRED',
            evidenceRefs: [recoveryPolicyRef],
          }),
          expect.objectContaining({
            predicate: 'custody-role-definitions',
            status: 'unavailable_owner_definition',
            code: 'CUSTODY_POLICY_DEFINED_RETENTION_DURATION_MISSING',
            evidenceRefs: [recoveryPolicyRef],
          }),
          expect.objectContaining({
            predicate: 'isolated-restore-evidence',
            status: 'missing_live_evidence',
            evidenceRefs: [],
          }),
          expect.objectContaining({
            predicate: 'exact-live-digest-and-evidence-custody',
            status: 'missing_live_evidence',
            evidenceRefs: [],
          }),
          expect.objectContaining({
            predicate: 'final-runtime-admission',
            status: 'missing_collector_engineering',
          }),
        ])
      );
      expect(report.binding.targetFingerprint).toBe(targetFingerprint);
      expect(ActualsMigrationPreflightReportSchema.safeParse(report).success).toBe(true);
      expect(JSON.stringify(report)).not.toMatch(
        /private-password|private-github-token|private-neon-token|databaseUrl|postgresql:/
      );
      expect(mode.endsWith('0056') ? mocks.draft : mocks.restatement).toHaveBeenCalledWith(
        expect.objectContaining({ apply: false })
      );
      expect(transport).toHaveBeenCalled();
    }
  );

  it('references the supplied recovery window and custody duties without treating policy as live evidence', async () => {
    installTransport();
    const report = await collectActualsMigrationPreflight(input, credentials);
    const policyPath = recoveryPolicyRef.id.split('#')[0]!;
    const document = await readFile(new URL(`../../../${policyPath}`, import.meta.url), 'utf8');
    const policy = document
      .split('### Actuals recovery evidence requirements')[1]!
      .split('\n### ')[0]!
      .replace(/[`*]/g, '')
      .replace(/\s+/g, ' ');
    for (const requirement of [
      'successful isolated restore must have completed during the preceding 72 hours',
      'actuals-isolated-restore-proof',
      'GitHub Actions',
      'protected from modification',
      'retained for the defined period',
      'repository owner is accountable for custody',
      'repository administrators',
      'retrieves the artifact by ID',
      'identity and integrity',
    ]) {
      expect(policy).toContain(requirement);
    }
    expect(policy).toMatch(/production workflow[^.]*independent[^.]*artifact by ID/);
    expect(policy).toMatch(/verif[^.]*digest[^.]*bindings/);
    expect(policy).toContain(
      'retention duration and exact execution, artifact, restore, and verification bindings remain unresolved'
    );
    expect(policy).toContain('does not prove successful recovery or authorize a production action');
    expect(
      report.observations
        .filter((item) =>
          item.evidenceRefs.some((reference) => reference.source === recoveryPolicyRef.source)
        )
        .map((item) => item.predicate)
    ).toEqual(['restore-freshness-window-definition', 'custody-role-definitions']);
    expect(report.evaluation).toBe('blocked');
    expect(
      report.observations.find((item) => item.predicate === 'custody-role-definitions')?.status
    ).toBe('unavailable_owner_definition');
    expect(mocks.restatement).toHaveBeenCalledWith(
      expect.objectContaining({ apply: false, localTestCapability: undefined })
    );
  });

  it.each([
    ['source head', '/commits/main', { sha: 'b'.repeat(40) }, 'current-protected-source-and-ci'],
    [
      'protection app',
      '/branches/main/protection',
      { required_status_checks: { checks: [{ context: 'CI Gate Status', app_id: 999 }] } },
      'current-protected-source-and-ci',
    ],
    [
      'owner dispatch',
      '/actions/runs/123',
      { actor: { id: 99, login: 'other' } },
      'exact-body-migration-authority',
    ],
    [
      'triggering actor',
      '/actions/runs/123',
      { triggering_actor: { id: 99, login: 'other' } },
      'exact-body-migration-authority',
    ],
    [
      'dispatch mode',
      '/actions/runs/123',
      { display_title: `actuals-schema:apply-actuals-draft-0056:${input.candidateSha}` },
      'exact-body-migration-authority',
    ],
    [
      'historical run',
      '/actions/runs/123',
      { status: 'completed' },
      'exact-body-migration-authority',
    ],
    ['run attempt', '/actions/runs/123', { run_attempt: 2 }, 'exact-body-migration-authority'],
    [
      'provider branch',
      '/branches/branch-target',
      { branch: { id: 'wrong', project_id: 'project-target' } },
      'protected-provider-and-database-identity',
    ],
    [
      'provider endpoint',
      '/endpoints/ep-target',
      {
        endpoint: {
          id: 'wrong',
          project_id: 'project-target',
          branch_id: 'branch-target',
          type: 'read_write',
          host: 'ep-target.neon.tech',
          current_state: 'active',
        },
      },
      'protected-provider-and-database-identity',
    ],
  ])('reports %s mismatch as failed', async (_label, suffix, change, predicate) => {
    installTransport(input.mode, (url, fixture) =>
      url.pathname.endsWith(suffix as string)
        ? { body: { ...(fixture.body as object), ...(change as object) } }
        : fixture
    );
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations.find((item) => item.predicate === predicate)?.status).toBe('failed');
    expect(report.evaluation).toBe('blocked');
  });

  it('refuses authenticated source bytes different from local pinned migration', async () => {
    installTransport(input.mode, (url, fixture) =>
      url.pathname.endsWith('0057_actuals_restatement_commands.sql')
        ? {
            body: {
              type: 'file',
              encoding: 'base64',
              content: Buffer.from('SELECT 1;').toString('base64'),
            },
          }
        : fixture
    );
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations[0]?.status).toBe('failed');
  });

  it('refuses a workflow body without the fixed mode binding', async () => {
    installTransport(input.mode, (url, fixture) =>
      url.pathname.endsWith('/contents/.github/workflows/prod-schema-reconcile.yml')
        ? {
            body: {
              type: 'file',
              encoding: 'base64',
              content: Buffer.from(`run-name: ${ACTUALS_SCHEMA_RUN_NAME}-other`).toString('base64'),
            },
          }
        : fixture
    );
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations[1]?.status).toBe('failed');
  });

  it.each(['github', 'neon'])(
    'classifies unavailable authenticated %s transport separately',
    async (provider) => {
      installTransport(input.mode, (url, fixture) =>
        url.hostname.includes(provider === 'github' ? 'github' : 'neon')
          ? { ...fixture, status: 403 }
          : fixture
      );
      const report = await collectActualsMigrationPreflight(input, credentials);
      expect(report.observations[provider === 'github' ? 0 : 2]?.status).toBe(
        'missing_live_evidence'
      );
    }
  );

  it('refuses mismatched live database identity before the bounded schema read', async () => {
    installTransport();
    mocks.identity.database = 'wrong_database';
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations[2]?.status).toBe('failed');
    expect(mocks.restatement).not.toHaveBeenCalled();
  });

  it('classifies database connection unavailability without leaking native error text', async () => {
    installTransport();
    mocks.connect.mockRejectedValue(new Error(input.databaseUrl));
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations[2]?.status).toBe('missing_live_evidence');
    expect(JSON.stringify(report)).not.toContain('private-password');
  });

  it('refuses bounded-runner target or mutation mismatch', async () => {
    installTransport();
    mocks.restatement.mockResolvedValue({
      ...runnerResult('restatement'),
      applied: true,
      postState: 'complete',
    });
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations[2]?.status).toBe('failed');
  });

  it.each(['identity', 'bounded-state'] as const)(
    'classifies %s database transport loss as unavailable',
    async (stage) => {
      installTransport();
      const failure = Object.assign(new Error(input.databaseUrl), { code: 'ECONNRESET' });
      (stage === 'identity' ? mocks.query : mocks.restatement).mockRejectedValue(failure);
      const report = await collectActualsMigrationPreflight(input, credentials);
      expect(report.observations[2]?.status).toBe('missing_live_evidence');
      expect(JSON.stringify(report)).not.toContain('private-password');
    }
  );

  it('classifies the pinned database client read timeout as unavailable', async () => {
    installTransport();
    mocks.query.mockRejectedValue(new Error('Query read timeout'));
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations[2]?.status).toBe('missing_live_evidence');
  });

  it('collects trusted CI from a later authenticated page', async () => {
    const transport = installTransport(input.mode, (url, fixture) =>
      url.pathname.endsWith('/check-runs') && !url.searchParams.has('page')
        ? { body: { check_runs: [] }, headers: { link: `<${url.href}&page=2>; rel="next"` } }
        : fixture
    );
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations[0]?.status).toBe('verified');
    expect(
      transport.mock.calls.some(([url]) => new URL(url).searchParams.get('page') === '2')
    ).toBe(true);
  });

  it.each([
    'https://untrusted.invalid/page',
    `https://api.github.com/repos/${input.repository}/actions/workflows?page=2`,
  ])('refuses changed pagination target %s before following it', async (next) => {
    const transport = installTransport(input.mode, (url, fixture) =>
      url.pathname.endsWith('/check-runs')
        ? { ...fixture, headers: { link: `<${next}>; rel="next"` } }
        : fixture
    );
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations[0]?.status).toBe('failed');
    expect(transport.mock.calls.some(([url]) => url === next)).toBe(false);
  });

  it('refuses protected-main drift during authenticated collection', async () => {
    let mainReads = 0;
    installTransport(input.mode, (url, fixture) => {
      if (!url.pathname.endsWith('/commits/main') || ++mainReads === 1) return fixture;
      return { body: { sha: 'b'.repeat(40) } };
    });
    const report = await collectActualsMigrationPreflight(input, credentials);
    expect(report.observations[0]?.status).toBe('failed');
    expect(report.evaluation).toBe('blocked');
  });

  it('rejects caller proof flags at the input boundary', async () => {
    const transport = installTransport();
    await expect(
      collectActualsMigrationPreflight(
        { ...input, ownerApproved: true } as ActualsMigrationPreflightInput,
        credentials
      )
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('immediate actuals pre-apply revalidation', () => {
  async function priorReport(mode = input.mode) {
    installTransport(mode);
    const report = await collectActualsMigrationPreflight({ ...input, mode }, credentials);
    vi.clearAllMocks();
    return report;
  }

  it.each(['apply-actuals-draft-0056', 'apply-actuals-restatement-0057'] as const)(
    'freshly checks %s in order and stops at the unresolved recovery gate',
    async (mode) => {
      const prior = await priorReport(mode);
      const transport = installTransport(mode);
      await expect(
        revalidateActualsMigrationBeforeApply(
          JSON.parse(JSON.stringify(prior)),
          { ...input, mode },
          credentials
        )
      ).rejects.toMatchObject({
        stage: 'recovery-and-admission',
        report: {
          binding: prior.binding,
          evaluation: 'blocked',
          observations: expect.arrayContaining([
            expect.objectContaining({
              predicate: 'backup-and-pitr-recoverability',
              status: 'missing_live_evidence',
            }),
            expect.objectContaining({
              predicate: 'restore-freshness-window-definition',
              status: 'verified',
              code: 'SUCCESSFUL_ISOLATED_RESTORE_WITHIN_PRECEDING_72_HOURS_REQUIRED',
              evidenceRefs: [recoveryPolicyRef],
            }),
            expect.objectContaining({
              predicate: 'custody-role-definitions',
              status: 'unavailable_owner_definition',
              code: 'CUSTODY_POLICY_DEFINED_RETENTION_DURATION_MISSING',
              evidenceRefs: [recoveryPolicyRef],
            }),
            expect.objectContaining({
              predicate: 'isolated-restore-evidence',
              status: 'missing_live_evidence',
              evidenceRefs: [],
            }),
            expect.objectContaining({
              predicate: 'exact-live-digest-and-evidence-custody',
              status: 'missing_live_evidence',
              evidenceRefs: [],
            }),
          ]),
        },
      });
      const urls = transport.mock.calls.map(([url]) => new URL(url));
      expect(urls[0]?.pathname).toContain('/commits/main');
      const dispatchIndex = urls.findIndex((url) => url.pathname.endsWith('/actions/runs/123'));
      const targetIndex = urls.findIndex((url) => url.hostname === 'console.neon.tech');
      expect(dispatchIndex).toBeGreaterThan(0);
      expect(targetIndex).toBeGreaterThan(dispatchIndex);
      const selected = mode.endsWith('0056') ? mocks.draft : mocks.restatement;
      const other = mode.endsWith('0056') ? mocks.restatement : mocks.draft;
      expect(selected).toHaveBeenCalledExactlyOnceWith({
        connectionString: input.databaseUrl,
        apply: false,
        localTestCapability: undefined,
        stdout: expect.any(Object),
      });
      expect(other).not.toHaveBeenCalled();
    }
  );

  it('round-trips persisted recovery selectors before fresh recovery refusal', async () => {
    installTransport();
    const prior = await collectActualsMigrationPreflight(inputWithRecovery, credentials);
    vi.clearAllMocks();
    installTransport();

    await expect(
      revalidateActualsMigrationBeforeApply(
        JSON.parse(JSON.stringify(prior)),
        inputWithRecovery,
        credentials
      )
    ).rejects.toMatchObject({
      stage: 'recovery-and-admission',
      report: {
        binding: prior.binding,
        observations: expect.arrayContaining([
          expect.objectContaining({
            predicate: 'backup-and-pitr-recoverability',
            status: 'failed',
          }),
          expect.objectContaining({
            predicate: 'isolated-restore-evidence',
            status: 'failed',
          }),
        ]),
      },
    });
  });

  it.each([
    ['mode', { mode: 'apply-actuals-draft-0056' }],
    ['source', { candidateSha: 'b'.repeat(40) }],
    ['repository', { repository: 'other/repository' }],
    ['run', { runId: '124' }],
    ['project', { provider: { ...input.provider, projectId: 'other-project' } }],
    ['branch', { provider: { ...input.provider, branchId: 'other-branch' } }],
    ['endpoint', { provider: { ...input.provider, endpointId: 'other-endpoint' } }],
    ['database', { provider: { ...input.provider, databaseName: 'other_database' } }],
    ['role', { provider: { ...input.provider, roleName: 'other_role' } }],
    ['connection target', { databaseUrl: input.databaseUrl.replace('ep-target', 'ep-other') }],
  ])(
    'refuses changed %s binding before collecting or reaching a runner',
    async (_label, change) => {
      const prior = await priorReport();
      const transport = installTransport();
      await expect(
        revalidateActualsMigrationBeforeApply(
          prior,
          { ...input, ...(change as object) },
          credentials
        )
      ).rejects.toMatchObject({ stage: 'binding' });
      expect(transport).not.toHaveBeenCalled();
      expect(mocks.draft).not.toHaveBeenCalled();
      expect(mocks.restatement).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['source', '/commits/main', { sha: 'b'.repeat(40) }, 'source'],
    [
      'mode',
      '/actions/runs/123',
      { display_title: `actuals-schema:apply-actuals-draft-0056:${input.candidateSha}` },
      'authority',
    ],
    ['run', '/actions/runs/123', { id: 124 }, 'authority'],
    ['attempt', '/actions/runs/123', { run_attempt: 2 }, 'authority'],
    [
      'target',
      '/branches/branch-target',
      { branch: { id: 'other-branch', project_id: 'project-target' } },
      'target',
    ],
  ])(
    'refuses authenticated %s drift before mutation and later stages',
    async (_label, suffix, change, stage) => {
      const prior = await priorReport();
      const transport = installTransport(input.mode, (url, fixture) =>
        url.pathname.endsWith(suffix as string)
          ? { body: { ...(fixture.body as object), ...(change as object) } }
          : fixture
      );
      await expect(
        revalidateActualsMigrationBeforeApply(prior, input, credentials)
      ).rejects.toMatchObject({ stage });
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.draft).not.toHaveBeenCalled();
      expect(mocks.restatement).not.toHaveBeenCalled();
      if (stage !== 'target') {
        expect(
          transport.mock.calls.some(([url]) => new URL(url).hostname === 'console.neon.tech')
        ).toBe(false);
      }
      if (stage === 'source') {
        expect(
          transport.mock.calls.some(([url]) => new URL(url).pathname.endsWith('/actions/runs/123'))
        ).toBe(false);
      }
    }
  );

  it('refuses changed live database identity before the bounded schema reader', async () => {
    const prior = await priorReport();
    installTransport();
    mocks.identity.database = 'other_database';
    await expect(
      revalidateActualsMigrationBeforeApply(prior, input, credentials)
    ).rejects.toMatchObject({ stage: 'target' });
    expect(mocks.query).toHaveBeenCalled();
    expect(mocks.restatement).not.toHaveBeenCalled();
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it('refuses copied source identity fields before transport', async () => {
    const prior = await priorReport();
    const transport = installTransport();
    await expect(
      revalidateActualsMigrationBeforeApply(
        {
          ...prior,
          binding: {
            ...prior.binding,
            migration: { ...prior.binding.migration, sqlSha256: 'b'.repeat(64) },
          },
        },
        input,
        credentials
      )
    ).rejects.toMatchObject({ stage: 'binding' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('never promotes caller JSON pass or verified observations into apply authority', async () => {
    const prior = await priorReport();
    installTransport();
    const claimed = {
      ...prior,
      evaluation: 'pass',
      observations: prior.observations.map((observation) => ({
        ...observation,
        status: 'verified',
        code: 'VERIFIED',
        evidenceRefs: [{ source: 'caller', id: 'claimed-authority' }],
      })),
    };
    await expect(
      revalidateActualsMigrationBeforeApply(claimed, input, credentials)
    ).rejects.toMatchObject({ stage: 'recovery-and-admission', report: { evaluation: 'blocked' } });
    expect(mocks.restatement.mock.calls.every(([options]) => options.apply === false)).toBe(true);
    expect(mocks.draft).not.toHaveBeenCalled();
  });
});

describe('pure non-authorizing protected-branch and admission evaluation', () => {
  it('requires only the exact live app-bound CI Gate Status contract', () => {
    expect(aggregateProtectedBranchEvidence(ciEvidence()).workflows).toHaveLength(1);
  });
  it('refuses latest failed trusted CI attempt', () => {
    const evidence = ciEvidence();
    evidence.checkRuns[0]!.conclusion = 'failure';
    expect(() => aggregateProtectedBranchEvidence(evidence)).toThrow(/not terminal success/);
  });
  it('has a reachable pass evaluation without producing a runtime handle', () => {
    const observations = ACTUALS_MIGRATION_PREFLIGHT_PREDICATES.map((predicate) => ({
      predicate,
      status: 'verified',
      code: 'VERIFIED',
      evidenceRefs: [{ source: 'authenticated-fixture', id: predicate }],
    }));
    expect(evaluateActualsMigrationAdmission(observations)).toBe('pass');
    expect(evaluateActualsMigrationAdmission(observations.slice(1))).toBe('blocked');
    expect(evaluateActualsMigrationAdmission([...observations.slice(1), observations[1]])).toBe(
      'blocked'
    );
    expect(
      evaluateActualsMigrationAdmission(observations.map((item) => ({ ...item, evidenceRefs: [] })))
    ).toBe('blocked');
    expect(evaluateActualsMigrationAdmission([{ ownerApproved: true }])).toBe('blocked');
  });
});
