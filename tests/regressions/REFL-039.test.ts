import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';

// REFL-039: transport failure must not invert model roles.
// DEV_BRAIN.md's Plan Review Gate and Lane Hygiene sections are the enforcement
// surface for the restored model co-op flow; pruning them reopens the trap.
async function readDevBrain(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), 'DEV_BRAIN.md'), 'utf-8');
}

describe('REFL-039: DEV_BRAIN.md orchestration guardrails', () => {
  it('retains the Plan Review Gate section', async () => {
    const devBrain = await readDevBrain();
    expect(devBrain).toMatch(/## Plan Review Gate/);
    expect(devBrain).toMatch(/finalized, reviewed plan dispatches to Codex/);
    expect(devBrain).toMatch(/Transport failures get transport fixes, never\s+role swaps/);
  });

  it('retains the Lane Hygiene rules', async () => {
    const devBrain = await readDevBrain();
    expect(devBrain).toMatch(/## Lane Hygiene/);
    expect(devBrain).toMatch(/node orchestrate\.js --phase production/);
    expect(devBrain).toMatch(/ONE lane at a time/);
  });
});
