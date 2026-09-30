import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';

import { normalizeRailwayResponse } from '../../../scripts/release/provider-evidence-contract.mjs';

// The promote job builds the release-provider payload from the railway-evidence.json
// that collect-provider-evidence writes. That file is the normalized form
// ({ projectId, environmentId, services }); reading the raw GraphQL shape would fail
// after promotion (found by read-only replay before phase B of the F_1.18.1 release).
const SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);
let producerScript;

beforeAll(async () => {
  const workflow = YAML.parse(
    await readFile(
      path.join(process.cwd(), '.github', 'workflows', 'release-production.yml'),
      'utf8'
    )
  );
  producerScript = workflow.jobs.promote.steps
    .find((step) => step.name === 'Build release-provider evidence fragment')
    .run.split("node <<'NODE'\n")[1]
    .split('\nNODE\n')[0];
});

function deployment(id, commitHash) {
  return {
    id,
    status: 'SUCCESS',
    deploymentStopped: false,
    meta: { commitHash },
    instances: [{ id: `${id}-instance`, status: 'RUNNING' }],
  };
}

function railwayEvidence(fundSha) {
  const node = (serviceId, serviceName, deploymentId, commitHash) => ({
    serviceId,
    serviceName,
    numReplicas: null,
    domains: { serviceDomains: [], customDomains: [] },
    latestDeployment: deployment(deploymentId, commitHash),
    activeDeployments: [deployment(deploymentId, commitHash)],
  });
  return normalizeRailwayResponse({
    data: {
      projectId: 'railway-project',
      environmentId: 'railway-environment',
      environment: {
        serviceInstances: {
          pageInfo: { hasNextPage: false },
          edges: [
            { node: node('service-fund', 'fund-scenario-calc', 'deployment-fund', fundSha) },
            { node: node('service-capital', 'capital-call-status', 'deployment-capital', SHA) },
          ],
        },
      },
    },
  });
}

const temps = [];
afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function runProducer(evidence) {
  const temp = await mkdtemp(path.join(tmpdir(), 'release-provider-'));
  temps.push(temp);
  await mkdir(path.join(temp, 'provider-evidence-promote-7-1'));
  await writeFile(
    path.join(temp, 'provider-evidence-promote-7-1', 'railway-evidence.json'),
    JSON.stringify(evidence)
  );
  const result = spawnSync(process.execPath, ['-e', producerScript], {
    encoding: 'utf8',
    env: {
      RUNNER_TEMP: temp,
      GITHUB_RUN_ID: '7',
      GITHUB_RUN_ATTEMPT: '1',
      EXPECTED_SHA: SHA,
      VERCEL_PROJECT_ID: 'vercel-project',
      VERCEL_PRODUCTION_HOSTNAME: 'production.example.com',
      PROVED_DEPLOYMENT_ID: 'dpl_candidate',
      RAILWAY_PROJECT_ID: 'railway-project',
      RAILWAY_ENVIRONMENT_ID: 'railway-environment',
      RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID: 'service-fund',
      RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID: 'service-capital',
    },
  });
  const payload =
    result.status === 0
      ? JSON.parse(
          await readFile(path.join(temp, 'release-provider-fragment-payload.json'), 'utf8')
        )
      : null;
  return { status: result.status, stderr: result.stderr, payload };
}

describe('release-provider fragment producer', () => {
  it('builds the payload from normalized Railway evidence', { retry: 0 }, async () => {
    const result = await runProducer(railwayEvidence(SHA));
    expect(result.status).toBe(0);
    expect(result.payload.railway.services).toEqual([
      {
        serviceName: 'fund-scenario-calc',
        serviceId: 'service-fund',
        deploymentId: 'deployment-fund',
        sourceSha: SHA,
      },
      {
        serviceName: 'capital-call-status',
        serviceId: 'service-capital',
        deploymentId: 'deployment-capital',
        sourceSha: SHA,
      },
    ]);
    expect(result.payload.vercel).toEqual({
      projectId: 'vercel-project',
      deploymentId: 'dpl_candidate',
      hostname: 'production.example.com',
      sourceSha: SHA,
    });
  });

  it('fails when a worker is not on the release SHA', { retry: 0 }, async () => {
    const result = await runProducer(railwayEvidence(OLD_SHA));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Post-promotion Railway identity for fund-scenario-calc is not canonical.'
    );
  });
});
