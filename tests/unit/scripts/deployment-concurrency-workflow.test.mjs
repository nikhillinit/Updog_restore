import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const WORKFLOW_GROUPS = [
  ['release-production.yml', 'release-production'],
  ['release-canary-recovery.yml', 'release-production'],
  ['prod-schema-reconcile.yml', 'prod-schema-reconcile'],
  ['prod-journaled-migrate-0045-0049.yml', 'prod-schema-reconcile'],
  ['current-forecast-production-action.yml', 'current-forecast-production-${{ inputs.fund_id }}'],
  [
    'current-forecast-neon-rehearsal.yml',
    'current-forecast-neon-${{ inputs.project_id }}-${{ inputs.parent_branch_id }}',
  ],
  ['release-proof.yml', 'full-release-proof-${{ github.ref }}'],
];

async function readWorkflow(name) {
  return YAML.parse(await readFile(path.join('.github', 'workflows', name), 'utf8'));
}

describe('deployment and recovery concurrency', () => {
  it.each(WORKFLOW_GROUPS)(
    '%s retains pending requests without cancelling an active run',
    async (name, group) => {
      const workflow = await readWorkflow(name);
      expect(workflow.concurrency).toEqual({
        group,
        'cancel-in-progress': false,
        queue: 'max',
      });
    }
  );

  it('keeps reusable release gates outside the caller lock to avoid self-blocking', async () => {
    const release = await readWorkflow('release-production.yml');
    const gates = Object.values(release.jobs).filter((job) =>
      job.uses?.startsWith('./.github/workflows/')
    );
    expect(gates.map((job) => job.uses).sort()).toEqual([
      './.github/workflows/prod-schema-reconcile.yml',
      './.github/workflows/release-proof.yml',
    ]);

    for (const gate of gates) {
      const called = await readWorkflow(path.basename(gate.uses));
      expect(called.concurrency.group.toLowerCase()).not.toBe(
        release.concurrency.group.toLowerCase()
      );
    }
  });

  it('keeps superseded source-validation CI cancellable', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    expect(workflow.concurrency).toEqual({
      group: 'ci-${{ github.event_name }}-${{ github.ref }}',
      'cancel-in-progress': true,
    });
  });
});
