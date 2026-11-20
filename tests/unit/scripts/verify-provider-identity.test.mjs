import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { promisify } from 'node:util';

import {
  verifyProviderIdentity,
  verifyAccessPosture,
  verifyRailwayTopology,
} from '../../../scripts/release/verify-provider-identity.mjs';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(process.cwd(), 'scripts/release/verify-provider-identity.mjs');

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
      aliases: ['project-candidate-team.vercel.app'],
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

function validPosture() {
  return {
    deploymentType: 'all',
    hostnames: ['production.example.com', 'www.example.com'],
    probes: [
      { hostname: 'production.example.com', status: 302, redirectHost: 'vercel.com', redirectPathPrefix: '/sso-api' },
      { hostname: 'www.example.com', status: 401, redirectHost: null, redirectPathPrefix: null },
    ],
  };
}

const invalidPostures = [
  ['non-global deployment type', (posture) => { posture.deploymentType = 'all_except_custom_domains'; }],
  ['null deployment type', (posture) => { posture.deploymentType = null; }],
  ['empty inventory', (posture) => { posture.hostnames = []; posture.probes = []; }],
  ['canonical missing from inventory', (posture) => { posture.hostnames = ['www.example.com']; posture.probes = posture.probes.slice(1); }],
  ['duplicate hostname', (posture) => { posture.hostnames.push('production.example.com'); }],
  ['hostname without probe', (posture) => { posture.probes.pop(); }],
  ['duplicate probe', (posture) => { posture.probes[1] = { ...posture.probes[0] }; }],
  ['probe outside inventory', (posture) => { posture.probes[1].hostname = 'outside.example.com'; }],
  ...[200, 404, 500].map((status) => [String(status), (posture) => { posture.probes[0].status = status; }]),
  ['foreign redirect', (posture) => { posture.probes[0].redirectHost = 'evil.test'; }],
  ['wrong redirect path', (posture) => { posture.probes[0].redirectPathPrefix = '/login'; }],
  ['suffix look-alike host', (posture) => { posture.probes[0].redirectHost = 'vercel.com.evil.test'; }],
  ['prefix look-alike host', (posture) => { posture.probes[0].redirectHost = 'evilvercel.com'; }],
];

