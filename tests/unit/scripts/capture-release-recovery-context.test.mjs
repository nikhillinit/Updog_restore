import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BaselineFragmentPayloadSchema } from '../../../shared/contracts/release-evidence-fragment-v1.contract';
import {
  ROLLBACK_DIFF_ALLOWLIST,
  buildReleaseRecoveryContext,
  captureProviderBaseline,
  captureReleaseRecoveryContext,
  decodeBaselineEvidence,
  verifyBaselineArtifact,
  verifyBaselineBinding,
  verifyBaselineConsumption,
} from '../../../scripts/release/capture-release-recovery-context.mjs';

const BASELINE_MAIN_SHA = 'a'.repeat(40);
const PLANNED_PR_HEAD_SHA = 'b'.repeat(40);
const PLANNED_PR_NUMBER = 1414;
const PLAN_PATH = 'docs/1-plans/release-hardening.plan.md';
const PLAN_SHA256 = 'c'.repeat(64);
const VERCEL_SOURCE_SHA = 'd'.repeat(40);
const RAILWAY_SOURCE_SHA = 'e'.repeat(40);

function captureInput(overrides = {}) {
  return {
    baselineMainSha: BASELINE_MAIN_SHA,
    plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
    plannedPrNumber: PLANNED_PR_NUMBER,
    planPath: PLAN_PATH,
    planSha256: PLAN_SHA256,
    githubRunId: '123456789',
    githubRunAttempt: 2,
    capturedAt: '2026-08-14T00:00:00.000Z',
    expectedIdentity: {
      vercelProjectId: 'vercel-project',
      vercelHostname: 'production.example.com',
      railwayProjectId: 'railway-project',
      railwayEnvironmentId: 'railway-environment',
      railwayServices: {
        'fund-scenario-calc': 'service-fund',
        'capital-call-status': 'service-capital',
      },
    },
    providerIdentity: {
      vercel: {
        projectId: 'vercel-project',
        deploymentId: 'dpl_baseline',
        hostname: 'production.example.com',
        sourceSha: VERCEL_SOURCE_SHA,
      },
      railway: {
        projectId: 'railway-project',
        environmentId: 'railway-environment',
        services: [
          {
            serviceName: 'fund-scenario-calc',
            serviceId: 'service-fund',
            deploymentId: 'deployment-fund',
            sourceSha: RAILWAY_SOURCE_SHA,
          },
          {
            serviceName: 'capital-call-status',
            serviceId: 'service-capital',
            deploymentId: 'deployment-capital',
            sourceSha: RAILWAY_SOURCE_SHA,
          },
        ],
      },
    },
    ...overrides,
  };
}

function providerEnvironment(overrides = {}) {
  return {
    GITHUB_RUN_ID: '123456789',
    GITHUB_RUN_ATTEMPT: '2',
    VERCEL_TOKEN: 'vercel-token-secret',
    VERCEL_ORG_ID: 'vercel-org',
    VERCEL_PROJECT_ID: 'vercel-project',
    VERCEL_PRODUCTION_HOSTNAME: 'production.example.com',
    RAILWAY_TOKEN: 'railway-token-secret',
    RAILWAY_PROJECT_ID: 'railway-project',
    RAILWAY_ENVIRONMENT_ID: 'railway-environment',
    RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID: 'service-fund',
    RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID: 'service-capital',
    ...overrides,
  };
}

function railwayService(serviceName, serviceId) {
  const deployment = {
    id: `deployment-${serviceId}`,
    status: 'SUCCESS',
    deploymentStopped: false,
    meta: { commitHash: RAILWAY_SOURCE_SHA },
    instances: [{ id: `instance-${serviceId}`, status: 'RUNNING' }],
  };
  return {
    serviceId,
    serviceName,
    numReplicas: 1,
    domains: { serviceDomains: [], customDomains: [] },
    latestDeployment: deployment,
    activeDeployments: [deployment],
  };
}

