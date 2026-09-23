import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';

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
  const content = await fs.readFile(
    path.join(process.cwd(), '.github/workflows/ci-unified.yml'),
    'utf-8'
  );
  return YAML.parse(content) as Workflow;
}

describe('CI Unified pull request full test lanes', () => {
  it('admits heavy pull requests with the selected full test groups', async () => {
    const workflow = await readCiUnifiedWorkflow();

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
  });
});
