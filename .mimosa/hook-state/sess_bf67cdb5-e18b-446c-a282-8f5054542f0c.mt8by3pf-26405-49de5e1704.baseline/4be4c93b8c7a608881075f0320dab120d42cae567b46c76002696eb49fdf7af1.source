import { describe, expect, it, vi } from 'vitest';

import {
  FundCompanyActualsFactSchema,
  type FundCompanyActualsFact,
} from '../../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { buildScenarioCaseSeed } from '../../../../server/services/scenarios/scenario-case-seed-service';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const GENERATED_AT = '2026-07-13T00:00:00.000Z';

function makePartialProvenance(
  warning: FundCompanyActualsFact['warnings'][number]
): FundCompanyActualsFact['provenance'] {
  return {
    trustState: 'PARTIAL',
    core: {
      sourceKind: 'computed',
      actionability: 'input_only',
      sourceEngine: 'fund-company-actuals-facts',
      engineVersion: 'fund-company-actuals-facts-v1',
      inputHash: HASH_A,
      assumptionsHash: HASH_B,
      generatedAt: GENERATED_AT,
      isFinanciallyActionable: false,
      warnings: [],
    },
    structuredWarnings: [warning],
  };
}

function makeUnavailableProvenance(
  warning: FundCompanyActualsFact['warnings'][number]
): FundCompanyActualsFact['provenance'] {
  return {
    trustState: 'UNAVAILABLE',
    core: {
      sourceKind: 'computed',
      actionability: 'quarantined',
      sourceEngine: 'fund-company-actuals-facts',
      engineVersion: 'fund-company-actuals-facts-v1',
      inputHash: HASH_A,
      assumptionsHash: HASH_B,
      generatedAt: GENERATED_AT,
      isFinanciallyActionable: false,
      quarantineReason: 'currency_mismatch',
      warnings: [],
    },
    structuredWarnings: [warning],
  };
}

function makeFailedProvenance(
  warning: FundCompanyActualsFact['warnings'][number]
): FundCompanyActualsFact['provenance'] {
  return {
    trustState: 'FAILED',
    core: {
      sourceKind: 'prototype_blocked',
      actionability: 'non_actionable',
      generatedAt: GENERATED_AT,
      isFinanciallyActionable: false,
      quarantineReason: 'round_adapter_failed',
      warnings: [],
    },
    structuredWarnings: [warning],
  };
}

function makeLiveFact(overrides: Partial<FundCompanyActualsFact> = {}) {
  return FundCompanyActualsFactSchema.parse({
    fundId: 10,
    companyId: 101,
    companyName: 'Acme Robotics',
    investmentIds: [201, 202],
    activeRoundIds: [21, 22],
    approvedPlanningFmvMarkId: 301,
    planningFmvStatus: 'active',
    initialInvestmentAmount: '500000.000000',
    followOnInvestmentAmount: '250000.000000',
    amountOnlyNonEquityAmount: '0.000000',
    latestRoundDate: '2025-02-01',
    latestRoundValuation: '12000000.000000',
    latestPlanningFmvDate: '2026-06-01',
    latestPlanningFmvValue: '14000000.000000',
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [],
    warnings: [],
    provenance: {
      trustState: 'LIVE',
      core: {
        sourceKind: 'computed',
        actionability: 'actionable',
        sourceEngine: 'fund-company-actuals-facts',
        engineVersion: 'fund-company-actuals-facts-v1',
        inputHash: HASH_A,
        assumptionsHash: HASH_B,
        generatedAt: GENERATED_AT,
        isFinanciallyActionable: true,
        warnings: [],
      },
      structuredWarnings: [],
    },
    inputHash: HASH_C,
    ...overrides,
  });
}

