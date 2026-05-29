import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function readRepoFile(relativePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('fund scenario set route contract', () => {
  it('keeps every fund-scoped scenario-set route protected by auth and fund access', async () => {
    const source = await readRepoFile('server/routes/fund-scenario-sets.ts');

    expect((source.match(/requireAuth\(\)/g) ?? []).length).toBe(10);
    expect((source.match(/requireFundAccess/g) ?? []).length).toBe(11);
    expect(source).toContain('getIdempotencyKey(req)');
    expect(source).toContain('/funds/:fundId/scenario-sets');
    expect(source).toContain('/funds/:fundId/scenario-sets/reserve-optimization');
    expect(source).toContain('/funds/:fundId/scenario-sets/:scenarioSetId/calculate');
    expect(source).toContain('/funds/:fundId/scenario-sets/:scenarioSetId/calculate-reserve');
    expect(source).toContain('/funds/:fundId/scenario-sets/:scenarioSetId/calculation-status');
    expect(source).toContain('/funds/:fundId/scenario-sets/:scenarioSetId/comparison');
    expect(source).toContain('/funds/:fundId/scenario-sets/:scenarioSetId/results');
    expect(source).toContain('/funds/:fundId/scenario-sets/:scenarioSetId/archive');
    expect(source).toContain('CreateReserveOptimizationScenarioSetV1Schema.safeParse');
    expect(source).toContain('createReserveOptimizationScenarioSet');
    expect(source).toContain('FundScenarioReserveCalculationRequestV1Schema.safeParse');
    expect(source).toContain('enqueueReserveScenarioCalculation');
    expect(source).toContain('getFundScenarioCalculationStatus');
  });
});
