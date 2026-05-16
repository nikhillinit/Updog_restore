import { describe, expect, it } from 'vitest';
import {
  analyzeCohorts,
  type AnalyzeCohortInput,
} from '@shared/core/cohorts/analysis/advanced-engine';
import type { CohortUnit } from '@shared/types';

const FUND_ID = 1;
const DEFINITION_ID = '11111111-1111-4111-8111-111111111111';
const SAAS_ID = '22222222-2222-4222-8222-222222222222';
const FINTECH_ID = '33333333-3333-4333-8333-333333333333';
const UNMAPPED_ID = '44444444-4444-4444-8444-444444444444';

function makeInput(unit: CohortUnit): AnalyzeCohortInput {
  return {
    request: { fundId: FUND_ID },
    cohortDefinition: {
      id: DEFINITION_ID,
      fundId: FUND_ID,
      name: unit === 'company' ? 'Company View' : 'Investment View',
      vintageGranularity: 'year',
      sectorTaxonomyVersion: 'v1',
      unit,
    },
    resolutionInput: {
      fundId: FUND_ID,
      taxonomyVersion: 'v1',
      granularity: 'year',
      companies: [
        { id: 10, name: 'Alpha', sector: 'SaaS' },
        { id: 20, name: 'Beta', sector: 'FinTech' },
        { id: 30, name: 'Gamma', sector: 'Mystery' },
      ],
      investments: [
        {
          id: 100,
          companyId: 10,
          investmentDate: new Date('2022-01-15T00:00:00Z'),
          amount: '1000000',
          round: 'Seed',
        },
        {
          id: 101,
          companyId: 10,
          investmentDate: new Date('2024-03-01T00:00:00Z'),
          amount: '500000',
          round: 'Series A',
        },
        {
          id: 200,
          companyId: 20,
          investmentDate: new Date('2023-02-10T00:00:00Z'),
          amount: '750000',
          round: 'Seed',
        },
        {
          id: 300,
          companyId: 30,
          investmentDate: new Date('2023-07-01T00:00:00Z'),
          amount: '250000',
          round: 'Seed',
        },
      ],
      sectorTaxonomy: [
        { id: SAAS_ID, slug: 'saas', name: 'SaaS', isSystem: false },
        { id: FINTECH_ID, slug: 'fintech', name: 'FinTech', isSystem: false },
        { id: UNMAPPED_ID, slug: 'unmapped', name: 'Unmapped', isSystem: true },
      ],
      sectorMappings: [
        { rawValueNormalized: 'saas', canonicalSectorId: SAAS_ID },
        { rawValueNormalized: 'fintech', canonicalSectorId: FINTECH_ID },
      ],
      companyOverrides: [],
      investmentOverrides: [],
    },
    lots: [],
  };
}

describe('analyzeCohorts', () => {
  it('assigns all included investments for a company to the earliest included cohort key in company-level analysis', () => {
    const result = analyzeCohorts(makeInput('company'));

    const alphaRows = result.rows.filter((row) => row.sectorId === SAAS_ID);

    expect(alphaRows).toHaveLength(1);
    expect(alphaRows[0]).toMatchObject({
      cohortKey: '2022',
      sectorName: 'SaaS',
      counts: {
        companies: 1,
        investments: 2,
      },
      exposure: {
        paidIn: 1500000,
        distributions: 0,
      },
    });
  });

  it('assigns each investment to its own cohort key in investment-level analysis', () => {
    const result = analyzeCohorts(makeInput('investment'));

    const alphaRows = result.rows.filter((row) => row.sectorId === SAAS_ID);

    expect(alphaRows.map((row) => row.cohortKey)).toEqual(['2022', '2024']);
    expect(alphaRows.map((row) => row.counts)).toEqual([
      { companies: 1, investments: 1 },
      { companies: 1, investments: 1 },
    ]);
  });

  it('keeps unmapped sector classifications included in rows and unmapped reporting', () => {
    const result = analyzeCohorts(makeInput('company'));

    const unmappedRow = result.rows.find((row) => row.sectorId === UNMAPPED_ID);

    expect(unmappedRow).toMatchObject({
      cohortKey: '2023',
      sectorName: 'Unmapped',
      counts: {
        companies: 1,
        investments: 1,
      },
      exposure: {
        paidIn: 250000,
        distributions: 0,
      },
    });
    expect(result.unmapped).toEqual([
      {
        rawValue: 'Mystery',
        rawValueNormalized: 'mystery',
        companyCount: 1,
        investmentCount: 1,
        totalInvested: 250000,
      },
    ]);
  });

  it('filters rows and unmapped reporting by requested canonical sector ids', () => {
    const input = makeInput('company');
    input.request.sectorIds = [SAAS_ID];

    const result = analyzeCohorts(input);

    expect(result.rows.map((row) => `${row.cohortKey}:${row.sectorName}`)).toEqual(['2022:SaaS']);
    expect(result.unmapped).toBeUndefined();
  });

  it('filters investments by requested stages before calculating company cohort keys', () => {
    const input = makeInput('company');
    input.request.stages = ['Series A'];

    const result = analyzeCohorts(input);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      cohortKey: '2024',
      sectorId: SAAS_ID,
      sectorName: 'SaaS',
      counts: {
        companies: 1,
        investments: 1,
      },
      exposure: {
        paidIn: 500000,
        distributions: 0,
      },
    });
  });

  it('filters investments by inclusive requested investment date range before grouping', () => {
    const input = makeInput('company');
    input.request.dateRange = {
      start: '2023-01-01',
      end: '2023-12-31',
    };

    const result = analyzeCohorts(input);

    expect(result.rows.map((row) => `${row.cohortKey}:${row.sectorName}`)).toEqual([
      '2023:FinTech',
      '2023:Unmapped',
    ]);
  });

  it('returns exposure-only rows without performance metrics when no lot cash-flow events exist', () => {
    const result = analyzeCohorts(makeInput('company'));

    expect(result.rows.map((row) => `${row.cohortKey}:${row.sectorName}`)).toEqual([
      '2022:SaaS',
      '2023:FinTech',
      '2023:Unmapped',
    ]);
    expect(result.rows.every((row) => row.performance === undefined)).toBe(true);
  });
});
