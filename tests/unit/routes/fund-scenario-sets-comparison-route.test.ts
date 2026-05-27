import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function readRepoFile(relativePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('fund scenario comparison route contract', () => {
  it('registers the comparison route with route-local auth and fund access', async () => {
    const source = await readRepoFile('server/routes/fund-scenario-sets.ts');

    expect(source).toContain('/funds/:fundId/scenario-sets/:scenarioSetId/comparison');
    expect(source).toContain('getFundScenarioComparison');
    expect((source.match(/requireAuth\(\)/g) ?? []).length).toBeGreaterThanOrEqual(9);
    expect((source.match(/requireFundAccess/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });
});
