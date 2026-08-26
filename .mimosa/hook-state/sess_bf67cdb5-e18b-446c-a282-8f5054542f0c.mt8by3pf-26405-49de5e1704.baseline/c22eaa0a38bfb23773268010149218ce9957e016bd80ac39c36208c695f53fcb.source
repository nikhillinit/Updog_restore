import { describe, expect, it } from 'vitest';

import { ReserveCompanyInputSchema } from '../../../shared/types';
import {
  buildReserveInputTrustSummary,
  buildReservePortfolioInputWithProvenanceFromRows,
} from '../../../server/services/reserve-input-builder';

describe('reserve input builder provenance', () => {
  it('preserves observed investment ownership and stage', () => {
    const portfolio = buildReservePortfolioInputWithProvenanceFromRows({
      investments: [
        {
          id: 1,
          company_id: 101,
          amount: '500000',
          ownership_percentage: '0.12',
          round: 'series_a',
          sector: 'SaaS',
        },
      ],
      companies: [],
    });

    expect(portfolio[0]).toMatchObject({
      id: 101,
      invested: 500000,
      ownership: 0.12,
      stage: 'series_a',
      provenance: {
        ownership: { status: 'observed' },
        stage: { status: 'observed' },
      },
    });
  });

  it('labels missing ownership and stage defaults and marks the summary untrusted', () => {
    const portfolio = buildReservePortfolioInputWithProvenanceFromRows({
      investments: [
        {
          id: 1,
          company_id: 101,
          amount: '500000',
          ownership_percentage: null,
          round: null,
          sector: 'SaaS',
        },
      ],
      companies: [],
    });
    const summary = buildReserveInputTrustSummary(portfolio);

    expect(portfolio[0]?.provenance.ownership.status).toBe('defaulted');
    expect(portfolio[0]?.provenance.stage.status).toBe('defaulted');
    expect(summary).toMatchObject({
      trustedForActivation: false,
      defaultedInputCount: 2,
      defaultedFields: ['ownership', 'stage'],
    });
  });

  it('defaults the portfolio-companies fallback branch and labels each field', () => {
    // Covers companyRowToPortfolioWithProvenance (investments empty -> companies path).
    const portfolio = buildReservePortfolioInputWithProvenanceFromRows({
      investments: [],
      companies: [{ id: 101, investment_amount: '500000', stage: null, sector: null }],
    });

    expect(portfolio[0]).toMatchObject({
      id: 101,
      invested: 500000,
      ownership: 0.15,
      stage: 'seed',
      sector: 'unknown',
      provenance: {
        ownership: { status: 'defaulted' },
        stage: { status: 'defaulted' },
        sector: { status: 'defaulted' },
      },
    });
  });

  it('REGRESSION: buildReservePortfolioInput fallback now emits schema-valid defaults, not null', () => {
    // Pins the authoritative Drizzle-path behavior change (C1): the portfolio-companies
    // fallback previously emitted raw null stage/sector (schema-invalid). The unified path
    // must emit 'seed'/'unknown', which the reserve engine accepts and provenance marks defaulted.
    const legacy = buildReservePortfolioInputWithProvenanceFromRows({
      investments: [],
      companies: [{ id: 101, investment_amount: '500000', stage: null, sector: null }],
    }).map(({ id, invested, ownership, stage, sector }) => ({ id, invested, ownership, stage, sector }));

    expect(legacy[0]?.stage).toBe('seed');
    expect(legacy[0]?.sector).toBe('unknown');
    expect(legacy[0]?.stage).not.toBeNull();
    // Guard: the emitted shape must satisfy ReserveCompanyInputSchema (stage/sector .min(1)).
    expect(() => ReserveCompanyInputSchema.parse(legacy[0])).not.toThrow();
  });
});
