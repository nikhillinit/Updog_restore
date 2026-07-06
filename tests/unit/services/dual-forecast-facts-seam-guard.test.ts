/**
 * Facts-contract-only guard (PRD #1020, ADR-031).
 *
 * The forecast path must consume Round/FMV actuals EXCLUSIVELY through the
 * sanctioned facts seam (buildFundCompanyActualsFacts). Any direct reference
 * to the investment_rounds / valuation_marks storage in these files is a
 * regression toward the H9 feature-isolation finding this lane exists to fix.
 */
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const FORECAST_PATH_FILES = [
  'server/services/metrics-aggregator.ts',
  'server/services/actual-metrics-calculator.ts',
  'server/services/projected-metrics-calculator.ts',
  'server/services/construction-forecast-calculator.ts',
  'server/services/variance-calculator.ts',
  'server/routes/dual-forecast.ts',
];

const FORBIDDEN_TOKENS = /investmentRounds|valuationMarks|investment_rounds|valuation_marks/;

async function readSource(relativePath: string): Promise<string> {
  // The shared node setup mocks fs; go through the real module for this scan.
  const { readFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('dual-forecast facts seam guard', () => {
  it('forecast path has zero raw investment_rounds / valuation_marks references', async () => {
    for (const file of FORECAST_PATH_FILES) {
      const source = await readSource(file);
      expect(
        FORBIDDEN_TOKENS.test(source),
        `${file} must not reference investment_rounds/valuation_marks directly - use the facts seam`
      ).toBe(false);
    }
  });

  it('the aggregator reads actuals exclusively through the facts service seam', async () => {
    const source = await readSource('server/services/metrics-aggregator.ts');
    expect(source).toMatch(/from '\.\/fund-actuals\/fund-company-actuals-facts-service'/);
    expect(source).toMatch(/buildFundCompanyActualsFacts/);
  });
});
