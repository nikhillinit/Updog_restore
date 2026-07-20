import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

type WorkflowStep = {
  ['continue-on-error']?: boolean;
  env?: Record<string, unknown>;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  needs?: string | string[];
  steps?: WorkflowStep[];
  uses?: string;
};

type Workflow = {
  jobs?: Record<string, WorkflowJob>;
};

const workflowsDir = path.join(process.cwd(), '.github', 'workflows');

async function readWorkflow(name: string): Promise<Workflow> {
  const contents = await readFile(path.join(workflowsDir, name), 'utf8');
  return YAML.parse(contents) as Workflow;
}

function allRunScripts(workflow: Workflow): string[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
  );
}

function normalizeNeeds(needs: WorkflowJob['needs']): string[] {
  if (typeof needs === 'string') return [needs];
  return needs ?? [];
}

// A "reporting publisher" writes presentation-only content to the GitHub API
// (PR comments, labels, commit statuses, check runs). These calls depend on an
// external service; an outage on that surface is not a validation failure, so a
// reporting step must never be able to fail a job that feeds the required gate.
const REPORTING_WRITE_CALL =
  /createComment|updateComment|addLabels|removeLabel|setLabels|createCommitStatus|createStatus|checks\.create|checks\.update/;

function isReportingPublisher(step: WorkflowStep | undefined): boolean {
  if (!step || typeof step.uses !== 'string' || !step.uses.startsWith('actions/github-script')) {
    return false;
  }
  const script = typeof step.with?.script === 'string' ? step.with.script : '';
  return REPORTING_WRITE_CALL.test(script);
}

function isFailOpen(step: WorkflowStep | undefined): boolean {
  return step?.['continue-on-error'] === true;
}

function hasBoundedRetries(step: WorkflowStep | undefined): boolean {
  // The actions/github-script default is `retries: 0` (no retry). A reporting
  // step must set a bounded, positive retry count so a transient 5xx is absorbed
  // before it gives up; continue-on-error then guarantees that even an exhausted
  // retry cannot fail the job or regain gate authority.
  const retries = step?.with?.retries;
  return typeof retries === 'number' && Number.isInteger(retries) && retries > 0;
}

function reportingPublishers(job: WorkflowJob | undefined): WorkflowStep[] {
  return (job?.steps ?? []).filter(isReportingPublisher);
}

// The exact set of jobs the required aggregator (CI Gate Status) consumes.
// Pinned so that adding a new gate input forces a conscious review of its
// authority-vs-reporting classification below.
const GATE_FEEDING_JOBS = [
  'changes',
  'docs-link-check',
  'check',
  'test-affected',
  'test-full',
  'build',
  'release-static',
  'dependency-validation',
  'pr-light-security',
  'security-tests',
  'memory-mode',
  'guards',
  'secret-scan',
];

