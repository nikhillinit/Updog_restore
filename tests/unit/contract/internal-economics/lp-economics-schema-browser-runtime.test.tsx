import { describe, expect, it } from 'vitest';

import {
  LpEconomicsResultV1Schema,
  LpEconomicsRunRequestV1Schema,
} from '../../../../shared/contracts/internal-economics/lp-economics-run-v1.contract';
import {
  LpEconomicsResultV1_1Schema,
  LpEconomicsRunRequestV1_1Schema,
} from '../../../../shared/contracts/internal-economics/lp-economics-run-v1.1.contract';

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
});
