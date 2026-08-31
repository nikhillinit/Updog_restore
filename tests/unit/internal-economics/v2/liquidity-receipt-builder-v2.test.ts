import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256CanonicalJson } from '../../../../shared/lib/canonical-json';
import { V2_ADMISSION_LIMITS } from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  buildReceipt,
  countReceiptRows,
  countSerializedOutputBytes,
  type ReceiptRowCountInputs,
} from '../../../../shared/lib/internal-economics/v2/liquidity-receipt-builder-v2';
import {
  initializeEventStreamState,
  type EventStreamState,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { oracleHash } from './support/canonical-receipt-oracle-v1';

function buildV2S0100Input() {
  const input = buildMinimalV2Input({
    selectedLane: 'deal_by_deal',
    events: [],
    waterfallPolicy: [{ kind: 'carry', priority: 1, gpShare: '0.200000000000' }],
    gpCashPreferredReturnTreatment: 'pari_passu',
  });
  input.lpClasses[0]!.feeProfile.managementFeeSchedule = [];
  input.partners[0]!.committedCapital = '500000.000000';
  input.partners[0]!.settledCash = '500000.000000';
  input.partners[0]!.remainingCallableCommitment = '0.000000';
  input.partners[1]!.committedCapital = '50000.000000';
  input.partners[1]!.settledCash = '50000.000000';
  input.partners[1]!.remainingCallableCommitment = '0.000000';
  input.openingState.openingCash = '0.000000';
  input.openingState.openingCashClassification = {
    paidIn: '0.000000',
    recycling: '0.000000',
    unclassified: '0.000000',
  };
  input.openingState.openingProvenance = {
    cashLots: [],
    investmentLots: [
      {
        investmentLotId: 'opening-investment:0001',
        sourceRef: 'opening-investment-source:0001',
        entitlementPoolId: 'opening-pool:0001',
        dealId: 'deal-1',
        securityId: 'security-1',
        owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
        costBasis: '500000.000000',
        relievedAmount: '0.000000',
        entitlementAmount: '60.000000',
      },
      {
        investmentLotId: 'opening-investment:0002',
        sourceRef: 'opening-investment-source:0002',
        entitlementPoolId: 'opening-pool:0001',
        dealId: 'deal-1',
        securityId: 'security-1',
        owner: { kind: 'gp', partnerId: 'gp-1' },
        costBasis: '50000.000000',
        relievedAmount: '0.000000',
        entitlementAmount: '40.000000',
      },
    ],
    entitlementPools: [
      {
        entitlementPoolId: 'opening-pool:0001',
        sourceRef: 'opening-pool-source:0001',
        dealId: 'deal-1',
        securityId: 'security-1',
      },
    ],
  };
  input.openingState.openingCommitments = '550000.000000';
  input.openingState.investorLedgers = [
    {
      partnerId: 'lp-1',
      committedCapital: '500000.000000',
      calledCapital: '500000.000000',
      settledCapital: '500000.000000',
      paidInCapital: '500000.000000',
      unreturnedSettledCashCapital: '500000.000000',
      cumulativeDistributions: '0.000000',
      cumulativeFees: '0.000000',
      accruedPreference: '0.000000',
    },
    {
      partnerId: 'gp-1',
      committedCapital: '50000.000000',
      calledCapital: '50000.000000',
      settledCapital: '50000.000000',
      paidInCapital: '50000.000000',
      unreturnedSettledCashCapital: '50000.000000',
      cumulativeDistributions: '0.000000',
      cumulativeFees: '0.000000',
      accruedPreference: '0.000000',
    },
  ];
  return input;
}

function normalizedAndState(
  input: ReturnType<typeof buildMinimalV2Input> | ReturnType<typeof buildV2S0100Input>
) {
  const normalized = verifyAndNormalizeInternalEconomicsInputV2(input);
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) throw new Error(normalized.refusal.message);
  return { input: normalized.input, state: initializeEventStreamState(normalized.input) };
}

function receiptFor(
  input: ReturnType<typeof buildMinimalV2Input> | ReturnType<typeof buildV2S0100Input>
) {
  const { input: normalized, state } = normalizedAndState(input);
  const result = buildReceipt(normalized, state, 'deal_by_deal', []);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal.message);
  return { input: normalized, state, receipt: result.receipt };
}

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

