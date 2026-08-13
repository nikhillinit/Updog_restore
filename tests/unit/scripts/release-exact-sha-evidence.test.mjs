import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  LOCKED_G3_CONTEXTS,
  aggregateExactShaEvidence,
  assertBranchProtectionReadable,
  collectPaginated,
  redactSecretShapedValues,
} from '../../../scripts/release/verify-exact-sha-checks.mjs';
import { verifyG3BootProof } from '../../../scripts/release/verify-g3-boot-proofs.mjs';
import {
  normalizeRailwayResponse,
  verifyProviderIdentity,
  verifyWorkerPrivateProof,
} from '../../../scripts/release/verify-provider-identity.mjs';

const execFileAsync = promisify(execFile);
const SHA = 'a'.repeat(40);
const DEPLOYMENT_ID = 'deployment-123';
const REQUIRED_PROOFS = [
  'vercel-api|make_app',
  'vercel-api|vercel_function',
  'railway-worker-fund-scenario-calc|worker_process',
  'railway-worker-capital-call-status|worker_process',
];

function exactChecks() {
  const contexts = [...LOCKED_G3_CONTEXTS];
  return {
    candidateSha: SHA,
    protection: { required_status_checks: { contexts, checks: [{ context: 'custom-protected' }] } },
    checkRuns: [...contexts, 'custom-protected'].map((name, id) => ({
      name, id, head_sha: SHA, status: 'completed', conclusion: 'success', completed_at: '2026-01-01T00:00:00.000Z',
    })),
    statuses: [],
  };
}

function health(workerType, deploymentId = DEPLOYMENT_ID, timestamp = new Date().toISOString()) {
  return {
    status: 'healthy', workerType, commit: SHA, deploymentId,
    timestamp,
    workers: [{ name: workerType, status: 'healthy', isRunning: true }],
  };
}

function ready(workerType, deploymentId = DEPLOYMENT_ID, timestamp = new Date().toISOString()) {
  return { status: 'ready', workerType, commit: SHA, deploymentId, timestamp };
}

function providerEvidence(mode = 'workflow') {
  const deployment = {
    id: 'vercel-deployment', url: 'candidate.vercel.app', readyState: 'READY', projectId: 'project-1',
    target: 'production', aliases: [], meta: { githubCommitRef: 'main', githubCommitSha: SHA },
  };
  const version = {
    version: '1.2.5', commit: SHA, environment: 'production', timestamp: 'now', nodeVersion: '22', platform: 'linux', arch: 'x64',
  };
  const railwayDeployment = {
    id: 'railway-deployment', status: 'SUCCESS', deploymentStopped: false, meta: { commitHash: SHA },
    instances: [{ id: 'instance-1', status: 'RUNNING' }],
  };
  return {
    mode, expectedSha: SHA,
    vercel: { expectedProjectId: 'project-1', deployment, version },
    railway: {
      projectId: 'railway-project', environmentId: 'railway-environment',
      services: ['fund-scenario-calc', 'capital-call-status'].map((serviceName) => ({
        serviceId: `${serviceName}-id`, serviceName, numReplicas: 1, domains: [],
        latestDeployment: { ...railwayDeployment }, activeDeployments: [{ ...railwayDeployment }],
      })),
    },
    protectedTopology: {
      projectId: 'railway-project',
      environmentId: 'railway-environment',
      services: {
        'fund-scenario-calc': 'fund-scenario-calc-id',
        'capital-call-status': 'capital-call-status-id',
      },
    },
  };
}

function successfulBootProof() {
  return {
    schema_version: '1.1.0',
    source_sha: SHA,
    proofs: REQUIRED_PROOFS.map((id) => {
      const [deployment, runtime] = id.split('|');
      const workerType = deployment.replace('railway-worker-', '');
      return {
        deployment, runtime, boot_status: 'proven',
        boot_evidence: {
          command_or_artifact: 'fixture', probe: 'fixture', result: 'fixture', observed_at: 'fixture',
        },
        ...(deployment.startsWith('railway-worker-') ? { worker_identity: { workerType, commit: SHA, deploymentId: DEPLOYMENT_ID } } : {}),
      };
    }),
  };
}

