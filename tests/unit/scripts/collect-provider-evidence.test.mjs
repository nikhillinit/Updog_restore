import { afterEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';

import { collectProviderEvidence } from '../../../scripts/release/collect-provider-evidence.mjs';

const SHA = 'a'.repeat(40);
const TOKENS = {
  VERCEL_TOKEN: 'vercel-secret-value',
  RAILWAY_TOKEN: 'railway-secret-value',
  VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret-value',
};

function vercelDeployment() {
  return {
    id: 'dpl_candidate',
    url: 'https://candidate.vercel.app',
    readyState: 'READY',
    target: 'production',
    projectId: 'vercel-project',
    alias: [],
    meta: { githubCommitRef: 'main', githubCommitSha: SHA },
  };
}

function version() {
  return {
    arch: 'x64',
    commit: SHA,
    environment: 'production',
    nodeVersion: '22',
    platform: 'vercel',
    timestamp: '2026-08-12T00:00:00.000Z',
    version: '1.0.0',
  };
}

function railwayControl({ hasNextPage = false } = {}) {
  const makeDeployment = (id) => ({
    id,
    status: 'SUCCESS',
    deploymentStopped: false,
    meta: { commitHash: SHA },
    instances: [{ id: `${id}-instance`, status: 'RUNNING' }],
  });
  const services = ['fund-scenario-calc', 'capital-call-status'].map((serviceName) => {
    const deployment = makeDeployment(`${serviceName}-deployment`);
    return {
      serviceId: `${serviceName}-id`,
      serviceName,
      numReplicas: 1,
      domains: { serviceDomains: [], customDomains: [] },
      latestDeployment: deployment,
      activeDeployments: [deployment],
    };
  });
  return {
    data: {
      environment: {
        serviceInstances: {
          edges: services.map((node) => ({ node })),
          pageInfo: { hasNextPage, endCursor: null },
        },
      },
    },
  };
}

function makeFetch({ control = railwayControl(), deployment = vercelDeployment(), versionBody = version() } = {}) {
  return vi.fn(async (url, options) => {
    if (url.includes('/v13/deployments/')) return { ok: true, json: async () => deployment };
    if (url.endsWith('/api/version')) return { ok: true, json: async () => versionBody };
    const payload = JSON.parse(options.body);
    if (payload.query.includes('projectToken')) {
      return {
        ok: true,
        json: async () => ({ data: { projectToken: { project: { id: 'railway-project' }, environment: { id: 'railway-environment' } } } }),
      };
    }
    return { ok: true, json: async () => control };
  });
}

function setEnvironment() {
  for (const [key, value] of Object.entries({
    ...TOKENS,
    VERCEL_ORG_ID: 'vercel-org',
    VERCEL_PROJECT_ID: 'vercel-project',
  })) {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of [...Object.keys(TOKENS), 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
    delete process.env[key];
  }
});

describe('collect-provider-evidence', () => {
  it('collects strict Vercel and full Railway evidence with injected IO', { retry: 0 }, async () => {
    setEnvironment();
    const fetchImpl = makeFetch();
    const writes = [];
    const writeFileImpl = vi.fn(async (path, body, encoding) => {
      writes.push({ path, body, encoding });
    });

    const result = await collectProviderEvidence({
      deploymentUrl: 'https://candidate.vercel.app',
      outputDirectory: '/tmp/provider-evidence-run-123',
      fetchImpl,
      writeFileImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.vercel.com/v13/deployments/candidate.vercel.app?teamId=vercel-org'
    );
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer ${TOKENS.VERCEL_TOKEN}`
    );
    expect(fetchImpl.mock.calls[1][0]).toBe('https://candidate.vercel.app/api/version');
    expect(fetchImpl.mock.calls[1][1].headers['x-vercel-protection-bypass']).toBe(
      TOKENS.VERCEL_AUTOMATION_BYPASS_SECRET
    );
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).query).toContain('projectToken');
    expect(JSON.parse(fetchImpl.mock.calls[3][1].body).variables).toEqual({
      projectId: 'railway-project',
      environmentId: 'railway-environment',
    });
    expect(writes.map(({ path }) => path)).toEqual([
      '/tmp/provider-evidence-run-123/vercel-evidence.json',
      '/tmp/provider-evidence-run-123/railway-evidence.json',
    ]);
    expect(writes.every(({ encoding }) => encoding === 'utf8')).toBe(true);
    expect(result.vercelEvidence).toMatchObject({ expectedProjectId: 'vercel-project' });
    expect(result.railwayEvidence.services).toHaveLength(2);
    expect(JSON.parse(writes[0].body)).toEqual(result.vercelEvidence);
    expect(JSON.parse(writes[1].body)).toEqual(result.railwayEvidence);
  });

  it.each([
    ['HTTP URL', 'http://candidate.vercel.app'],
    ['path URL', 'https://candidate.vercel.app/path'],
    ['query URL', 'https://candidate.vercel.app/?x=1'],
    ['non-Vercel URL', 'https://example.com'],
  ])('rejects strict staged URL: %s', { retry: 0 }, async (_label, deploymentUrl) => {
    setEnvironment();
    await expect(collectProviderEvidence({
      deploymentUrl,
      outputDirectory: '/tmp/provider-evidence-run-123',
      fetchImpl: vi.fn(),
      writeFileImpl: vi.fn(),
    })).rejects.toThrow(/deployment URL/i);
  });

  it.each([
    ['paginated topology', makeFetch({ control: railwayControl({ hasNextPage: true }) })],
    ['malformed deployment', makeFetch({ deployment: { id: 'missing-fields' } })],
    ['GraphQL error', vi.fn(async (url, options) => {
      if (url.includes('/v13/deployments/')) return { ok: true, json: async () => vercelDeployment() };
      if (url.endsWith('/api/version')) return { ok: true, json: async () => version() };
      const query = JSON.parse(options.body).query;
      return query.includes('projectToken')
        ? { ok: true, json: async () => ({ data: { projectToken: { project: { id: 'railway-project' }, environment: { id: 'railway-environment' } } } }) }
        : { ok: true, json: async () => ({ errors: [{ message: 'raw GraphQL error' }] }) };
    })],
  ])('fails closed for %s', { retry: 0 }, async (_label, fetchImpl) => {
    setEnvironment();
    const writeFileImpl = vi.fn();
    await expect(collectProviderEvidence({
      deploymentUrl: 'https://candidate.vercel.app',
      outputDirectory: '/tmp/provider-evidence-run-123',
      fetchImpl,
      writeFileImpl,
    })).rejects.toThrow(/Provider evidence/);
    expect(writeFileImpl).not.toHaveBeenCalled();
  });

  it('never returns, writes, or reports provider tokens', { retry: 0 }, async () => {
    setEnvironment();
    const token = TOKENS.RAILWAY_TOKEN;
    const fetchImpl = vi.fn(async () => {
      throw new Error(`network failure ${token}`);
    });
    const writeFileImpl = vi.fn();
    let error;
    try {
      await collectProviderEvidence({
        deploymentUrl: 'https://candidate.vercel.app',
        outputDirectory: '/tmp/provider-evidence-run-123',
        fetchImpl,
        writeFileImpl,
      });
    } catch (caught) {
      error = caught;
    }
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain(token);
    expect(error?.message).not.toContain(token);
    expect(JSON.stringify(writeFileImpl.mock.calls)).not.toContain(token);
  });

  it('keeps tokens out of the success-path result, file paths, bodies, and stdio', { retry: 0 }, async () => {
    setEnvironment();
    const stdoutSpy = vi.spyOn(process.stdout, 'write');
    const stderrSpy = vi.spyOn(process.stderr, 'write');
    try {
      const writes = [];
      const result = await collectProviderEvidence({
        deploymentUrl: 'https://candidate.vercel.app',
        outputDirectory: '/tmp/provider-evidence-run-123',
        fetchImpl: makeFetch(),
        writeFileImpl: vi.fn(async (path, body, encoding) => {
          writes.push({ path, body, encoding });
        }),
      });
      const emitted = [
        JSON.stringify(result),
        ...writes.map(({ path, body }) => `${path}\n${body}`),
        ...stdoutSpy.mock.calls.map((call) => String(call[0])),
        ...stderrSpy.mock.calls.map((call) => String(call[0])),
      ].join('\n');
      for (const secret of Object.values(TOKENS)) {
        expect(emitted).not.toContain(secret);
      }
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('rejects an output directory containing a provider secret', { retry: 0 }, async () => {
    setEnvironment();
    const writeFileImpl = vi.fn();
    await expect(collectProviderEvidence({
      deploymentUrl: 'https://candidate.vercel.app',
      outputDirectory: `/tmp/${TOKENS.RAILWAY_TOKEN}/provider-evidence`,
      fetchImpl: makeFetch(),
      writeFileImpl,
    })).rejects.toThrow(/Provider evidence/);
    expect(writeFileImpl).not.toHaveBeenCalled();
  });
});
