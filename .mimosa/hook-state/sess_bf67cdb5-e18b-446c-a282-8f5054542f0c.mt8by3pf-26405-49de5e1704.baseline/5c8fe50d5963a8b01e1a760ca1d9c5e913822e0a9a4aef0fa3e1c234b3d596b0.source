import { describe, expect, it } from 'vitest';

import {
  PortfolioOverviewResponseV1Schema,
  type PortfolioOverviewResponseV1,
} from '../../../shared/contracts/portfolio-overview-v1.contract';

const validResponse: PortfolioOverviewResponseV1 = {
  fundId: 10,
  generatedAt: '2026-06-24T00:00:00.000Z',
  currency: 'USD',
  provenance: {
    sourceKind: 'computed',
    actionability: 'actionable',
    isFinanciallyActionable: true,
    sourceEngine: 'portfolio-overview',
    engineVersion: 'portfolio-overview-service@1',
    calculationVersion: 'portfolio_overview_metrics_v1',
    sourceRoute: 'GET /api/portfolio-overview',
    inputHash: 'a'.repeat(64),
    assumptionsHash: 'b'.repeat(64),
    generatedAt: '2026-06-24T00:00:00.000Z',
    warnings: ['currentValuation may include user-entered marks or assumptions'],
  },
  sourceRecordCounts: { companies: 1 },
  metrics: {
    totalInvested: '1000000',
    totalValue: '3000000',
    averageMOIC: '3',
    returnPct: '200',
    totalCompanies: 1,
    activeCompanies: 1,
    exitedCompanies: 0,
  },
  companies: [
    {
      id: 1,
      name: 'Acme',
      sector: 'SaaS',
      stage: 'Seed',
      status: 'active',
      invested: '1000000',
      currentValue: '3000000',
      moic: '3',
    },
  ],
  meta: {
    mode: 'live',
    requestedAsOf: null,
    resolvedAsOf: null,
    source: 'live',
    historicalAvailable: false,
  },
};

describe('PortfolioOverviewResponseV1Schema', () => {
  it('accepts a valid server-computed overview with decimal-string money fields', () => {
    expect(PortfolioOverviewResponseV1Schema.parse(validResponse)).toEqual(validResponse);
  });

  it('rejects numeric money fields (money must be decimal strings)', () => {
    const result = PortfolioOverviewResponseV1Schema.safeParse({
      ...validResponse,
      metrics: { ...validResponse.metrics, totalInvested: 1_000_000 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a numeric per-company moic', () => {
    const result = PortfolioOverviewResponseV1Schema.safeParse({
      ...validResponse,
      companies: [{ ...validResponse.companies[0], moic: 3 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown leak fields at the top level (strict)', () => {
    const result = PortfolioOverviewResponseV1Schema.safeParse({
      ...validResponse,
      shadowDiff: {},
    });
    expect(result.success).toBe(false);
  });

  it('requires the computed-actionable provenance to be hash-bound', () => {
    const { inputHash: _omit, ...provenanceWithoutInputHash } = validResponse.provenance;
    const result = PortfolioOverviewResponseV1Schema.safeParse({
      ...validResponse,
      provenance: provenanceWithoutInputHash,
    });
    expect(result.success).toBe(false);
  });
});
