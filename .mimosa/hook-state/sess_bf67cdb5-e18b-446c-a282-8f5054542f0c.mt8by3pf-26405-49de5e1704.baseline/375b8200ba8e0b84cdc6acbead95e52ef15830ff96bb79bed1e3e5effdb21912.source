import { describe, expect, it } from 'vitest';

import {
  LpEconomicsIndicativeReasonV1Schema,
  LpEconomicsResultV1Schema,
} from '../../../../shared/contracts/internal-economics/lp-economics-run-v1.contract';
import {
  LP_ECONOMICS_INDICATIVE_REASON_CODES_V1_1,
  LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1,
  LpEconomicsIndicativeReasonV1_1Schema,
  LpEconomicsResultV1_1Schema,
  buildLpEconomicsRunIdempotencyPreimageV1_1,
  type LpEconomicsRunRequestV1_1,
} from '../../../../shared/contracts/internal-economics/lp-economics-run-v1.1.contract';

const request = {
  policyVersionId: 11,
  factsSnapshotId: 22,
  planVersionId: 33,
  forecastSnapshotId: 44,
  terminalMode: 'hold_unrealized',
  clock: '2026-06-30T23:59:59.000Z',
} satisfies LpEconomicsRunRequestV1_1;

const common = {
  waterfallTemplate: 'deal_by_deal',
  clock: request.clock,
  currency: 'USD',
  perspective: 'lp_net',
  precisionMode: 'decimal_native_with_float64_xirr',
} as const;

const zeroTotals = {
  lpCapitalCallUsd: '0.000000',
  gpCommitmentCallUsd: '0.000000',
  portfolioDeploymentUsd: '0.000000',
  managementFeesUsd: '0.000000',
  fundExpensesUsd: '0.000000',
  grossRealizedProceedsUsd: '0.000000',
  lpCapitalReturnUsd: '0.000000',
  lpProfitUsd: '0.000000',
  lpDistributionUsd: '0.000000',
  gpInvestmentDistributionUsd: '0.000000',
  gpCarryDistributedUsd: '0.000000',
  endingCashUsd: '0.000000',
  grossNavUsd: '0.000000',
  lpNetNavUsd: '0.000000',
  dpi: null,
  rvpi: null,
  tvpi: null,
} as const;

const availableResult = {
  ...common,
  resultStatus: 'available',
  quarters: [],
  waterfallEvents: [],
  totals: zeroTotals,
  terminalNavBeforeRealizationUsd: '0.000000',
  lpNetIrr: null,
  lpNetIrrBasis: 'cash_only',
  lpNetIrrDiagnostic: {
    convergence: 'failed',
    iterations: 0,
    method: 'none',
    boundHit: null,
    failureReason: 'NO_SIGN_CHANGE',
  },
  reasons: [],
} as const;

describe('lp-economics run V1.1 contract', () => {
  it('accepts available only through the separate V1.1 result parser', () => {
    expect(LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1).toBe('lp-economics/1.1.0');
    expect(LpEconomicsResultV1_1Schema.safeParse(availableResult).success).toBe(true);
    expect(LpEconomicsResultV1Schema.safeParse(availableResult).success).toBe(false);
  });

  it('excludes DECIMAL_CORE_UNCERTIFIED from V1.1 new-emission vocabulary', () => {
    expect(LP_ECONOMICS_INDICATIVE_REASON_CODES_V1_1).toEqual([
      'FLOAT64_WATERFALL_PATH',
      'LP_NET_NAV_FLAT_SHARE_APPROXIMATION',
    ]);
    expect(
      LpEconomicsIndicativeReasonV1_1Schema.safeParse({
        code: 'DECIMAL_CORE_UNCERTIFIED',
      }).success
    ).toBe(false);
    expect(
      LpEconomicsIndicativeReasonV1Schema.safeParse({ code: 'DECIMAL_CORE_UNCERTIFIED' }).success
    ).toBe(true);
  });

  it('builds the exact V1.1 command preimage from six explicit basis fields', () => {
    expect(
      buildLpEconomicsRunIdempotencyPreimageV1_1({
        fundId: 5,
        request,
        engineVersion: 'cash-assembly-period-loop-v1/1.1.0',
        methodologyVersion: 'cash-assembly-period-loop-methodology/1.1.0',
      })
    ).toEqual({
      commandKind: 'internal-economics-run:create',
      fundId: 5,
      contractVersion: 'lp-economics/1.1.0',
      request,
      engineVersion: 'cash-assembly-period-loop-v1/1.1.0',
      methodologyVersion: 'cash-assembly-period-loop-methodology/1.1.0',
    });
  });
});
