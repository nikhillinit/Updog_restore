import { describe, expect, it } from 'vitest';

import { generateReserveSummary } from '../../../shared/core/reserves/ReserveEngine';
import {
  buildReserveInputTrustSummary,
  buildReservePortfolioInputWithProvenanceFromRows,
  buildReservePortfolioInputWithTrustFromRows,
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

  it('emits null ownership with unavailable provenance and marks the summary untrusted', () => {
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

    // ADR-054: ownership is never defaulted. A missing percentage is null + 'unavailable',
    // never 0.15 + 'defaulted'. Missing stage is unavailable and excluded from the engine.
    expect(portfolio[0]?.ownership).toBeNull();
    expect(portfolio[0]?.stage).toBe('');
    expect(portfolio[0]?.provenance.ownership).toEqual({
      status: 'unavailable',
      source: 'investments.ownership_percentage',
      reason: expect.stringMatching(/no default is substituted/),
    });
    expect(portfolio[0]?.provenance.stage).toEqual({
      status: 'unavailable',
      source: 'investments.round',
      reason:
        'No round recorded; company excluded from reserve allocation (no default is substituted)',
    });
    expect(summary).toEqual({
      trustedForActivation: false,
      defaultedInputCount: 0,
      unavailableInputCount: 2,
      defaultedFields: [],
      unavailableFields: ['ownership', 'stage'],
    });
  });

  it('labels the portfolio-companies fallback branch; ownership is null and unavailable', () => {
    // Covers companyRowToPortfolioWithProvenance (investments empty -> companies path).
    const portfolio = buildReservePortfolioInputWithProvenanceFromRows({
      investments: [],
      companies: [{ id: 101, investment_amount: '500000', stage: null, sector: null }],
    });

    expect(portfolio[0]).toMatchObject({
      id: 101,
      invested: 500000,
      ownership: null,
      stage: '',
      sector: 'unknown',
      provenance: {
        ownership: {
          status: 'unavailable',
          source: 'portfolio_companies',
          reason: expect.stringMatching(/no default is substituted/),
        },
        stage: {
          status: 'unavailable',
          source: 'portfolio_companies.stage',
          reason:
            'No stage recorded; company excluded from reserve allocation (no default is substituted)',
        },
        sector: { status: 'defaulted' },
      },
    });
    expect(buildReserveInputTrustSummary(portfolio)).toEqual({
      trustedForActivation: false,
      defaultedInputCount: 1,
      unavailableInputCount: 2,
      defaultedFields: ['sector'],
      unavailableFields: ['ownership', 'stage'],
    });
  });

  it('REGRESSION: missing stage is retained in provenance but excluded from legacy portfolio', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [],
      companies: [{ id: 101, investment_amount: '500000', stage: null, sector: null }],
    });

    expect(built.provenancePortfolio[0]?.stage).toBe('');
    expect(built.provenancePortfolio[0]?.sector).toBe('unknown');
    expect(built.provenancePortfolio[0]?.ownership).toBeNull();
    expect(built.portfolio).toEqual([]);
  });
});

describe('reserve-input-builder stage handling', () => {
  it('marks a null round as unavailable and excludes the company from the engine portfolio', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [
        {
          id: 1,
          company_id: 10,
          amount: '100000',
          ownership_percentage: '0.1',
          round: null,
          sector: 'SaaS',
        },
        {
          id: 2,
          company_id: 11,
          amount: '200000',
          ownership_percentage: '0.1',
          round: 'Series A',
          sector: 'SaaS',
        },
      ],
      companies: [],
    });

    expect(built.provenancePortfolio).toHaveLength(2);
    expect(built.provenancePortfolio[0]?.provenance.stage).toEqual({
      status: 'unavailable',
      source: 'investments.round',
      reason:
        'No round recorded; company excluded from reserve allocation (no default is substituted)',
    });
    expect(built.provenancePortfolio[0]?.stage).toBe('');
    expect(built.portfolio.map((company) => company.id)).toEqual([11]);
    expect(built.reserveInputTrustSummary.trustedForActivation).toBe(false);
    expect(built.reserveInputTrustSummary.unavailableFields).toContain('stage');
  });

  it('treats a blank round the same as null', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [
        {
          id: 1,
          company_id: 10,
          amount: '100000',
          ownership_percentage: '0.1',
          round: '   ',
          sector: 'SaaS',
        },
      ],
      companies: [],
    });

    expect(built.provenancePortfolio[0]?.provenance.stage.status).toBe('unavailable');
    expect(built.portfolio).toEqual([]);
  });

  it('passes an observed round through verbatim', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [
        {
          id: 1,
          company_id: 10,
          amount: '100000',
          ownership_percentage: '0.1',
          round: 'Series A',
          sector: 'SaaS',
        },
      ],
      companies: [],
    });

    expect(built.portfolio[0]).toMatchObject({ id: 10, stage: 'Series A' });
    expect(built.provenancePortfolio[0]?.provenance.stage.status).toBe('observed');
  });

  it('a missing-stage company receives no reserve allocation from generateReserveSummary', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [
        {
          id: 1,
          company_id: 10,
          amount: '100000',
          ownership_percentage: '0.1',
          round: null,
          sector: 'SaaS',
        },
        {
          id: 2,
          company_id: 11,
          amount: '100000',
          ownership_percentage: '0.1',
          round: 'Series A',
          sector: 'SaaS',
        },
      ],
      companies: [],
    });

    const summary = generateReserveSummary(1, built.portfolio);
    expect(summary.allocations).toHaveLength(1);
    const onlyObserved = generateReserveSummary(1, [built.portfolio[0]!]);
    expect(summary.totalAllocation).toBe(onlyObserved.totalAllocation);
  });

  it('marks a null company stage as unavailable and excludes it', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [],
      companies: [{ id: 101, investment_amount: '500000', stage: null, sector: 'SaaS' }],
    });

    expect(built.provenancePortfolio[0]?.provenance.stage).toEqual({
      status: 'unavailable',
      source: 'portfolio_companies.stage',
      reason:
        'No stage recorded; company excluded from reserve allocation (no default is substituted)',
    });
    expect(built.portfolio).toEqual([]);
  });
});
