import { Decimal } from '../../../lib/decimal-config';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../../canonical-json';
import {
  V2_ADMISSION_LIMITS,
  type NormalizedInternalEconomicsInputV2,
  type PartnerV2,
  type V2RefusalCode,
  type V2Stage,
  type V2WaterfallLane,
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import {
  INTERNAL_ECONOMICS_RECEIPT_V2_VERSION,
  type CashFlowEntryV2,
  type ClassLedgerV2,
  type ComponentVersionsV2,
  type FundCashEquationV2,
  type InternalEconomicsReceiptV2,
  type InternalEconomicsReceiptV2Result,
  type InternalEconomicsReceiptV2ResultHashPreimage,
  type InvestmentSliceJournalPostingV2,
  type JournalEntryV2,
  type JournalPostingV2,
  type OpeningOwnerV2,
  type OpeningPartnerOwnerV2,
  type OpeningPositionsReceiptV2,
  type PartnerLedgerV2,
  type TierAllocationV2,
} from '../../../contracts/internal-economics/internal-economics-receipt-v2.contract';
import { INTERNAL_ECONOMICS_COMPOSITE_IMPLEMENTATION_VERSION } from './derive-composite-v2';
import {
  INTERNAL_ECONOMICS_EVENT_ENGINE_V2_VERSION,
  type EventStreamState,
} from './event-stream-engine-v2';
import { INTERNAL_ECONOMICS_NORMALIZER_V2_VERSION } from './normalize-input-v2';
import { INTERNAL_ECONOMICS_WATERFALL_DEAL_BY_DEAL_V2_VERSION } from './waterfall-deal-by-deal-v2';

export const INTERNAL_ECONOMICS_RECEIPT_SERIALIZER_V2_VERSION =
  'internal-economics-receipt-serializer/2.1.0' as const;

const ZERO = new Decimal(0);
const FIX6 = 6;

type LedgerAmountField =
  | 'committedCapital'
  | 'calledCapital'
  | 'settledCapital'
  | 'paidInCapital'
  | 'unreturnedSettledCashCapital'
  | 'cumulativeDistributions'
  | 'cumulativeFees'
  | 'cumulativeExpenses'
  | 'accruedPreference'
  | 'returnOfCapital'
  | 'preferredReturnPaid'
  | 'catchUpPaid'
  | 'carryPaid';

const LEDGER_AMOUNT_FIELDS: readonly LedgerAmountField[] = [
  'committedCapital',
  'calledCapital',
  'settledCapital',
  'paidInCapital',
  'unreturnedSettledCashCapital',
  'cumulativeDistributions',
  'cumulativeFees',
  'cumulativeExpenses',
  'accruedPreference',
  'returnOfCapital',
  'preferredReturnPaid',
  'catchUpPaid',
  'carryPaid',
];

export interface ReceiptRowCountInputs {
  readonly componentVersionCount: number;
  readonly openingCashLotCount: number;
  readonly openingInvestmentSliceCount: number;
  readonly openingEntitlementPoolCount: number;
  readonly journalEntryCount: number;
  readonly journalPostingCount: number;
  readonly tierAllocationCount: number;
  readonly partnerLedgerCount: number;
  readonly classLedgerCount: number;
  readonly partnerCashFlowEntryCount: number;
  readonly classCashFlowEntryCount: number;
  readonly sourceRefCount: number;
  readonly upstreamReceiptIdCount: number;
}

export function countReceiptRows(counts: ReceiptRowCountInputs): number {
  return (
    1 +
    counts.componentVersionCount +
    1 +
    counts.openingCashLotCount +
    counts.openingInvestmentSliceCount +
    counts.openingEntitlementPoolCount +
    counts.journalEntryCount +
    counts.journalPostingCount +
    counts.tierAllocationCount +
    counts.partnerLedgerCount +
    counts.classLedgerCount +
    counts.partnerCashFlowEntryCount +
    counts.classCashFlowEntryCount +
    counts.sourceRefCount +
    counts.upstreamReceiptIdCount
  );
}

export function countSerializedOutputBytes(
  receipt: InternalEconomicsReceiptV2,
): number {
  return Buffer.byteLength(canonicalJson(receipt), 'utf8');
}

function fix(value: Decimal): string {
  return value.toFixed(FIX6);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function refusal(
  code: V2RefusalCode,
  stage: V2Stage,
  message: string,
): InternalEconomicsReceiptV2Result {
  return {
    ok: false,
    refusal: { ok: false, code, stage, message },
  };
}

function conservationRefusal(message: string): InternalEconomicsReceiptV2Result {
  return refusal(
    'RECEIPT_CONSERVATION_VIOLATION',
    'receipt',
    message,
  );
}

function admissionRefusal(message: string): InternalEconomicsReceiptV2Result {
  return refusal('ADMISSION_LIMIT_EXCEEDED', 'receipt', message);
}

function cloneOpeningOwner(owner: OpeningOwnerV2): OpeningOwnerV2 {
  switch (owner.kind) {
    case 'lp':
      return {
        kind: 'lp',
        partnerId: owner.partnerId,
        lpClassId: owner.lpClassId,
      };
    case 'gp':
      return { kind: 'gp', partnerId: owner.partnerId };
    case 'entitlement_pool':
      return {
        kind: 'entitlement_pool',
        entitlementPoolId: owner.entitlementPoolId,
      };
    case 'fund':
      return { kind: 'fund' };
  }
}

function clonePartnerOwner(owner: OpeningPartnerOwnerV2): OpeningPartnerOwnerV2 {
  return owner.kind === 'lp'
    ? { kind: 'lp', partnerId: owner.partnerId, lpClassId: owner.lpClassId }
    : { kind: 'gp', partnerId: owner.partnerId };
}

function ownerPartnerId(owner: OpeningOwnerV2): string | null {
  return owner.kind === 'lp' || owner.kind === 'gp' ? owner.partnerId : null;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export function buildFundCashEquation(
  input: NormalizedInternalEconomicsInputV2,
  _state: EventStreamState,
): FundCashEquationV2 {
  let contributions = ZERO;
  let deployments = ZERO;
  let realizations = ZERO;
  let fees = ZERO;
  let expenses = ZERO;

  for (const event of input.events) {
    const amount = new Decimal(event.amountUsd);
    switch (event.kind) {
      case 'settled_contribution':
        if ('purpose' in event && event.purpose === 'management_fee') {
          fees = fees.plus(amount);
        } else if ('purpose' in event && event.purpose === 'fund_expense') {
          expenses = expenses.plus(amount);
        } else {
          contributions = contributions.plus(amount);
        }
        break;
      case 'deployment':
        deployments = deployments.plus(amount);
        break;
      case 'realization':
        realizations = realizations.plus(amount);
        break;
      case 'fund_expense_payment':
        expenses = expenses.plus(amount);
        break;
    }
  }

  const openingCash = new Decimal(input.openingState.openingCash);
  const endingCash = openingCash
    .plus(contributions)
    .plus(realizations)
    .minus(fees)
    .minus(expenses)
    .minus(deployments);

  return {
    openingCash: fix(openingCash),
    contributions: fix(contributions),
    deployments: fix(deployments),
    realizations: fix(realizations),
    fees: fix(fees),
    expenses: fix(expenses),
    distributions: fix(ZERO),
    endingCash: fix(endingCash),
  };
}

export function buildPartnerLedgers(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState,
): PartnerLedgerV2[] {
  const partnerMap = new Map(input.partners.map((partner) => [partner.partnerId, partner]));

  return Array.from(state.partnerLedgers.values())
    .map((ledger): PartnerLedgerV2 => {
      const partner = partnerMap.get(ledger.partnerId);
      const committedCapital = partner
        ? new Decimal(partner.committedCapital)
        : ZERO;
      const calledCapital = partner
        ? committedCapital.minus(new Decimal(partner.remainingCallableCommitment))
        : ZERO;

      return {
        partnerId: ledger.partnerId,
        committedCapital: fix(committedCapital),
        calledCapital: fix(calledCapital),
        settledCapital: fix(ledger.settledCapital),
        paidInCapital: fix(ledger.paidInCapital),
        unreturnedSettledCashCapital: fix(ledger.unreturnedSettledCashCapital),
        cumulativeDistributions: fix(ledger.cumulativeDistributions),
        cumulativeFees: fix(ledger.cumulativeFees),
        cumulativeExpenses: fix(ZERO),
        accruedPreference: fix(ledger.accruedPreference),
        returnOfCapital: fix(ZERO),
        preferredReturnPaid: fix(ZERO),
        catchUpPaid: fix(ZERO),
        carryPaid: fix(ZERO),
        cashFlowVector: [],
      };
    })
    .sort((left, right) => compareStrings(left.partnerId, right.partnerId));
}

function sumClassField(
  members: readonly PartnerV2[],
  partnerLedgers: ReadonlyMap<string, PartnerLedgerV2>,
  field: LedgerAmountField,
): string {
  return fix(
    members.reduce((total, partner) => {
      const ledger = partnerLedgers.get(partner.partnerId);
      return ledger ? total.plus(new Decimal(ledger[field])) : total;
    }, ZERO),
  );
}

function mergeCashFlowVectors(
  vectors: readonly (readonly CashFlowEntryV2[])[],
): CashFlowEntryV2[] {
  return vectors
    .flatMap((vector) => vector.map((entry) => ({ ...entry })))
    .sort((left, right) => {
      const instant = compareStrings(left.instant, right.instant);
      if (instant !== 0) return instant;
      const eventId = compareStrings(left.eventId, right.eventId);
      if (eventId !== 0) return eventId;
      return compareStrings(left.direction, right.direction);
    });
}

export function buildClassLedgers(
  input: NormalizedInternalEconomicsInputV2,
  partnerLedgers: readonly PartnerLedgerV2[],
): ClassLedgerV2[] {
  const partnerLedgerMap = new Map(
    partnerLedgers.map((ledger) => [ledger.partnerId, ledger]),
  );

  return input.lpClasses
    .map((lpClass): ClassLedgerV2 => {
      const members = input.partners.filter(
        (partner) => !partner.isGp && partner.lpClassId === lpClass.lpClassId,
      );

      return {
        lpClassId: lpClass.lpClassId,
        committedCapital: sumClassField(members, partnerLedgerMap, 'committedCapital'),
        calledCapital: sumClassField(members, partnerLedgerMap, 'calledCapital'),
        settledCapital: sumClassField(members, partnerLedgerMap, 'settledCapital'),
        paidInCapital: sumClassField(members, partnerLedgerMap, 'paidInCapital'),
        unreturnedSettledCashCapital: sumClassField(
          members,
          partnerLedgerMap,
          'unreturnedSettledCashCapital',
        ),
        cumulativeDistributions: sumClassField(
          members,
          partnerLedgerMap,
          'cumulativeDistributions',
        ),
        cumulativeFees: sumClassField(members, partnerLedgerMap, 'cumulativeFees'),
        cumulativeExpenses: sumClassField(
          members,
          partnerLedgerMap,
          'cumulativeExpenses',
        ),
        accruedPreference: sumClassField(members, partnerLedgerMap, 'accruedPreference'),
        returnOfCapital: sumClassField(members, partnerLedgerMap, 'returnOfCapital'),
        preferredReturnPaid: sumClassField(
          members,
          partnerLedgerMap,
          'preferredReturnPaid',
        ),
        catchUpPaid: sumClassField(members, partnerLedgerMap, 'catchUpPaid'),
        carryPaid: sumClassField(members, partnerLedgerMap, 'carryPaid'),
        cashFlowVector: mergeCashFlowVectors(
          members.map((partner) => partnerLedgerMap.get(partner.partnerId)?.cashFlowVector ?? []),
        ),
      };
    })
    .sort((left, right) => compareStrings(left.lpClassId, right.lpClassId));
}

function buildOpeningPositions(state: EventStreamState): OpeningPositionsReceiptV2 {
  const cashLots = Array.from(state.openingCashLots.values())
    .sort((left, right) => compareStrings(left.lotId, right.lotId))
    .map((lot) => ({
      lotId: lot.lotId,
      sourceRef: lot.sourceRef,
      owner: cloneOpeningOwner(lot.owner),
      classification: lot.classification,
      originalAmount: fix(lot.originalAmount),
      remainingBalance: fix(lot.remainingBalance),
    }));

  const investmentSlices = Array.from(state.openingInvestmentSlices.values())
    .sort((left, right) => compareStrings(left.investmentLotId, right.investmentLotId))
    .map((slice) => ({
      investmentLotId: slice.investmentLotId,
      sourceRef: slice.sourceRef,
      entitlementPoolId: slice.entitlementPoolId,
      dealId: slice.dealId,
      securityId: slice.securityId,
      owner: clonePartnerOwner(slice.owner),
      costBasis: fix(slice.costBasis),
      relievedAmount: fix(slice.relievedAmount),
      remainingBasis: fix(slice.remainingBasis),
      entitlementAmount: fix(slice.entitlementAmount),
    }));

  const entitlementPools = Array.from(state.openingEntitlementPools.values())
    .sort((left, right) =>
      compareStrings(left.entitlementPoolId, right.entitlementPoolId),
    )
    .map((pool) => ({
      entitlementPoolId: pool.entitlementPoolId,
      sourceRef: pool.sourceRef,
      dealId: pool.dealId,
      securityId: pool.securityId,
      entitlementTotal: fix(pool.entitlementTotal),
    }));

  return { cashLots, investmentSlices, entitlementPools };
}

function comparePostings(
  left: { readonly account: string; readonly rowRef: string },
  right: { readonly account: string; readonly rowRef: string },
): number {
  const account = compareStrings(left.account, right.account);
  return account !== 0 ? account : compareStrings(left.rowRef, right.rowRef);
}

function buildJournal(state: EventStreamState): JournalEntryV2[] {
  return state.openingJournal
    .map((entry): JournalEntryV2 => {
      if (entry.kind === 'opening_cash_lot') {
        const postings = [...entry.postings].sort(comparePostings).map(
          (posting): JournalPostingV2 => ({
            account: posting.account,
            rowRef: posting.rowRef,
            owner: cloneOpeningOwner(posting.owner),
            amountUsd: fix(posting.amountUsd),
          }),
        );
        return {
          entryId: entry.entryId,
          instant: entry.instant,
          kind: 'opening_cash_lot',
          sourceRef: entry.sourceRef,
          postings: [postings[0]!, postings[1]!],
        };
      }
      const postings = [...entry.postings].sort(comparePostings).map(
        (posting): InvestmentSliceJournalPostingV2 => ({
          account: posting.account,
          rowRef: posting.rowRef,
          owner: clonePartnerOwner(posting.owner),
          amountUsd: fix(posting.amountUsd),
        }),
      );
      return {
        entryId: entry.entryId,
        instant: entry.instant,
        kind: 'opening_investment_slice',
        sourceRef: entry.sourceRef,
        postings: [postings[0]!, postings[1]!],
      };
    })
    .sort((left, right) => compareStrings(left.entryId, right.entryId));
}

function buildTierAllocations(
  tierAllocations: readonly TierAllocationV2[],
): TierAllocationV2[] {
  return tierAllocations
    .map((tier) => ({
      kind: tier.kind,
      priority: tier.priority,
      totalAllocated: fix(new Decimal(tier.totalAllocated)),
      gpShare: fix(new Decimal(tier.gpShare)),
      lpShare: fix(new Decimal(tier.lpShare)),
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      return compareStrings(left.kind, right.kind);
    });
}

function buildComponentVersions(): ComponentVersionsV2 {
  return {
    normalizer: INTERNAL_ECONOMICS_NORMALIZER_V2_VERSION,
    composite: INTERNAL_ECONOMICS_COMPOSITE_IMPLEMENTATION_VERSION,
    eventEngine: INTERNAL_ECONOMICS_EVENT_ENGINE_V2_VERSION,
    selectedWaterfall: INTERNAL_ECONOMICS_WATERFALL_DEAL_BY_DEAL_V2_VERSION,
    receiptSerializer: INTERNAL_ECONOMICS_RECEIPT_SERIALIZER_V2_VERSION,
  };
}

function sumOpeningAssetsByPartner(state: EventStreamState): Map<string, Decimal> {
  const totals = new Map<string, Decimal>();
  const add = (partnerId: string, amount: Decimal) => {
    totals.set(partnerId, (totals.get(partnerId) ?? ZERO).plus(amount));
  };

  for (const lot of state.openingCashLots.values()) {
    const partnerId = ownerPartnerId(lot.owner);
    if (partnerId) add(partnerId, lot.remainingBalance);
  }
  for (const slice of state.openingInvestmentSlices.values()) {
    const partnerId = ownerPartnerId(slice.owner);
    if (partnerId) add(partnerId, slice.remainingBasis);
  }

  return totals;
}

function sumJournalAssetsByPartner(state: EventStreamState): Map<string, Decimal> {
  const totals = new Map<string, Decimal>();
  const add = (partnerId: string, amount: Decimal) => {
    totals.set(partnerId, (totals.get(partnerId) ?? ZERO).plus(amount));
  };

  for (const entry of state.openingJournal) {
    for (const posting of entry.postings) {
      if (posting.account !== 'cash' && posting.account !== 'invested_basis') {
        continue;
      }
      const partnerId = ownerPartnerId(posting.owner);
      if (partnerId && posting.amountUsd.gte(0)) add(partnerId, posting.amountUsd);
    }
  }

  return totals;
}

function sumJournalAccount(
  state: EventStreamState,
  account: 'cash' | 'invested_basis',
): Decimal {
  return Array.from(state.openingJournal.values()).reduce(
    (total, entry) =>
      entry.postings.reduce(
        (entryTotal, posting) =>
          posting.account === account ? entryTotal.plus(posting.amountUsd) : entryTotal,
        total,
      ),
    ZERO,
  );
}

function compareCashFlows(
  left: readonly CashFlowEntryV2[],
  right: readonly CashFlowEntryV2[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      entry.instant === other.instant &&
      entry.amountUsd === other.amountUsd &&
      entry.direction === other.direction &&
      entry.eventId === other.eventId
    );
  });
}

function validateConservation(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState,
  fundCashEquation: FundCashEquationV2,
  openingPositions: OpeningPositionsReceiptV2,
  journal: readonly JournalEntryV2[],
  tierAllocations: readonly TierAllocationV2[],
  partnerLedgers: readonly PartnerLedgerV2[],
  classLedgers: readonly ClassLedgerV2[],
): InternalEconomicsReceiptV2Result | null {
  for (const entry of journal) {
    const balance = entry.postings.reduce(
      (total, posting) => total.plus(new Decimal(posting.amountUsd)),
      ZERO,
    );
    if (!balance.isZero()) {
      return conservationRefusal(`Journal entry ${entry.entryId} does not balance.`);
    }
  }

  const openingCash = new Decimal(input.openingState.openingCash);
  const openingCashLotsTotal = Array.from(state.openingCashLots.values()).reduce(
    (total, lot) => total.plus(lot.remainingBalance),
    ZERO,
  );
  const openingCashClassificationTotal = [
    input.openingState.openingCashClassification.paidIn,
    input.openingState.openingCashClassification.recycling,
    input.openingState.openingCashClassification.unclassified,
  ].reduce((total, amount) => total.plus(new Decimal(amount)), ZERO);
  if (
    !openingCashLotsTotal.eq(openingCash) ||
    !openingCashClassificationTotal.eq(openingCash) ||
    !sumJournalAccount(state, 'cash').eq(openingCash) ||
    !new Decimal(fundCashEquation.openingCash).eq(openingCash) ||
    !new Decimal(fundCashEquation.endingCash).eq(openingCash)
  ) {
    return conservationRefusal('Opening cash conservation failed.');
  }

  for (const slice of state.openingInvestmentSlices.values()) {
    if (!slice.relievedAmount.isZero() || !slice.remainingBasis.eq(slice.costBasis)) {
      return conservationRefusal(
        `Investment slice ${slice.investmentLotId} basis conservation failed.`,
      );
    }
  }
  const investedBasisTotal = Array.from(state.openingInvestmentSlices.values()).reduce(
    (total, slice) => total.plus(slice.remainingBasis),
    ZERO,
  );
  if (!investedBasisTotal.eq(sumJournalAccount(state, 'invested_basis'))) {
    return conservationRefusal('Opening investment basis conservation failed.');
  }

  const openingAssetsByPartner = sumOpeningAssetsByPartner(state);
  const journalAssetsByPartner = sumJournalAssetsByPartner(state);
  const partnerLedgerMap = new Map(
    partnerLedgers.map((ledger) => [ledger.partnerId, ledger]),
  );
  for (const partner of input.partners) {
    const ledger = partnerLedgerMap.get(partner.partnerId);
    if (!ledger) return conservationRefusal(`Missing partner ledger ${partner.partnerId}.`);
    const openingAssets = openingAssetsByPartner.get(partner.partnerId) ?? ZERO;
    const journalAssets = journalAssetsByPartner.get(partner.partnerId) ?? ZERO;
    const unreturned = new Decimal(ledger.unreturnedSettledCashCapital);
    if (!openingAssets.eq(journalAssets) || !openingAssets.eq(unreturned)) {
      return conservationRefusal(
        `Partner ${partner.partnerId} unreturned capital conservation failed.`,
      );
    }

    const ledgerAmounts = LEDGER_AMOUNT_FIELDS.map((field) => new Decimal(ledger[field]));
    if (ledgerAmounts.some((amount) => amount.lt(0))) {
      return conservationRefusal(`Partner ${partner.partnerId} has a negative balance.`);
    }
    const committed = new Decimal(ledger.committedCapital);
    const called = new Decimal(ledger.calledCapital);
    const settled = new Decimal(ledger.settledCapital);
    const paidIn = new Decimal(ledger.paidInCapital);
    const remainingCallable = new Decimal(partner.remainingCallableCommitment);
    if (
      unreturned.gt(paidIn) ||
      !paidIn.eq(settled) ||
      settled.gt(called) ||
      called.gt(committed) ||
      !remainingCallable.eq(committed.minus(called))
    ) {
      return conservationRefusal(`Partner ${partner.partnerId} ledger ordering failed.`);
    }
  }

  const classLedgerMap = new Map(
    classLedgers.map((ledger) => [ledger.lpClassId, ledger]),
  );
  for (const lpClass of input.lpClasses) {
    const classLedger = classLedgerMap.get(lpClass.lpClassId);
    if (!classLedger) return conservationRefusal(`Missing class ledger ${lpClass.lpClassId}.`);
    const members = input.partners.filter(
      (partner) => !partner.isGp && partner.lpClassId === lpClass.lpClassId,
    );
    for (const field of LEDGER_AMOUNT_FIELDS) {
      const expected = members.reduce((total, partner) => {
        const ledger = partnerLedgerMap.get(partner.partnerId);
        return ledger ? total.plus(new Decimal(ledger[field])) : total;
      }, ZERO);
      if (!new Decimal(classLedger[field]).eq(expected)) {
        return conservationRefusal(`Class ${lpClass.lpClassId} aggregation failed.`);
      }
    }
    const expectedCashFlows = mergeCashFlowVectors(
      members.map((partner) => partnerLedgerMap.get(partner.partnerId)?.cashFlowVector ?? []),
    );
    if (!compareCashFlows(classLedger.cashFlowVector, expectedCashFlows)) {
      return conservationRefusal(`Class ${lpClass.lpClassId} cash-flow aggregation failed.`);
    }
  }

  const poolMap = new Map(
    openingPositions.entitlementPools.map((pool) => [pool.entitlementPoolId, pool]),
  );
  for (const slice of openingPositions.investmentSlices) {
    const pool = poolMap.get(slice.entitlementPoolId);
    if (!pool || pool.dealId !== slice.dealId || pool.securityId !== slice.securityId) {
      return conservationRefusal(
        `Investment slice ${slice.investmentLotId} has invalid entitlement pool identity.`,
      );
    }
  }
  for (const pool of openingPositions.entitlementPools) {
    const members = openingPositions.investmentSlices.filter(
      (slice) => slice.entitlementPoolId === pool.entitlementPoolId,
    );
    for (const slice of members) {
      if (!new Decimal(slice.entitlementAmount).gt(0)) {
        return conservationRefusal(
          `Entitlement slice ${slice.investmentLotId} must be positive.`,
        );
      }
    }
    const memberTotal = members.reduce(
      (total, slice) => total.plus(new Decimal(slice.entitlementAmount)),
      ZERO,
    );
    if (!memberTotal.eq(new Decimal(pool.entitlementTotal))) {
      return conservationRefusal(
        `Entitlement pool ${pool.entitlementPoolId} arithmetic failed.`,
      );
    }
  }

  const tierTotal = tierAllocations.reduce(
    (total, tier) => total.plus(new Decimal(tier.totalAllocated)),
    ZERO,
  );
  if (!tierTotal.eq(new Decimal(fundCashEquation.distributions))) {
    return conservationRefusal('Tier distribution conservation failed.');
  }
  for (const tier of tierAllocations) {
    if (
      !new Decimal(tier.totalAllocated).eq(
        new Decimal(tier.gpShare).plus(new Decimal(tier.lpShare)),
      )
    ) {
      return conservationRefusal(`Tier ${tier.kind} conservation failed.`);
    }
  }

  if (
    input.events.length !== 0 ||
    partnerLedgers.some((ledger) => ledger.cashFlowVector.length !== 0) ||
    classLedgers.some((ledger) => ledger.cashFlowVector.length !== 0)
  ) {
    return conservationRefusal('Opening positions must not create cash-flow vectors.');
  }

  return null;
}

export function buildReceipt(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState,
  selectedLane: V2WaterfallLane,
  tierAllocations: readonly TierAllocationV2[],
): InternalEconomicsReceiptV2Result {
  const fundCashEquation = buildFundCashEquation(input, state);
  const componentVersions = buildComponentVersions();
  const rowCount = countReceiptRows({
    componentVersionCount: Object.keys(componentVersions).length,
    openingCashLotCount: state.openingCashLots.size,
    openingInvestmentSliceCount: state.openingInvestmentSlices.size,
    openingEntitlementPoolCount: state.openingEntitlementPools.size,
    journalEntryCount: state.openingJournal.length,
    journalPostingCount: state.openingJournal.reduce(
      (count, entry) => count + entry.postings.length,
      0,
    ),
    tierAllocationCount: tierAllocations.length,
    partnerLedgerCount: state.partnerLedgers.size,
    classLedgerCount: input.lpClasses.length,
    partnerCashFlowEntryCount: 0,
    classCashFlowEntryCount: 0,
    sourceRefCount: input.sourceRefs?.length ?? 0,
    upstreamReceiptIdCount: input.upstreamReceiptIds?.length ?? 0,
  });
  if (rowCount > V2_ADMISSION_LIMITS.MAX_OUTPUT_ROWS) {
    return admissionRefusal(
      `Receipt row count ${rowCount} exceeds limit ${V2_ADMISSION_LIMITS.MAX_OUTPUT_ROWS}.`,
    );
  }
  if (state.openingJournal.some((entry) => entry.postings.length !== 2)) {
    return conservationRefusal('Opening journal entries must contain exactly two postings.');
  }

  const openingPositions = buildOpeningPositions(state);
  const journal = buildJournal(state);
  const partnerLedgers = buildPartnerLedgers(input, state);
  const classLedgers = buildClassLedgers(input, partnerLedgers);
  const receiptTierAllocations = buildTierAllocations(tierAllocations);
  const sourceRefs = [...(input.sourceRefs ?? [])].sort(compareStrings);
  const upstreamReceiptIds = [...(input.upstreamReceiptIds ?? [])].sort(compareStrings);

  const conservationError = validateConservation(
    input,
    state,
    fundCashEquation,
    openingPositions,
    journal,
    receiptTierAllocations,
    partnerLedgers,
    classLedgers,
  );
  if (conservationError) return conservationError;

  const preimage: InternalEconomicsReceiptV2ResultHashPreimage = {
    receiptVersion: INTERNAL_ECONOMICS_RECEIPT_V2_VERSION,
    componentVersions,
    selectedLane,
    hashAlgorithm: 'canonical-json-sha256/1',
    normalizedInputHash: input._normalizedInputHash,
    fundCashEquation,
    openingPositions,
    journal,
    tierAllocations: receiptTierAllocations,
    partnerLedgers,
    classLedgers,
    sourceRefs,
    upstreamReceiptIds,
  };
  const receipt: InternalEconomicsReceiptV2 = {
    ...preimage,
    resultHash: sha256CanonicalJson(preimage),
  };
  const serializedBytes = countSerializedOutputBytes(receipt);
  if (serializedBytes > V2_ADMISSION_LIMITS.MAX_SERIALIZED_OUTPUT_BYTES) {
    return admissionRefusal(
      `Serialized receipt size ${serializedBytes} bytes exceeds limit ${V2_ADMISSION_LIMITS.MAX_SERIALIZED_OUTPUT_BYTES}.`,
    );
  }

  return { ok: true, receipt: deepFreeze(receipt) };
}
