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

  it('blocks the PowerShell dispatcher before invoking GitHub CLI', async () => {
    const script = await readFile(
      path.join(process.cwd(), 'scripts', 'deploy-production.ps1'),
      'utf8'
    );

    expect(script).not.toContain('gh workflow run');
    expect(script).toMatch(/production mutation is mechanically blocked/i);
  });
});
