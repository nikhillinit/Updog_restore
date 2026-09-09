import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectActualsRecoveryEvidence } from '../../../scripts/release/actuals-recovery-evidence';
import { ActualsMigrationPreflightInputSchema } from '../../../shared/contracts/schema-reconcile-receipt-v1.contract';

const now = Date.parse('2026-09-09T12:00:00.000Z');
const artifactBytes = new TextEncoder().encode('fixture restore evidence\n');
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
const credentials = { githubToken: 'private-github-token', neonApiKey: 'private-neon-token' };

const binding: Parameters<typeof collectActualsRecoveryEvidence>[0]['binding'] = {
  mode: 'apply-actuals-restatement-0057',
  repository: 'fixture-owner/fixture-repo',
  candidateSha: 'a'.repeat(40),
  provider: {
    projectId: 'project-production',
    branchId: 'branch-production',
    endpointId: 'endpoint-production',
    databaseName: 'updog',
    roleName: 'migration_owner',
  },
  recovery: {
    source: {
      snapshotId: 'snapshot-source',
      branchId: 'branch-production',
      recoveryPoint: '2026-09-08T12:00:00.000Z',
    },
    restoreTarget: {
      projectId: 'project-restore',
      branchId: 'branch-restore',
      endpointId: 'endpoint-restore',
      databaseName: 'updog_restore',
      roleName: 'restore_owner',
    },
    proof: {
      runId: '123',
      runAttempt: 2,
      artifactId: '456',
      artifactName: 'actuals-restore-proof.zip',
      artifactSha256,
    },
  },
  migration: {
    tag: '0057_actuals_restatement_commands',
    idx: 58,
    when: 1788912000000,
    sqlSha256: 'b'.repeat(64),
  },
  manifest: { path: 'shared/schema-manifest.json', sha256: 'c'.repeat(64) },
  targetFingerprint: 'd'.repeat(64),
};

type RouteOverride = (
  url: URL,
  init: RequestInit,
  response: Response
) => Response | Promise<Response>;

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function successfulResponse(url: URL): Response {
  const path = url.pathname;
  if (url.origin === 'https://console.neon.tech') {
    if (path === '/api/v2/projects/project-production') {
      return json({
        project: { id: 'project-production', history_retention_seconds: 30 * 24 * 60 * 60 },
      });
    }
    if (path.endsWith('/snapshots')) {
      return json({
        snapshots: [
          {
            id: 'snapshot-unrelated',
            created_at: '2026-09-08T11:01:00.000Z',
            timestamp: '2026-09-08T11:00:00.000Z',
            source_branch_id: 'branch-other',
            expires_at: '2026-09-10T00:00:00.000Z',
          },
          {
            id: 'snapshot-source',
            created_at: '2026-09-08T12:01:00.000Z',
            timestamp: '2026-09-08T12:00:00.000Z',
            source_branch_id: 'branch-production',
            expires_at: '2026-09-10T00:00:00.000Z',
          },
        ],
      });
    }
    if (path.endsWith('/branches/branch-restore')) {
      return json({
        branch: {
          id: 'branch-restore',
          project_id: 'project-restore',
          parent_id: 'branch-production',
          created_at: '2026-09-08T12:00:00.000Z',
          expires_at: '2026-09-10T00:00:00.000Z',
        },
      });
    }
    if (path.endsWith('/endpoints/endpoint-restore')) {
      return json({
        endpoint: {
          id: 'endpoint-restore',
          project_id: 'project-restore',
          branch_id: 'branch-restore',
        },
      });
    }
    if (path.endsWith('/databases/updog_restore')) {
      return json({
        database: {
          name: 'updog_restore',
          branch_id: 'branch-restore',
          owner_name: 'restore_owner',
        },
      });
    }
    if (path.endsWith('/roles/restore_owner')) {
      return json({ role: { name: 'restore_owner', branch_id: 'branch-restore' } });
    }
  }
  if (url.origin === 'https://api.github.com') {
    if (path.endsWith('/actions/runs/123')) {
      return json({
        id: 123,
        run_attempt: 2,
        name: 'actuals-isolated-restore-proof',
        path: '.github/workflows/actuals-isolated-restore-proof.yml',
        head_sha: binding.candidateSha,
        status: 'completed',
        conclusion: 'success',
        updated_at: '2026-09-08T12:00:00.000Z',
        repository: { full_name: binding.repository },
      });
    }
    if (path.endsWith('/actions/artifacts/456')) {
      return json({
        id: 456,
        name: 'actuals-restore-proof.zip',
        expired: false,
        digest: `sha256:${artifactSha256}`,
        created_at: '2026-09-08T12:01:00.000Z',
        expires_at: '2026-09-16T12:01:00.000Z',
        size_in_bytes: artifactBytes.byteLength,
        workflow_run: { id: 123, head_sha: binding.candidateSha },
      });
    }
    if (path.endsWith('/actions/artifacts/456/zip')) {
      return new Response(null, {
        status: 302,
        headers: {
          location:
            'https://productionresultssa1.blob.core.windows.net/results/proof.zip?sig=fixture',
        },
      });
    }
  }
  if (url.hostname === 'productionresultssa1.blob.core.windows.net') {
    return new Response(artifactBytes, {
      status: 200,
      headers: { 'content-length': String(artifactBytes.byteLength) },
    });
  }
  throw new Error(`unexpected fixture request: ${url}`);
}

