import { describe, expect, it } from 'vitest';
import { URL } from 'node:url';

import {
  normalizeRailwayResponse,
  verifyRailwayTopology,
  verifyVercelEvidence,
} from '../../../scripts/release/provider-evidence-contract.mjs';

const SHA = 'a'.repeat(40);
const TOPOLOGY = {
  projectId: 'railway-project',
  environmentId: 'railway-environment',
  services: {
    'fund-scenario-calc': 'service-fund',
    'capital-call-status': 'service-capital',
  },
};

function deployment(id, commit = SHA, status = 'SUCCESS') {
  return {
    id,
    status,
    deploymentStopped: false,
    meta: { commitHash: commit },
    instances: [{ id: `${id}-instance`, status: status === 'SUCCESS' ? 'RUNNING' : 'BUILDING' }],
  };
}

function service(serviceName, serviceId, options = {}) {
  const current = deployment(`${serviceId}-deployment`, options.commit, options.status);
  return {
    serviceId,
    serviceName,
    numReplicas: options.numReplicas ?? 1,
    domains: options.domains ?? [],
    latestDeployment: current,
    activeDeployments: [{ ...current, instances: current.instances.map((instance) => ({ ...instance })) }],
  };
}

function railway(options = {}) {
  return {
    projectId: options.projectId ?? TOPOLOGY.projectId,
    environmentId: options.environmentId ?? TOPOLOGY.environmentId,
    services: options.services ?? [
      service('fund-scenario-calc', TOPOLOGY.services['fund-scenario-calc']),
      service('capital-call-status', TOPOLOGY.services['capital-call-status']),
    ],
  };
}

function vercel(options = {}) {
  return {
    deployment: {
      id: 'dpl_candidate',
      url: 'https://candidate.vercel.app',
      readyState: 'READY',
      target: 'production',
      projectId: 'vercel-project',
      aliases: [],
      meta: { githubCommitRef: 'main', githubCommitSha: SHA },
      ...options.deployment,
    },
    version: {
      arch: 'x64',
      commit: SHA,
      environment: 'production',
      nodeVersion: '22',
      platform: 'vercel',
      timestamp: '2026-08-12T00:00:00.000Z',
      version: '1.0.0',
      ...options.version,
    },
  };
}

