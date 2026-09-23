import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { TESTCONTAINERS_TEST_PATHS } from '../config/testcontainers-test-paths.mjs';

interface WorkflowStep {
  id?: string;
  name?: string;
  run?: string;
}

interface WorkflowJob {
  if?: string;
  outputs?: Record<string, string>;
  strategy?: { matrix?: { group?: string } };
  steps?: WorkflowStep[];
}

interface Workflow {
  jobs?: Record<string, WorkflowJob>;
}

async function readCiUnifiedWorkflow(): Promise<Workflow> {
  const workflowContent = await readRepoFile('.github/workflows/ci-unified.yml');
  return YAML.parse(workflowContent) as Workflow;
}

async function readRepoFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), 'utf-8');
}

describe('CI Unified Playwright setup', () => {
  it('installs Chromium before affected tests can invoke Playwright smoke tests', async () => {
    const workflow = await readCiUnifiedWorkflow();
    const affectedSteps = workflow.jobs?.['test-affected']?.steps ?? [];

    const installPlaywrightIndex = affectedSteps.findIndex(
      (step) =>
        step.name === 'Install Playwright' &&
        step.run?.includes('npx playwright install --with-deps chromium')
    );
    const runAffectedTestsIndex = affectedSteps.findIndex(
      (step) => step.name === 'Run affected tests'
    );

    expect(installPlaywrightIndex).toBeGreaterThanOrEqual(0);
    expect(runAffectedTestsIndex).toBeGreaterThanOrEqual(0);
    expect(installPlaywrightIndex).toBeLessThan(runAffectedTestsIndex);
  });
});

describe('CI Unified scenario release gate', () => {
  it('keeps the release gate covered by affected and full integration paths', async () => {
    const scenarioReleaseGatePath =
      'tests/integration/scenarios/scenario-release-gate.integration.test.ts';
    const workflow = await readCiUnifiedWorkflow();
    const affectedRun =
      workflow.jobs?.['test-affected']?.steps?.find((step) => step.name === 'Run affected tests')
        ?.run ?? '';
    const fullRun =
      workflow.jobs?.['test-full']?.steps?.find((step) => step.name === 'Run tests')?.run ?? '';
    const integrationConfig = await readRepoFile('vitest.config.int.ts');
    const smartTestRunner = await readRepoFile('scripts/test-smart.mjs');
    const integrationIncludeBlock =
      integrationConfig.match(/include:\s*\[([\s\S]*?)\],/)?.[1] ?? '';
    const integrationExcludeBlock =
      integrationConfig.match(/exclude:\s*\[([\s\S]*?)\],/)?.[1] ?? '';

    expect(affectedRun).toContain('npm run test:scenario-release-gate');
    expect(fullRun).toContain('integration)');
    expect(fullRun).toContain('npm run test:integration');
    expect(integrationConfig).toContain(`'${scenarioReleaseGatePath}'`);
    expect(integrationIncludeBlock).toContain('scenarioReleaseGatePath');
    expect(integrationExcludeBlock).not.toContain(scenarioReleaseGatePath);
    expect(integrationExcludeBlock).not.toContain('scenarioReleaseGatePath');
    expect(integrationExcludeBlock).toContain('...testcontainersOnlyPaths');

    // Testcontainers-only ownership is centralized in one canonical manifest
    // (tests/config/testcontainers-test-paths.mjs), consumed by the Docker
    // vitest config, the plain-integration exclude list, and affected-test
    // routing. Verify both configs are wired to that single source rather
    // than carrying their own hardcoded path lists that can drift apart.
    expect(integrationConfig).toContain("from './tests/config/testcontainers-test-paths.mjs'");
    expect(smartTestRunner).toContain("from '../tests/config/testcontainers-test-paths.mjs'");
    expect(TESTCONTAINERS_TEST_PATHS.length).toBeGreaterThan(0);
    expect(TESTCONTAINERS_TEST_PATHS).not.toContain(scenarioReleaseGatePath);
  });
});

describe('CI Unified pull request full test lanes', () => {
  it('admits heavy pull requests with the selected full test groups', async () => {
    const workflow = await readCiUnifiedWorkflow();

    expect(workflow.jobs?.['test-full']?.if).toContain(
      "needs.changes.outputs.full_suite == 'true'"
    );
    expect(workflow.jobs?.['test-full']?.if).toContain(
      "(github.event_name == 'pull_request' && needs.changes.outputs.heavy_ci_relevant == 'true')"
    );
    expect(workflow.jobs?.['test-full']?.strategy?.matrix?.group).toBe(
      '${{ fromJSON(needs.changes.outputs.test_full_groups) }}'
    );
    expect(workflow.jobs?.changes?.outputs?.test_full_groups).toBe(
      '${{ steps.groups.outputs.test_full_groups }}'
    );
  });

  it('selects the ordinary pull request lanes and all three full-suite lanes', async () => {
    const workflow = await readCiUnifiedWorkflow();
    const groups = workflow.jobs?.changes?.steps?.find((step) => step.id === 'groups');

    expect(groups).toBeDefined();
    expect(groups?.run).toContain('full_suite=true');
    expect(groups?.run).toContain('["integration","validate-core"]');
    expect(groups?.run).toContain('["integration","e2e","validate-core"]');
  });

  it('runs full tests without suppressing failures or a leading conditional', async () => {
    const workflow = await readCiUnifiedWorkflow();
    const runTests = workflow.jobs?.['test-full']?.steps?.find((step) => step.name === 'Run tests');

    expect(runTests).toBeDefined();
    expect(runTests).not.toHaveProperty('continue-on-error');
    expect(runTests?.run).not.toMatch(/\|\|\s*true/);
    expect(runTests?.run?.trimStart().startsWith('if ')).toBe(false);
  });

  it('requires the full lanes when the pull request gate expects them', async () => {
    const workflow = await readCiUnifiedWorkflow();
    const gate = workflow.jobs?.gate?.steps?.find((step) => step.name === 'Determine gate status');

    expect(gate?.run).toContain(
      'require_result "Test (full integration)" "${{ needs.test-full.result }}" "$test_full_expected"'
    );
    expect(gate?.run).toContain('require_result "Test" "$test_result" "$test_expected"');
    expect(gate?.run).toContain(
      'if [[ "$schema_changed" == "true" || "$heavy_ci_relevant" == "true" ]]; then'
    );
  });
});