describe('exact SHA release evidence', () => {
  it('unions context and checks requirements', () => {
    expect(aggregateExactShaEvidence(exactChecks()).contexts).toContain('custom-protected');
  });

  it.each(['queued', 'in_progress', 'pending', 'skipped', 'cancelled', 'timed_out', 'action_required', 'failure'])(
    'rejects non-success check state %s',
    (state) => {
      const evidence = exactChecks();
      evidence.checkRuns[0] = { ...evidence.checkRuns[0], status: state === 'failure' ? 'completed' : state, conclusion: state === 'failure' ? 'failure' : null };
      expect(() => aggregateExactShaEvidence(evidence)).toThrow(/CI Gate Status/);
    }
  );

  it('fails closed for unreadable/missing/foreign/self-referential checks and deterministic latest ties', async () => {
    expect(() => assertBranchProtectionReadable({ status: 404 })).toThrow(/branch protection/i);
    expect(() => assertBranchProtectionReadable({ required_status_checks: {} })).toThrow(/required contexts/i);
    const foreign = exactChecks();
    foreign.checkRuns[0].head_sha = 'b'.repeat(40);
    expect(() => aggregateExactShaEvidence(foreign)).toThrow(/CI Gate Status/);
    const self = exactChecks();
    self.protection.required_status_checks.contexts.push('G3 Exact-SHA Verdict');
    expect(() => aggregateExactShaEvidence(self)).toThrow(/self-reference/i);
    const latest = exactChecks();
    latest.checkRuns.push({ ...latest.checkRuns[0], id: 999, conclusion: 'failure' });
    expect(() => aggregateExactShaEvidence(latest)).toThrow(/latest/i);
    const pages = [{ items: [{ id: 1 }], next: 'two' }, { items: [{ id: 2 }], next: null }];
    await expect(collectPaginated(async () => pages.shift())).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('orders overlapping retries by attempt start, never completion time', () => {
    const evidence = exactChecks();
    evidence.checkRuns[0] = {
      ...evidence.checkRuns[0],
      id: 100,
      started_at: '2026-01-01T00:00:00.000Z',
      completed_at: '2026-01-01T00:10:00.000Z',
    };
    evidence.checkRuns.push({
      ...evidence.checkRuns[0],
      id: 101,
      status: 'in_progress',
      conclusion: null,
      started_at: '2026-01-01T00:05:00.000Z',
      completed_at: null,
    });

    expect(() => aggregateExactShaEvidence(evidence)).toThrow(/latest check result for CI Gate Status is not terminal success/i);
  });

  it('requires the exact GitHub App for app-bound branch-protection checks', () => {
    const evidence = exactChecks();
    evidence.protection.required_status_checks.checks.push({ context: 'app-bound', app_id: 42 });
    evidence.protection.required_status_checks.checks.push({ context: 'app-bound', app_id: 41 });
    evidence.checkRuns.push({
      name: 'app-bound', id: 2, head_sha: SHA, status: 'completed', conclusion: 'success', app: { id: 99 },
    });
    evidence.statuses.push({ context: 'app-bound', id: 3, sha: SHA, state: 'success' });
    expect(() => aggregateExactShaEvidence(evidence)).toThrow(/missing required context app-bound/i);
    evidence.checkRuns.push({
      name: 'app-bound', id: 4, head_sha: SHA, status: 'completed', conclusion: 'success', app: { id: 42 },
    });
    expect(() => aggregateExactShaEvidence(evidence)).toThrow(/missing required context app-bound/i);
    evidence.checkRuns.push({
      name: 'app-bound', id: 5, head_sha: SHA, status: 'completed', conclusion: 'success', app: { id: 41 },
    });
    expect(aggregateExactShaEvidence(evidence).contexts).toContain('app-bound');
  });

  it('requires exact Task7 source, unique proof keys, per-worker identity, and --input CLI', async () => {
    expect(verifyG3BootProof(successfulBootProof(), SHA).sourceSha).toBe(SHA);
    const malformedSchema = successfulBootProof();
    malformedSchema.schema_version = '1.0.0';
    expect(() => verifyG3BootProof(malformedSchema, SHA)).toThrow(/schema/i);
    const invalid = successfulBootProof();
    invalid.proofs[2].worker_identity.workerType = 'capital-call-status';
    expect(() => verifyG3BootProof(invalid, SHA)).toThrow(/worker identity/i);
    const duplicate = successfulBootProof();
    duplicate.proofs.push({ ...duplicate.proofs[0], boot_status: 'failed' });
    expect(() => verifyG3BootProof(duplicate, SHA)).toThrow(/duplicate proof/i);
    const unrelatedDuplicate = successfulBootProof();
    unrelatedDuplicate.proofs.push(
      { deployment: 'vercel-web', runtime: 'client_router', boot_status: 'proven', boot_evidence: { command_or_artifact: 'fixture', probe: 'fixture', result: 'fixture', observed_at: 'fixture' } },
      { deployment: 'vercel-web', runtime: 'client_router', boot_status: 'failed', boot_evidence: { command_or_artifact: 'fixture', probe: 'fixture', result: 'fixture', observed_at: 'fixture' } }
    );
    expect(() => verifyG3BootProof(unrelatedDuplicate, SHA)).toThrow(/duplicate proof vercel-web\|client_router/i);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'boot-proof-'));
    const proofPath = path.join(directory, 'proof.json');
    await writeFile(proofPath, JSON.stringify(successfulBootProof()));
    const result = await execFileAsync(process.execPath, [
      'scripts/release/verify-g3-boot-proofs.mjs', '--input', proofPath, '--expected-sha', SHA,
    ], { cwd: process.cwd() });
    expect(result.stdout).toContain('G3 boot proof passed');
  });

  it('rejects historical, mismatched, and non-running Railway deployments', () => {
    const evidence = providerEvidence();
    expect(verifyProviderIdentity(evidence)).toMatchObject({
      mode: 'workflow',
      controlPlane: {
        vercel: { projectId: 'project-1', deploymentId: 'vercel-deployment' },
        railway: { projectId: 'railway-project', environmentId: 'railway-environment' },
      },
    });
    const historical = providerEvidence();
    historical.railway.services[0].latestDeployment.meta.commitHash = 'b'.repeat(40);
    expect(() => verifyProviderIdentity(historical)).toThrow(/does not match expected SHA/i);
    const correlation = providerEvidence();
    correlation.railway.services[0].activeDeployments[0].id = 'different-current-id';
    expect(() => verifyProviderIdentity(correlation)).toThrow(/latest and active deployments differ/i);
    const stopped = providerEvidence();
    stopped.railway.services[0].latestDeployment.instances[0].status = 'STOPPED';
    expect(() => verifyProviderIdentity(stopped)).toThrow(/deployment instance is invalid/i);
    const missingVercelProject = providerEvidence();
    delete missingVercelProject.vercel.expectedProjectId;
    delete missingVercelProject.vercel.deployment.projectId;
    expect(() => verifyProviderIdentity(missingVercelProject)).toThrow(/project ID/i);
    const previewTarget = providerEvidence();
    previewTarget.vercel.deployment.target = null;
    expect(() => verifyProviderIdentity(previewTarget)).toThrow(/staged candidate target is invalid/i);
    const aliasedProduction = providerEvidence();
    aliasedProduction.vercel.deployment.aliases = ['production.example.test'];
    expect(() => verifyProviderIdentity(aliasedProduction)).toThrow(/staged candidate has an alias/i);
    const missingRailwayScope = providerEvidence();
    delete missingRailwayScope.railway.projectId;
    expect(() => verifyProviderIdentity(missingRailwayScope)).toThrow(/project ID/i);
    const ambiguousStop = providerEvidence();
    delete ambiguousStop.railway.services[0].latestDeployment.deploymentStopped;
    expect(() => verifyProviderIdentity(ambiguousStop)).toThrow(/not successful/i);
  });

  it('normalizes only scoped Railway GraphQL data and rejects errors or pagination', () => {
    const railway = providerEvidence().railway;
    const raw = {
      data: {
        projectId: railway.projectId, environmentId: railway.environmentId,
        environment: { serviceInstances: { edges: railway.services.map((node) => ({ node })), pageInfo: { hasNextPage: false } } },
      },
    };
    expect(normalizeRailwayResponse(raw).services).toHaveLength(2);
    raw.data.environment.serviceInstances.pageInfo.hasNextPage = true;
    expect(() => normalizeRailwayResponse(raw)).toThrow(/pagination/i);
    raw.data.environment.serviceInstances.pageInfo = {};
    expect(() => normalizeRailwayResponse(raw)).toThrow(/pagination/i);
    expect(() => normalizeRailwayResponse({ errors: [{ message: 'denied' }] })).toThrow(/errors/i);
  });

  it('requires valid private health/readiness, one worker, and all four files', () => {
    const deploymentIds = { 'fund-scenario-calc': DEPLOYMENT_ID, 'capital-call-status': DEPLOYMENT_ID };
    const valid = verifyWorkerPrivateProof({ expectedSha: SHA, deploymentIds, fundHealth: health('fund-scenario-calc'), fundReady: ready('fund-scenario-calc'), capitalHealth: health('capital-call-status'), capitalReady: ready('capital-call-status') });
    expect(valid.reference).toMatch(/^sha256:[a-f0-9]{64}$/);
    const extraWorker = health('fund-scenario-calc');
    extraWorker.workers.push({ name: 'extra', status: 'healthy', isRunning: true });
    expect(() => verifyWorkerPrivateProof({ expectedSha: SHA, deploymentIds, fundHealth: extraWorker, fundReady: ready('fund-scenario-calc'), capitalHealth: health('capital-call-status'), capitalReady: ready('capital-call-status') })).toThrow(/exactly one/i);
    for (const key of ['fundHealth', 'fundReady', 'capitalHealth', 'capitalReady']) {
      const files = { fundHealth: health('fund-scenario-calc'), fundReady: ready('fund-scenario-calc'), capitalHealth: health('capital-call-status'), capitalReady: ready('capital-call-status') };
      delete files[key];
      expect(() => verifyWorkerPrivateProof({ expectedSha: SHA, deploymentIds, ...files })).toThrow();
    }
    expect(() => verifyWorkerPrivateProof({ expectedSha: SHA, deploymentIds: { ...deploymentIds, 'fund-scenario-calc': 'other-deployment' }, fundHealth: health('fund-scenario-calc'), fundReady: ready('fund-scenario-calc'), capitalHealth: health('capital-call-status'), capitalReady: ready('capital-call-status') })).toThrow(/does not match Railway/i);
    expect(() => verifyWorkerPrivateProof({ expectedSha: SHA, deploymentIds, fundHealth: health('fund-scenario-calc'), fundReady: ready('capital-call-status'), capitalHealth: health('capital-call-status'), capitalReady: ready('capital-call-status') })).toThrow(/readiness identity/i);
    const changed = verifyWorkerPrivateProof({ expectedSha: SHA, deploymentIds, fundHealth: { ...health('fund-scenario-calc'), timestamp: new Date(Date.now() - 1000).toISOString() }, fundReady: ready('fund-scenario-calc'), capitalHealth: health('capital-call-status'), capitalReady: ready('capital-call-status') });
    expect(changed.reference).not.toBe(valid.reference);
  });

  it('rejects stale, future, skewed, missing, and invalid operator probe timestamps', () => {
    const now = Date.parse('2026-08-10T12:00:00.000Z');
    const probe = (timestamp) => ({
      expectedSha: SHA,
      deploymentIds: { 'fund-scenario-calc': DEPLOYMENT_ID, 'capital-call-status': DEPLOYMENT_ID },
      fundHealth: health('fund-scenario-calc', DEPLOYMENT_ID, timestamp),
      fundReady: ready('fund-scenario-calc', DEPLOYMENT_ID, timestamp),
      capitalHealth: health('capital-call-status', DEPLOYMENT_ID, timestamp),
      capitalReady: ready('capital-call-status', DEPLOYMENT_ID, timestamp),
      now,
    });
    const fresh = new Date(now - 60 * 60 * 1000).toISOString();
    expect(verifyWorkerPrivateProof(probe(fresh)).reference).toMatch(/^sha256:/);
    expect(() => verifyWorkerPrivateProof(probe(new Date(now - 121 * 60 * 1000).toISOString()))).toThrow(/older than 120 minutes/i);
    expect(() => verifyWorkerPrivateProof(probe(new Date(now + 5 * 60 * 1000 + 1).toISOString()))).toThrow(/future/i);

    const skewed = probe(fresh);
    skewed.capitalReady.timestamp = new Date(now - 16 * 60 * 1000).toISOString();
    expect(() => verifyWorkerPrivateProof(skewed)).toThrow(/more than 15 minutes apart/i);

    const missing = probe(fresh);
    delete missing.fundReady.timestamp;
    expect(() => verifyWorkerPrivateProof(missing)).toThrow(/fund ready.*timestamp is required/i);
    const invalid = probe(fresh);
    invalid.capitalHealth.timestamp = 'not-a-timestamp';
    expect(() => verifyWorkerPrivateProof(invalid)).toThrow(/capital health.*timestamp is invalid/i);

    const customWindow = probe(new Date(now - 31 * 60 * 1000).toISOString());
    customWindow.maxProbeAgeMinutes = 30;
    expect(() => verifyWorkerPrivateProof(customWindow)).toThrow(/older than 30 minutes/i);
  });

  it('runs CLI with explicit source SHA and never trusts embedded candidate fields', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'release-proof-'));
    const provider = providerEvidence();
    const vercelPath = path.join(directory, 'vercel.json');
    const railwayPath = path.join(directory, 'railway.json');
    await writeFile(vercelPath, JSON.stringify({ ...provider.vercel, candidateSha: 'b'.repeat(40) }));
    await writeFile(railwayPath, JSON.stringify({
      data: {
        projectId: provider.railway.projectId,
        environmentId: provider.railway.environmentId,
        environment: { serviceInstances: { edges: provider.railway.services.map((node) => ({ node })), pageInfo: { hasNextPage: false } } },
      },
    }));
    const railwayIdentityFlags = [
      '--expected-railway-project-id', 'railway-project',
      '--expected-railway-environment-id', 'railway-environment',
      '--expected-fund-scenario-service-id', 'fund-scenario-calc-id',
      '--expected-capital-call-service-id', 'capital-call-status-id',
    ];
    const result = await execFileAsync(process.execPath, [
      'scripts/release/verify-provider-identity.mjs', '--mode', 'workflow', '--expected-sha', SHA,
      '--vercel', vercelPath, '--railway', railwayPath, ...railwayIdentityFlags,
    ], { cwd: process.cwd() });
    expect(result.stdout).toContain(SHA);
    const privatePaths = await Promise.all([
      ['fund-health.json', health('fund-scenario-calc', 'railway-deployment')],
      ['fund-ready.json', ready('fund-scenario-calc', 'railway-deployment')],
      ['capital-health.json', health('capital-call-status', 'railway-deployment')],
      ['capital-ready.json', ready('capital-call-status', 'railway-deployment')],
    ].map(async ([file, body]) => {
      const target = path.join(directory, file);
      await writeFile(target, JSON.stringify(body));
      return target;
    }));
    const operator = await execFileAsync(process.execPath, [
      'scripts/release/verify-provider-identity.mjs', '--mode', 'operator', '--expected-sha', SHA,
      '--vercel', vercelPath, '--railway', railwayPath, ...railwayIdentityFlags,
      '--max-probe-age-minutes', '120',
      '--fund-health', privatePaths[0], '--fund-ready', privatePaths[1],
      '--capital-health', privatePaths[2], '--capital-ready', privatePaths[3],
    ], { cwd: process.cwd() });
    expect(operator.stdout).toMatch(/sha256:[a-f0-9]{64}/);
    await expect(execFileAsync(process.execPath, [
      'scripts/release/verify-provider-identity.mjs', '--mode', 'workflow', '--expected-sha', 'bad', '--vercel', vercelPath, '--railway', railwayPath, ...railwayIdentityFlags,
    ], { cwd: process.cwd() })).rejects.toMatchObject({ stderr: expect.stringMatching(/expected SHA/i) });
  });

  it('redacts secret-shaped input values', () => {
    const redacted = redactSecretShapedValues({ token: 'never-print', url: 'https://a:never-print@example.test/?token=never-print' });
    expect(JSON.stringify(redacted)).not.toContain('never-print');
  });
});
