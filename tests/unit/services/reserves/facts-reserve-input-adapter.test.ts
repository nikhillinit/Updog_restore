import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FundCompanyActualsFactsResponse } from '../../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import {
  FactsReserveCandidateSchema,
  type ReserveCompanyInputWithProvenance,
} from '../../../../shared/contracts/reserve-input-provenance.contract';
import type { ReservePortfolioInputWithTrust } from '../../../../server/services/reserve-input-builder';

const { buildFundCompanyActualsFacts, buildReservePortfolioInputWithProvenance } = vi.hoisted(
  () => ({
    buildFundCompanyActualsFacts: vi.fn(),
    buildReservePortfolioInputWithProvenance: vi.fn(),
  })
);

vi.mock('../../../../server/services/fund-actuals/fund-company-actuals-facts-service', () => ({
  buildFundCompanyActualsFacts,
}));

vi.mock('../../../../server/services/reserve-input-builder', () => ({
  buildReservePortfolioInputWithProvenance,
}));

import { buildFactsReserveCandidates } from '../../../../server/services/reserves/facts-reserve-input-adapter';

const FUND_FACTS_HASH = 'a'.repeat(64);
const COMPANY_FACTS_HASH = 'b'.repeat(64);

describe('FactsReserveCandidateSchema', () => {
  it('accepts missing_sector as an additive exclusion reason', () => {
    expect(
      FactsReserveCandidateSchema.parse({
        status: 'excluded',
        companyId: 11,
        reasons: ['missing_sector'],
        factsInputHash: null,
      })
    ).toEqual({
      status: 'excluded',
      companyId: 11,
      reasons: ['missing_sector'],
      factsInputHash: null,
    });
  });
});

function field(
  status: ReserveCompanyInputWithProvenance['provenance']['ownership']['status'],
  source: string
) {
  return { status, source, reason: null };
}

function reserveCompany(
  companyId: number,
  overrides: Partial<ReserveCompanyInputWithProvenance> = {}
): ReserveCompanyInputWithProvenance {
  return {
    id: companyId,
    invested: 999,
    ownership: 0.125,
    stage: 'Series A',
    sector: 'SaaS',
    provenance: {
      invested: field('observed', 'investments.amount'),
      ownership: field('observed', 'investments.ownership_percentage'),
      stage: field('approved_assumption', 'approved.stage'),
      sector: field('observed', 'portfolio_companies.sector'),
    },
    ...overrides,
  };
}

function legacyPortfolio(
  provenancePortfolio: ReserveCompanyInputWithProvenance[]
): ReservePortfolioInputWithTrust {
  return {
    portfolio: provenancePortfolio.map(({ id, invested, ownership, stage, sector }) => ({
      id,
      invested,
      ownership,
      stage,
      sector,
    })),
    provenancePortfolio,
    reserveInputTrustSummary: {
      trustedForActivation: true,
      defaultedInputCount: 0,
      unavailableInputCount: 0,
      defaultedFields: [],
      unavailableFields: [],
    },
  };
}

function facts(
  companyId: number,
  overrides: Partial<FundCompanyActualsFactsResponse['facts'][number]> = {}
): FundCompanyActualsFactsResponse {
  return {
    fundId: 7,
    asOfDate: '2026-07-13',
    inputHash: FUND_FACTS_HASH,
    generatedAt: '2026-07-13T00:00:00.000Z',
    facts: [
      {
        fundId: 7,
        companyId,
        companyName: `Company ${companyId}`,
        investmentIds: [101],
        activeRoundIds: [201],
        approvedPlanningFmvMarkId: null,
        planningFmvStatus: 'none',
        initialInvestmentAmount: '100.250000',
        followOnInvestmentAmount: '20.750000',
        amountOnlyNonEquityAmount: '0.000000',
        latestRoundDate: '2026-07-01',
        latestRoundValuation: '1000.000000',
        latestPlanningFmvDate: null,
        latestPlanningFmvValue: null,
        currency: 'USD',
        currencyStatus: 'base_currency',
        supersedeLineage: [{ roundId: 201, supersedesRoundId: null }],
        warnings: [],
        provenance: {
          trustState: 'LIVE',
          core: {
            sourceKind: 'computed',
            actionability: 'actionable',
            sourceEngine: 'fund-company-actuals-facts',
            engineVersion: 'fund-company-actuals-facts-v1',
            inputHash: COMPANY_FACTS_HASH,
            assumptionsHash: 'c'.repeat(64),
            generatedAt: '2026-07-13T00:00:00.000Z',
            isFinanciallyActionable: true,
            warnings: [],
          },
          structuredWarnings: [],
        },
        inputHash: COMPANY_FACTS_HASH,
        ...overrides,
      },
    ],
  };
}

