import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LATENT_500_TABLES = [
  'cohort_definitions',
  'sector_taxonomy',
  'sector_mappings',
  'company_overrides',
  'investment_overrides',
  'reconciliation_runs',
  'fund_calculation_modes',
  'tasks',
  'cash_flow_events',
  'valuation_marks',
  'vehicles',
  'lp_metric_runs',
  'evidence_records',
  'narrative_runs',
] as const;

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('prod schema empty-DB contract surface', () => {
  it('keeps the C1 latent-500 contract matrix explicit', () => {
    expect(LATENT_500_TABLES).toHaveLength(14);
    expect(LATENT_500_TABLES).toContain('tasks');
    expect(LATENT_500_TABLES).toContain('lp_metric_runs');
  });

  it('pins rounds v2 as observable graceful degradation, not silent success', () => {
    const fundMoicRoute = readRepoFile('server/routes/fund-moic.ts');
    const evidenceService = readRepoFile('server/services/rounds-to-model-evidence-service.ts');
    const moicPage = readRepoFile('client/src/pages/fund-model-results-moic-analysis.tsx');

    expect(fundMoicRoute).toContain("contract !== 'v2'");
    expect(fundMoicRoute).toContain('provenance');
    expect(fundMoicRoute).toContain('legacy');
    expect(evidenceService).toContain('ROUND_ADAPTER_FAILED');
    expect(moicPage).toContain('warningCodes');
    expect(moicPage).toContain('Badge');
  });
});
