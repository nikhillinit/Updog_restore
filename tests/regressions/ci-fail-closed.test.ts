import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

type WorkflowStep = {
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

  it('makes critical and high Trivy findings blocking', async () => {
    const workflow = await readWorkflow('security-scan.yml');
    const trivySteps = Object.values(workflow.jobs ?? {}).flatMap((job) =>
      (job.steps ?? []).filter((step) => step.uses?.includes('aquasecurity/trivy-action'))
    );

    expect(trivySteps).not.toHaveLength(0);
    for (const step of trivySteps) {
      expect(String(step.with?.severity)).toBe('CRITICAL,HIGH');
      expect(String(step.with?.['exit-code'])).toBe('1');
    }
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

    const gateNeeds = ciWorkflow.jobs?.gate?.needs;
    const normalizedNeeds = typeof gateNeeds === 'string' ? [gateNeeds] : (gateNeeds ?? []);
    expect(normalizedNeeds).toContain('release-static');

    const fullWorkflow = await readWorkflow('release-proof.yml');
    const fullScripts = allRunScripts(fullWorkflow).join('\n');
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
    const releaseScripts = allRunScripts(releaseWorkflow).join('\n');
    expect(releaseScripts).toContain('vercel@55.0.0 promote');
    expect(releaseScripts).toContain('tests/smoke/production-boundaries.spec.ts');
    expect(releaseScripts).toContain('PROD_SMOKE_USERNAME');
    expect(releaseScripts).toContain('PROD_SMOKE_PASSWORD');
  });
});
