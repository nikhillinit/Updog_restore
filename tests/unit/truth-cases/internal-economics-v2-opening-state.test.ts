import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../../shared/lib/canonical-json';
import type { InternalEconomicsInputV2Wire } from '../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { deriveInternalEconomicsV2 } from '../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { oracleHash } from '../internal-economics/v2/support/canonical-receipt-oracle-v1';

const INPUT_JSON = String.raw`{
  "contractVersion": "internal-economics-composite/2.0.1",
  "currency": "USD",
  "calculationDate": "2025-06-30T00:00:00Z",
  "cutoverInstant": "2025-01-01T00:00:00Z",
  "roundingMode": "half_up",
  "fundEstablishmentDate": "2024-01-01T00:00:00Z",
  "investmentPeriodEndDate": "2028-01-01T00:00:00Z",
  "fundTermDate": "2034-01-01T00:00:00Z",
  "lpClasses": [{"lpClassId":"class-a","feeProfile":{"managementFeeSchedule":[],"feeRecyclingEnabled":false,"exitRecyclingEnabled":false}}],
  "partners": [{"partnerId":"lp-1","name":"LP One","isGp":false,"lpClassId":"class-a","committedCapital":"500000.000000","settledCash":"500000.000000","remainingCallableCommitment":"0.000000"},{"partnerId":"gp-1","name":"GP One","isGp":true,"committedCapital":"50000.000000","settledCash":"50000.000000","remainingCallableCommitment":"0.000000"}],
  "waterfallPolicy": [{"kind":"carry","priority":1,"gpShare":"0.200000000000"}],
  "selectedLane":"deal_by_deal",
  "gpCashPreferredReturnTreatment":"pari_passu",
  "openingState": {
    "openingCash":"0.000000",
    "openingCashClassification":{"paidIn":"0.000000","recycling":"0.000000","unclassified":"0.000000"},
    "openingProvenance": {
      "cashLots":[],
      "investmentLots":[{"investmentLotId":"opening-investment:0001","sourceRef":"opening-investment-source:0001","entitlementPoolId":"opening-pool:0001","dealId":"deal-1","securityId":"security-1","owner":{"kind":"lp","partnerId":"lp-1","lpClassId":"class-a"},"costBasis":"500000.000000","relievedAmount":"0.000000","entitlementAmount":"60.000000"},{"investmentLotId":"opening-investment:0002","sourceRef":"opening-investment-source:0002","entitlementPoolId":"opening-pool:0001","dealId":"deal-1","securityId":"security-1","owner":{"kind":"gp","partnerId":"gp-1"},"costBasis":"50000.000000","relievedAmount":"0.000000","entitlementAmount":"40.000000"}],
      "entitlementPools":[{"entitlementPoolId":"opening-pool:0001","sourceRef":"opening-pool-source:0001","dealId":"deal-1","securityId":"security-1"}]
    },
    "openingCommitments":"550000.000000",
    "investorLedgers":[{"partnerId":"lp-1","committedCapital":"500000.000000","calledCapital":"500000.000000","settledCapital":"500000.000000","paidInCapital":"500000.000000","unreturnedSettledCashCapital":"500000.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","accruedPreference":"0.000000"},{"partnerId":"gp-1","committedCapital":"50000.000000","calledCapital":"50000.000000","settledCapital":"50000.000000","paidInCapital":"50000.000000","unreturnedSettledCashCapital":"50000.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","accruedPreference":"0.000000"}],
    "accruedPreferenceTotal":"0.000000",
    "cumulativeDistributionsTotal":"0.000000",
    "cumulativeFeesTotal":"0.000000",
    "consumedFeeRecyclingCapacity":"0.000000",
    "consumedExitRecyclingCapacity":"0.000000",
    "profitDecomposition":{"openingCumulativePreferredPaid":"0.000000","openingCumulativeGpProfitDistributions":"0.000000","openingCumulativeLpProfitDistributions":"0.000000"}
  },
  "events":[]
}`;

