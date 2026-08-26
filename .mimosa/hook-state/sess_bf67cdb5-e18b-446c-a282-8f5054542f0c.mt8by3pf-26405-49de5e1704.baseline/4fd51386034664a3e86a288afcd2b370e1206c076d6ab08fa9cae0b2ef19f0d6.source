import { describe, expect, it } from 'vitest';

import {
  ECONOMICS_POLICY_CONTRACT_VERSION,
  ECONOMICS_POLICY_SEED_REFUSAL_CODES_V1,
  EconomicsPolicyBodyV1Schema,
  EconomicsPolicyCreateRequestV1Schema,
  EconomicsPolicyNormalizationWarningV1Schema,
  EconomicsPolicySeedRefusalCodeV1Schema,
  type EconomicsPolicyBodyV1,
} from '../../../../shared/contracts/internal-economics/economics-policy-v1.contract';

const validBody = {
  waterfallTemplate: 'deal_by_deal',
  carryPct: 0.2,
  hurdle: { basis: 'none' },
  managementFeesUsd: '0.000000',
  fundExpenses: [],
  cashBufferQuarters: 2,
  terminalMode: 'liquidate_at_horizon',
  termStartDate: '2020-01-15',
  fundLifeYears: '10',
} satisfies EconomicsPolicyBodyV1;

describe('internal-economics-policy/1.0.0 contract', () => {
  it('pins the contract version literal', () => {
    expect(ECONOMICS_POLICY_CONTRACT_VERSION).toBe('internal-economics-policy/1.0.0');
  });

  it('round-trips a valid V1 policy body', () => {
    expect(EconomicsPolicyBodyV1Schema.parse(validBody)).toEqual(validBody);
  });

  it('admits only the deal_by_deal template (no whole_fund stub)', () => {
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, waterfallTemplate: 'whole_fund' })
        .success
    ).toBe(false);
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, waterfallTemplate: 'american' }).success
    ).toBe(false);
  });

  it('bounds carryPct to a finite [0, 1] number', () => {
    expect(EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, carryPct: 1 }).success).toBe(true);
    expect(EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, carryPct: 0 }).success).toBe(true);
    for (const carryPct of [-0.1, 1.2, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, carryPct }).success).toBe(false);
    }
  });

  it("admits only hurdle basis 'none' in schema V1", () => {
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, hurdle: { basis: 'compounded' } })
        .success
    ).toBe(false);
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({
        ...validBody,
        hurdle: { basis: 'none', rate: 0.08 },
      }).success
    ).toBe(false);
  });

  it('requires explicit zero fees and empty expenses', () => {
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, managementFeesUsd: '1.000000' }).success
    ).toBe(false);
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, managementFeesUsd: '0.00' }).success
    ).toBe(false);
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, fundExpenses: ['0.000000'] }).success
    ).toBe(false);
  });

  it('requires a nonnegative integer cash buffer', () => {
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, cashBufferQuarters: 0 }).success
    ).toBe(true);
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, cashBufferQuarters: -1 }).success
    ).toBe(false);
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, cashBufferQuarters: 1.5 }).success
    ).toBe(false);
  });

  it('accepts both terminal modes and rejects others', () => {
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, terminalMode: 'hold_unrealized' })
        .success
    ).toBe(true);
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, terminalMode: 'liquidate' }).success
    ).toBe(false);
  });

  it('validates term anchor inputs (calendar date + positive decimal-string years)', () => {
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, termStartDate: '2020-13-01' }).success
    ).toBe(false);
    expect(
      EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, fundLifeYears: '10.25' }).success
    ).toBe(true);
    for (const fundLifeYears of ['0', '-10', 'ten', '1e1']) {
      expect(EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, fundLifeYears }).success).toBe(
        false
      );
    }
  });

  it('rejects unknown body keys (strict)', () => {
    expect(EconomicsPolicyBodyV1Schema.safeParse({ ...validBody, hurdleRate: 0.08 }).success).toBe(
      false
    );
  });

  it('round-trips a creation request pinning envelope + source config lineage', () => {
    const request = {
      capitalEnvelopeVersionId: 3,
      sourceConfigId: 1,
      sourceConfigVersion: 2,
      body: validBody,
    };
    expect(EconomicsPolicyCreateRequestV1Schema.parse(request)).toEqual(request);
    expect(
      EconomicsPolicyCreateRequestV1Schema.safeParse({ ...request, capitalEnvelopeVersionId: 0 })
        .success
    ).toBe(false);
    expect(
      EconomicsPolicyCreateRequestV1Schema.safeParse({ ...request, extra: true }).success
    ).toBe(false);
  });

  it('carries the complete section 5 seed-refusal registry in ratified order', () => {
    expect(ECONOMICS_POLICY_SEED_REFUSAL_CODES_V1).toEqual([
      'CATCH_UP_UNSUPPORTED',
      'CLAWBACK_UNSUPPORTED',
      'ESCROW_UNSUPPORTED',
      'RECYCLING_UNSUPPORTED',
      'HURDLE_BASIS_UNSUPPORTED',
      'FUND_LIFE_ABSENT',
      'FUND_LIFE_GRID_UNREPRESENTABLE',
      'FUND_TERM_START_ABSENT',
      'EVERGREEN_STATUS_ABSENT',
      'EVERGREEN_UNSUPPORTED',
      'CREDIT_FACILITY_UNSUPPORTED',
    ]);
    expect(EconomicsPolicySeedRefusalCodeV1Schema.options).toEqual(
      ECONOMICS_POLICY_SEED_REFUSAL_CODES_V1
    );
  });

  it('round-trips a normalization warning with explicit/defaulted provenance', () => {
    const warning = {
      parameter: 'clawbackEnabled',
      provenance: 'defaulted',
      resolvedValue: 'true',
      detail: 'defaultWaterfall seeds clawbackEnabled into every defaulted config.',
    };
    expect(EconomicsPolicyNormalizationWarningV1Schema.parse(warning)).toEqual(warning);

    expect(
      EconomicsPolicyNormalizationWarningV1Schema.safeParse({
        ...warning,
        provenance: 'implicit',
      }).success
    ).toBe(false);
    expect(
      EconomicsPolicyNormalizationWarningV1Schema.safeParse({ ...warning, detail: '' }).success
    ).toBe(false);
    expect(
      EconomicsPolicyNormalizationWarningV1Schema.safeParse({ ...warning, extra: 1 }).success
    ).toBe(false);
  });
});