function transport(override?: RouteOverride) {
  return vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const response = successfulResponse(url);
    return override ? override(url, init, response) : response;
  });
}

function observation(
  observations: Awaited<ReturnType<typeof collectActualsRecoveryEvidence>>,
  predicate: string
) {
  return observations.find((item) => item.predicate === predicate);
}

afterEach(() => vi.restoreAllMocks());

describe('actuals recovery evidence contract', () => {
  const preflightBase = {
    mode: binding.mode,
    repository: binding.repository,
    candidateSha: binding.candidateSha,
    runId: '999',
    runAttempt: 1,
    databaseUrl: 'postgresql://fixture.invalid/updog',
    provider: binding.provider,
  };

  it.each([
    ['partial recovery references', { source: binding.recovery?.source }],
    ['caller proof booleans', { source: true, restoreTarget: true, proof: true }],
    [
      'malformed locator',
      {
        source: { ...binding.recovery?.source, snapshotId: 'https://attacker.invalid/snapshot' },
        restoreTarget: binding.recovery?.restoreTarget,
        proof: binding.recovery?.proof,
      },
    ],
  ])('rejects %s before collection', (_name, recovery) => {
    expect(
      ActualsMigrationPreflightInputSchema.safeParse({ ...preflightBase, recovery }).success
    ).toBe(false);
  });
});