const EXPECTED_RECEIPT_JSON = String.raw`{
  "receiptVersion":"internal-economics-receipt/2.1.0",
  "componentVersions":{"normalizer":"internal-economics-normalizer/2.0.1","composite":"internal-economics-composite/2.0.1","eventEngine":"internal-economics-event-engine/2.0.1","selectedWaterfall":"internal-economics-waterfall-deal-by-deal/2.0.1","receiptSerializer":"internal-economics-receipt-serializer/2.1.0"},
  "selectedLane":"deal_by_deal",
  "hashAlgorithm":"canonical-json-sha256/1",
  "normalizedInputHash":"273367406da6294a58cc2ed6ebfc0d0ec2d67a1356f81fb59f51782e1a351d98",
  "fundCashEquation":{"openingCash":"0.000000","contributions":"0.000000","deployments":"0.000000","realizations":"0.000000","fees":"0.000000","expenses":"0.000000","distributions":"0.000000","endingCash":"0.000000"},
  "openingPositions":{"cashLots":[],"investmentSlices":[{"investmentLotId":"opening-investment:0001","sourceRef":"opening-investment-source:0001","entitlementPoolId":"opening-pool:0001","dealId":"deal-1","securityId":"security-1","owner":{"kind":"lp","partnerId":"lp-1","lpClassId":"class-a"},"costBasis":"500000.000000","relievedAmount":"0.000000","remainingBasis":"500000.000000","entitlementAmount":"60.000000"},{"investmentLotId":"opening-investment:0002","sourceRef":"opening-investment-source:0002","entitlementPoolId":"opening-pool:0001","dealId":"deal-1","securityId":"security-1","owner":{"kind":"gp","partnerId":"gp-1"},"costBasis":"50000.000000","relievedAmount":"0.000000","remainingBasis":"50000.000000","entitlementAmount":"40.000000"}],"entitlementPools":[{"entitlementPoolId":"opening-pool:0001","sourceRef":"opening-pool-source:0001","dealId":"deal-1","securityId":"security-1","entitlementTotal":"100.000000"}]},
  "journal":[{"entryId":"opening/investment_slice/opening-investment:0001","instant":"2025-01-01T00:00:00Z","kind":"opening_investment_slice","sourceRef":"opening-investment-source:0001","postings":[{"account":"invested_basis","rowRef":"opening-investment:0001","owner":{"kind":"lp","partnerId":"lp-1","lpClassId":"class-a"},"amountUsd":"500000.000000"},{"account":"opening_unreturned_capital","rowRef":"opening-investment:0001","owner":{"kind":"lp","partnerId":"lp-1","lpClassId":"class-a"},"amountUsd":"-500000.000000"}]},{"entryId":"opening/investment_slice/opening-investment:0002","instant":"2025-01-01T00:00:00Z","kind":"opening_investment_slice","sourceRef":"opening-investment-source:0002","postings":[{"account":"invested_basis","rowRef":"opening-investment:0002","owner":{"kind":"gp","partnerId":"gp-1"},"amountUsd":"50000.000000"},{"account":"opening_unreturned_capital","rowRef":"opening-investment:0002","owner":{"kind":"gp","partnerId":"gp-1"},"amountUsd":"-50000.000000"}]}],
  "tierAllocations":[],
  "partnerLedgers":[{"partnerId":"gp-1","committedCapital":"50000.000000","calledCapital":"50000.000000","settledCapital":"50000.000000","paidInCapital":"50000.000000","unreturnedSettledCashCapital":"50000.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","cumulativeExpenses":"0.000000","accruedPreference":"0.000000","returnOfCapital":"0.000000","preferredReturnPaid":"0.000000","catchUpPaid":"0.000000","carryPaid":"0.000000","cashFlowVector":[]},{"partnerId":"lp-1","committedCapital":"500000.000000","calledCapital":"500000.000000","settledCapital":"500000.000000","paidInCapital":"500000.000000","unreturnedSettledCashCapital":"500000.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","cumulativeExpenses":"0.000000","accruedPreference":"0.000000","returnOfCapital":"0.000000","preferredReturnPaid":"0.000000","catchUpPaid":"0.000000","carryPaid":"0.000000","cashFlowVector":[]}],
  "classLedgers":[{"lpClassId":"class-a","committedCapital":"500000.000000","calledCapital":"500000.000000","settledCapital":"500000.000000","paidInCapital":"500000.000000","unreturnedSettledCashCapital":"500000.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","cumulativeExpenses":"0.000000","accruedPreference":"0.000000","returnOfCapital":"0.000000","preferredReturnPaid":"0.000000","catchUpPaid":"0.000000","carryPaid":"0.000000","cashFlowVector":[]}],
  "sourceRefs":[],
  "upstreamReceiptIds":[],
  "resultHash":"ea74f8d284ba0625568f89e9b3ffe1dad32abb9d37bb0c0b05bdc2735a48916f"
}`;

