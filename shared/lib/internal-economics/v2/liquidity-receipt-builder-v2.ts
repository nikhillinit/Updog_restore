import { Decimal } from '../../../lib/decimal-config';
import { canonicalJson, sha256CanonicalJson } from '../../canonical-json';
import {
  V2_ADMISSION_LIMITS,
  V2_EVENT_CLASSIFICATION,
  type NormalizedInternalEconomicsInputV2,
  type PartnerV2,
  type V2RefusalCode,
  type V2Stage,
  type V2ExpenseCategory,
  type V2WaterfallLane,
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import {
  INTERNAL_ECONOMICS_RECEIPT_V2_VERSION,
  type CashFlowEntryV2,
  type ClassLedgerV2,
  type ComponentVersionsV2,
  type DistributionJournalEntryV2,
  type EventJournalEntryV2,
  type EventJournalPostingV2,
  type ExpenseTotalsByCategoryV2,
  type FundCashEquationV2,
  type InternalEconomicsReceiptV2,
  type InternalEconomicsReceiptV2Result,
  type InternalEconomicsReceiptV2ResultHashPreimage,
  type InvestmentSliceJournalPostingV2,
  type JournalAccountV2,
  type JournalEntryV2,
  type JournalPostingV2,
  type LineageDisclosureV2,
  type OpeningOwnerV2,
  type OpeningPartnerOwnerV2,
  type OpeningPositionsReceiptV2,
  type PartnerLedgerV2,
  type TierAllocationV2,
} from '../../../contracts/internal-economics/internal-economics-receipt-v2.contract';
import { INTERNAL_ECONOMICS_COMPOSITE_IMPLEMENTATION_VERSION } from './derive-composite-v2';
import type { TierPartnerAllocation } from './derive-composite-v2';
import {
  INTERNAL_ECONOMICS_EVENT_ENGINE_V2_VERSION,
  type EventStreamState,
  type PartnerEffectRecord,
} from './event-stream-engine-v2';
import { INTERNAL_ECONOMICS_NORMALIZER_V2_VERSION } from './normalize-input-v2';
import { INTERNAL_ECONOMICS_WATERFALL_DEAL_BY_DEAL_V2_VERSION } from './waterfall-deal-by-deal-v2';
import { INTERNAL_ECONOMICS_WATERFALL_WHOLE_FUND_V2_VERSION } from './waterfall-whole-fund-v2';

export const INTERNAL_ECONOMICS_RECEIPT_SERIALIZER_V2_VERSION =
  'internal-economics-receipt-serializer/2.3.0' as const;

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
  readonly cashLotLineageCount?: number;
  readonly investmentSliceLineageCount?: number;
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
    counts.upstreamReceiptIdCount +
    (counts.cashLotLineageCount ?? 0) +
    (counts.investmentSliceLineageCount ?? 0)
  );
}

export function countSerializedOutputBytes(receipt: InternalEconomicsReceiptV2): number {
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
  message: string
): InternalEconomicsReceiptV2Result {
  return {
    ok: false,
    refusal: { ok: false, code, stage, message },
  };
}