function providerFetch({ deploymentUrl = 'baseline.vercel.app' } = {}) {
  const control = {
    data: {
      environment: {
        serviceInstances: {
          edges: [
            { node: railwayService('fund-scenario-calc', 'service-fund') },
            { node: railwayService('capital-call-status', 'service-capital') },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    },
  };
  return async (url, options) => {
    if (url.includes('api.vercel.com')) {
      expect(options.headers.Authorization).toBe('Bearer vercel-token-secret');
      return {
        ok: true,
        json: async () => ({
          id: 'dpl_baseline',
          url: deploymentUrl,
          readyState: 'READY',
          target: 'production',
          projectId: 'vercel-project',
          aliases: ['production.example.com'],
          meta: { githubCommitSha: VERCEL_SOURCE_SHA },
        }),
      };
    }
    const request = JSON.parse(options.body);
    if (request.query.includes('projectToken')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            projectToken: {
              project: { id: 'railway-project' },
              environment: { id: 'railway-environment' },
            },
          },
        }),
      };
    }
    return { ok: true, json: async () => control };
  };
}

describe('capture-release-recovery-context', () => {
  it('builds the exact sanitized release-recovery-context-v1 payload', { retry: 0 }, () => {
    expect(buildReleaseRecoveryContext(captureInput())).toEqual({
      schemaVersion: 'release-recovery-context-v1',
      baselineMainSha: BASELINE_MAIN_SHA,
      plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
      plannedPrNumber: PLANNED_PR_NUMBER,
      planPath: PLAN_PATH,
      planSha256: PLAN_SHA256,
      githubRunId: '123456789',
      githubRunAttempt: 2,
      capturedAt: '2026-08-14T00:00:00.000Z',
      vercel: {
        projectId: 'vercel-project',
        deploymentId: 'dpl_baseline',
        hostname: 'production.example.com',
        sourceSha: VERCEL_SOURCE_SHA,
      },
      railway: {
        projectId: 'railway-project',
        environmentId: 'railway-environment',
        services: [
          {
            serviceName: 'fund-scenario-calc',
            serviceId: 'service-fund',
            deploymentId: 'deployment-fund',
            sourceSha: RAILWAY_SOURCE_SHA,
          },
          {
            serviceName: 'capital-call-status',
            serviceId: 'service-capital',
            deploymentId: 'deployment-capital',
            sourceSha: RAILWAY_SOURCE_SHA,
          },
        ],
      },
    });
  });

  it(
    'captures only normalized provider identity through read-only API requests',
    { retry: 0 },
    async () => {
      const context = await captureProviderBaseline({
      baselineMainSha: BASELINE_MAIN_SHA,
      plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
      plannedPrNumber: PLANNED_PR_NUMBER,
      planPath: PLAN_PATH,
      planSha256: PLAN_SHA256,
        environment: providerEnvironment(),
        fetchImpl: providerFetch(),
        now: () => '2026-08-14T00:00:00.000Z',
      });

      expect(context).toMatchObject({
        schemaVersion: 'release-recovery-context-v1',
        baselineMainSha: BASELINE_MAIN_SHA,
        plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
        vercel: { deploymentId: 'dpl_baseline', sourceSha: VERCEL_SOURCE_SHA },
        railway: {
          projectId: 'railway-project',
          environmentId: 'railway-environment',
          services: [
            { serviceName: 'fund-scenario-calc', sourceSha: RAILWAY_SOURCE_SHA },
            { serviceName: 'capital-call-status', sourceSha: RAILWAY_SOURCE_SHA },
          ],
        },
      });
      expect(JSON.stringify(context)).not.toContain('vercel-token-secret');
      expect(JSON.stringify(context)).not.toContain('railway-token-secret');
    }
  );

  it(
    'rejects credential-bearing Vercel provider URLs before serializing context',
    { retry: 0 },
    async () => {
      await expect(
        captureProviderBaseline({
          baselineMainSha: BASELINE_MAIN_SHA,
          plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
          planSha256: PLAN_SHA256,
          environment: providerEnvironment(),
          fetchImpl: providerFetch({
            deploymentUrl: 'https://user:password@baseline.vercel.app/?token=secret',
          }),
        })
      ).rejects.toThrow(/release recovery context/i);
    }
  );

  it(
    'proves exact current main, PR head, and immutable plan content before capture',
    { retry: 0 },
    async () => {
      const plan = 'approved hardening plan\n';
      const digest = createHash('sha256').update(plan).digest('hex');
      const environment = providerEnvironment({
        GITHUB_REPOSITORY: 'nikhillinit/Updog_restore',
        GH_TOKEN: 'ghs_read_only_token',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: BASELINE_MAIN_SHA,
      });
      const fetchImpl = async (url) => {
        if (url.endsWith('/commits/main'))
          return { ok: true, json: async () => ({ sha: BASELINE_MAIN_SHA }) };
        if (url.endsWith(`/pulls/${PLANNED_PR_NUMBER}`))
          return { ok: true, json: async () => ({ head: { sha: PLANNED_PR_HEAD_SHA } }) };
        throw new Error('unexpected URL');
      };
      const execFileImpl = async (_command, args) => {
        const key = args.join(' ');
        if (key === 'rev-parse HEAD') return { stdout: `${BASELINE_MAIN_SHA}\n` };
        if (key === `fetch --no-tags origin pull/${PLANNED_PR_NUMBER}/head:refs/remotes/origin/pr-${PLANNED_PR_NUMBER}`)
          return { stdout: '' };
        if (key === `rev-parse origin/pr-${PLANNED_PR_NUMBER}`) return { stdout: `${PLANNED_PR_HEAD_SHA}\n` };
        if (key.startsWith('show ')) return { stdout: plan };
        throw new Error('unexpected git command');
      };

      await expect(
        verifyBaselineBinding({
          baselineMainSha: BASELINE_MAIN_SHA,
          plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
          plannedPrNumber: PLANNED_PR_NUMBER,
          planPath: PLAN_PATH,
          planSha256: digest,
          environment,
          fetchImpl,
          execFileImpl,
        })
      ).resolves.toBeUndefined();
    }
  );

  it(
    'rejects a caller baseline that differs from trusted github.sha before GitHub access',
    { retry: 0 },
    async () => {
      const environment = providerEnvironment({
        GITHUB_REPOSITORY: 'nikhillinit/Updog_restore',
        GH_TOKEN: 'ghs_read_only_token',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: 'f'.repeat(40),
      });
      const fetchImpl = async () => {
        throw new Error('GitHub access must not occur for an untrusted checkout');
      };
      const execFileImpl = async () => {
        throw new Error('Git access must not occur for an untrusted checkout');
      };

      await expect(
        verifyBaselineBinding({
          baselineMainSha: BASELINE_MAIN_SHA,
          plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
          plannedPrNumber: PLANNED_PR_NUMBER,
          planPath: PLAN_PATH,
          planSha256: PLAN_SHA256,
          environment,
          fetchImpl,
          execFileImpl,
        })
      ).rejects.toThrow(/workflow ref does not match baseline main SHA/i);
    }
  );

  it(
    'rejects a local checkout that differs from trusted github.sha before GitHub access',
    { retry: 0 },
    async () => {
      const environment = providerEnvironment({
        GITHUB_REPOSITORY: 'nikhillinit/Updog_restore',
        GH_TOKEN: 'ghs_read_only_token',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: BASELINE_MAIN_SHA,
      });
      const fetchImpl = async () => {
        throw new Error('GitHub access must not occur for an untrusted checkout');
      };
      const execFileImpl = async () => ({ stdout: `${'f'.repeat(40)}\n` });

      await expect(
        verifyBaselineBinding({
          baselineMainSha: BASELINE_MAIN_SHA,
          plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
          plannedPrNumber: PLANNED_PR_NUMBER,
          planPath: PLAN_PATH,
          planSha256: PLAN_SHA256,
          environment,
          fetchImpl,
          execFileImpl,
        })
      ).rejects.toThrow(/checked out commit does not match baseline main SHA/i);
    }
  );

  it('rejects live main drift before reading the planned PR head', { retry: 0 }, async () => {
    const environment = providerEnvironment({
      GITHUB_REPOSITORY: 'nikhillinit/Updog_restore',
      GH_TOKEN: 'ghs_read_only_token',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: BASELINE_MAIN_SHA,
    });
    let plannedPrWasRead = false;
    const fetchImpl = async (url) => {
      if (url.endsWith('/commits/main'))
        return { ok: true, json: async () => ({ sha: 'f'.repeat(40) }) };
      if (url.endsWith(`/pulls/${PLANNED_PR_NUMBER}`)) plannedPrWasRead = true;
      throw new Error('planned PR must not be read after main drift');
    };
    const execFileImpl = async (_command, args) => {
      if (args.join(' ') === 'rev-parse HEAD') return { stdout: `${BASELINE_MAIN_SHA}\n` };
      throw new Error('Git evidence after main drift is invalid');
    };

    await expect(
      verifyBaselineBinding({
        baselineMainSha: BASELINE_MAIN_SHA,
        plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
        plannedPrNumber: PLANNED_PR_NUMBER,
        planPath: PLAN_PATH,
        planSha256: PLAN_SHA256,
        environment,
        fetchImpl,
        execFileImpl,
      })
    ).rejects.toThrow(/live main SHA does not match baseline main SHA/i);
    expect(plannedPrWasRead).toBe(false);
  });

  it(
    'rejects unknown fields, response bodies, secret-shaped keys and values, and credential URLs',
    { retry: 0 },
    () => {
      for (const input of [
        { ...captureInput(), extra: true },
        {
          ...captureInput(),
          providerIdentity: { ...captureInput().providerIdentity, responseBody: {} },
        },
        {
          ...captureInput(),
          providerIdentity: { ...captureInput().providerIdentity, apiToken: 'secret' },
        },
        {
          ...captureInput(),
          providerIdentity: {
            ...captureInput().providerIdentity,
            vercel: {
              ...captureInput().providerIdentity.vercel,
              hostname: 'https://user:password@production.example.com/?token=secret',
            },
          },
        },
        { ...captureInput(), githubRunId: 'ghp_not_allowed' },
      ]) {
        expect(() => buildReleaseRecoveryContext(input)).toThrow(/release recovery context/i);
      }
    }
  );

  it(
    'rejects malformed IDs and SHAs plus expected provider identity mismatches',
    { retry: 0 },
    () => {
      for (const input of [
        { ...captureInput(), baselineMainSha: 'A'.repeat(40) },
        { ...captureInput(), githubRunId: '0' },
        {
          ...captureInput(),
          providerIdentity: {
            ...captureInput().providerIdentity,
            vercel: { ...captureInput().providerIdentity.vercel, deploymentId: 'bad id' },
          },
        },
        {
          ...captureInput(),
          providerIdentity: {
            ...captureInput().providerIdentity,
            railway: { ...captureInput().providerIdentity.railway, projectId: 'wrong-project' },
          },
        },
      ]) {
        expect(() => buildReleaseRecoveryContext(input)).toThrow(/release recovery context/i);
      }
    }
  );

  it(
    'writes the context with mode 0600 and never serializes expected identity or raw response data',
    { retry: 0 },
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'release-recovery-context-'));
      const inputPath = path.join(directory, 'input.json');
      const outputPath = path.join(directory, 'release-recovery-context-v1.json');
      try {
        await (
          await import('node:fs/promises')
        ).writeFile(inputPath, JSON.stringify(captureInput()), 'utf8');
        await captureReleaseRecoveryContext({ inputPath, outputPath });

        const context = JSON.parse(await readFile(outputPath, 'utf8'));
        const mode = (await lstat(outputPath)).mode & 0o777;
        expect(mode).toBe(0o600);
        expect(context).not.toHaveProperty('expectedIdentity');
        expect(JSON.stringify(context)).not.toContain('responseBody');
    expect(Object.keys(context)).toEqual([
      'schemaVersion',
      'baselineMainSha',
      'plannedPrHeadSha',
      'plannedPrNumber',
      'planPath',
      'planSha256',
          'githubRunId',
          'githubRunAttempt',
          'capturedAt',
          'vercel',
          'railway',
        ]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
});

describe('baseline evidence decoding and exact consumption', () => {
  const RELEASE_SHA = 'f'.repeat(40);
  const ROLLBACK_HEAD_SHA = '9'.repeat(40);
  const PLAN_TEXT = 'approved hardening plan body\n';
  const PLAN_DIGEST = createHash('sha256').update(PLAN_TEXT).digest('hex');
  const REPOSITORY = 'nikhillinit/Updog_restore';
  const ARTIFACT_NAME = `release-baseline-v1-123456789-2-${PLANNED_PR_HEAD_SHA}`;

  function bindingInput(mode, overrides = {}) {
    return {
      schemaVersion: 'release-baseline-binding-v1',
      baselineRunId: '123456789',
      baselineRunAttempt: 2,
      baselineArtifactId: '777001',
      baselineArtifactDigest: `sha256:${'d'.repeat(64)}`,
      baselineFileSha256: overrides.baselineFileSha256 ?? 'e'.repeat(64),
      ...(mode === 'rollback' && {
        rollbackPrNumber: 4321,
        rollbackPrHeadSha: ROLLBACK_HEAD_SHA,
      }),
      ...overrides,
    };
  }

  function encodeBinding(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  }

  function contextContents(overrides = {}) {
    return `${JSON.stringify({
      ...buildReleaseRecoveryContext(captureInput()),
      planSha256: PLAN_DIGEST,
      ...overrides,
    })}\n`;
  }

  function baselineEnvironment() {
    return { GITHUB_REPOSITORY: REPOSITORY, GH_TOKEN: 'workflow-token' };
  }

  function runResponse(overrides = {}) {
    return {
      path: '.github/workflows/capture-release-baseline.yml',
      repository: { full_name: REPOSITORY },
      head_branch: 'main',
      conclusion: 'success',
      actor: { login: 'nikhillinit' },
      ...overrides,
    };
  }

  function artifactResponse(overrides = {}) {
    return {
      id: 777001,
      name: ARTIFACT_NAME,
      expired: false,
      digest: `sha256:${'d'.repeat(64)}`,
      workflow_run: { id: 123456789 },
      ...overrides,
    };
  }

  function makeFetch(routes) {
    return async (url) => {
      const key = Object.keys(routes).find((fragment) => String(url).includes(fragment));
      if (!key) throw new Error(`unexpected fetch ${url}`);
      return { ok: true, json: async () => routes[key] };
    };
  }

  function artifactRoutes(overrides = {}) {
    return {
      '/actions/runs/123456789/artifacts': overrides.list ?? {
        artifacts: [{ id: 777001, name: ARTIFACT_NAME }],
      },
      '/actions/artifacts/777001': overrides.artifact ?? artifactResponse(),
      '/actions/runs/123456789': overrides.run ?? runResponse(),
    };
  }

  function makeExecFile({ ancestor = true, diff = '', plan = PLAN_TEXT } = {}) {
    return async (command, args) => {
      if (command !== 'git') throw new Error(`unexpected command ${command}`);
      if (args[0] === 'fetch') return { stdout: '' };
      if (args[0] === 'merge-base') {
        if (!ancestor) throw new Error('not an ancestor');
        return { stdout: '' };
      }
      if (args[0] === 'show') return { stdout: plan };
      if (args[0] === 'diff') return { stdout: diff };
      throw new Error(`unexpected git args ${args.join(' ')}`);
    };
  }

  function pullRoutes({ primary, rollback } = {}) {
    return {
      [`/pulls/${PLANNED_PR_NUMBER}`]: primary ?? {
        head: { sha: PLANNED_PR_HEAD_SHA },
        merged: true,
        base: { ref: 'main' },
        merge_commit_sha: RELEASE_SHA,
      },
      '/pulls/4321': rollback ?? {
        head: { sha: ROLLBACK_HEAD_SHA },
        merged: true,
        base: { ref: 'main' },
        merge_commit_sha: RELEASE_SHA,
      },
    };
  }

  async function consume(mode, overrides = {}) {
    const contents = overrides.contents ?? contextContents();
    const fileSha = createHash('sha256').update(contents).digest('hex');
    const binding = bindingInput(mode, {
      baselineFileSha256: overrides.wrongFileSha ? 'e'.repeat(64) : fileSha,
      ...(overrides.binding ?? {}),
    });
    return verifyBaselineConsumption({
      baselineEvidenceB64: encodeBinding(binding),
      releaseMode: mode,
      releaseSha: overrides.releaseSha ?? RELEASE_SHA,
      contextPath: '/virtual/release-recovery-context-v1.json',
      emitNormalizedPath: overrides.emitNormalizedPath,
    prNumber: 'prNumber' in overrides ? overrides.prNumber : String(PLANNED_PR_NUMBER),
      environment: baselineEnvironment(),
      fetchImpl:
        overrides.fetchImpl ?? makeFetch({ ...pullRoutes(overrides.pulls ?? {}) }),
      execFileImpl: makeExecFile(overrides.git ?? {}),
      readFileImpl: async () => contents,
    });
  }

  it('decodes an exact primary and rollback baseline binding', () => {
    expect(decodeBaselineEvidence(encodeBinding(bindingInput('primary')), 'primary')).toMatchObject(
      { releaseMode: 'primary', baselineRunId: '123456789', baselineRunAttempt: 2 }
    );
    expect(
      decodeBaselineEvidence(encodeBinding(bindingInput('rollback')), 'rollback')
    ).toMatchObject({ rollbackPrNumber: 4321, rollbackPrHeadSha: ROLLBACK_HEAD_SHA });
  });

  it.each([
    ['unset mode', bindingInput('primary'), undefined],
    ['unknown mode', bindingInput('primary'), 'canary'],
    ['rollback keys in primary mode', bindingInput('rollback'), 'primary'],
    ['missing rollback keys in rollback mode', bindingInput('primary'), 'rollback'],
    ['unknown field', { ...bindingInput('primary'), extra: 'x' }, 'primary'],
    ['wrong schema version', { ...bindingInput('primary'), schemaVersion: 'v0' }, 'primary'],
    [
      'malformed artifact digest',
      { ...bindingInput('primary'), baselineArtifactDigest: 'd'.repeat(64) },
      'primary',
    ],
    ['non-integer attempt', { ...bindingInput('primary'), baselineRunAttempt: '2' }, 'primary'],
  ])('fails closed decoding %s', (_label, binding, mode) => {
    return expect(async () =>
      decodeBaselineEvidence(encodeBinding(binding), mode)
    ).rejects.toThrow();
  });

  it('rejects non-base64 baseline evidence', () => {
    expect(() => decodeBaselineEvidence('%%%not-base64%%%', 'primary')).toThrow();
    expect(() => decodeBaselineEvidence('', 'primary')).toThrow();
  });

  it('verifies the exact baseline artifact identity', async () => {
    await expect(
      verifyBaselineArtifact({
        baselineEvidenceB64: encodeBinding(bindingInput('primary')),
        releaseMode: 'primary',
        environment: baselineEnvironment(),
        fetchImpl: makeFetch(artifactRoutes()),
      })
    ).resolves.toMatchObject({ plannedPrHeadSha: PLANNED_PR_HEAD_SHA });
  });

  it.each([
    ['wrong workflow', { run: runResponse({ path: '.github/workflows/other.yml' }) }],
    ['wrong repository', { run: runResponse({ repository: { full_name: 'other/repo' } }) }],
    ['non-main branch', { run: runResponse({ head_branch: 'feature' }) }],
    ['unsuccessful run', { run: runResponse({ conclusion: 'failure' }) }],
    ['wrong actor', { run: runResponse({ actor: { login: 'intruder' } }) }],
    ['artifact from another run', { artifact: artifactResponse({ workflow_run: { id: 5 } }) }],
    ['expired artifact', { artifact: artifactResponse({ expired: true }) }],
    ['digest mismatch', { artifact: artifactResponse({ digest: `sha256:${'0'.repeat(64)}` }) }],
    [
      'wrong attempt in name',
      { artifact: artifactResponse({ name: `release-baseline-v1-123456789-3-${PLANNED_PR_HEAD_SHA}` }) },
    ],
    ['duplicate artifact', { list: { artifacts: [{ id: 777001 }, { id: 777002 }] } }],
    ['missing artifact on run', { list: { artifacts: [] } }],
  ])('rejects baseline artifact identity for %s', async (_label, overrides) => {
    await expect(
      verifyBaselineArtifact({
        baselineEvidenceB64: encodeBinding(bindingInput('primary')),
        releaseMode: 'primary',
        environment: baselineEnvironment(),
        fetchImpl: makeFetch(artifactRoutes(overrides)),
      })
    ).rejects.toThrow();
  });

  it('consumes a primary release bound to the exact baseline', async () => {
    await expect(consume('primary')).resolves.toMatchObject({
      mode: 'primary',
      baselineMainSha: BASELINE_MAIN_SHA,
      plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
    });
  });

  it.each([
    ['edited context file', { wrongFileSha: true }],
    ['capture run mismatch', { contents: undefined, binding: { baselineRunId: '999999999' } }],
    ['non-ancestor baseline', { git: { ancestor: false } }],
    [
      'runtime PR head mismatch',
      { pulls: { primary: { head: { sha: '9'.repeat(40) }, merged: true, base: { ref: 'main' }, merge_commit_sha: RELEASE_SHA } } },
    ],
    [
      'unmerged runtime PR',
      { pulls: { primary: { head: { sha: PLANNED_PR_HEAD_SHA }, merged: false, base: { ref: 'main' }, merge_commit_sha: RELEASE_SHA } } },
    ],
    [
      'merge commit mismatch',
      { pulls: { primary: { head: { sha: PLANNED_PR_HEAD_SHA }, merged: true, base: { ref: 'main' }, merge_commit_sha: '9'.repeat(40) } } },
    ],
  ])('fails closed consuming a primary release with %s', async (_label, overrides) => {
    await expect(consume('primary', overrides)).rejects.toThrow();
  });

  it('fails closed when the approved plan differs at the exact release SHA', async () => {
    await expect(consume('primary', { git: { plan: 'tampered release plan\n' } })).rejects.toThrow(
      /release plan digest/i
    );
  });

  it('fails closed when primary-mode prNumber is omitted', async () => {
    await expect(
      consume('primary', { prNumber: undefined })
    ).rejects.toThrow(/pr-number/i);
  });

  it('fails closed when primary-mode prNumber mismatches captured value', async () => {
    await expect(
      consume('primary', { prNumber: '99999' })
    ).rejects.toThrow(/pr number/i);
  });

  it('accepts a clean rollback revert bounded by the control-plane allowlist', async () => {
    await expect(
      consume('rollback', {
        git: { diff: '.github/workflows/release-production.yml\nscripts/release/recover-canary-run.mjs\ndocs/runbooks/rollback.md\n' },
      })
    ).resolves.toMatchObject({ mode: 'rollback' });
    await expect(consume('rollback', { git: { diff: '' } })).resolves.toMatchObject({
      mode: 'rollback',
    });
  });

  it.each([
    ['a revert that misses an application file', 'server/services/fund-persistence-service.ts\n'],
    ['a revert that sneaks a non-control-plane change', 'docs-site/index.md\nclient/src/App.tsx\n'],
  ])('fails closed for %s', async (_label, diff) => {
    await expect(consume('rollback', { git: { diff } })).rejects.toThrow(
      /differs from the baseline application tree/
    );
  });

  it('consumes a historical rollback context with only the bound rollback PR fetch', async () => {
    const historical = JSON.parse(contextContents());
    delete historical.plannedPrNumber;
    delete historical.planPath;
    const fetchedPullRequests = [];
    const fetchImpl = async (url) => {
      const target = String(url);
      if (target.includes(`/pulls/${PLANNED_PR_NUMBER}`)) {
        throw new Error('rollback must not fetch the primary/runtime pull request');
      }
      if (target.includes('/pulls/4321')) {
        fetchedPullRequests.push('/pulls/4321');
        return {
          ok: true,
          json: async () => ({
            head: { sha: ROLLBACK_HEAD_SHA },
            merged: true,
            base: { ref: 'main' },
            merge_commit_sha: RELEASE_SHA,
          }),
        };
      }
      throw new Error(`unexpected fetch ${target}`);
    };
    await expect(
      consume('rollback', {
        contents: `${JSON.stringify(historical)}\n`,
        fetchImpl,
        prNumber: undefined,
        git: { diff: '' },
      })
    ).resolves.toMatchObject({ mode: 'rollback' });
    expect(fetchedPullRequests).toEqual(['/pulls/4321']);
  });

  it.each([
    [
      'rollback PR head mismatch',
      {
        head: { sha: '8'.repeat(40) },
        merged: true,
        base: { ref: 'main' },
        merge_commit_sha: RELEASE_SHA,
      },
    ],
    [
      'unmerged rollback PR',
      {
        head: { sha: ROLLBACK_HEAD_SHA },
        merged: false,
        base: { ref: 'main' },
        merge_commit_sha: RELEASE_SHA,
      },
    ],
    [
      'rollback PR base mismatch',
      {
        head: { sha: ROLLBACK_HEAD_SHA },
        merged: true,
        base: { ref: 'release' },
        merge_commit_sha: RELEASE_SHA,
      },
    ],
    [
      'rollback PR merge commit mismatch',
      {
        head: { sha: ROLLBACK_HEAD_SHA },
        merged: true,
        base: { ref: 'main' },
        merge_commit_sha: '8'.repeat(40),
      },
    ],
  ])('fails closed consuming rollback release with %s', async (_label, rollback) => {
    await expect(
      consume('rollback', {
        prNumber: undefined,
        pulls: { rollback },
        git: { diff: '' },
      })
    ).rejects.toThrow();
  });

  it.each([
    ['only planned PR number', { planPath: undefined }],
    ['only plan path', { plannedPrNumber: undefined }],
  ])('rejects hybrid baseline context provenance with %s', async (_label, mutation) => {
    const context = JSON.parse(contextContents());
    Object.assign(context, mutation);
    await expect(
      consume('rollback', { contents: `${JSON.stringify(context)}\n`, git: { diff: '' } })
    ).rejects.toThrow(/hybrid provenance/i);
  });

  it('pins the rollback allowlist to release control-plane paths only', () => {
    expect(ROLLBACK_DIFF_ALLOWLIST).toEqual([
      '.github/workflows/',
      'scripts/release/',
      'scripts/deploy-production.ps1',
      'tests/unit/scripts/',
      'tests/regressions/',
      'docs/',
    ]);
  });

  describe('--emit-normalized baseline fragment payload', () => {
    const PROVIDER_IDENTITY = {
      vercel: {
        projectId: 'vercel-project',
        deploymentId: 'dpl-baseline',
        hostname: 'production.example.com',
        sourceSha: VERCEL_SOURCE_SHA,
      },
      railway: {
        projectId: 'railway-project',
        environmentId: 'railway-environment',
        services: [
          {
            serviceName: 'fund-scenario-calc',
            serviceId: 'service-fund',
            deploymentId: 'deployment-fund',
            sourceSha: RAILWAY_SOURCE_SHA,
          },
          {
            serviceName: 'capital-call-status',
            serviceId: 'service-capital',
            deploymentId: 'deployment-capital',
            sourceSha: RAILWAY_SOURCE_SHA,
          },
        ],
      },
    };

    function providerContextContents() {
      return contextContents(PROVIDER_IDENTITY);
    }

    async function withEmitDirectory(run) {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'baseline-fragment-emit-'));
      try {
        return await run(directory);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }

    it('emits the exact BaselineFragmentPayload (mode 0600) after primary consumption', async () => {
      await withEmitDirectory(async (directory) => {
        const emitPath = path.join(directory, 'baseline-fragment-payload.json');
        const contents = providerContextContents();
        await expect(
          consume('primary', { contents, emitNormalizedPath: emitPath })
        ).resolves.toMatchObject({ mode: 'primary' });

        const written = JSON.parse(await readFile(emitPath, 'utf8'));
        // The emit must satisfy Lane A's frozen contract schema verbatim,
        // including both rollback/baselineArtifact equality refinements.
        const payload = BaselineFragmentPayloadSchema.parse(written);
        const contextFileSha256 = createHash('sha256').update(contents).digest('hex');
        expect(payload).toEqual({
          prechange: PROVIDER_IDENTITY,
          rollback: {
            targetMainSha: BASELINE_MAIN_SHA,
            recoveryContextSha256: contextFileSha256,
          },
          baselineArtifact: {
            runId: '123456789',
            runAttempt: 2,
            workflowPath: '.github/workflows/capture-release-baseline.yml',
            baselineMainSha: BASELINE_MAIN_SHA,
            plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
            artifactId: '777001',
            artifactName: ARTIFACT_NAME,
            artifactArchiveSha256: 'd'.repeat(64),
            contextFileSha256,
          },
        });
        const mode = (await lstat(emitPath)).mode & 0o777;
        expect(mode).toBe(0o600);
      });
    });

    it('emits the schema-valid payload after rollback consumption', async () => {
      await withEmitDirectory(async (directory) => {
        const emitPath = path.join(directory, 'baseline-fragment-payload.json');
        await expect(
          consume('rollback', {
            contents: providerContextContents(),
            emitNormalizedPath: emitPath,
            git: { diff: '' },
          })
        ).resolves.toMatchObject({ mode: 'rollback' });

        const payload = BaselineFragmentPayloadSchema.parse(
          JSON.parse(await readFile(emitPath, 'utf8'))
        );
        expect(payload.baselineArtifact.artifactName).toBe(ARTIFACT_NAME);
      });
    });

    it('writes nothing without the flag and nothing when verification fails first', async () => {
      await withEmitDirectory(async (directory) => {
        await expect(
          consume('primary', { contents: providerContextContents() })
        ).resolves.toMatchObject({ mode: 'primary' });

        const emitPath = path.join(directory, 'baseline-fragment-payload.json');
        await expect(
          consume('primary', {
            contents: providerContextContents(),
            emitNormalizedPath: emitPath,
            wrongFileSha: true,
          })
        ).rejects.toThrow();

        await expect(readdir(directory)).resolves.toEqual([]);
      });
    });

    it('fails closed on an unwritable emit path after verification passed', async () => {
      await withEmitDirectory(async (directory) => {
        const emitPath = path.join(directory, 'missing-subdirectory', 'payload.json');
        await expect(
          consume('primary', { contents: providerContextContents(), emitNormalizedPath: emitPath })
        ).rejects.toThrow(/could not be written/);
      });
    });
  });
});
