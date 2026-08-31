import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  certifyInternalEconomicsDualLaneV2,
  deriveInternalEconomicsV2,
} from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';

function inputWithRate(rate: string) {
  const input = buildMinimalV2Input();
  input.lpClasses[0]!.feeProfile.managementFeeSchedule[0]!.rate.rate = rate;
  return input;
}

describe('V2 F1 properties', () => {
  it('keeps the public refusal domain non-empty', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (basisPoints) => {
        const rate = (basisPoints / 10_000).toFixed(12);
        const result = deriveInternalEconomicsV2(inputWithRate(rate));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.refusal.code).toBe(
          basisPoints === 0 ? 'UNSUPPORTED_V2_BASE_EVENT' : 'UNSUPPORTED_V2_MANAGEMENT_FEE'
        );
      }),
      { numRuns: 20 }
    );
  });

  it('normalization hash is deterministic for identical inputs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (basisPoints) => {
        const rate = (basisPoints / 10_000).toFixed(12);
        const first = verifyAndNormalizeInternalEconomicsInputV2(inputWithRate(rate));
        const second = verifyAndNormalizeInternalEconomicsInputV2(inputWithRate(rate));

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(first.input._normalizedInputHash).toBe(second.input._normalizedInputHash);
      }),
      { numRuns: 20 }
    );
  });

  it('public refusals never expose partial outputs', () => {
    const deriveResult = deriveInternalEconomicsV2(inputWithRate('0.020000000000'));
    const certifyResult = certifyInternalEconomicsDualLaneV2(inputWithRate('0.020000000000'));

    expect(deriveResult.ok).toBe(false);
    expect(certifyResult.ok).toBe(false);
    expect('receipt' in deriveResult).toBe(false);
    expect('certification' in certifyResult).toBe(false);
  });

  it('certifies fee-free inputs in both lanes', () => {
    const result = certifyInternalEconomicsDualLaneV2(buildMinimalV2Input());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.certification.dealByDeal.selectedLane).toBe('deal_by_deal');
    expect(result.certification.wholeFund.selectedLane).toBe('whole_fund');
  });
});
