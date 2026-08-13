import { describe, expect, it } from 'vitest';

import {
  verifyProviderIdentity,
  verifyRailwayTopology,
} from '../../../scripts/release/verify-provider-identity.mjs';

const SHA = 'a'.repeat(40);
const TOPOLOGY = {
  projectId: 'railway-project',
  environmentId: 'railway-environment',
  services: {
    'fund-scenario-calc': 'service-fund',
    'capital-call-status': 'service-capital',
  },
};

function deployment(id) {
  return {
    id,
    status: 'SUCCESS',
    deploymentStopped: false,
    meta: { commitHash: SHA },
    instances: [{ id: `${id}-instance`, status: 'RUNNING' }],
  };
}

function railwayEvidence({ services } = {}) {
  return {
    projectId: TOPOLOGY.projectId,
    environmentId: TOPOLOGY.environmentId,
    services: services ?? [
      ['fund-scenario-calc', 'service-fund'],
      ['capital-call-status', 'service-capital'],
    ].map(([serviceName, serviceId]) => {
      const current = deployment(`${serviceId}-deployment`);
      return {
        serviceName,
        serviceId,
        numReplicas: 1,
        domains: [],
        latestDeployment: current,
        activeDeployments: [{ ...current, instances: [...current.instances] }],
      };
    }),
  };
}

function vercelEvidence() {
  return {
    expectedProjectId: 'vercel-project',
    deployment: {
      id: 'dpl_candidate',
      url: 'https://candidate.vercel.app',
      readyState: 'READY',
      target: 'production',
      projectId: 'vercel-project',
      aliases: [],
      meta: { githubCommitRef: 'main', githubCommitSha: SHA },
    },
    version: {
      arch: 'x64',
      commit: SHA,
      environment: 'production',
      nodeVersion: '22',
      platform: 'vercel',
      timestamp: '2026-08-12T00:00:00.000Z',
      version: '1.0.0',
    },
  };
}

describe('verify-provider-identity', () => {
  it('delegates Vercel and Railway identity checks to protected contract values', { retry: 0 }, () => {
    const result = verifyProviderIdentity({
      mode: 'workflow',
      expectedSha: SHA,
      expectedVercelProjectId: 'vercel-project',
      vercel: vercelEvidence(),
      railway: railwayEvidence(),
      protectedTopology: TOPOLOGY,
    });

    expect(result).toMatchObject({
      mode: 'workflow',
      expectedSha: SHA,
      controlPlane: {
        vercel: { projectId: 'vercel-project', deploymentId: 'dpl_candidate' },
        railway: {
          projectId: 'railway-project',
          environmentId: 'railway-environment',
          services: expect.arrayContaining([
            {
              serviceName: 'fund-scenario-calc',
              serviceId: 'service-fund',
              deploymentId: 'service-fund-deployment',
            },
            {
              serviceName: 'capital-call-status',
              serviceId: 'service-capital',
              deploymentId: 'service-capital-deployment',
            },
          ]),
        },
      },
    });
  });

  it('does not accept matching names with wrong protected IDs', { retry: 0 }, () => {
    const railway = railwayEvidence({
      services: railwayEvidence().services.map((service) => ({
        ...service,
        serviceId: service.serviceName === 'fund-scenario-calc' ? 'wrong-id' : service.serviceId,
      })),
    });
    expect(() => verifyProviderIdentity({
      mode: 'workflow',
      expectedSha: SHA,
      expectedVercelProjectId: 'vercel-project',
      vercel: vercelEvidence(),
      railway,
      protectedTopology: TOPOLOGY,
    })).toThrow(/protected|Railway/i);
  });

  it('allows unrelated services only after full topology scan', { retry: 0 }, () => {
    const railway = railwayEvidence();
    railway.services.push({ serviceName: 'unrelated-api', serviceId: 'service-api', domains: [] });
    expect(() => verifyRailwayTopology(railway, SHA, TOPOLOGY)).not.toThrow();
  });

  it('keeps provider secrets out of verifier failures and normalized output', { retry: 0 }, () => {
    const secret = 'RAILWAY_TOKEN-value-must-not-escape';
    const malformed = railwayEvidence({
      services: [{ serviceName: secret, serviceId: 'service-fund', domains: [] }],
    });
    let error;
    try {
      verifyRailwayTopology(malformed, SHA, TOPOLOGY);
    } catch (caught) {
      error = caught;
    }
    expect(error?.message).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
  });
});
