import { describe, expect, it } from 'vitest';

import {
  LpEconomicsResultV1Schema,
  LpEconomicsRunRequestV1Schema,
} from '../../../../shared/contracts/internal-economics/lp-economics-run-v1.contract';
import {
  LpEconomicsResultV1_1Schema,
  LpEconomicsRunRequestV1_1Schema,
} from '../../../../shared/contracts/internal-economics/lp-economics-run-v1.1.contract';
import { InternalLpEconomicsRunReceiptV1Schema } from '../../../../shared/contracts/internal-economics/lp-economics-run-receipt-v1.contract';

const request = {
  policyVersionId: 11,
  factsSnapshotId: 22,
  planVersionId: 33,
  forecastSnapshotId: 44,
  terminalMode: 'hold_unrealized',
  clock: '2026-06-30T23:59:59.000Z',
} as const;

const unavailableReceiptResult = {
  waterfallTemplate: 'deal_by_deal',
  resultStatus: 'unavailable',
  clock: request.clock,
  currency: 'USD',
  perspective: 'lp_net',
  precisionMode: 'decimal_native_with_float64_xirr',
  reasons: [{ code: 'MAIN_FUND_VEHICLE_ABSENT' }],
} as const;

describe('LP economics schema browser runtime boundary', () => {
  it('loads and parses V1.0 request and receipt-result surfaces in jsdom', () => {
    expect(LpEconomicsRunRequestV1Schema.safeParse(request).success).toBe(true);
    expect(LpEconomicsResultV1Schema.safeParse(unavailableReceiptResult).success).toBe(true);
  });

  it('loads and parses V1.1 request and receipt-result surfaces in jsdom', () => {
    expect(LpEconomicsRunRequestV1_1Schema.safeParse(request).success).toBe(true);
    expect(LpEconomicsResultV1_1Schema.safeParse(unavailableReceiptResult).success).toBe(true);
  });

  it('loads and parses the strict versioned receipt surface in jsdom', () => {
    const hash = 'a'.repeat(64);
    expect(
      InternalLpEconomicsRunReceiptV1Schema.safeParse({
        receiptVersion: 'internal-lp-economics-run-receipt/1.0.0',
        runId: 1,
        fundId: 2,
        createdAt: request.clock,
        basis: {
          policyVersionId: 11,
          capitalEnvelopeVersionId: 12,
          factsSnapshotId: 22,
          knowledgeCutoff: '2026-06-30T00:00:00.000Z',
          planVersionId: 33,
          forecastSnapshotId: 44,
          evaluationClock: request.clock,
          terminalMode: request.terminalMode,
          terminalPeriodEnd: '2026-09-30',
          terminalResolutionMethodologyVersion: 'terminal-resolution/1.0.0',
        },
        versions: {
          calculationContractVersion: 'lp-economics/1.1.0',
          engineVersion: 'cash-assembly-period-loop-v1/1.1.0',
          methodologyVersion: 'cash-assembly-period-loop-methodology/1.1.0',
          resultCalculationVersion: 'lp-economics/1.1.0',
        },
        hashes: {
          capitalEnvelopeHash: hash,
          policyAssumptionsHash: hash,
          factsSnapshotInputHash: hash,
          planAssumptionsHash: hash,
          forecastInputHash: hash,
          inputHash: hash,
          resultHash: hash,
        },
        outcome: { runState: 'completed', result: unavailableReceiptResult },
      }).success
    ).toBe(true);
  });
});
