import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';

interface WorkflowStep {
  name?: string;
  run?: string;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface Workflow {
  jobs?: Record<string, WorkflowJob>;
}

async function readCiUnifiedWorkflow(): Promise<Workflow> {
  const workflowPath = path.join(process.cwd(), '.github/workflows/ci-unified.yml');
  const workflowContent = await fs.readFile(workflowPath, 'utf-8');
  return YAML.parse(workflowContent) as Workflow;
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