function oracleCanonicalJson(value: unknown): string {
  function sort(valueToSort: unknown): unknown {
    if (Array.isArray(valueToSort)) return valueToSort.map(sort);
    if (valueToSort === null || typeof valueToSort !== 'object') return valueToSort;
    return Object.fromEntries(
      Object.keys(valueToSort as Record<string, unknown>)
        .sort()
        .map((key) => [key, sort((valueToSort as Record<string, unknown>)[key])])
    );
  }

  return JSON.stringify(sort(value));
}

function deeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return (
    Object.isFrozen(value) &&
    Object.values(value as Record<string, unknown>).every((child) => deeplyFrozen(child, seen))
  );
}

function buildLiteralInput(): InternalEconomicsInputV2Wire {
  return JSON.parse(INPUT_JSON) as InternalEconomicsInputV2Wire;
}

describe('V2-S-0100 opening investment provenance truth case', () => {
  it('matches literal receipt, independent oracle, deep freeze, and no inferred lineage', () => {
    const input = buildLiteralInput();
    const inputBefore = structuredClone(input);
    const expectedReceipt = JSON.parse(EXPECTED_RECEIPT_JSON);
    const result = deriveInternalEconomicsV2(input);

    expect(result.ok, result.ok ? undefined : `${result.refusal.code}/${result.refusal.stage}`).toBe(
      true
    );
    if (!result.ok) return;

    expect(result.receipt).toEqual(expectedReceipt);
    expect(result.receipt.normalizedInputHash).toBe(
      '273367406da6294a58cc2ed6ebfc0d0ec2d67a1356f81fb59f51782e1a351d98'
    );
    expect(result.receipt.resultHash).toBe(
      'ea74f8d284ba0625568f89e9b3ffe1dad32abb9d37bb0c0b05bdc2735a48916f'
    );

    const { resultHash, ...preimage } = result.receipt;
    expect(oracleHash(preimage)).toBe(resultHash);
    expect(oracleCanonicalJson(preimage)).toBe(canonicalJson(preimage));
    expect(deeplyFrozen(result.receipt)).toBe(true);
    expect(input).toEqual(inputBefore);
    expect(JSON.stringify(result.receipt)).not.toContain('sourceCashLotId');
  });

  it('changes entitlement disclosure and hash without changing cash, basis, ledgers, tiers, or flows', () => {
    const baseResult = deriveInternalEconomicsV2(buildLiteralInput());
    const changedInput = buildLiteralInput();
    changedInput.openingState.openingProvenance.investmentLots[0]!.entitlementAmount =
      '61.000000';
    const changedResult = deriveInternalEconomicsV2(changedInput);

    expect(baseResult.ok).toBe(true);
    expect(changedResult.ok).toBe(true);
    if (!baseResult.ok || !changedResult.ok) return;

    expect(changedResult.receipt.resultHash).not.toBe(baseResult.receipt.resultHash);
    expect(changedResult.receipt.openingPositions.investmentSlices[0]!.entitlementAmount).toBe(
      '61.000000'
    );
    expect(changedResult.receipt.openingPositions.entitlementPools[0]!.entitlementTotal).toBe(
      '101.000000'
    );
    expect(changedResult.receipt.fundCashEquation).toEqual(baseResult.receipt.fundCashEquation);
    expect(changedResult.receipt.tierAllocations).toEqual(baseResult.receipt.tierAllocations);
    expect(changedResult.receipt.partnerLedgers.map((ledger) => ({
      partnerId: ledger.partnerId,
      unreturnedSettledCashCapital: ledger.unreturnedSettledCashCapital,
      cashFlowVector: ledger.cashFlowVector,
    }))).toEqual(baseResult.receipt.partnerLedgers.map((ledger) => ({
      partnerId: ledger.partnerId,
      unreturnedSettledCashCapital: ledger.unreturnedSettledCashCapital,
      cashFlowVector: ledger.cashFlowVector,
    })));
    expect(changedResult.receipt.openingPositions.investmentSlices.map((slice) => ({
      investmentLotId: slice.investmentLotId,
      costBasis: slice.costBasis,
      relievedAmount: slice.relievedAmount,
      remainingBasis: slice.remainingBasis,
    }))).toEqual(baseResult.receipt.openingPositions.investmentSlices.map((slice) => ({
      investmentLotId: slice.investmentLotId,
      costBasis: slice.costBasis,
      relievedAmount: slice.relievedAmount,
      remainingBasis: slice.remainingBasis,
    })));
  });
});
