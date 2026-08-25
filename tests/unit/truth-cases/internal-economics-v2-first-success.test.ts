import { describe, expect, it } from 'vitest';
import { deriveInternalEconomicsV2 } from '../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { buildMinimalV2Input } from '../../helpers/v2-input-builder';
import {
  INTERNAL_ECONOMICS_TEST_ORACLE_VERSION,
  oracleHash,
} from '../internal-economics/v2/support/canonical-receipt-oracle-v1';
import { CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V1 } from '../internal-economics/v2/support/canonical-receipt-changed-case-manifest-v1';

function buildV2S0101Input() {
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

describe('V2-S-0101 paid-in cash-only selected-lane success', () => {
  it('returns the exact detached 2.1.0 opening-state receipt with changed-case evidence', () => {
    const input = buildV2S0101Input();
    const inputBefore = structuredClone(input);
    const manifest = CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V1[0]!;
    const expectedReceipt = {
      receiptVersion: 'internal-economics-receipt/2.1.0' as const,
      componentVersions: {
        normalizer: 'internal-economics-normalizer/2.0.1' as const,
        composite: 'internal-economics-composite/2.0.1' as const,
        eventEngine: 'internal-economics-event-engine/2.0.1' as const,
        selectedWaterfall: 'internal-economics-waterfall-deal-by-deal/2.0.1' as const,
        receiptSerializer: 'internal-economics-receipt-serializer/2.1.0' as const,
      },
      selectedLane: 'deal_by_deal' as const,
      hashAlgorithm: 'canonical-json-sha256/1' as const,
      normalizedInputHash: manifest.normalizedInputHash,
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
      openingPositions: {
        cashLots: [
          {
            lotId: 'opening-cash:gp-1',
            sourceRef: 'opening-ledger:gp-1',
            owner: { kind: 'gp', partnerId: 'gp-1' },
            classification: 'paid_in',
            originalAmount: '50000.000000',
            remainingBalance: '50000.000000',
          },
          {
            lotId: 'opening-cash:lp-1',
            sourceRef: 'opening-ledger:lp-1',
            owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
            classification: 'paid_in',
            originalAmount: '500000.000000',
            remainingBalance: '500000.000000',
          },
        ],
        investmentSlices: [],
        entitlementPools: [],
      },
      journal: [
        {
          entryId: 'opening/cash_lot/opening-cash:gp-1',
          instant: '2025-01-01T00:00:00Z',
          kind: 'opening_cash_lot' as const,
          sourceRef: 'opening-ledger:gp-1',
          postings: [
            {
              account: 'cash' as const,
              rowRef: 'opening-cash:gp-1',
              owner: { kind: 'gp' as const, partnerId: 'gp-1' },
              amountUsd: '50000.000000',
            },
            {
              account: 'opening_unreturned_capital' as const,
              rowRef: 'opening-cash:gp-1',
              owner: { kind: 'gp' as const, partnerId: 'gp-1' },
              amountUsd: '-50000.000000',
            },
          ],
        },
        {
          entryId: 'opening/cash_lot/opening-cash:lp-1',
          instant: '2025-01-01T00:00:00Z',
          kind: 'opening_cash_lot' as const,
          sourceRef: 'opening-ledger:lp-1',
          postings: [
            {
              account: 'cash' as const,
              rowRef: 'opening-cash:lp-1',
              owner: { kind: 'lp' as const, partnerId: 'lp-1', lpClassId: 'class-a' },
              amountUsd: '500000.000000',
            },
            {
              account: 'opening_unreturned_capital' as const,
              rowRef: 'opening-cash:lp-1',
              owner: { kind: 'lp' as const, partnerId: 'lp-1', lpClassId: 'class-a' },
              amountUsd: '-500000.000000',
            },
          ],
        },
      ],
      tierAllocations: [],
      partnerLedgers: [
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
      ],
      classLedgers: [
        {
          lpClassId: 'class-a',
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
      ],
      sourceRefs: [],
      upstreamReceiptIds: [],
      resultHash: manifest.afterResultHash,
    };

    expect(manifest.beforeResultHash).toBe(
      'e0263b99740005feffcb89bb000d931b00b9232b6086b13056849a191eb07e28'
    );
    expect(manifest.afterReceiptVersion).toBe('internal-economics-receipt/2.1.0');
    expect(manifest.beforeResultHash).not.toBe(manifest.afterResultHash);
    expect(INTERNAL_ECONOMICS_TEST_ORACLE_VERSION).toBe(
      'internal-economics-test-oracle/1.0.0'
    );

    const result = deriveInternalEconomicsV2(input);

    expect(result.ok, result.ok ? undefined : `${result.refusal.code}/${result.refusal.stage}`).toBe(
      true
    );
    if (!result.ok) return;
    expect(result.receipt).toEqual(expectedReceipt);
    expect(result.receipt.resultHash).toBe(manifest.afterResultHash);
    expect(result.receipt.normalizedInputHash).toBe(manifest.normalizedInputHash);
    const { resultHash, ...preimage } = result.receipt;
    expect(oracleHash(preimage)).toBe(resultHash);
    expect(input).toEqual(inputBefore);

    const receiptSnapshot = structuredClone(result.receipt);
    input.partners[0]!.committedCapital = '1.000000';
    input.openingState.investorLedgers[0]!.settledCapital = '1.000000';
    expect(result.receipt).toEqual(receiptSnapshot);
    expect(deriveInternalEconomicsV2(buildV2S0101Input())).toEqual({
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
