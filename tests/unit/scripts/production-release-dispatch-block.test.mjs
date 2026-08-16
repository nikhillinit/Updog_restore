import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

async function readWorkflow(name) {
  return YAML.parse(
    await readFile(path.join(process.cwd(), '.github', 'workflows', name), 'utf8')
  );
}

describe('production release dispatch block', () => {
  it('makes every provider mutation job unreachable', async () => {
    const workflow = await readWorkflow('release-production.yml');

    expect(workflow.jobs['stage-production'].if).toBe('${{ false }}');
    expect(workflow.jobs.promote.if).toBe('${{ false }}');
  });

  it('terminates every release dispatch with an explicit nonzero block', async () => {
    const workflow = await readWorkflow('release-production.yml');
    const blocker = workflow.jobs['production-mutation-block'];

    expect(blocker).toBeDefined();
    expect(blocker.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ run: expect.stringMatching(/exit 1/) }),
      ])
    );
    expect(workflow.jobs['validate-target'].needs).toBe('production-mutation-block');
  });

  it('blocks the PowerShell dispatcher before invoking GitHub CLI', async () => {
    const script = await readFile(
      path.join(process.cwd(), 'scripts', 'deploy-production.ps1'),
      'utf8'
    );

    expect(script).not.toContain('gh workflow run');
    expect(script).toMatch(/production mutation is mechanically blocked/i);
  });
});