describe('required CI fails closed', () => {
  it('does not fall through from a failed unit or affected suite', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const scripts = allRunScripts(workflow);

    expect(scripts.join('\n')).not.toMatch(/test:unit[^\n]*\|\|\s*npm run test:quick/);

    const affectedJob = workflow.jobs?.['test-affected'];
    const affectedScripts = (affectedJob?.steps ?? [])
      .flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
      .join('\n');
    expect(affectedScripts).not.toMatch(/npm run test:affected[^\n]*\|\|/);
    expect(affectedScripts).toContain('npm run test:affected:plan');
    expect(affectedScripts).toContain('npm run test:affected:run');
  });

  it('does not mask bundle-budget failures', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const scripts = allRunScripts(workflow).join('\n');

    expect(scripts).not.toMatch(/npm run bundle:check\s*\|\|\s*true/);
    expect(scripts).toContain('npm run bundle:check');
  });

  it('does not downgrade governance failures to comments', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const flagsGuard = workflow.jobs?.guards?.steps?.find(
      (step) => step.name === 'Feature flags guard'
    );

    expect(flagsGuard).toBeDefined();
    expect(flagsGuard).not.toHaveProperty('continue-on-error', true);
  });

  it('does not let advisory PR comments override the validated gate result', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const gateSteps = workflow.jobs?.gate?.steps ?? [];
    const determineGateStatus = gateSteps.find((step) => step.name === 'Determine gate status');
    const commentPrStatus = gateSteps.find((step) => step.name === 'Comment PR status');

    expect(determineGateStatus).toBeDefined();
    expect(determineGateStatus).not.toHaveProperty('continue-on-error', true);
    expect(commentPrStatus).toBeDefined();
    expect(commentPrStatus).toHaveProperty('continue-on-error', true);
    // #1159 only made this advisory; the retro also requires bounded retries so a
    // transient 5xx is absorbed rather than merely swallowed.
    expect(hasBoundedRetries(commentPrStatus)).toBe(true);
  });

  it('makes critical and high Trivy findings blocking', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const requiredSecurityJob = workflow.jobs?.['pr-light-security'];
    const trivySteps = (requiredSecurityJob?.steps ?? []).filter((step) =>
      step.uses?.includes('aquasecurity/trivy-action')
    );

    expect(trivySteps).toHaveLength(2);
    expect(trivySteps.map((step) => step.with?.['scan-type'])).toEqual(['fs', 'image']);
    for (const step of trivySteps) {
      expect(String(step.with?.severity)).toBe('CRITICAL,HIGH');
      expect(String(step.with?.['exit-code'])).toBe('1');
    }

    const gateNeeds = workflow.jobs?.gate?.needs;
    const normalizedNeeds = typeof gateNeeds === 'string' ? [gateNeeds] : (gateNeeds ?? []);
    expect(normalizedNeeds).toContain('pr-light-security');
  });

  it('keeps npm audit blocking without coupling OWASP to its upstream availability', async () => {
    const ciWorkflow = await readWorkflow('ci-unified.yml');
    const requiredSecurityJob = ciWorkflow.jobs?.['pr-light-security'];
    const productionAudit = requiredSecurityJob?.steps?.find(
      (step) => step.name === 'Production dependency audit'
    );

    expect(productionAudit?.run).toContain('npm audit --omit=dev --audit-level=high');

    const deepScanWorkflow = await readWorkflow('security-scan.yml');
    const dependencyCheck = deepScanWorkflow.jobs?.['dependency-check']?.steps?.find(
      (step) => step.name === 'OWASP Dependency-Check'
    );
    expect(String(dependencyCheck?.with?.args)).toContain('--disableNodeAudit');

    const deepScanNeeds = deepScanWorkflow.jobs?.['security-scan']?.needs;
    const normalizedDeepScanNeeds =
      typeof deepScanNeeds === 'string' ? [deepScanNeeds] : (deepScanNeeds ?? []);
    expect(normalizedDeepScanNeeds).toContain('dependency-check');
  });

  it('runs secret scanning inside the required CI aggregator', async () => {
    const secretWorkflowPath = path.join(workflowsDir, 'secret-scan.yml');
    await expect(access(secretWorkflowPath)).resolves.toBeUndefined();

    const workflow = await readWorkflow('ci-unified.yml');
    expect(workflow.jobs?.['secret-scan']?.uses).toBe('./.github/workflows/secret-scan.yml');

    const gateNeeds = workflow.jobs?.gate?.needs;
    const normalizedNeeds = typeof gateNeeds === 'string' ? [gateNeeds] : (gateNeeds ?? []);
    expect(normalizedNeeds).toContain('secret-scan');
  });

  it('separates static diagnostics from full release proof', async () => {
    const ciWorkflow = await readWorkflow('ci-unified.yml');
    const staticScripts = allRunScripts({
      jobs: { release: ciWorkflow.jobs?.['release-static'] ?? {} },
    });
    expect(staticScripts.join('\n')).toContain('npm run release:check -- --skip-db');
    expect(staticScripts.join('\n')).toContain('npx playwright install --with-deps chromium');

    const gateNeeds = ciWorkflow.jobs?.gate?.needs;
    const normalizedNeeds = typeof gateNeeds === 'string' ? [gateNeeds] : (gateNeeds ?? []);
    expect(normalizedNeeds).toContain('release-static');

    const fullWorkflow = await readWorkflow('release-proof.yml');
    const fullScripts = allRunScripts(fullWorkflow).join('\n');
    expect(fullScripts).toContain('npx playwright install --with-deps chromium');
    expect(fullScripts).toContain('npm run release:check');
    expect(fullScripts).not.toContain('release:check -- --skip-db');

    const releaseChecker = await readFile(
      path.join(process.cwd(), 'scripts/release-check.mjs'),
      'utf8'
    );
    const dbBackedSteps = releaseChecker.slice(
      releaseChecker.indexOf('const dbBackedSteps'),
      releaseChecker.indexOf('if (skipDbProof)')
    );
    expect(dbBackedSteps).toContain("name: 'Scenario release gate'");
    expect(releaseChecker).toContain('steps.push(...dbBackedSteps)');
  });

  it('gates production promotion on a clean schema audit and authenticated smoke', async () => {
    const schemaWorkflow = await readWorkflow('prod-schema-reconcile.yml');
    const schemaScripts = allRunScripts(schemaWorkflow).join('\n');
    expect(schemaScripts).toContain('Production schema audit is clean.');

    const releaseWorkflow = await readWorkflow('release-production.yml');
    expect(releaseWorkflow.jobs?.['schema-audit']?.uses).toBe(
      './.github/workflows/prod-schema-reconcile.yml'
    );
    const stagedSmoke = releaseWorkflow.jobs?.['staged-smoke'];
    const stagedNeeds =
      typeof stagedSmoke?.needs === 'string' ? [stagedSmoke.needs] : (stagedSmoke?.needs ?? []);
    expect(stagedNeeds).toContain('validate-deployment');
    const stagedSmokeStep = stagedSmoke?.steps?.find(
      (step) => step.name === 'Run authenticated staged smoke'
    );
    expect(stagedSmokeStep?.env?.PRODUCTION_URL).toBe(
      '${{ needs.validate-deployment.outputs.deployment_url }}'
    );
    expect(stagedSmokeStep?.env).toHaveProperty('VERCEL_AUTOMATION_BYPASS_SECRET');
    // Staged smoke probes RUM origin layers with the canonical production
    // origin — the ephemeral staged URL is correctly not allow-listed.
    expect(stagedSmokeStep?.env?.RUM_ALLOWED_ORIGIN).toBe('${{ vars.PRODUCTION_URL }}');
    const stagedCredentialGuard = stagedSmoke?.steps?.find(
      (step) => step.name === 'Require non-skippable smoke credentials'
    );
    expect(stagedCredentialGuard?.run).toContain('VERCEL_AUTOMATION_BYPASS_SECRET is required');
    expect(stagedCredentialGuard?.run).toContain('RUM_ALLOWED_ORIGIN is required');

    const postPromotionSmoke = releaseWorkflow.jobs?.['post-promotion-smoke'];
    expect(JSON.stringify(postPromotionSmoke?.steps ?? [])).not.toContain(
      'VERCEL_AUTOMATION_BYPASS_SECRET'
    );

    const identityScripts = allRunScripts({
      jobs: { identity: releaseWorkflow.jobs?.['validate-deployment'] ?? {} },
    }).join('\n');
    expect(identityScripts).toContain('api.vercel.com/v13/deployments');
    expect(identityScripts).toContain('githubCommitSha');
    expect(identityScripts).toContain('GITHUB_OUTPUT');

    const releaseScripts = allRunScripts(releaseWorkflow).join('\n');
    expect(releaseScripts).toContain('vercel@55.0.0 promote');
    expect(releaseScripts).toContain('tests/smoke/production-boundaries.spec.ts');
    expect(releaseScripts).toContain('PROD_SMOKE_USERNAME');
    expect(releaseScripts).toContain('PROD_SMOKE_PASSWORD');
  });

  // --- Retro follow-up: authority-vs-reporting boundary enumeration ----------

  it('pins the CI Gate Status input surface so new feeders are classified', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const gateNeeds = normalizeNeeds(workflow.jobs?.gate?.needs);
    expect([...gateNeeds].sort()).toEqual([...GATE_FEEDING_JOBS].sort());
  });

  it('keeps the gate authority step blocking under all circumstances', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const determineGateStatus = (workflow.jobs?.gate?.steps ?? []).find(
      (step) => step.name === 'Determine gate status'
    );
    expect(determineGateStatus).toBeDefined();
    // Authority never becomes advisory and never delegates its verdict to a
    // reporting API — it computes the result and exits non-zero on failure.
    expect(determineGateStatus).not.toHaveProperty('continue-on-error', true);
    expect(isReportingPublisher(determineGateStatus)).toBe(false);
    expect(determineGateStatus?.run).toContain('exit 1');
  });

  it('makes every reporting publisher fail-open with bounded retries', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const publishers = Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      reportingPublishers(job).map((step) => ({ jobName, step }))
    );

    // Guard against a vacuous pass if the reporting steps are renamed or removed.
    expect(publishers.length).toBeGreaterThanOrEqual(3);
    expect(new Set(publishers.map(({ step }) => step.name))).toEqual(
      new Set(['Comment guard results', 'Comment PR with metrics', 'Comment PR status'])
    );

    const notFailOpen = publishers
      .filter(({ step }) => !isFailOpen(step))
      .map(({ jobName, step }) => `${jobName} > ${step.name ?? '(unnamed)'}`);
    expect(notFailOpen).toEqual([]);

    const missingRetries = publishers
      .filter(({ step }) => !hasBoundedRetries(step))
      .map(({ jobName, step }) => `${jobName} > ${step.name ?? '(unnamed)'}`);
    expect(missingRetries).toEqual([]);
  });

  it('proves no advisory publisher can fail the required CI Gate Status', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const jobs = workflow.jobs ?? {};
    const gateNeeds = normalizeNeeds(jobs.gate?.needs);

    // Every reporting publisher inside a gate-feeding job is fail-open, so an
    // outage on the reporting surface cannot turn the required gate red.
    const blockingReporters = gateNeeds.flatMap((jobName) =>
      reportingPublishers(jobs[jobName])
        .filter((step) => !isFailOpen(step))
        .map((step) => `${jobName} > ${step.name ?? '(unnamed)'}`)
    );
    expect(blockingReporters).toEqual([]);

    // `guards` is the only gate-feeding job that reports; its comment step is
    // advisory while its validation steps stay authoritative (fail-closed).
    const guardsReporters = reportingPublishers(jobs.guards).map((step) => step.name);
    expect(guardsReporters).toContain('Comment guard results');
    const flagsGuard = (jobs.guards?.steps ?? []).find(
      (step) => step.name === 'Feature flags guard'
    );
    expect(flagsGuard).toBeDefined();
    expect(flagsGuard).not.toHaveProperty('continue-on-error', true);
  });
});
