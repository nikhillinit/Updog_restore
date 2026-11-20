import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';
import { promisify } from 'node:util';
import { URL } from 'node:url';

import { collectProviderEvidence } from '../../../scripts/release/collect-provider-evidence.mjs';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(process.cwd(), 'scripts/release/collect-provider-evidence.mjs');

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
    // Creation-time only; the collector must replace it with the live list.
    alias: ['stale-creation-alias.vercel.app'],
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

const LIVE_ALIASES = { aliases: [{ alias: 'project-candidate-team.vercel.app' }] };

function makeFetch({
  control = railwayControl(),
  deployment = vercelDeployment(),
  versionBody = version(),
  aliasesBody = LIVE_ALIASES,
  postureProject = { ssoProtection: { deploymentType: 'all' } },
  domainsResponse = { domains: [] },
  canonicalDeployment = { ...vercelDeployment(), id: 'dpl_canonical' },
  canonicalAliasesBody = { aliases: [{ alias: 'production.example.com' }] },
  probe = () => ({ status: 401, location: null }),
} = {}) {
  return vi.fn(async (url, options) => {
    if (url.includes('/v9/projects/') && url.includes('/domains?')) return { ok: true, json: async () => domainsResponse };
    if (url.includes('/v9/projects/')) return { ok: true, json: async () => postureProject };
    if (url.includes('/v13/deployments/')) {
      return { ok: true, json: async () => url.includes('production.example.com') ? canonicalDeployment : deployment };
    }
    if (url.includes('/v2/deployments/')) {
      return { ok: true, json: async () => url.includes('dpl_canonical') ? canonicalAliasesBody : aliasesBody };
    }
    if (url.includes('/api/health')) {
      const result = probe(new URL(url).hostname);
      return {
        status: result.status,
        headers: { get: (name) => name === 'location' ? result.location : null },
        body: { cancel: vi.fn(async () => {}) },
      };
    }
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
    VERCEL_PRODUCTION_HOSTNAME: 'Production.Example.com',
  })) {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of [...Object.keys(TOKENS), 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'VERCEL_PRODUCTION_HOSTNAME']) {
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

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.vercel.com/v13/deployments/candidate.vercel.app?teamId=vercel-org'
    );
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer ${TOKENS.VERCEL_TOKEN}`
    );
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'https://api.vercel.com/v2/deployments/dpl_candidate/aliases?teamId=vercel-org'
    );
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe(
      `Bearer ${TOKENS.VERCEL_TOKEN}`
    );
    expect(fetchImpl.mock.calls[2][0]).toBe('https://candidate.vercel.app/api/version');
    expect(fetchImpl.mock.calls[2][1].headers['x-vercel-protection-bypass']).toBe(
      TOKENS.VERCEL_AUTOMATION_BYPASS_SECRET
    );
    expect(JSON.parse(fetchImpl.mock.calls[3][1].body).query).toContain('projectToken');
    expect(JSON.parse(fetchImpl.mock.calls[4][1].body).variables).toEqual({
      projectId: 'railway-project',
      environmentId: 'railway-environment',
    });
    expect(writes.map(({ path }) => path)).toEqual([
      '/tmp/provider-evidence-run-123/vercel-evidence.json',
      '/tmp/provider-evidence-run-123/railway-evidence.json',
    ]);
    expect(writes.every(({ encoding }) => encoding === 'utf8')).toBe(true);
    expect(result.vercelEvidence).toMatchObject({ expectedProjectId: 'vercel-project' });
    expect(result.vercelEvidence.deployment.aliases).toEqual(['project-candidate-team.vercel.app']);
    expect(result.railwayEvidence.services).toHaveLength(2);
    expect(JSON.parse(writes[0].body)).toEqual(result.vercelEvidence);
    expect(JSON.parse(writes[1].body)).toEqual(result.railwayEvidence);
  });

  it('collects opt-in posture without exposing bypass keys or probe query strings', { retry: 0 }, async () => {
    setEnvironment();
    const bypassKey = 'fixture-protection-bypass-secret';
    const fetchImpl = makeFetch({
      postureProject: {
        ssoProtection: { deploymentType: 'all' },
        passwordProtection: { deploymentType: 'all' },
        trustedIps: null,
        protectionBypass: {
          [bypassKey]: { scope: 'preview' },
          anotherSecret: { scope: 'automation' },
          thirdSecret: { scope: 'preview' },
        },
      },
      domainsResponse: {
        pagination: { next: null },
        domains: [
          { name: 'HTTPS://WWW.Example.com/ignored' },
          { name: 'www.example.com' },
          { name: 'custom.example.com' },
        ],
      },
      canonicalAliasesBody: { aliases: [{ alias: 'https://production.example.com/path' }] },
      probe: () => ({ status: 302, location: 'https://vercel.com/sso-api?nonce=private&return=%2F' }),
    });
    const writes = [];
    const result = await collectProviderEvidence({
      deploymentUrl: 'https://candidate.vercel.app',
      outputDirectory: '/tmp/provider-evidence-run-posture',
      accessPosture: true,
      fetchImpl,
      writeFileImpl: vi.fn(async (path, body) => writes.push({ path, body })),
    });
    const posture = {
      deploymentType: 'all',
      passwordProtection: { enabled: true, deploymentType: 'all' },
      trustedIps: { enabled: false, deploymentType: null },
      bypass: { count: 3, scopes: ['automation', 'preview'] },
      hostnames: ['custom.example.com', 'production.example.com', 'www.example.com'],
      probes: [
        'custom.example.com', 'production.example.com', 'www.example.com',
      ].map((hostname) => ({
        hostname,
        status: 302,
        redirectHost: 'vercel.com',
        redirectPathPrefix: '/sso-api',
      })),
    };
    expect(result.accessPosture).toEqual(posture);
    expect(writes.map(({ path }) => path)).toEqual([
      '/tmp/provider-evidence-run-posture/vercel-evidence.json',
      '/tmp/provider-evidence-run-posture/railway-evidence.json',
      '/tmp/provider-evidence-run-posture/vercel-access-posture.json',
    ]);
    const emitted = `${JSON.stringify(result)}\n${writes.map(({ body }) => body).join('\n')}`;
    expect(emitted).not.toContain(bypassKey);
    expect(emitted).not.toContain('anotherSecret');
    expect(emitted).not.toContain('private');
    const probes = fetchImpl.mock.calls.filter(([url]) => url.includes('/api/health'));
    expect(probes).toHaveLength(3);
    for (const [, options] of probes) {
      expect(options).toMatchObject({ method: 'GET', redirect: 'manual' });
      expect(options).not.toHaveProperty('headers');
    }
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/v9/projects/vercel-project?teamId=vercel-org'))).toBe(true);
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/v9/projects/vercel-project/domains?teamId=vercel-org&limit=100'))).toBe(true);
  });

  it('requires production hostname only when posture collection is enabled', { retry: 0 }, async () => {
    setEnvironment();
    delete process.env.VERCEL_PRODUCTION_HOSTNAME;
    const fetchImpl = vi.fn();
    await expect(collectProviderEvidence({
      deploymentUrl: 'https://candidate.vercel.app',
      outputDirectory: '/tmp/provider-evidence-run-123',
      accessPosture: true,
      fetchImpl,
      writeFileImpl: vi.fn(),
    })).rejects.toThrow(/VERCEL_PRODUCTION_HOSTNAME is required/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['paginated domains', makeFetch({ domainsResponse: { pagination: { next: 'cursor' }, domains: [] } })],
    ['malformed domains', makeFetch({ domainsResponse: { pagination: { next: null } } })],
    ['foreign canonical project', makeFetch({
      canonicalDeployment: { ...vercelDeployment(), id: 'dpl_canonical', projectId: 'other-project' },
    })],
    ['probe transport failure', vi.fn(async (url, options) => {
      if (url.includes('/api/health')) throw new Error('private host failure');
      return makeFetch()(url, options);
    })],
  ])('fails closed for posture %s', { retry: 0 }, async (_label, fetchImpl) => {
    setEnvironment();
    const writeFileImpl = vi.fn();
    await expect(collectProviderEvidence({
      deploymentUrl: 'https://candidate.vercel.app',
      outputDirectory: '/tmp/provider-evidence-run-123',
      accessPosture: true,
      fetchImpl,
      writeFileImpl,
    })).rejects.toThrow(/Provider evidence/);
    expect(writeFileImpl).not.toHaveBeenCalled();
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
    ['malformed live aliases', makeFetch({ aliasesBody: { aliases: [{}] } })],
    ['GraphQL error', vi.fn(async (url, options) => {
      if (url.includes('/v13/deployments/')) return { ok: true, json: async () => vercelDeployment() };
      if (url.includes('/v2/deployments/')) return { ok: true, json: async () => LIVE_ALIASES };
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

  it('CLI never creates a secret-bearing directory, including via dot-dot traversal', { retry: 0 }, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'collect-cli-test-'));
    try {
      const cliEnvironment = {
        ...process.env,
        ...TOKENS,
        VERCEL_ORG_ID: 'vercel-org',
        VERCEL_PROJECT_ID: 'vercel-project',
      };

      const direct = path.join(root, TOKENS.RAILWAY_TOKEN, 'evidence');
      const directResult = await execFileAsync(process.execPath, [
        CLI_PATH, '--deployment-url', 'https://candidate.vercel.app', '--output-dir', direct,
      ], { env: cliEnvironment }).catch((error) => error);
      expect(directResult.code).not.toBe(0);
      await expect(lstat(path.join(root, TOKENS.RAILWAY_TOKEN))).rejects.toMatchObject({ code: 'ENOENT' });

      // Traversal form: the raw path carries a secret-named component that a
      // dot-dot segment removes on resolve; recursive mkdir on the RAW input
      // would still have materialized it. Trigger a pre-network failure by
      // omitting a required env value so no real fetch is attempted.
      // Build the raw argument WITHOUT path.join: join would normalize the
      // dot-dot away at construction time and make this regression vacuous.
      const traversal = `${root}${path.sep}${TOKENS.RAILWAY_TOKEN}-x${path.sep}..${path.sep}evidence`;
      expect(traversal).toContain(`${path.sep}..${path.sep}`);
      const traversalEnvironment = { ...cliEnvironment };
      delete traversalEnvironment.VERCEL_ORG_ID;
      const traversalResult = await execFileAsync(process.execPath, [
        CLI_PATH, '--deployment-url', 'https://candidate.vercel.app', '--output-dir', traversal,
      ], { env: traversalEnvironment }).catch((error) => error);
      expect(traversalResult.code).not.toBe(0);
      await expect(lstat(path.join(root, `${TOKENS.RAILWAY_TOKEN}-x`))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('CLI accepts bare posture flag and requires its hostname', { retry: 0 }, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'collect-posture-cli-'));
    try {
      const outputDirectory = path.join(root, 'evidence');
      const cliEnvironment = {
        ...process.env,
        ...TOKENS,
        VERCEL_ORG_ID: 'vercel-org',
        VERCEL_PROJECT_ID: 'vercel-project',
      };
      delete cliEnvironment.VERCEL_PRODUCTION_HOSTNAME;
      const result = await execFileAsync(process.execPath, [
        CLI_PATH,
        '--deployment-url', 'https://candidate.vercel.app',
        '--output-dir', outputDirectory,
        '--access-posture',
      ], { env: cliEnvironment }).catch((error) => error);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(/Provider evidence collection failed/);
      expect((await lstat(outputDirectory)).isDirectory()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('forwards one absolute collection deadline to Vercel and Railway requests', { retry: 0 }, async () => {
    setEnvironment();
    const fetchImpl = makeFetch();

    await expect(collectProviderEvidence({
      deploymentUrl: 'https://candidate.vercel.app',
      outputDirectory: '/tmp/provider-evidence-run-123',
      deadlineAt: Date.now() + 10_000,
      fetchImpl,
      writeFileImpl: vi.fn(),
    })).resolves.toBeDefined();

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(fetchImpl.mock.calls.every(([, options]) => options.signal instanceof globalThis.AbortSignal)).toBe(
      true
    );
  });

  it('rejects an expired collection deadline before the first fetch', { retry: 0 }, async () => {
    setEnvironment();
    const fetchImpl = vi.fn();

    await expect(collectProviderEvidence({
      deploymentUrl: 'https://candidate.vercel.app',
      outputDirectory: '/tmp/provider-evidence-run-123',
      deadlineAt: 0,
      now: () => 1,
      fetchImpl,
      writeFileImpl: vi.fn(),
    })).rejects.toThrow(/deadline/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps the internal collection budget below the two-minute promotion shell timeout', { retry: 0 }, async () => {
    const { DEFAULT_COLLECTION_TIMEOUT_MS } = await import(
      '../../../scripts/release/collect-provider-evidence.mjs'
    );
    const workflow = await readFile(
      path.join(process.cwd(), '.github', 'workflows', 'release-production.yml'),
      'utf8'
    );

    const callerTimeoutMinutes = Number(
      workflow.match(
        /timeout --signal=TERM (\d+)m[\s\S]{0,400}?collect-provider-evidence\.mjs/
      )?.[1]
    );

    expect(DEFAULT_COLLECTION_TIMEOUT_MS).toBe(90_000);
    expect(callerTimeoutMinutes).toBe(2);
    expect(DEFAULT_COLLECTION_TIMEOUT_MS).toBeLessThan(callerTimeoutMinutes * 60_000);
  });
});