describe('provider-evidence-contract', () => {
  it('verifies staged Vercel evidence and returns normalized identity', { retry: 0 }, () => {
    const result = verifyVercelEvidence(vercel(), 'vercel-project', {
      kind: 'staged_candidate',
      expectedSha: SHA,
    });

    expect(result).toMatchObject({
      projectId: 'vercel-project',
      deploymentId: 'dpl_candidate',
      sourceSha: SHA,
      deployment: { aliases: [] },
    });
  });

  it.each([
    ['wrong project', { expectedProjectId: 'other' }, 'Vercel deployment project'],
    ['not ready', { deployment: { readyState: 'BUILDING' } }, 'not READY'],
    ['wrong target', { deployment: { target: 'preview' } }, 'target'],
    ['aliased', { deployment: { aliases: ['production.example.com'] } }, 'alias'],
    ['wrong commit', { deployment: { meta: { githubCommitRef: 'main', githubCommitSha: 'b'.repeat(40) } } }, 'commit'],
    ['wrong version', { version: { commit: 'b'.repeat(40) } }, 'version'],
    ['non-vercel URL', { deployment: { url: 'https://example.com' } }, 'URL'],
  ])('rejects staged Vercel %s', { retry: 0 }, (_label, changes, expected) => {
    const input = vercel(changes.expectedProjectId ? {} : changes);
    expect(() => verifyVercelEvidence(input, changes.expectedProjectId ?? 'vercel-project', {
      kind: 'staged_candidate',
      expectedSha: SHA,
    })).toThrow(new RegExp(expected, 'i'));
  });

  it('verifies canonical baseline mode and returns current source identity', { retry: 0 }, () => {
    const result = verifyVercelEvidence(
      vercel({
        deployment: {
          aliases: ['production.example.com'],
          meta: { githubCommitSha: SHA },
        },
      }),
      'vercel-project',
      { kind: 'canonical_baseline', canonicalHostname: 'production.example.com' }
    );
    expect(result).toMatchObject({
      deploymentId: 'dpl_candidate',
      sourceSha: SHA,
    });
  });

  it.each(['https://production.example.com', 'production.example.com/', 'production.example.com:443', 'PRODUCTION.EXAMPLE.COM'])(
    'rejects malformed canonical hostname %s',
    { retry: 0 },
    (canonicalHostname) => {
      expect(() => verifyVercelEvidence(
        vercel({
          deployment: {
            aliases: ['production.example.com'],
            meta: { githubCommitSha: SHA },
          },
        }),
        'vercel-project',
        { kind: 'canonical_baseline', canonicalHostname }
      )).toThrow(/canonical hostname/i);
    }
  );

  it('accepts unrelated Railway services after scanning the full topology', { retry: 0 }, () => {
    const evidence = railway({
      services: [
        service('fund-scenario-calc', TOPOLOGY.services['fund-scenario-calc']),
        service('capital-call-status', TOPOLOGY.services['capital-call-status']),
        { serviceName: 'unrelated-api', serviceId: 'service-api', domains: [] },
      ],
    });
    expect(verifyRailwayTopology(evidence, SHA, TOPOLOGY)).toMatchObject({
      services: [
        { serviceName: 'fund-scenario-calc', serviceId: 'service-fund' },
        { serviceName: 'capital-call-status', serviceId: 'service-capital' },
      ],
    });
  });

  it.each([
    ['wrong project', railway({ projectId: 'other-project' })],
    ['wrong environment', railway({ environmentId: 'other-environment' })],
    ['wrong fund service ID', railway({ services: [
      service('fund-scenario-calc', 'wrong-fund'),
      service('capital-call-status', 'service-capital'),
    ] }),],
    ['wrong capital service ID', railway({ services: [
      service('fund-scenario-calc', 'service-fund'),
      service('capital-call-status', 'wrong-capital'),
    ] }),],
    ['wrong commit', railway({ services: [
      service('fund-scenario-calc', 'service-fund', { commit: 'b'.repeat(40) }),
      service('capital-call-status', 'service-capital'),
    ] }),],
  ])('rejects Railway identity mismatch: %s', { retry: 0 }, (_label, evidence) => {
    expect(() => verifyRailwayTopology(evidence, SHA, TOPOLOGY)).toThrow(/Railway/);
  });

  it.each([
    ['duplicate protected name', [
      service('fund-scenario-calc', 'service-fund'),
      service('fund-scenario-calc', 'another-fund'),
      service('capital-call-status', 'service-capital'),
    ]],
    ['duplicate protected ID', [
      service('fund-scenario-calc', 'service-fund'),
      service('other-worker', 'service-fund'),
      service('capital-call-status', 'service-capital'),
    ]],
    ['cross-mapped pairs', [
      service('fund-scenario-calc', 'service-capital'),
      service('capital-call-status', 'service-fund'),
    ]],
  ])('rejects Railway %s', { retry: 0 }, (_label, services) => {
    expect(() => verifyRailwayTopology(railway({ services }), SHA, TOPOLOGY)).toThrow(/Railway/);
  });

  it('rejects paginated or malformed Railway GraphQL evidence', { retry: 0 }, () => {
    expect(() => normalizeRailwayResponse({
      data: { projectId: 'p', environmentId: 'e', environment: { serviceInstances: { edges: [], pageInfo: { hasNextPage: true } } } },
    })).toThrow(/pagination/i);
    expect(() => normalizeRailwayResponse({
      data: { projectId: 'p', environmentId: 'e', environment: { serviceInstances: { edges: [], pageInfo: { hasNextPage: false } } } },
      errors: [{ message: 'provider error' }],
    })).toThrow(/errors/i);
  });

  it('contains no IO implementation in pure contract module', { retry: 0 }, async () => {
    const source = await (await import('node:fs/promises')).readFile(
      new URL('../../../scripts/release/provider-evidence-contract.mjs', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/from ['"]node:(fs|http|https)/);
    expect(source).not.toMatch(/\b(fetch|writeFile|readFile)\s*\(/);
  });
});