describe('verify-provider-identity', () => {
  it.each(['workflow', 'operator'])('keeps CLI JSON unchanged with optional posture in %s mode', { retry: 0 }, async (mode) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'verify-posture-cli-'));
    try {
      const files = {
        vercel: path.join(root, 'vercel.json'),
        railway: path.join(root, 'railway.json'),
        posture: path.join(root, 'posture.json'),
      };
      await writeFile(files.vercel, JSON.stringify(vercelEvidence()));
      await writeFile(files.railway, JSON.stringify(railwayEvidence()));
      await writeFile(files.posture, JSON.stringify(validPosture()));
      const args = [
        '--mode', mode,
        '--expected-sha', SHA,
        '--expected-vercel-project-id', 'vercel-project',
        '--canonical-hostname', 'production.example.com',
        '--expected-railway-project-id', TOPOLOGY.projectId,
        '--expected-railway-environment-id', TOPOLOGY.environmentId,
        '--expected-fund-scenario-service-id', TOPOLOGY.services['fund-scenario-calc'],
        '--expected-capital-call-service-id', TOPOLOGY.services['capital-call-status'],
        '--vercel', files.vercel,
        '--railway', files.railway,
      ];
      if (mode === 'operator') {
        const timestamp = new Date().toISOString();
        for (const [key, workerType, deploymentId] of [
          ['fund', 'fund-scenario-calc', 'service-fund-deployment'],
          ['capital', 'capital-call-status', 'service-capital-deployment'],
        ]) {
          const healthPath = path.join(root, `${key}-health.json`);
          const readyPath = path.join(root, `${key}-ready.json`);
          await writeFile(healthPath, JSON.stringify({
            timestamp, status: 'healthy', workerType, commit: SHA, deploymentId,
            workers: [{ name: workerType, status: 'healthy', isRunning: true }],
          }));
          await writeFile(readyPath, JSON.stringify({
            timestamp, status: 'ready', workerType, commit: SHA, deploymentId,
          }));
          args.push(`--${key}-health`, healthPath, `--${key}-ready`, readyPath);
        }
      }
      const withoutPosture = await execFileAsync(process.execPath, [CLI_PATH, ...args]);
      const withPosture = await execFileAsync(process.execPath, [
        CLI_PATH, ...args, '--access-posture-file', files.posture,
      ]);
      expect(JSON.parse(withPosture.stdout)).toEqual(JSON.parse(withoutPosture.stdout));
      expect(Object.keys(JSON.parse(withPosture.stdout))).toEqual([
        'mode', 'expectedSha', 'controlPlane', 'privateProof',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['missing', 'malformed'])('fails CLI closed for %s posture file', { retry: 0 }, async (state) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'verify-posture-cli-'));
    try {
      const posturePath = path.join(root, 'posture.json');
      if (state === 'malformed') await writeFile(posturePath, '{');
      const result = await execFileAsync(process.execPath, [
        CLI_PATH,
        '--mode', 'workflow',
        '--expected-vercel-project-id', 'vercel-project',
        '--canonical-hostname', 'production.example.com',
        '--access-posture-file', posturePath,
      ]).catch((error) => error);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(/Access posture JSON file is unreadable/);
      expect(result.stderr).not.toContain('production.example.com');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts one SSO redirect and one 401 for the complete canonical inventory', { retry: 0 }, () => {
    expect(() => verifyAccessPosture({
      posture: validPosture(),
      canonicalHostname: 'PRODUCTION.EXAMPLE.COM',
    })).not.toThrow();
  });

  it.each(invalidPostures)('rejects access posture with %s', { retry: 0 }, (_label, mutate) => {
    const posture = validPosture();
    mutate(posture);
    expect(() => verifyAccessPosture({ posture, canonicalHostname: 'production.example.com' }))
      .toThrow('Provider identity failed: access posture is invalid');
  });

  it('rejects non-plain posture values with a generic error', { retry: 0 }, () => {
    expect(() => verifyAccessPosture({ posture: [], canonicalHostname: 'private.example.com' }))
      .toThrow('Provider identity failed: access posture is invalid');
  });

  it('delegates Vercel and Railway identity checks to protected contract values', { retry: 0 }, () => {
    const result = verifyProviderIdentity({
      mode: 'workflow',
      expectedSha: SHA,
      expectedVercelProjectId: 'vercel-project',
      canonicalHostname: 'production.example.com',
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
      canonicalHostname: 'production.example.com',
      vercel: vercelEvidence(),
      railway,
      protectedTopology: TOPOLOGY,
    })).toThrow(/protected|Railway/i);
  });

  it('optionally requires Railway active deployment IDs from the deploy job', { retry: 0 }, () => {
    const expectedDeploymentIds = {
      'fund-scenario-calc': 'service-fund-deployment',
      'capital-call-status': 'service-capital-deployment',
    };
    const options = {
      mode: 'workflow',
      expectedSha: SHA,
      expectedVercelProjectId: 'vercel-project',
      canonicalHostname: 'production.example.com',
      vercel: vercelEvidence(),
      railway: railwayEvidence(),
      protectedTopology: TOPOLOGY,
      expectedDeploymentIds,
    };

    const result = verifyProviderIdentity(options);
    expect(result.controlPlane.railway.services).toEqual(expect.arrayContaining([
      expect.objectContaining({
        serviceName: 'fund-scenario-calc',
        deploymentId: expectedDeploymentIds['fund-scenario-calc'],
      }),
      expect.objectContaining({
        serviceName: 'capital-call-status',
        deploymentId: expectedDeploymentIds['capital-call-status'],
      }),
    ]));
    expect(() => verifyProviderIdentity({
      ...options,
      expectedDeploymentIds: {
        ...expectedDeploymentIds,
        'fund-scenario-calc': 'wrong-deployment',
      },
    })).toThrow(/active deployment ID does not match expected deployment ID/);
  });

  it('rejects a staged candidate that already holds the canonical alias', { retry: 0 }, () => {
    const vercel = vercelEvidence();
    vercel.deployment.aliases = ['project-candidate-team.vercel.app', 'production.example.com'];
    expect(() => verifyProviderIdentity({
      mode: 'workflow',
      expectedSha: SHA,
      expectedVercelProjectId: 'vercel-project',
      canonicalHostname: 'production.example.com',
      vercel,
      railway: railwayEvidence(),
      protectedTopology: TOPOLOGY,
    })).toThrow(/already holds the canonical alias/);
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
