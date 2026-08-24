import { describe, expect, it } from 'vitest';
import { deriveInternalEconomicsV2 } from '../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { buildMinimalV2Input } from '../../helpers/v2-input-builder';
import {
  INTERNAL_ECONOMICS_TEST_ORACLE_VERSION,
  oracleHash,
} from '../internal-economics/v2/support/canonical-receipt-oracle-v1';

function buildV2S0100Input() {
  const input = buildMinimalV2Input({
    selectedLane: 'deal_by_deal',
    events: [],
    waterfallPolicy: [{ kind: 'carry', priority: 1, gpShare: '0.200000000000' }],
    gpCashPreferredReturnTreatment: 'pari_passu',
  });

  for (const lpClass of input.lpClasses) {
    lpClass.feeProfile.managementFeeSchedule = [];
    lpClass.feeProfile.feeRecyclingEnabled = false;
    delete lpClass.feeProfile.feeRecyclingCapUsd;
    lpClass.feeProfile.exitRecyclingEnabled = false;
    delete lpClass.feeProfile.exitRecyclingCapUsd;
  }
  delete input.sourceRefs;
  delete input.upstreamReceiptIds;

  return input;
}

function micros(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, '0').slice(0, 6));
}

describe('V2-S-0100 first public selected-lane success', () => {
  it('returns the exact detached opening-state receipt with independent hashes', () => {
    const input = buildV2S0100Input();
    const inputBefore = structuredClone(input);
    const normalizedInputHash = oracleHash(inputBefore);
    const expectedResultPayload = {
      selectedLane: 'deal_by_deal' as const,
      fundCashEquation: {
        openingCash: '550000.000000',
        contributions: '0.000000',
        deployments: '0.000000',
        realizations: '0.000000',
        fees: '0.000000',
        expenses: '0.000000',
        distributions: '0.000000',
        endingCash: '550000.000000',
      },
      tierAllocations: [],
      partnerLedgers: [
        {
          partnerId: 'lp-1',
          committedCapital: '1000000.000000',
          calledCapital: '500000.000000',
          settledCapital: '500000.000000',
          paidInCapital: '500000.000000',
          unreturnedSettledCashCapital: '500000.000000',
          cumulativeDistributions: '0.000000',
          cumulativeFees: '0.000000',
          cumulativeExpenses: '0.000000',
          accruedPreference: '0.000000',
          returnOfCapital: '0.000000',
          preferredReturnPaid: '0.000000',
          catchUpPaid: '0.000000',
          carryPaid: '0.000000',
          cashFlowVector: [],
        },
        {
          partnerId: 'gp-1',
          committedCapital: '100000.000000',
          calledCapital: '50000.000000',
          settledCapital: '50000.000000',
          paidInCapital: '50000.000000',
          unreturnedSettledCashCapital: '50000.000000',
          cumulativeDistributions: '0.000000',
          cumulativeFees: '0.000000',
          cumulativeExpenses: '0.000000',
          accruedPreference: '0.000000',
          returnOfCapital: '0.000000',
          preferredReturnPaid: '0.000000',
          catchUpPaid: '0.000000',
          carryPaid: '0.000000',
          cashFlowVector: [],
        },
      ],
      classLedgers: [
        {
          lpClassId: 'class-a',
          totalFees: '0.000000',
          totalExpenses: '0.000000',
          feeRecyclingUsed: '0.000000',
          exitRecyclingUsed: '0.000000',
        },
      ],
    };
    const expectedReceipt = {
      receiptVersion: 'internal-economics-receipt/2.0.0' as const,
      componentVersions: {},
      selectedLane: 'deal_by_deal' as const,
      hashAlgorithm: 'canonical-json-sha256/1' as const,
      normalizedInputHash,
      resultHash: oracleHash(expectedResultPayload),
      fundCashEquation: expectedResultPayload.fundCashEquation,
      tierAllocations: expectedResultPayload.tierAllocations,
      partnerLedgers: expectedResultPayload.partnerLedgers,
      classLedgers: expectedResultPayload.classLedgers,
    };

    const result = deriveInternalEconomicsV2(input);

    expect(result.ok, result.ok ? undefined : `${result.refusal.code}/${result.refusal.stage}`).toBe(
      true
    );
    if (!result.ok) return;
    expect(INTERNAL_ECONOMICS_TEST_ORACLE_VERSION).toBe(
      'internal-economics-test-oracle/1.0.0'
    );
    expect(result.receipt).toEqual(expectedReceipt);
    expect(result.receipt.normalizedInputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receipt.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input).toEqual(inputBefore);

    const receiptSnapshot = structuredClone(result.receipt);
    input.partners[0]!.committedCapital = '1.000000';
    input.openingState.investorLedgers[0]!.settledCapital = '1.000000';
    expect(result.receipt).toEqual(receiptSnapshot);
    expect(deriveInternalEconomicsV2(buildV2S0100Input())).toEqual({
      ok: true,
      receipt: expectedReceipt,
    });

    const cash = result.receipt.fundCashEquation;
    expect(
      micros(cash.openingCash) +
        micros(cash.contributions) +
        micros(cash.realizations) -
        micros(cash.deployments) -
        micros(cash.fees) -
        micros(cash.expenses) -
        micros(cash.distributions)
    ).toBe(micros(cash.endingCash));
    expect(
      result.receipt.tierAllocations.reduce(
        (sum, allocation) => sum + micros(allocation.totalAllocated),
        0n
      )
    ).toBe(micros(cash.distributions));
    for (const allocation of result.receipt.tierAllocations) {
      expect(micros(allocation.totalAllocated)).toBe(
        micros(allocation.gpShare) + micros(allocation.lpShare)
      );
    }
  });
});