describe('collectActualsRecoveryEvidence', () => {
  it.each([
    ['missing recovery references', { ...binding, recovery: undefined }, credentials],
    ['missing GitHub credential', binding, { ...credentials, githubToken: '' }],
    ['missing Neon credential', binding, { ...credentials, neonApiKey: '' }],
  ])(
    'keeps live recovery gates nonverified for %s without fetching',
    async (_name, testBinding, testCredentials) => {
      const fetchImpl = transport();
      const observations = await collectActualsRecoveryEvidence({
        binding: testBinding as typeof binding,
        credentials: testCredentials,
        fetchImpl,
        now: () => now,
      });

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            predicate: 'backup-and-pitr-recoverability',
            status: 'missing_live_evidence',
          }),
          expect.objectContaining({
            predicate: 'isolated-restore-evidence',
            status: 'missing_live_evidence',
          }),
          expect.objectContaining({
            predicate: 'exact-live-digest-and-evidence-custody',
            status: 'missing_live_evidence',
          }),
          expect.objectContaining({
            predicate: 'migration-isolation-containment-and-residue',
            status: 'missing_live_evidence',
          }),
          expect.objectContaining({
            predicate: 'custody-role-definitions',
            status: 'unavailable_owner_definition',
          }),
        ])
      );
    }
  );

  it('hashes downloaded bytes and authenticates only fixed API GET requests', async () => {
    const fetchImpl = transport();
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl,
      now: () => now,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(10);
    for (const [rawUrl, init = {}] of fetchImpl.mock.calls) {
      const url = new URL(String(rawUrl));
      expect(init.method).toBe('GET');
      expect(init.signal).toBeDefined();
      if (url.origin === 'https://console.neon.tech') {
        expect(init.redirect).toBe('error');
        expect(init.headers).toEqual({ Authorization: `Bearer ${credentials.neonApiKey}` });
      } else if (url.origin === 'https://api.github.com') {
        expect(init.headers).toMatchObject({ Authorization: `Bearer ${credentials.githubToken}` });
      } else {
        expect(url.hostname).toMatch(/^productionresultssa[0-9]+\.blob\.core\.windows\.net$/);
        expect(init.redirect).toBe('error');
        expect(init.headers).toEqual({});
      }
    }
    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predicate: 'backup-and-pitr-recoverability',
          status: 'missing_collector_engineering',
        }),
        expect.objectContaining({
          predicate: 'isolated-restore-evidence',
          status: 'missing_collector_engineering',
        }),
        expect.objectContaining({
          predicate: 'exact-live-digest-and-evidence-custody',
          status: 'missing_collector_engineering',
        }),
        expect.objectContaining({
          predicate: 'migration-isolation-containment-and-residue',
          status: 'missing_collector_engineering',
        }),
        expect.objectContaining({
          predicate: 'custody-role-definitions',
          status: 'unavailable_owner_definition',
        }),
      ])
    );
    expect(
      observations.every(
        (item) =>
          item.status !== 'verified' || item.predicate === 'restore-freshness-window-definition'
      )
    ).toBe(true);
  });

  it('does not treat matching artifact bytes as proof of the selected run attempt', async () => {
    const fetchImpl = transport((url, _init, response) =>
      url.pathname.endsWith('/actions/artifacts/456')
        ? json({
            id: 456,
            name: 'actuals-restore-proof.zip',
            expired: false,
            digest: `sha256:${artifactSha256}`,
            created_at: '2026-09-07T12:01:00.000Z',
            expires_at: '2026-09-16T12:01:00.000Z',
            size_in_bytes: artifactBytes.byteLength,
            workflow_run: { id: 123, head_sha: binding.candidateSha },
          })
        : response
    );
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl,
      now: () => now,
    });

    expect(observation(observations, 'isolated-restore-evidence')).toMatchObject({
      status: 'missing_collector_engineering',
      code: 'ISOLATED_RESTORE_PRODUCER_PROOF_CONTRACT_MISSING',
    });
    expect(observation(observations, 'exact-live-digest-and-evidence-custody')).toMatchObject({
      status: 'missing_collector_engineering',
      code: 'RESTORE_ARTIFACT_ATTEMPT_BINDING_UNAVAILABLE',
    });
    expect(observation(observations, 'migration-isolation-containment-and-residue')).toMatchObject({
      status: 'missing_collector_engineering',
      code: 'MIGRATION_ISOLATION_ATTEMPT_AND_PRODUCER_BINDING_UNAVAILABLE',
    });
    expect(
      observations.some(
        (item) =>
          item.status === 'verified' && item.predicate !== 'restore-freshness-window-definition'
      )
    ).toBe(false);
  });

  it.each([
    [
      '401 response',
      (url: URL) => (url.pathname.endsWith('/snapshots') ? json({}, 401) : undefined),
    ],
    [
      '404 response',
      (url: URL) => (url.pathname.endsWith('/actions/runs/123') ? json({}, 404) : undefined),
    ],
    [
      'bad JSON',
      (url: URL) =>
        url.pathname.endsWith('/actions/artifacts/456')
          ? new Response('{', { status: 200 })
          : undefined,
    ],
  ])('fails closed on %s', async (_name, alter) => {
    const fetchImpl = transport((url, _init, response) => alter(url) ?? response);
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl,
      now: () => now,
    });

    expect(
      observations.some(
        (item) =>
          item.status === 'verified' && item.predicate !== 'restore-freshness-window-definition'
      )
    ).toBe(false);
    expect(
      observations.some(
        (item) => item.status === 'missing_live_evidence' || item.status === 'failed'
      )
    ).toBe(true);
  });

  it('treats fetch timeout as missing live evidence', async () => {
    const fetchImpl = transport((url, _init, response) => {
      if (url.pathname.endsWith('/snapshots')) throw new DOMException('timeout', 'TimeoutError');
      return response;
    });
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl,
      now: () => now,
    });

    expect(observation(observations, 'backup-and-pitr-recoverability')).toMatchObject({
      status: 'missing_live_evidence',
      code: 'BACKUP_PITR_LIVE_EVIDENCE_MISSING',
    });
  });

  it.each([
    {
      path: '/snapshots',
      predicate: 'backup-and-pitr-recoverability',
      code: 'BACKUP_PITR_LIVE_EVIDENCE_MISSING',
    },
    {
      path: '/proof.zip',
      predicate: 'exact-live-digest-and-evidence-custody',
      code: 'RESTORE_DIGEST_LIVE_EVIDENCE_MISSING',
    },
  ])(
    'treats $path body interruption as missing live evidence',
    async ({ path, predicate, code }) => {
      for (const error of [
        new TypeError('connection reset with private-response-details'),
        new DOMException('private-response-details', 'TimeoutError'),
        new DOMException('private-response-details', 'AbortError'),
      ]) {
        const fetchImpl = transport((url, _init, response) =>
          url.pathname.endsWith(path)
            ? new Response(new ReadableStream({ start: (controller) => controller.error(error) }))
            : response
        );
        const observations = await collectActualsRecoveryEvidence({
          binding,
          credentials,
          fetchImpl,
          now: () => now,
        });

        expect(observation(observations, predicate)).toMatchObject({
          status: 'missing_live_evidence',
          code,
        });
        expect(JSON.stringify(observations)).not.toContain('private-response-details');
        expect(fetchImpl.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
      }
    }
  );

  it.each([
    ['malformed snapshot time', { timestamp: 'not-a-date' }],
    ['malformed expiry time', { expires_at: 'not-a-date' }],
    ['expired snapshot', { expires_at: '2026-09-08T00:00:00.000Z' }],
    ['wrong source identity', { source_branch_id: 'branch-other' }],
  ])('rejects %s', async (_name, snapshotChange) => {
    const fetchImpl = transport((url, _init, response) => {
      if (url.pathname.endsWith('/snapshots')) {
        return json({
          snapshots: [
            {
              id: 'snapshot-source',
              created_at: '2026-09-08T12:01:00.000Z',
              timestamp: '2026-09-08T12:00:00.000Z',
              source_branch_id: 'branch-production',
              expires_at: '2026-09-10T00:00:00.000Z',
              ...snapshotChange,
            },
          ],
        });
      }
      return response;
    });
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl,
      now: () => now,
    });

    expect(observation(observations, 'backup-and-pitr-recoverability')).toMatchObject({
      status: 'failed',
      code: 'BACKUP_PITR_EVIDENCE_CONTRADICTS_BINDING',
    });
  });

  it('rejects duplicate matching snapshot identities', async () => {
    const snapshot = {
      id: 'snapshot-source',
      created_at: '2026-09-08T12:01:00.000Z',
      timestamp: '2026-09-08T12:00:00.000Z',
      source_branch_id: 'branch-production',
      expires_at: '2026-09-10T00:00:00.000Z',
    };
    const fetchImpl = transport((url, _init, response) =>
      url.pathname.endsWith('/snapshots') ? json({ snapshots: [snapshot, snapshot] }) : response
    );
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl,
      now: () => now,
    });

    expect(observation(observations, 'backup-and-pitr-recoverability')).toMatchObject({
      status: 'failed',
      code: 'BACKUP_PITR_EVIDENCE_CONTRADICTS_BINDING',
    });
  });

  it.each([
    ['workflow', { path: '.github/workflows/other.yml' }],
    ['source SHA', { head_sha: 'e'.repeat(40) }],
    ['attempt', { run_attempt: 3 }],
  ])('rejects mismatched restore run %s', async (_name, runChange) => {
    const fetchImpl = transport((url, _init, response) =>
      url.pathname.endsWith('/actions/runs/123')
        ? json({
            id: 123,
            run_attempt: 2,
            name: 'actuals-isolated-restore-proof',
            path: '.github/workflows/actuals-isolated-restore-proof.yml',
            head_sha: binding.candidateSha,
            status: 'completed',
            conclusion: 'success',
            updated_at: '2026-09-08T12:00:00.000Z',
            repository: { full_name: binding.repository },
            ...runChange,
          })
        : response
    );
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl,
      now: () => now,
    });

    expect(observation(observations, 'exact-live-digest-and-evidence-custody')).toMatchObject({
      status: 'failed',
      code: 'RESTORE_DIGEST_EVIDENCE_CONTRADICTS_BINDING',
    });
  });

  it.each([
    ['exactly 72 hours old', '2026-09-06T12:00:00.000Z', 'missing_collector_engineering'],
    ['older than 72 hours', '2026-09-06T11:59:59.999Z', 'failed'],
    ['future completion', '2026-09-09T12:00:00.001Z', 'failed'],
  ])('classifies a restore run %s', async (_name, updatedAt, expectedStatus) => {
    const fetchImpl = transport((url, _init, response) =>
      url.pathname.endsWith('/actions/runs/123')
        ? json({
            id: 123,
            run_attempt: 2,
            name: 'actuals-isolated-restore-proof',
            path: '.github/workflows/actuals-isolated-restore-proof.yml',
            head_sha: binding.candidateSha,
            status: 'completed',
            conclusion: 'success',
            updated_at: updatedAt,
            repository: { full_name: binding.repository },
          })
        : response
    );
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl,
      now: () => now,
    });

    expect(observation(observations, 'isolated-restore-evidence')?.status).toBe(expectedStatus);
  });

  it.each([
    [
      'production branch',
      { projectId: binding.provider.projectId, branchId: binding.provider.branchId },
    ],
    [
      'production endpoint',
      { projectId: binding.provider.projectId, endpointId: binding.provider.endpointId },
    ],
  ])('rejects restore target sharing %s identity', async (_name, targetChange) => {
    const observations = await collectActualsRecoveryEvidence({
      binding: {
        ...binding,
        recovery: {
          ...binding.recovery!,
          restoreTarget: { ...binding.recovery!.restoreTarget!, ...targetChange },
        },
      },
      credentials,
      fetchImpl: transport(),
      now: () => now,
    });

    expect(observation(observations, 'isolated-restore-evidence')).toMatchObject({
      status: 'failed',
      code: 'ISOLATED_RESTORE_TARGET_CONTRADICTS_BINDING',
    });
  });

  it.each([
    [
      'expired artifact',
      (url: URL, response: Response) =>
        url.pathname.endsWith('/actions/artifacts/456')
          ? json({
              id: 456,
              name: 'actuals-restore-proof.zip',
              expired: true,
              digest: `sha256:${artifactSha256}`,
              created_at: '2026-09-08T12:01:00.000Z',
              expires_at: '2026-09-16T12:01:00.000Z',
              size_in_bytes: artifactBytes.byteLength,
              workflow_run: { id: 123, head_sha: binding.candidateSha },
            })
          : response,
    ],
    [
      'wrong metadata digest',
      (url: URL, response: Response) =>
        url.pathname.endsWith('/actions/artifacts/456')
          ? json({
              id: 456,
              name: 'actuals-restore-proof.zip',
              expired: false,
              digest: `sha256:${'f'.repeat(64)}`,
              created_at: '2026-09-08T12:01:00.000Z',
              expires_at: '2026-09-16T12:01:00.000Z',
              size_in_bytes: artifactBytes.byteLength,
              workflow_run: { id: 123, head_sha: binding.candidateSha },
            })
          : response,
    ],
    [
      'wrong downloaded digest',
      (url: URL, response: Response) =>
        url.hostname === 'productionresultssa1.blob.core.windows.net'
          ? new Response('wrong bytes')
          : response,
    ],
    [
      'oversized declared content',
      (url: URL, response: Response) =>
        url.hostname === 'productionresultssa1.blob.core.windows.net'
          ? new Response('x', { headers: { 'content-length': String(50 * 1024 * 1024 + 1) } })
          : response,
    ],
  ])('rejects %s', async (_name, alter) => {
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl: transport((url, _init, response) => alter(url, response)),
      now: () => now,
    });

    expect(observation(observations, 'exact-live-digest-and-evidence-custody')).toMatchObject({
      status: 'failed',
      code: 'RESTORE_DIGEST_EVIDENCE_CONTRADICTS_BINDING',
    });
  });

  it('rejects an untrusted artifact redirect without forwarding credentials', async () => {
    const fetchImpl = transport((url, _init, response) =>
      url.pathname.endsWith('/actions/artifacts/456/zip')
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://attacker.invalid/proof.zip' },
          })
        : response
    );
    const observations = await collectActualsRecoveryEvidence({
      binding,
      credentials,
      fetchImpl,
      now: () => now,
    });

    expect(
      fetchImpl.mock.calls.some(
        ([rawUrl]) => new URL(String(rawUrl)).hostname === 'attacker.invalid'
      )
    ).toBe(false);
    expect(observation(observations, 'exact-live-digest-and-evidence-custody')).toMatchObject({
      status: 'failed',
      code: 'RESTORE_DIGEST_EVIDENCE_CONTRADICTS_BINDING',
    });
  });
});