describe('liquidity receipt builder V2.1.0 spine', () => {
  it('proves the full receipt hash domain and oracle parity for both receipt shapes', () => {
    const s0100 = receiptFor(buildV2S0100Input()).receipt;
    const s0101 = receiptFor(buildMinimalV2Input()).receipt;

    for (const receipt of [s0100, s0101]) {
      const { resultHash, ...preimage } = receipt;
      expect(Object.prototype.hasOwnProperty.call(preimage, 'resultHash')).toBe(false);
      expect(oracleHash(preimage)).toBe(resultHash);
      expect(canonicalJson(preimage)).toBe(oracleCanonicalJson(preimage));
      expect(sha256CanonicalJson(receipt)).not.toBe(resultHash);
    }

    const base = s0100;
    const { resultHash: _resultHash, ...preimage } = base;
    const mutations = [
      { ...preimage, normalizedInputHash: 'f'.repeat(64) },
      {
        ...preimage,
        fundCashEquation: { ...preimage.fundCashEquation, openingCash: '1.000000' },
      },
      {
        ...preimage,
        openingPositions: { ...preimage.openingPositions, entitlementPools: [] },
      },
      { ...preimage, sourceRefs: ['changed-source'] },
    ];
    for (const mutated of mutations) expect(oracleHash(mutated)).not.toBe(base.resultHash);
  });

  it('matches undefined rejection behavior in production and independent oracle canonicalizers', () => {
    expect(() => canonicalJson({ undefinedField: undefined })).toThrow(TypeError);
    expect(() => oracleHash({ undefinedField: undefined })).toThrow(TypeError);
  });

  it('enforces prospective row limits at the exact boundary', () => {
    const counts: ReceiptRowCountInputs = {
      componentVersionCount: 0,
      openingCashLotCount: 0,
      openingInvestmentSliceCount: 0,
      openingEntitlementPoolCount: 0,
      journalEntryCount: 0,
      journalPostingCount: 0,
      tierAllocationCount: 0,
      partnerLedgerCount: 0,
      classLedgerCount: 0,
      partnerCashFlowEntryCount: 0,
      classCashFlowEntryCount: 0,
      sourceRefCount: 99_998,
      upstreamReceiptIdCount: 0,
    };
    expect(countReceiptRows(counts)).toBe(100_000);
    expect(countReceiptRows({ ...counts, sourceRefCount: 99_999 })).toBe(100_001);

    const { input, state } = normalizedAndState(buildMinimalV2Input());
    const fixedCounts: ReceiptRowCountInputs = {
      componentVersionCount: 5,
      openingCashLotCount: state.openingCashLots.size,
      openingInvestmentSliceCount: state.openingInvestmentSlices.size,
      openingEntitlementPoolCount: state.openingEntitlementPools.size,
      journalEntryCount: state.openingJournal.length,
      journalPostingCount: state.openingJournal.reduce(
        (sum, entry) => sum + entry.postings.length,
        0
      ),
      tierAllocationCount: 0,
      partnerLedgerCount: state.partnerLedgers.size,
      classLedgerCount: input.lpClasses.length,
      partnerCashFlowEntryCount: 0,
      classCashFlowEntryCount: 0,
      sourceRefCount: 0,
      upstreamReceiptIdCount: 0,
      cashLotLineageCount: state.cashSourceLots.size,
      investmentSliceLineageCount: state.investmentLots.size,
    };
    const exactRefs = Array.from(
      { length: V2_ADMISSION_LIMITS.MAX_OUTPUT_ROWS - countReceiptRows(fixedCounts) },
      () => 'source-ref'
    );
    const exact = buildReceipt({ ...input, sourceRefs: exactRefs }, state, 'deal_by_deal', []);
    expect(exact.ok).toBe(true);
    const over = buildReceipt(
      { ...input, sourceRefs: [...exactRefs, 'source-ref'] },
      state,
      'deal_by_deal',
      []
    );
    expect(over).toMatchObject({
      ok: false,
      refusal: { code: 'ADMISSION_LIMIT_EXCEEDED', stage: 'receipt' },
    });
  });

  it('enforces complete serialized output bytes after attaching resultHash', () => {
    const { input, state, receipt: baseline } = receiptFor(buildV2S0100Input());
    const baselineBytes = countSerializedOutputBytes(baseline);
    expect(baselineBytes).toBe(4379);
    const paddingLength = V2_ADMISSION_LIMITS.MAX_SERIALIZED_OUTPUT_BYTES - baselineBytes - 2;
    const exact = buildReceipt(
      { ...input, sourceRefs: ['x'.repeat(paddingLength)] },
      state,
      'deal_by_deal',
      []
    );
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(countSerializedOutputBytes(exact.receipt)).toBe(16_777_216);

    const over = buildReceipt(
      { ...input, sourceRefs: ['x'.repeat(paddingLength + 1)] },
      state,
      'deal_by_deal',
      []
    );
    expect(over).toMatchObject({
      ok: false,
      refusal: { code: 'ADMISSION_LIMIT_EXCEEDED', stage: 'receipt' },
    });
  });

  it('refuses journal balance and partner unreturned-capital conservation violations', () => {
    const { input, state } = normalizedAndState(buildV2S0100Input());
    const brokenJournal = state.openingJournal.map((entry, index) => {
      if (index !== 0) return entry;
      return {
        ...entry,
        postings: [
          { ...entry.postings[0]!, amountUsd: entry.postings[0]!.amountUsd.plus(new Decimal(1)) },
          entry.postings[1]!,
        ] as [(typeof entry.postings)[0], (typeof entry.postings)[1]],
      };
    }) as EventStreamState['openingJournal'];
    const journalResult = buildReceipt(
      { ...input },
      { ...state, openingJournal: brokenJournal },
      'deal_by_deal',
      []
    );
    expect(journalResult).toMatchObject({
      ok: false,
      refusal: { code: 'RECEIPT_CONSERVATION_VIOLATION', stage: 'receipt' },
    });

    const partnerLedgers = new Map(state.partnerLedgers);
    const lpLedger = partnerLedgers.get('lp-1')!;
    partnerLedgers.set('lp-1', {
      ...lpLedger,
      unreturnedSettledCashCapital: lpLedger.unreturnedSettledCashCapital.plus(new Decimal(1)),
    });
    const partnerResult = buildReceipt(
      { ...input },
      { ...state, partnerLedgers },
      'deal_by_deal',
      []
    );
    expect(partnerResult).toMatchObject({
      ok: false,
      refusal: { code: 'RECEIPT_CONSERVATION_VIOLATION', stage: 'receipt' },
    });
  });
});