describe('buildScenarioCaseSeed', () => {
  it('maps usable LIVE facts into seed suggestions without forecasting user inputs', () => {
    const seed = buildScenarioCaseSeed({
      fundId: 10,
      fact: makeLiveFact(),
      asOfDate: '2026-07-13',
    });

    expect(seed.fields).toEqual({
      investment: {
        status: 'seeded',
        value: '500000.000000',
        source: 'facts.initialInvestmentAmount',
      },
      followOns: {
        status: 'seeded',
        value: '250000.000000',
        source: 'facts.followOnInvestmentAmount',
      },
      fmv: {
        status: 'seeded',
        value: '14000000.000000',
        source: 'facts.latestPlanningFmvValue',
      },
      exitValuation: {
        value: null,
        status: 'user_required',
        marketReference: '12000000.000000',
      },
      probability: { value: null, status: 'user_required' },
      ownershipAtExit: { value: null, status: 'user_required' },
    });
  });

  it('keeps usable PARTIAL actuals while disclosing a stale FMV as unavailable', () => {
    const warning = {
      code: 'PLANNING_FMV_STALE',
      severity: 'warning',
      message: 'The approved planning FMV mark is stale.',
      source: 'company:101',
    } as const;
    const fact = makeLiveFact({
      planningFmvStatus: 'stale',
      warnings: [warning],
      provenance: makePartialProvenance(warning),
    });

    const seed = buildScenarioCaseSeed({ fundId: 10, fact, asOfDate: '2026-07-13' });

    expect(seed.trustState).toBe('PARTIAL');
    expect(seed.fields.investment.status).toBe('seeded');
    expect(seed.fields.followOns.status).toBe('seeded');
    expect(seed.fields.fmv).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'fmv_stale',
    });
  });

  it.each(['none', 'superseded', 'blocked'] as const)(
    'does not seed a %s planning FMV',
    (planningFmvStatus) => {
      const warning = {
        code: 'PLANNING_FMV_MISSING',
        severity: 'warning',
        message: 'No active planning FMV is available.',
        source: 'company:101',
      } as const;
      const fact = makeLiveFact({
        planningFmvStatus,
        warnings: [warning],
        provenance: makePartialProvenance(warning),
      });

      const seed = buildScenarioCaseSeed({ fundId: 10, fact, asOfDate: '2026-07-13' });

      expect(seed.fields.fmv).toEqual({
        status: 'unavailable',
        value: null,
        reason: 'no_active_fmv',
      });
    }
  );

  it('blocks every monetary seed when the fact currency does not match the fund', () => {
    const warning = {
      code: 'CURRENCY_MISMATCH_BLOCK',
      severity: 'blocking',
      message: 'The source currency does not match the fund base currency.',
      source: 'company:101',
    } as const;
    const fact = makeLiveFact({
      planningFmvStatus: 'blocked',
      currency: 'EUR',
      currencyStatus: 'mismatch_blocked',
      warnings: [warning],
      provenance: makeUnavailableProvenance(warning),
    });

    const seed = buildScenarioCaseSeed({ fundId: 10, fact, asOfDate: '2026-07-13' });

    expect(seed.fields.investment).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'currency_blocked',
    });
    expect(seed.fields.followOns).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'currency_blocked',
    });
    expect(seed.fields.fmv).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'currency_blocked',
    });
    expect(seed.fields.exitValuation).toEqual({
      value: null,
      status: 'user_required',
      marketReference: '12000000.000000',
    });
  });

  it('returns a fully unavailable seed for a FAILED company fact', () => {
    const warning = {
      code: 'ROUND_ADAPTER_FAILED',
      severity: 'blocking',
      message: 'The round adapter failed for this company.',
      source: 'company:101',
    } as const;
    const fact = makeLiveFact({
      warnings: [warning],
      provenance: makeFailedProvenance(warning),
    });

    const seed = buildScenarioCaseSeed({ fundId: 10, fact, asOfDate: '2026-07-13' });

    expect(seed.trustState).toBe('FAILED');
    expect(seed.fields.investment).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'facts_unavailable',
    });
    expect(seed.fields.followOns).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'facts_unavailable',
    });
    expect(seed.fields.fmv).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'facts_unavailable',
    });
    expect(seed.fields.exitValuation).toEqual({
      value: null,
      status: 'user_required',
      marketReference: null,
    });
  });

  it('rejects a fact from a different fund', () => {
    const fact = makeLiveFact({ fundId: 11 });

    expect(() => buildScenarioCaseSeed({ fundId: 10, fact, asOfDate: '2026-07-13' })).toThrow(
      'Fact fund 11 does not match requested fund 10'
    );
  });

  it('does not fabricate observed money when the fact has no active round source', () => {
    const fact = makeLiveFact({
      investmentIds: [],
      activeRoundIds: [],
      initialInvestmentAmount: '0.000000',
      followOnInvestmentAmount: '0.000000',
    });

    const seed = buildScenarioCaseSeed({ fundId: 10, fact, asOfDate: '2026-07-13' });

    expect(seed.fields.investment).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'source_missing',
    });
    expect(seed.fields.followOns).toEqual({
      status: 'unavailable',
      value: null,
      reason: 'source_missing',
    });
    expect(seed.fields.fmv.status).toBe('seeded');
  });

  it('preserves observed zero sums when an amount-only round supplies the fact source', () => {
    const fact = makeLiveFact({
      activeRoundIds: [21],
      initialInvestmentAmount: '0.000000',
      followOnInvestmentAmount: '0.000000',
      amountOnlyNonEquityAmount: '100000.000000',
    });

    const seed = buildScenarioCaseSeed({ fundId: 10, fact, asOfDate: '2026-07-13' });

    expect(seed.fields.investment).toEqual({
      status: 'seeded',
      value: '0.000000',
      source: 'facts.initialInvestmentAmount',
    });
    expect(seed.fields.followOns).toEqual({
      status: 'seeded',
      value: '0.000000',
      source: 'facts.followOnInvestmentAmount',
    });
  });

  it('treats an unknown currency as blocked for every monetary seed', () => {
    const warning = {
      code: 'PLANNING_FMV_MISSING',
      severity: 'warning',
      message: 'No active planning FMV is available.',
      source: 'company:101',
    } as const;
    const fact = makeLiveFact({
      planningFmvStatus: 'none',
      currencyStatus: 'unknown',
      warnings: [warning],
      provenance: makePartialProvenance(warning),
    });

    const seed = buildScenarioCaseSeed({ fundId: 10, fact, asOfDate: '2026-07-13' });

    expect(seed.fields.investment).toMatchObject({
      status: 'unavailable',
      reason: 'currency_blocked',
    });
    expect(seed.fields.followOns).toMatchObject({
      status: 'unavailable',
      reason: 'currency_blocked',
    });
    expect(seed.fields.fmv).toMatchObject({
      status: 'unavailable',
      reason: 'currency_blocked',
    });
  });

  it('is deterministic, preserves the fact hash, and never promotes a market reference', () => {
    const input = { fundId: 10, fact: makeLiveFact(), asOfDate: '2026-07-13' };

    const first = buildScenarioCaseSeed(input);
    const second = buildScenarioCaseSeed(input);

    expect(second).toEqual(first);
    expect(first.factsInputHash).toBe(HASH_C);
    expect(first.fields.exitValuation).toEqual({
      value: null,
      status: 'user_required',
      marketReference: '12000000.000000',
    });
    expect(first.fields.probability).toEqual({ value: null, status: 'user_required' });
    expect(first.fields.ownershipAtExit).toEqual({ value: null, status: 'user_required' });
    expect(JSON.stringify(first).match(/12000000\.000000/g)).toHaveLength(1);
  });

  it('keeps the pure assembler isolated from routes, persistence, and source tables', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL(
        '../../../../server/services/scenarios/scenario-case-seed-service.ts',
        import.meta.url
      ),
      'utf8'
    );
    const importTargets = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

    expect(importTargets).toEqual([
      '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract',
      '../../../shared/contracts/scenarios/scenario-case-seed-v1.contract',
    ]);
    for (const forbidden of [
      'server/db',
      'express',
      'drizzle',
      'investment_rounds',
      'valuation_marks',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
