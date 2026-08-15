import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildReleaseRecoveryContext,
  captureProviderBaseline,
  captureReleaseRecoveryContext,
  verifyBaselineBinding,
} from '../../../scripts/release/capture-release-recovery-context.mjs';

const BASELINE_MAIN_SHA = 'a'.repeat(40);
const PLANNED_PR_HEAD_SHA = 'b'.repeat(40);
const PLAN_SHA256 = 'c'.repeat(64);
const VERCEL_SOURCE_SHA = 'd'.repeat(40);
const RAILWAY_SOURCE_SHA = 'e'.repeat(40);

function captureInput(overrides = {}) {
  return {
    baselineMainSha: BASELINE_MAIN_SHA,
    plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
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
        if (url.endsWith('/pulls/1385'))
          return { ok: true, json: async () => ({ head: { sha: PLANNED_PR_HEAD_SHA } }) };
        throw new Error('unexpected URL');
      };
      const execFileImpl = async (_command, args) => {
        const key = args.join(' ');
        if (key === 'rev-parse HEAD') return { stdout: `${BASELINE_MAIN_SHA}\n` };
        if (key === 'fetch --no-tags origin pull/1385/head:refs/remotes/origin/pr-1385')
          return { stdout: '' };
        if (key === 'rev-parse origin/pr-1385') return { stdout: `${PLANNED_PR_HEAD_SHA}\n` };
        if (key.startsWith('show ')) return { stdout: plan };
        throw new Error('unexpected git command');
      };

      await expect(
        verifyBaselineBinding({
          baselineMainSha: BASELINE_MAIN_SHA,
          plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
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
      if (url.endsWith('/pulls/1385')) plannedPrWasRead = true;
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