function conservationRefusal(message: string): InternalEconomicsReceiptV2Result {
  return refusal('RECEIPT_CONSERVATION_VIOLATION', 'receipt', message);
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
  state: EventStreamState,
  distributionTotal: Decimal = ZERO
): FundCashEquationV2 {
  let contributions = ZERO;
  let deployments = ZERO;
  let realizations = ZERO;
  let expenses = ZERO;

  for (const event of state.eventEffectRecords) {
    const amount = new Decimal(event.amountUsd);
    switch (event.kind) {
      case 'settled_contribution':
        contributions = contributions.plus(amount);
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
  const endingCash = new Decimal(state.endingCash).minus(distributionTotal);

  return {
    openingCash: fix(openingCash),
    contributions: fix(contributions),
    deployments: fix(deployments),
    realizations: fix(realizations),
    fees: fix(ZERO),
    expenses: fix(expenses),
    distributions: fix(distributionTotal),
    endingCash: fix(endingCash),
  };
}

function buildExpenseTotalsByCategory(state: EventStreamState): ExpenseTotalsByCategoryV2 {
  const totals = {
    legal: ZERO,
    audit: ZERO,
    admin: ZERO,
    custody: ZERO,
    other: ZERO,
  } satisfies Record<V2ExpenseCategory, Decimal>;

  for (const event of state.eventEffectRecords) {
    if (event.kind === 'fund_expense_payment') {
      totals[event.expenseCategory] = totals[event.expenseCategory].plus(event.amountUsd);
    }
  }

  return {
    legal: fix(totals.legal),
    audit: fix(totals.audit),
    admin: fix(totals.admin),
    custody: fix(totals.custody),
    other: fix(totals.other),
  };
}

function distributionAmountByPartnerAndTier(
  allocations: readonly TierPartnerAllocation[]
): Map<string, Map<string, Decimal>> {
  const byPartner = new Map<string, Map<string, Decimal>>();
  for (const allocation of allocations) {
    const amount = new Decimal(allocation.amountUsd);
    if (amount.isNegative()) continue;
    const byTier = byPartner.get(allocation.partnerId) ?? new Map<string, Decimal>();
    byTier.set(allocation.tierKind, (byTier.get(allocation.tierKind) ?? ZERO).plus(amount));
    byPartner.set(allocation.partnerId, byTier);
  }
  return byPartner;
}

function applyDistributionEffects(
  state: EventStreamState,
  allocations: readonly TierPartnerAllocation[]
): InternalEconomicsReceiptV2Result | null {
  const byPartner = distributionAmountByPartnerAndTier(allocations);

  for (const [partnerId, byTier] of byPartner) {
    const ledger = state.partnerLedgers.get(partnerId);
    if (!ledger) return conservationRefusal(`Missing partner ledger ${partnerId}.`);

    const roc = byTier.get('return_of_capital') ?? ZERO;
    const preference = byTier.get('preferred_return') ?? ZERO;
    if (roc.gt(ledger.unreturnedSettledCashCapital)) {
      return conservationRefusal(
        `Partner ${partnerId} return-of-capital distribution exceeds unreturned settled cash capital.`
      );
    }
    if (preference.gt(ledger.accruedPreference)) {
      return conservationRefusal(
        `Partner ${partnerId} preferred-return distribution exceeds accrued preference.`
      );
    }
  }

  for (const allocation of allocations) {
    const amount = new Decimal(allocation.amountUsd);
    if (amount.isZero()) continue;
    state.partnerEffectRecords.push({
      origin: 'distribution',
      lane: allocation.lane,
      tierKind: allocation.tierKind,
      tierOrdinal: allocation.tierOrdinal,
      partnerId: allocation.partnerId,
      field: 'cumulativeDistributions',
      amountUsd: new Decimal(amount),
    });
    if (allocation.tierKind === 'return_of_capital') {
      state.partnerEffectRecords.push({
        origin: 'distribution',
        lane: allocation.lane,
        tierKind: allocation.tierKind,
        tierOrdinal: allocation.tierOrdinal,
        partnerId: allocation.partnerId,
        field: 'unreturnedSettledCashCapital',
        amountUsd: new Decimal(amount).negated(),
      });
    }
    if (allocation.tierKind === 'preferred_return') {
      state.partnerEffectRecords.push({
        origin: 'distribution',
        lane: allocation.lane,
        tierKind: allocation.tierKind,
        tierOrdinal: allocation.tierOrdinal,
        partnerId: allocation.partnerId,
        field: 'accruedPreference',
        amountUsd: new Decimal(amount).negated(),
      });
    }
  }

  return null;
}

export function buildPartnerLedgers(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState,
  tierPartnerAllocations: readonly TierPartnerAllocation[] = [],
  distributionInstant = input.cutoverInstant
): PartnerLedgerV2[] {
  const partnerMap = new Map(input.partners.map((partner) => [partner.partnerId, partner]));
  const allocationsByPartner = distributionAmountByPartnerAndTier(tierPartnerAllocations);

  function eventCashFlows(partnerId: string): CashFlowEntryV2[] {
    const candidates = state.partnerEffectRecords
      .filter(
        (record): record is Extract<PartnerEffectRecord, { origin: 'event' }> =>
          record.origin === 'event' &&
          record.partnerId === partnerId &&
          record.field === 'settledCapital'
      )
      .sort((left, right) => {
        const instant = compareStrings(left.instant, right.instant);
        return instant !== 0 ? instant : compareStrings(left.eventId, right.eventId);
      });
    const seen = new Set<string>();
    return candidates.flatMap((record) => {
      if (seen.has(record.eventId)) return [];
      seen.add(record.eventId);
      const cashFlow: CashFlowEntryV2 = {
        source: 'event',
        instant: record.instant,
        amountUsd: fix(record.amountUsd),
        direction: 'inflow',
        eventId: record.eventId,
      };
      return [cashFlow];
    });
  }

  function distributionCashFlows(partnerId: string): CashFlowEntryV2[] {
    return state.partnerEffectRecords
      .filter(
        (record): record is Extract<PartnerEffectRecord, { origin: 'distribution' }> =>
          record.origin === 'distribution' &&
          record.partnerId === partnerId &&
          record.field === 'cumulativeDistributions'
      )
      .map((record): Extract<CashFlowEntryV2, { source: 'distribution' }> => ({
        source: 'distribution',
        instant: distributionInstant,
        amountUsd: fix(record.amountUsd),
        direction: 'outflow',
        lane: record.lane,
        tierKind: record.tierKind,
        tierOrdinal: record.tierOrdinal,
        partnerId: record.partnerId,
      }))
      .sort((left, right) => {
        if (left.tierOrdinal !== right.tierOrdinal) {
          return left.tierOrdinal - right.tierOrdinal;
        }
        const tier = compareStrings(left.tierKind, right.tierKind);
        return tier !== 0 ? tier : compareStrings(left.partnerId, right.partnerId);
      });
  }

  return Array.from(state.partnerLedgers.values())
    .map((ledger): PartnerLedgerV2 => {
      const partner = partnerMap.get(ledger.partnerId);
      const committedCapital = partner ? new Decimal(partner.committedCapital) : ZERO;
      const calledCapital = partner
        ? committedCapital.minus(
            state.callableTrackers.get(ledger.partnerId)?.remainingCallable ?? ZERO
          )
        : ZERO;
      const byTier = allocationsByPartner.get(ledger.partnerId) ?? new Map<string, Decimal>();
      const returnOfCapital = byTier.get('return_of_capital') ?? ZERO;
      const preferredReturn = byTier.get('preferred_return') ?? ZERO;
      const cumulativeDistributions = Array.from(byTier.values()).reduce(
        (total, amount) => total.plus(amount),
        ZERO
      );

      return {
        partnerId: ledger.partnerId,
        committedCapital: fix(committedCapital),
        calledCapital: fix(calledCapital),
        settledCapital: fix(ledger.settledCapital),
        paidInCapital: fix(ledger.paidInCapital),
        unreturnedSettledCashCapital: fix(
          ledger.unreturnedSettledCashCapital.minus(returnOfCapital)
        ),
        cumulativeDistributions: fix(ledger.cumulativeDistributions.plus(cumulativeDistributions)),
        cumulativeFees: fix(ledger.cumulativeFees),
        cumulativeExpenses: fix(ledger.cumulativeExpenses),
        accruedPreference: fix(ledger.accruedPreference.minus(preferredReturn)),
        returnOfCapital: fix(returnOfCapital),
        preferredReturnPaid: fix(preferredReturn),
        catchUpPaid: fix(byTier.get('gp_catch_up') ?? ZERO),
        carryPaid: fix(byTier.get('carry') ?? ZERO),
        cashFlowVector: [
          ...eventCashFlows(ledger.partnerId),
          ...distributionCashFlows(ledger.partnerId),
        ],
      };
    })
    .sort((left, right) => compareStrings(left.partnerId, right.partnerId));
}

function sumClassField(
  members: readonly PartnerV2[],
  partnerLedgers: ReadonlyMap<string, PartnerLedgerV2>,
  field: LedgerAmountField
): string {
  return fix(
    members.reduce((total, partner) => {
      const ledger = partnerLedgers.get(partner.partnerId);
      return ledger ? total.plus(new Decimal(ledger[field])) : total;
    }, ZERO)
  );
}

function mergeCashFlowVectors(vectors: readonly (readonly CashFlowEntryV2[])[]): CashFlowEntryV2[] {
  return vectors
    .flatMap((vector) => vector.map((entry) => ({ ...entry })))
    .sort((left, right) => {
      if (left.source !== right.source) return left.source === 'event' ? -1 : 1;
      const instant = compareStrings(left.instant, right.instant);
      if (instant !== 0) return instant;
      if (left.source === 'event' && right.source === 'event') {
        return compareStrings(left.eventId, right.eventId);
      }
      if (left.source === 'distribution') {
        if (right.source !== 'distribution') return 0;
        if (left.tierOrdinal !== right.tierOrdinal) return left.tierOrdinal - right.tierOrdinal;
        const tier = compareStrings(left.tierKind, right.tierKind);
        return tier !== 0 ? tier : compareStrings(left.partnerId, right.partnerId);
      }
      return compareStrings(left.direction, right.direction);
    });
}

export function buildClassLedgers(
  input: NormalizedInternalEconomicsInputV2,
  partnerLedgers: readonly PartnerLedgerV2[]
): ClassLedgerV2[] {
  const partnerLedgerMap = new Map(partnerLedgers.map((ledger) => [ledger.partnerId, ledger]));

  return input.lpClasses
    .map((lpClass): ClassLedgerV2 => {
      const members = input.partners.filter(
        (partner) => !partner.isGp && partner.lpClassId === lpClass.lpClassId
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
          'unreturnedSettledCashCapital'
        ),
        cumulativeDistributions: sumClassField(
          members,
          partnerLedgerMap,
          'cumulativeDistributions'
        ),
        cumulativeFees: sumClassField(members, partnerLedgerMap, 'cumulativeFees'),
        cumulativeExpenses: sumClassField(members, partnerLedgerMap, 'cumulativeExpenses'),
        accruedPreference: sumClassField(members, partnerLedgerMap, 'accruedPreference'),
        returnOfCapital: sumClassField(members, partnerLedgerMap, 'returnOfCapital'),
        preferredReturnPaid: sumClassField(members, partnerLedgerMap, 'preferredReturnPaid'),
        catchUpPaid: sumClassField(members, partnerLedgerMap, 'catchUpPaid'),
        carryPaid: sumClassField(members, partnerLedgerMap, 'carryPaid'),
        cashFlowVector: mergeCashFlowVectors(
          members.map((partner) => partnerLedgerMap.get(partner.partnerId)?.cashFlowVector ?? [])
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
    .sort((left, right) => compareStrings(left.entitlementPoolId, right.entitlementPoolId))
    .map((pool) => ({
      entitlementPoolId: pool.entitlementPoolId,
      sourceRef: pool.sourceRef,
      dealId: pool.dealId,
      securityId: pool.securityId,
      entitlementTotal: fix(pool.entitlementTotal),
    }));

  return { cashLots, investmentSlices, entitlementPools };
}

function buildLineage(state: EventStreamState): LineageDisclosureV2 {
  const consumingEventsByLot = new Map<string, string[]>();
  for (const record of state.consumptionRecords) {
    const events = consumingEventsByLot.get(record.lotId) ?? [];
    if (!events.includes(record.eventId)) events.push(record.eventId);
    consumingEventsByLot.set(record.lotId, events);
  }

  const cashLots = Array.from(state.cashSourceLots.values())
    .sort((left, right) => compareStrings(left.lotId, right.lotId))
    .map((lot) => ({
      lotId: lot.lotId,
      consumingEventIds: [...(consumingEventsByLot.get(lot.lotId) ?? [])],
    }));

  const investmentSlices = Array.from(state.investmentLots.values())
    .sort((left, right) => compareStrings(left.lotId, right.lotId))
    .map((lot) => ({
      investmentLotId: lot.lotId,
      fundingAllocations: lot.fundingAllocations.map((allocation) => ({ ...allocation })),
    }));

  return { cashLots, investmentSlices };
}

function comparePostings(
  left: { readonly account: string; readonly rowRef: string },
  right: { readonly account: string; readonly rowRef: string }
): number {
  const account = compareStrings(left.account, right.account);
  return account !== 0 ? account : compareStrings(left.rowRef, right.rowRef);
}

function buildOpeningJournal(state: EventStreamState): JournalEntryV2[] {
  return state.openingJournal
    .map((entry): JournalEntryV2 => {
      if (entry.kind === 'opening_cash_lot') {
        const postings = [...entry.postings]
          .sort(comparePostings)
          .map((posting): JournalPostingV2 => ({
            account: posting.account,
            rowRef: posting.rowRef,
            owner: cloneOpeningOwner(posting.owner),
            amountUsd: fix(posting.amountUsd),
          }));
        return {
          entryId: entry.entryId,
          instant: entry.instant,
          kind: 'opening_cash_lot',
          sourceRef: entry.sourceRef,
          postings: [postings[0]!, postings[1]!],
        };
      }
      const postings = [...entry.postings]
        .sort(comparePostings)
        .map((posting): InvestmentSliceJournalPostingV2 => ({
          account: posting.account,
          rowRef: posting.rowRef,
          owner: clonePartnerOwner(posting.owner),
          amountUsd: fix(posting.amountUsd),
        }));
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

function eventJournalPostings(
  eventId: string,
  postings: readonly [JournalAccountV2, Decimal, JournalAccountV2, Decimal]
): readonly [EventJournalPostingV2, EventJournalPostingV2] {
  return [
    { account: postings[0], rowRef: eventId, amountUsd: fix(postings[1]) },
    { account: postings[2], rowRef: eventId, amountUsd: fix(postings[3]) },
  ];
}

function buildEventJournal(state: EventStreamState): EventJournalEntryV2[] {
  const journal: EventJournalEntryV2[] = [];
  const effects = [...state.eventEffectRecords].sort((left, right) => {
    const instant = compareStrings(left.instant, right.instant);
    if (instant !== 0) return instant;
    const phase =
      V2_EVENT_CLASSIFICATION[left.kind].phase - V2_EVENT_CLASSIFICATION[right.kind].phase;
    if (phase !== 0) return phase;
    return compareStrings(left.eventId, right.eventId);
  });

  for (const [index, event] of effects.entries()) {
    const amount = new Decimal(event.amountUsd);
    const chronologyOrdinal = index + 1;

    switch (event.kind) {
      case 'settled_contribution':
        journal.push({
          entryId: `event/${event.eventId}`,
          instant: event.instant,
          source: 'event',
          eventId: event.eventId,
          chronologyOrdinal,
          postings: eventJournalPostings(event.eventId, [
            'cash',
            amount,
            'contributed_capital',
            amount.negated(),
          ]),
        });
        break;
      case 'deployment':
        journal.push({
          entryId: `event/${event.eventId}`,
          instant: event.instant,
          source: 'event',
          eventId: event.eventId,
          chronologyOrdinal,
          postings: eventJournalPostings(event.eventId, [
            'cash',
            amount.negated(),
            'invested_basis',
            amount,
          ]),
        });
        break;
      case 'realization': {
        const reliefTotal = new Decimal(event.reliefTotal ?? ZERO);
        journal.push({
          entryId: `event/${event.eventId}`,
          instant: event.instant,
          source: 'event',
          eventId: event.eventId,
          chronologyOrdinal,
          postings: [
            {
              account: 'cash',
              rowRef: event.eventId,
              amountUsd: fix(amount),
            },
            {
              account: 'invested_basis',
              rowRef: event.eventId,
              amountUsd: fix(reliefTotal.negated()),
            },
            {
              account: 'realized_gain_loss',
              rowRef: event.eventId,
              amountUsd: fix(reliefTotal.minus(amount)),
            },
          ],
        });
        break;
      }
      case 'fund_expense_payment':
        journal.push({
          entryId: `event/${event.eventId}`,
          instant: event.instant,
          source: 'event',
          eventId: event.eventId,
          chronologyOrdinal,
          postings: eventJournalPostings(event.eventId, [
            'cash',
            amount.negated(),
            'fund_expenses',
            amount,
          ]),
        });
        break;
      default:
        break;
    }
  }

  return journal;
}

function buildDistributionJournal(
  lane: V2WaterfallLane,
  instant: string,
  allocations: readonly TierPartnerAllocation[]
): DistributionJournalEntryV2[] {
  return allocations.flatMap((allocation, index) => {
    const amount = new Decimal(allocation.amountUsd);
    if (amount.isZero()) return [];
    return [
      {
        entryId: `distribution/${lane}/${String(index + 1).padStart(6, '0')}`,
        instant,
        source: 'distribution',
        lane,
        tierKind: allocation.tierKind,
        tierOrdinal: allocation.tierOrdinal,
        partnerId: allocation.partnerId,
        postings: [
          {
            account: 'cash',
            rowRef: allocation.partnerId,
            amountUsd: fix(amount.negated()),
          },
          {
            account: 'distributions',
            rowRef: allocation.partnerId,
            amountUsd: fix(amount),
          },
        ],
      },
    ];
  });
}

function buildJournal(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState,
  lane: V2WaterfallLane,
  tierPartnerAllocations: readonly TierPartnerAllocation[],
  distributionInstant: string
): JournalEntryV2[] {
  return [
    ...buildOpeningJournal(state),
    ...buildEventJournal(state),
    ...buildDistributionJournal(lane, distributionInstant, tierPartnerAllocations),
  ];
}

function buildTierAllocations(tierAllocations: readonly TierAllocationV2[]): TierAllocationV2[] {
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

function buildComponentVersions(selectedLane: V2WaterfallLane): ComponentVersionsV2 {
  return {
    normalizer: INTERNAL_ECONOMICS_NORMALIZER_V2_VERSION,
    composite: INTERNAL_ECONOMICS_COMPOSITE_IMPLEMENTATION_VERSION,
    eventEngine: INTERNAL_ECONOMICS_EVENT_ENGINE_V2_VERSION,
    selectedWaterfall:
      selectedLane === 'deal_by_deal'
        ? INTERNAL_ECONOMICS_WATERFALL_DEAL_BY_DEAL_V2_VERSION
        : INTERNAL_ECONOMICS_WATERFALL_WHOLE_FUND_V2_VERSION,
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

function sumJournalAccount(journal: readonly JournalEntryV2[], account: JournalAccountV2): Decimal {
  return journal.reduce(
    (total, entry) =>
      entry.postings.reduce(
        (entryTotal, posting) =>
          posting.account === account ? entryTotal.plus(posting.amountUsd) : entryTotal,
        total
      ),
    ZERO
  );
}

function compareCashFlows(
  left: readonly CashFlowEntryV2[],
  right: readonly CashFlowEntryV2[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      entry.source === other.source &&
      entry.instant === other.instant &&
      entry.amountUsd === other.amountUsd &&
      entry.direction === other.direction &&
      (entry.source === 'event'
        ? other.source === 'event' && entry.eventId === other.eventId
        : other.source === 'distribution' &&
          entry.lane === other.lane &&
          entry.tierKind === other.tierKind &&
          entry.tierOrdinal === other.tierOrdinal &&
          entry.partnerId === other.partnerId)
    );
  });
}

function validateConservation(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState,
  fundCashEquation: FundCashEquationV2,
  expenseTotalsByCategory: ExpenseTotalsByCategoryV2,
  openingPositions: OpeningPositionsReceiptV2,
  journal: readonly JournalEntryV2[],
  tierAllocations: readonly TierAllocationV2[],
  tierPartnerAllocations: readonly TierPartnerAllocation[],
  partnerLedgers: readonly PartnerLedgerV2[],
  classLedgers: readonly ClassLedgerV2[],
  waterfallTotalDistributed?: Decimal,
  waterfallPartnerDistributions?: ReadonlyMap<string, Decimal>
): InternalEconomicsReceiptV2Result | null {
  for (const entry of journal) {
    const balance = entry.postings.reduce(
      (total, posting) => total.plus(new Decimal(posting.amountUsd)),
      ZERO
    );
    if (!balance.isZero()) {
      return conservationRefusal(`Journal entry ${entry.entryId} does not balance.`);
    }
  }

  const openingCash = new Decimal(input.openingState.openingCash);
  const distributionTotal = tierPartnerAllocations.reduce(
    (total, allocation) => total.plus(new Decimal(allocation.amountUsd)),
    ZERO
  );
  if (waterfallTotalDistributed !== undefined && !waterfallTotalDistributed.eq(distributionTotal)) {
    return conservationRefusal('Waterfall total distribution cross-check failed.');
  }
  if (waterfallPartnerDistributions) {
    const byPartner = new Map<string, Decimal>();
    for (const allocation of tierPartnerAllocations) {
      byPartner.set(
        allocation.partnerId,
        (byPartner.get(allocation.partnerId) ?? ZERO).plus(new Decimal(allocation.amountUsd))
      );
    }
    for (const [partnerId, amount] of waterfallPartnerDistributions) {
      if (!(byPartner.get(partnerId) ?? ZERO).eq(amount)) {
        return conservationRefusal(
          `Waterfall partner distribution cross-check failed for ${partnerId}.`
        );
      }
    }
  }

  const openingCashLotsTotal = Array.from(state.openingCashLots.values()).reduce(
    (total, lot) => total.plus(lot.remainingBalance),
    ZERO
  );
  const openingCashClassificationTotal = [
    input.openingState.openingCashClassification.paidIn,
    input.openingState.openingCashClassification.recycling,
    input.openingState.openingCashClassification.unclassified,
  ].reduce((total, amount) => total.plus(new Decimal(amount)), ZERO);
  if (
    !openingCashLotsTotal.eq(openingCash) ||
    !openingCashClassificationTotal.eq(openingCash) ||
    !sumJournalAccount(buildOpeningJournal(state), 'cash').eq(openingCash) ||
    !new Decimal(fundCashEquation.openingCash).eq(openingCash) ||
    !new Decimal(fundCashEquation.endingCash).eq(
      new Decimal(state.endingCash).minus(distributionTotal)
    )
  ) {
    return conservationRefusal('Opening cash conservation failed.');
  }

  for (const slice of state.openingInvestmentSlices.values()) {
    if (!slice.relievedAmount.isZero() || !slice.remainingBasis.eq(slice.costBasis)) {
      return conservationRefusal(
        `Investment slice ${slice.investmentLotId} basis conservation failed.`
      );
    }
  }
  const investedBasisTotal = Array.from(state.openingInvestmentSlices.values()).reduce(
    (total, slice) => total.plus(slice.remainingBasis),
    ZERO
  );
  if (!investedBasisTotal.eq(sumJournalAccount(buildOpeningJournal(state), 'invested_basis'))) {
    return conservationRefusal('Opening investment basis conservation failed.');
  }

  const journalCash = sumJournalAccount(journal, 'cash');
  const journalInvestedBasis = sumJournalAccount(journal, 'invested_basis');
  const deploymentBasis = state.eventEffectRecords
    .filter((event) => event.kind === 'deployment')
    .reduce((total, event) => total.plus(new Decimal(event.amountUsd)), ZERO);
  const relievedBasis = state.eventEffectRecords
    .filter((event) => event.kind === 'realization')
    .reduce((total, event) => total.plus(new Decimal(event.reliefTotal ?? ZERO)), ZERO);
  const expectedInvestedBasis = investedBasisTotal.plus(deploymentBasis).minus(relievedBasis);
  if (!journalCash.eq(new Decimal(state.endingCash).minus(distributionTotal))) {
    return conservationRefusal('Journal cash conservation failed.');
  }
  if (!journalInvestedBasis.eq(expectedInvestedBasis)) {
    return conservationRefusal('Journal invested-basis conservation failed.');
  }
  if (!sumJournalAccount(journal, 'distributions').eq(distributionTotal)) {
    return conservationRefusal('Journal distribution conservation failed.');
  }

  const openingAssetsByPartner = sumOpeningAssetsByPartner(state);
  const journalAssetsByPartner = sumJournalAssetsByPartner(state);
  const partnerLedgerMap = new Map(partnerLedgers.map((ledger) => [ledger.partnerId, ledger]));
  for (const partner of input.partners) {
    const ledger = partnerLedgerMap.get(partner.partnerId);
    if (!ledger) return conservationRefusal(`Missing partner ledger ${partner.partnerId}.`);
    const openingAssets = openingAssetsByPartner.get(partner.partnerId) ?? ZERO;
    const journalAssets = journalAssetsByPartner.get(partner.partnerId) ?? ZERO;
    const openingLedger = input.openingState.investorLedgers.find(
      (candidate) => candidate.partnerId === partner.partnerId
    );
    const stagedLedger = state.partnerLedgers.get(partner.partnerId);
    const tracker = state.callableTrackers.get(partner.partnerId);
    const byTier =
      distributionAmountByPartnerAndTier(tierPartnerAllocations).get(partner.partnerId) ??
      new Map<string, Decimal>();
    const returnOfCapital = byTier.get('return_of_capital') ?? ZERO;
    const preferredReturn = byTier.get('preferred_return') ?? ZERO;
    const stagedUnreturned = stagedLedger?.unreturnedSettledCashCapital ?? ZERO;
    const expectedUnreturned = stagedUnreturned.minus(returnOfCapital);
    const unreturned = new Decimal(ledger.unreturnedSettledCashCapital);
    if (
      !openingLedger ||
      !stagedLedger ||
      !tracker ||
      !openingAssets.eq(journalAssets) ||
      !openingAssets.eq(new Decimal(openingLedger.unreturnedSettledCashCapital)) ||
      !expectedUnreturned.eq(unreturned)
    ) {
      return conservationRefusal(
        `Partner ${partner.partnerId} unreturned capital conservation failed.`
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
    const remainingCallable = tracker.remainingCallable;
    const expectedCalled = new Decimal(partner.committedCapital).minus(remainingCallable);
    if (
      unreturned.gt(paidIn) ||
      !paidIn.eq(settled) ||
      settled.gt(called) ||
      called.gt(committed) ||
      !remainingCallable.eq(committed.minus(called)) ||
      !called.eq(expectedCalled) ||
      !new Decimal(ledger.settledCapital).eq(stagedLedger.settledCapital) ||
      !new Decimal(ledger.paidInCapital).eq(stagedLedger.paidInCapital) ||
      !new Decimal(ledger.cumulativeFees).eq(stagedLedger.cumulativeFees) ||
      !new Decimal(ledger.cumulativeExpenses).eq(stagedLedger.cumulativeExpenses) ||
      !new Decimal(ledger.accruedPreference).eq(
        stagedLedger.accruedPreference.minus(preferredReturn)
      ) ||
      !new Decimal(ledger.cumulativeDistributions).eq(
        stagedLedger.cumulativeDistributions.plus(
          Array.from(byTier.values()).reduce((total, amount) => total.plus(amount), ZERO)
        )
      )
    ) {
      return conservationRefusal(`Partner ${partner.partnerId} ledger ordering failed.`);
    }
  }

  const journalFundExpenses = sumJournalAccount(journal, 'fund_expenses');
  const categoryExpenseAmounts: readonly string[] = [
    expenseTotalsByCategory.legal,
    expenseTotalsByCategory.audit,
    expenseTotalsByCategory.admin,
    expenseTotalsByCategory.custody,
    expenseTotalsByCategory.other,
  ];
  const categoryExpenseTotal = categoryExpenseAmounts.reduce(
    (total, amount) => total.plus(new Decimal(amount)),
    ZERO
  );
  const stagedFundExpenseEvents = state.eventEffectRecords
    .filter((event) => event.kind === 'fund_expense_payment')
    .reduce((total, event) => total.plus(event.amountUsd), ZERO);
  const stagedPartnerExpenses = Array.from(state.partnerLedgers.values()).reduce(
    (total, ledger) => total.plus(ledger.cumulativeExpenses),
    ZERO
  );
  if (
    !categoryExpenseTotal.eq(journalFundExpenses) ||
    !categoryExpenseTotal.eq(stagedPartnerExpenses) ||
    !categoryExpenseTotal.eq(stagedFundExpenseEvents)
  ) {
    return conservationRefusal('Journal fund-expense conservation failed.');
  }

  const classLedgerMap = new Map(classLedgers.map((ledger) => [ledger.lpClassId, ledger]));
  for (const lpClass of input.lpClasses) {
    const classLedger = classLedgerMap.get(lpClass.lpClassId);
    if (!classLedger) return conservationRefusal(`Missing class ledger ${lpClass.lpClassId}.`);
    const members = input.partners.filter(
      (partner) => !partner.isGp && partner.lpClassId === lpClass.lpClassId
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
      members.map((partner) => partnerLedgerMap.get(partner.partnerId)?.cashFlowVector ?? [])
    );
    if (!compareCashFlows(classLedger.cashFlowVector, expectedCashFlows)) {
      return conservationRefusal(`Class ${lpClass.lpClassId} cash-flow aggregation failed.`);
    }
  }

  const poolMap = new Map(
    openingPositions.entitlementPools.map((pool) => [pool.entitlementPoolId, pool])
  );
  for (const slice of openingPositions.investmentSlices) {
    const pool = poolMap.get(slice.entitlementPoolId);
    if (!pool || pool.dealId !== slice.dealId || pool.securityId !== slice.securityId) {
      return conservationRefusal(
        `Investment slice ${slice.investmentLotId} has invalid entitlement pool identity.`
      );
    }
  }
  for (const pool of openingPositions.entitlementPools) {
    const members = openingPositions.investmentSlices.filter(
      (slice) => slice.entitlementPoolId === pool.entitlementPoolId
    );
    for (const slice of members) {
      if (!new Decimal(slice.entitlementAmount).gt(0)) {
        return conservationRefusal(`Entitlement slice ${slice.investmentLotId} must be positive.`);
      }
    }
    const memberTotal = members.reduce(
      (total, slice) => total.plus(new Decimal(slice.entitlementAmount)),
      ZERO
    );
    if (!memberTotal.eq(new Decimal(pool.entitlementTotal))) {
      return conservationRefusal(`Entitlement pool ${pool.entitlementPoolId} arithmetic failed.`);
    }
  }

  const tierTotal = tierAllocations.reduce(
    (total, tier) => total.plus(new Decimal(tier.totalAllocated)),
    ZERO
  );
  if (!tierTotal.eq(new Decimal(fundCashEquation.distributions))) {
    return conservationRefusal('Tier distribution conservation failed.');
  }
  for (const tier of tierAllocations) {
    if (
      !new Decimal(tier.totalAllocated).eq(
        new Decimal(tier.gpShare).plus(new Decimal(tier.lpShare))
      )
    ) {
      return conservationRefusal(`Tier ${tier.kind} conservation failed.`);
    }
  }

  const tierTotalsByKind = new Map<string, Decimal>();
  for (const allocation of tierPartnerAllocations) {
    tierTotalsByKind.set(
      allocation.tierKind,
      (tierTotalsByKind.get(allocation.tierKind) ?? ZERO).plus(new Decimal(allocation.amountUsd))
    );
  }
  for (const tier of tierAllocations) {
    if (!(tierTotalsByKind.get(tier.kind) ?? ZERO).eq(new Decimal(tier.totalAllocated))) {
      return conservationRefusal(`Tier ${tier.kind} partner vector failed.`);
    }
  }

  return null;
}

export function buildReceipt(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState,
  selectedLane: V2WaterfallLane,
  tierAllocations: readonly TierAllocationV2[],
  tierPartnerAllocations: readonly TierPartnerAllocation[] = [],
  waterfallTotalDistributed?: Decimal,
  waterfallPartnerDistributions?: ReadonlyMap<string, Decimal>
): InternalEconomicsReceiptV2Result {
  if (state.openingJournal.some((entry) => entry.postings.length !== 2)) {
    return conservationRefusal('Opening journal entries must contain exactly two postings.');
  }

  const distributionError = applyDistributionEffects(state, tierPartnerAllocations);
  if (distributionError) return distributionError;

  const distributionInstant = state.eventEffectRecords.reduce(
    (latest, event) => (compareStrings(event.instant, latest) > 0 ? event.instant : latest),
    input.cutoverInstant
  );
  const distributionTotal =
    waterfallTotalDistributed ??
    tierPartnerAllocations.reduce(
      (total, allocation) => total.plus(new Decimal(allocation.amountUsd)),
      ZERO
    );
  const openingPositions = buildOpeningPositions(state);
  const journal = buildJournal(
    input,
    state,
    selectedLane,
    tierPartnerAllocations,
    distributionInstant
  );
  const partnerLedgers = buildPartnerLedgers(
    input,
    state,
    tierPartnerAllocations,
    distributionInstant
  );
  const classLedgers = buildClassLedgers(input, partnerLedgers);
  const receiptTierAllocations = buildTierAllocations(tierAllocations);
  const fundCashEquation = buildFundCashEquation(input, state, distributionTotal);
  const sourceRefs = [...(input.sourceRefs ?? [])].sort(compareStrings);
  const upstreamReceiptIds = [...(input.upstreamReceiptIds ?? [])].sort(compareStrings);
  const lineage = buildLineage(state);
  const componentVersions = buildComponentVersions(selectedLane);
  const expenseTotalsByCategory = buildExpenseTotalsByCategory(state);

  const rowCount = countReceiptRows({
    componentVersionCount: Object.keys(componentVersions).length,
    openingCashLotCount: openingPositions.cashLots.length,
    openingInvestmentSliceCount: openingPositions.investmentSlices.length,
    openingEntitlementPoolCount: openingPositions.entitlementPools.length,
    journalEntryCount: journal.length,
    journalPostingCount: journal.reduce((count, entry) => count + entry.postings.length, 0),
    tierAllocationCount: receiptTierAllocations.length,
    partnerLedgerCount: partnerLedgers.length,
    classLedgerCount: classLedgers.length,
    partnerCashFlowEntryCount: partnerLedgers.reduce(
      (count, ledger) => count + ledger.cashFlowVector.length,
      0
    ),
    classCashFlowEntryCount: classLedgers.reduce(
      (count, ledger) => count + ledger.cashFlowVector.length,
      0
    ),
    sourceRefCount: sourceRefs.length,
    upstreamReceiptIdCount: upstreamReceiptIds.length,
    cashLotLineageCount: lineage.cashLots.reduce(
      (count, lot) => count + 1 + lot.consumingEventIds.length,
      0
    ),
    investmentSliceLineageCount: lineage.investmentSlices.reduce(
      (count, slice) => count + 1 + slice.fundingAllocations.length,
      0
    ),
  });
  if (rowCount > V2_ADMISSION_LIMITS.MAX_OUTPUT_ROWS) {
    return admissionRefusal(
      `Receipt row count ${rowCount} exceeds limit ${V2_ADMISSION_LIMITS.MAX_OUTPUT_ROWS}.`
    );
  }

  const conservationError = validateConservation(
    input,
    state,
    fundCashEquation,
    expenseTotalsByCategory,
    openingPositions,
    journal,
    receiptTierAllocations,
    tierPartnerAllocations,
    partnerLedgers,
    classLedgers,
    distributionTotal,
    waterfallPartnerDistributions
  );
  if (conservationError) return conservationError;

  const preimage: InternalEconomicsReceiptV2ResultHashPreimage = {
    receiptVersion: INTERNAL_ECONOMICS_RECEIPT_V2_VERSION,
    componentVersions,
    selectedLane,
    hashAlgorithm: 'canonical-json-sha256/1',
    normalizedInputHash: input._normalizedInputHash,
    fundCashEquation,
    expenseTotalsByCategory,
    openingPositions,
    lineage,
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
      `Serialized receipt size ${serializedBytes} bytes exceeds limit ${V2_ADMISSION_LIMITS.MAX_SERIALIZED_OUTPUT_BYTES}.`
    );
  }

  return { ok: true, receipt: deepFreeze(receipt) };
}