function factsForCompanies(companyIds: number[]): FundCompanyActualsFactsResponse {
  const response = facts(companyIds[0] ?? 1);
  response.facts = companyIds.map((companyId) => facts(companyId).facts[0]!);
  return response;
}

describe('buildFactsReserveCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildReservePortfolioInputWithProvenance.mockResolvedValue(
      legacyPortfolio([reserveCompany(11)])
    );
    buildFundCompanyActualsFacts.mockResolvedValue(facts(11));
  });

  it('builds an eligible engine input from facts money and trusted builder fields', async () => {
    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });

    expect(result).toMatchObject({
      factsInputHash: FUND_FACTS_HASH,
      candidates: [
        {
          status: 'eligible',
          companyId: 11,
          factsInputHash: COMPANY_FACTS_HASH,
          input: {
            id: 11,
            invested: 121,
            ownership: 0.125,
            stage: 'Series A',
            sector: 'SaaS',
            provenance: {
              invested: {
                status: 'observed',
                source:
                  'fund_company_actuals_facts.initialInvestmentAmount+followOnInvestmentAmount',
              },
              ownership: { status: 'observed' },
              stage: { status: 'approved_assumption' },
              sector: { status: 'observed' },
            },
          },
        },
      ],
      trustSummary: {
        trustedForActivation: true,
        defaultedInputCount: 0,
        unavailableInputCount: 0,
        defaultedFields: [],
        unavailableFields: [],
      },
    });
    expect(buildFundCompanyActualsFacts).toHaveBeenCalledWith({
      fundId: 7,
      asOfDate: '2026-07-13',
    });
  });

  it('excludes missing ownership instead of substituting the legacy 15 percent default', async () => {
    const company = reserveCompany(11, { ownership: 0.15 });
    company.provenance.ownership = {
      status: 'defaulted',
      source: 'system_default_ownership',
      reason: 'Missing ownership percentage uses 0.15 legacy default',
    };
    buildReservePortfolioInputWithProvenance.mockResolvedValue(legacyPortfolio([company]));

    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });

    expect(result.candidates).toEqual([
      {
        status: 'excluded',
        companyId: 11,
        reasons: ['missing_ownership'],
        factsInputHash: COMPANY_FACTS_HASH,
      },
    ]);
  });

  it('excludes a company whose stage provenance is not observed or approved', async () => {
    const company = reserveCompany(11, { stage: 'seed' });
    company.provenance.stage = field('estimated', 'estimated.stage');
    buildReservePortfolioInputWithProvenance.mockResolvedValue(legacyPortfolio([company]));

    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });

    expect(result.candidates[0]).toMatchObject({
      status: 'excluded',
      reasons: ['missing_stage'],
    });
  });

  it('excludes a company whose sector provenance is not observed or approved', async () => {
    const company = reserveCompany(11, { sector: 'unknown' });
    company.provenance.sector = field('unavailable', 'missing.sector');
    buildReservePortfolioInputWithProvenance.mockResolvedValue(legacyPortfolio([company]));

    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });

    expect(result.candidates[0]).toMatchObject({
      status: 'excluded',
      reasons: ['missing_sector'],
    });
  });

  it('excludes currency-blocked facts without converting raw money', async () => {
    buildFundCompanyActualsFacts.mockResolvedValue(
      facts(11, { currency: 'EUR', currencyStatus: 'mismatch_blocked' })
    );

    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });

    expect(result.candidates[0]).toMatchObject({
      status: 'excluded',
      reasons: expect.arrayContaining(['currency_blocked']),
    });
  });

  it('excludes every legacy company and clears the top-level hash when facts loading fails', async () => {
    buildReservePortfolioInputWithProvenance.mockResolvedValue(
      legacyPortfolio([reserveCompany(12), reserveCompany(11)])
    );
    buildFundCompanyActualsFacts.mockRejectedValue(new Error('facts unavailable'));

    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });

    expect(result.factsInputHash).toBeNull();
    expect(result.candidates).toEqual([
      {
        status: 'excluded',
        companyId: 11,
        reasons: ['facts_unavailable'],
        factsInputHash: null,
      },
      {
        status: 'excluded',
        companyId: 12,
        reasons: ['facts_unavailable'],
        factsInputHash: null,
      },
    ]);
  });

  it('excludes missing and FAILED per-company facts', async () => {
    const response = factsForCompanies([11]);
    response.facts[0]!.provenance.trustState = 'FAILED';
    buildReservePortfolioInputWithProvenance.mockResolvedValue(
      legacyPortfolio([reserveCompany(12), reserveCompany(11)])
    );
    buildFundCompanyActualsFacts.mockResolvedValue(response);

    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });

    expect(result.candidates).toEqual([
      {
        status: 'excluded',
        companyId: 11,
        reasons: ['facts_unavailable'],
        factsInputHash: COMPANY_FACTS_HASH,
      },
      {
        status: 'excluded',
        companyId: 12,
        reasons: ['facts_unavailable'],
        factsInputHash: null,
      },
    ]);
  });

  it('sorts candidates by company id regardless of source order', async () => {
    buildReservePortfolioInputWithProvenance.mockResolvedValue(
      legacyPortfolio([reserveCompany(12), reserveCompany(11)])
    );
    buildFundCompanyActualsFacts.mockResolvedValue(factsForCompanies([12, 11]));

    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });

    expect(result.candidates.map((candidate) => candidate.companyId)).toEqual([11, 12]);
  });

  it('counts excluded defaulted and unavailable fields without distrusting the eligible engine set', async () => {
    const defaultedOwnership = reserveCompany(11);
    defaultedOwnership.provenance.ownership = field('defaulted', 'system_default_ownership');
    const estimatedStage = reserveCompany(12);
    estimatedStage.provenance.stage = field('estimated', 'estimated.stage');
    buildReservePortfolioInputWithProvenance.mockResolvedValue(
      legacyPortfolio([defaultedOwnership, estimatedStage, reserveCompany(13), reserveCompany(14)])
    );
    const response = factsForCompanies([11, 12, 13, 14]);
    response.facts.find((fact) => fact.companyId === 13)!.currencyStatus = 'mismatch_blocked';
    buildFundCompanyActualsFacts.mockResolvedValue(response);

    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });

    expect(result.trustSummary).toEqual({
      trustedForActivation: true,
      defaultedInputCount: 1,
      unavailableInputCount: 2,
      defaultedFields: ['ownership'],
      unavailableFields: ['invested', 'stage'],
    });
  });

  it('never carries legacy default sources or reasons into an eligible candidate', async () => {
    const result = await buildFactsReserveCandidates({ fundId: 7, asOfDate: '2026-07-13' });
    const eligible = result.candidates.find((candidate) => candidate.status === 'eligible');

    expect(eligible).toBeDefined();
    const serialized = JSON.stringify(eligible);
    expect(serialized).not.toContain('system_default');
    expect(serialized.toLowerCase()).not.toContain('legacy default');
  });

  it('imports only the sanctioned facts and provenance-builder sources', async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const source = await readFile(
      path.join(repoRoot, 'server/services/reserves/facts-reserve-input-adapter.ts'),
      'utf8'
    );

    expect(source).toContain('buildFundCompanyActualsFacts');
    expect(source).toContain('buildReservePortfolioInputWithProvenance');
    expect(source).not.toMatch(/from ['"].*\/db['"]/);
    expect(source).not.toMatch(/from ['"].*shared\/schema/);
    expect(source).not.toMatch(/\b(investments|investmentRounds|valuationMarks)\b/);
  });
});
