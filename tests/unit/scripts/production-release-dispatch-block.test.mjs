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

  it('pins the PowerShell dispatcher to exact live main before invoking GitHub CLI', async () => {
    const script = await readFile(
      path.join(process.cwd(), 'scripts', 'deploy-production.ps1'),
      'utf8'
    );

    // The former mechanical block is superseded by the governed exact-SHA
    // dispatcher (Child F G4 hardening); its full contract is asserted in
    // tests/regressions/ci-fail-closed.test.ts. This guard keeps the
    // dispatch fail-closed: live-main SHA pinned and no bypass switches.
    expect(script).toContain('$expectedSha -notmatch "^[0-9a-f]{40}$"');
    expect(script).toContain(
      'gh workflow run release-production.yml --ref main --repo $repository --json'
    );
    expect(script).not.toMatch(/\bSkipSmokeTest\b|\bForce\b/);
  });
});
