import { Decimal } from '../../../lib/decimal-config';
import type {
  CashSourceAllocation,
  V2Event,
  NormalizedInternalEconomicsInputV2,
  OpeningCashOwnerV2,
  OpeningPartnerOwnerV2,
  V2CoreRefusal,
  V2RefusalCode,
  V2Stage,
  V2TierKind,
  V2WaterfallLane,
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import { V2_EVENT_CLASSIFICATION } from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import {
  buildMonthlySchedule,
  computePeriodAccrual,
  computeEpochMonth,
  type MonthlyPeriod,
  type PreferredReturnConfig,
} from './preferred-return-accrual-v2';

export const INTERNAL_ECONOMICS_EVENT_ENGINE_V2_VERSION =
  'internal-economics-event-engine/2.2.0' as const;

type CashSourceLotBase = {
  readonly lotId: string;
  readonly originalAmount: Decimal;
  remainingBalance: Decimal;
};

type ContributionSettlementCashSourceLot = CashSourceLotBase & {
  readonly origin: 'event';
  readonly sourceKind: 'contribution_settlement';
  readonly sourceEventId: string;
  readonly partnerId: string;
};

type RealizationProceedsCashSourceLot = CashSourceLotBase & {
  readonly origin: 'event';
  readonly sourceKind: 'realization_proceeds';
  readonly sourceEventId: string;
  readonly dealId: string;
};

type OpeningCashSourceLot = CashSourceLotBase & {
  readonly origin: 'opening';
  readonly sourceRef: string;
  readonly owner: OpeningCashOwnerV2;
  readonly classification: 'paid_in' | 'recycling' | 'unclassified';
};

function refuse(
  code: V2RefusalCode,
  stage: V2Stage,
  message: string,
  diagnostics?: Record<string, unknown>
): V2CoreRefusal {
  return { ok: false, code, stage, message, ...(diagnostics ? { diagnostics } : {}) };
}

export type CashSourceLot =
  ContributionSettlementCashSourceLot | RealizationProceedsCashSourceLot | OpeningCashSourceLot;

export interface InvestmentLot {
  readonly lotId: string;
  readonly dealId: string;
  readonly securityId: string;
  readonly fundingAllocations: readonly CashSourceAllocation[];
  readonly costBasis: Decimal;
  relievedAmount: Decimal;
}

export interface CallableCommitmentTracker {
  readonly partnerId: string;
  remainingCallable: Decimal;
}

export interface PartnerLedgerState {
  readonly partnerId: string;
  readonly isGp: boolean;
  settledCapital: Decimal;
  paidInCapital: Decimal;
  unreturnedSettledCashCapital: Decimal;
  cumulativeDistributions: Decimal;
  cumulativeFees: Decimal;
  accruedPreference: Decimal;
  calledCapitalPeriodDeployment: Decimal;
}

export interface HydratedOpeningCashLot {
  readonly lotId: string;
  readonly sourceRef: string;
  readonly owner: OpeningCashOwnerV2;
  readonly classification: 'paid_in' | 'recycling' | 'unclassified';
  readonly originalAmount: Decimal;
  remainingBalance: Decimal;
}

export interface HydratedOpeningInvestmentSlice {
  readonly investmentLotId: string;
  readonly sourceRef: string;
  readonly entitlementPoolId: string;
  readonly dealId: string;
  readonly securityId: string;
  readonly owner: OpeningPartnerOwnerV2;
  readonly costBasis: Decimal;
  readonly relievedAmount: Decimal;
  readonly remainingBasis: Decimal;
  readonly entitlementAmount: Decimal;
}

export interface HydratedOpeningEntitlementPool {
  readonly entitlementPoolId: string;
  readonly sourceRef: string;
  readonly dealId: string;
  readonly securityId: string;
  readonly entitlementTotal: Decimal;
}

export interface OpeningJournalPosting {
  readonly account: 'cash' | 'invested_basis' | 'opening_unreturned_capital';
  readonly rowRef: string;
  readonly owner: OpeningCashOwnerV2;
  readonly amountUsd: Decimal;
}

export interface OpeningInvestmentSliceJournalPosting {
  readonly account: 'cash' | 'invested_basis' | 'opening_unreturned_capital';
  readonly rowRef: string;
  readonly owner: OpeningPartnerOwnerV2;
  readonly amountUsd: Decimal;
}

export interface OpeningCashLotJournalEntry {
  readonly entryId: string;
  readonly instant: string;
  readonly kind: 'opening_cash_lot';
  readonly sourceRef: string;
  readonly postings: [OpeningJournalPosting, OpeningJournalPosting];
}

export interface OpeningInvestmentSliceJournalEntry {
  readonly entryId: string;
  readonly instant: string;
  readonly kind: 'opening_investment_slice';
  readonly sourceRef: string;
  readonly postings: [OpeningInvestmentSliceJournalPosting, OpeningInvestmentSliceJournalPosting];
}

export type OpeningJournalEntry = OpeningCashLotJournalEntry | OpeningInvestmentSliceJournalEntry;

export interface DerivedEvent {
  readonly derivedEventId: string;
  readonly derivedKind: 'management_fee_payment' | 'distribution';
  readonly instant: string;
  readonly amount: Decimal;
  readonly lpClassId?: string;
  readonly partnerId?: string;
}

export interface ConsumptionRecord {
  readonly eventId: string;
  readonly lotId: string;
  readonly amountUsd: Decimal;
}

export type EventEffectKind =
  'settled_contribution' | 'deployment' | 'realization' | 'fund_expense_payment';

export interface EventEffectRecord {
  readonly eventId: string;
  readonly instant: string;
  readonly kind: EventEffectKind;
  readonly amountUsd: Decimal;
  readonly reliefTotal?: Decimal;
}

export type PartnerEffectField =
  | 'settledCapital'
  | 'paidInCapital'
  | 'unreturnedSettledCashCapital'
  | 'cumulativeDistributions'
  | 'cumulativeFees'
  | 'accruedPreference'
  | 'calledCapitalPeriodDeployment';

export type EventPartnerEffectRecord = {
  readonly origin: 'event';
  readonly eventId: string;
  readonly instant: string;
  readonly partnerId: string;
  readonly field: PartnerEffectField;
  readonly amountUsd: Decimal;
};

export type DistributionPartnerEffectRecord = {
  readonly origin: 'distribution';
  readonly lane: V2WaterfallLane;
  readonly tierKind: V2TierKind;
  readonly tierOrdinal: number;
  readonly partnerId: string;
  readonly field: PartnerEffectField;
  readonly amountUsd: Decimal;
};

export type PartnerEffectRecord = EventPartnerEffectRecord | DistributionPartnerEffectRecord;

export interface ChronologyEntry {
  readonly instant: string;
  readonly phase: number;
  readonly event: V2Event | null;
  readonly derived: DerivedEvent | null;
  readonly sortKey: string;
}

export function sortEventsIntoChronology(events: readonly V2Event[]): ChronologyEntry[] {
  const entries: ChronologyEntry[] = events.map((event) => {
    const classification = V2_EVENT_CLASSIFICATION[event.kind];
    return {
      instant: event.instant,
      phase: classification.phase,
      event,
      derived: null,
      sortKey: `${event.instant}|${String(classification.phase).padStart(2, '0')}|${event.eventId}`,
    };
  });

  entries.sort((a, b) => {
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return 0;
  });

  return entries;
}

export function insertDerivedEvents(chronology: ChronologyEntry[], derived: DerivedEvent[]): void {
  for (const d of derived) {
    const phase = d.derivedKind === 'management_fee_payment' ? 3 : 6;
    const entry: ChronologyEntry = {
      instant: d.instant,
      phase,
      event: null,
      derived: d,
      sortKey: `${d.instant}|${String(phase).padStart(2, '0')}|~${d.derivedEventId}`,
    };
    chronology.push(entry);
  }

  chronology.sort((a, b) => {
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return 0;
  });
}

export function validateCashSourceAllocations(
  allocations: readonly { lotId: string; amount: string }[],
  lots: Map<string, CashSourceLot>,
  eventId: string
): V2CoreRefusal | null {
  for (const alloc of allocations) {
    if (!lots.has(alloc.lotId)) {
      return refuse(
        'CASH_SOURCE_ALLOCATION_VIOLATION',
        'provenance',
        `Event ${eventId}: cash source lot '${alloc.lotId}' not found.`,
        { eventId }
      );
    }
  }

  for (const alloc of allocations) {
    const allocAmount = new Decimal(alloc.amount);
    if (allocAmount.lt(0)) {
      return refuse(
        'CASH_SOURCE_ALLOCATION_VIOLATION',
        'provenance',
        `Event ${eventId}: cash source allocation ${allocAmount.toFixed(6)} is negative.`,
        { eventId }
      );
    }
  }

  const totals = new Map<string, Decimal>();
  for (const alloc of allocations) {
    const total = totals.get(alloc.lotId) ?? new Decimal(0);
    totals.set(alloc.lotId, total.plus(new Decimal(alloc.amount)));
  }

  for (const [lotId, total] of totals) {
    const lot = lots.get(lotId)!;
    if (total.gt(lot.remainingBalance)) {
      return refuse(
        'CASH_SOURCE_ALLOCATION_VIOLATION',
        'provenance',
        `Event ${eventId}: allocation ${total.toFixed(6)} exceeds lot '${lotId}' remaining balance ${lot.remainingBalance.toFixed(6)}.`,
        { eventId }
      );
    }
  }

  return null;
}

export function applyCashSourceAllocations(
  allocations: readonly { lotId: string; amount: string }[],
  lots: Map<string, CashSourceLot>
): void {
  for (const alloc of allocations) {
    const lot = lots.get(alloc.lotId)!;
    lot.remainingBalance = lot.remainingBalance.minus(new Decimal(alloc.amount));
  }
}

export function validateReliefRows(
  reliefRows: readonly {
    investmentLotId: string;
    relievedCostBasis: string;
    allocatedProceeds: string;
  }[],
  investmentLots: Map<string, InvestmentLot>,
  eventId: string
): V2CoreRefusal | null {
  for (const row of reliefRows) {
    if (!investmentLots.has(row.investmentLotId)) {
      return refuse(
        'INVESTMENT_LOT_RELIEF_VIOLATION',
        'provenance',
        `Event ${eventId}: investment lot '${row.investmentLotId}' not found.`,
        { eventId }
      );
    }
  }

  for (const row of reliefRows) {
    const relieved = new Decimal(row.relievedCostBasis);
    const proceeds = new Decimal(row.allocatedProceeds);
    if (relieved.lt(0) || proceeds.lt(0)) {
      return refuse(
        'INVESTMENT_LOT_RELIEF_VIOLATION',
        'provenance',
        `Event ${eventId}: relief row for investment lot '${row.investmentLotId}' contains a negative amount.`,
        { eventId }
      );
    }
  }

  const totals = new Map<string, Decimal>();
  for (const row of reliefRows) {
    const total = totals.get(row.investmentLotId) ?? new Decimal(0);
    totals.set(row.investmentLotId, total.plus(new Decimal(row.relievedCostBasis)));
  }

  for (const [lotId, total] of totals) {
    const lot = investmentLots.get(lotId)!;
    const remaining = lot.costBasis.minus(lot.relievedAmount);
    if (total.gt(remaining)) {
      return refuse(
        'INVESTMENT_LOT_RELIEF_VIOLATION',
        'provenance',
        `Event ${eventId}: relief ${total.toFixed(6)} exceeds lot '${lotId}' remaining basis ${remaining.toFixed(6)}.`,
        { eventId }
      );
    }
  }

  return null;
}

export function applyReliefRows(
  reliefRows: readonly { investmentLotId: string; relievedCostBasis: string }[],
  investmentLots: Map<string, InvestmentLot>
): void {
  for (const row of reliefRows) {
    const lot = investmentLots.get(row.investmentLotId)!;
    lot.relievedAmount = lot.relievedAmount.plus(new Decimal(row.relievedCostBasis));
  }
}

export function processCallableCommitment(
  event: V2Event,
  trackers: Map<string, CallableCommitmentTracker>
): V2CoreRefusal | null {
  const classification = V2_EVENT_CLASSIFICATION[event.kind];
  if (classification.callableEffect === 'none' || classification.callableEffect === 'reserved') {
    return null;
  }

  const amount = new Decimal(event.amountUsd);

  if (classification.callableEffect === 'consumes') {
    if (event.kind !== 'settled_contribution') return null;
    const tracker = trackers.get(event.partnerId);
    if (!tracker) {
      return refuse(
        'SCHEMA_VALIDATION_FAILED',
        'settlement',
        `Event ${event.eventId}: partner '${event.partnerId}' is not declared in partners.`,
        { eventId: event.eventId, partnerId: event.partnerId }
      );
    }

    if (amount.gt(tracker.remainingCallable)) {
      return refuse(
        'COMMITMENT_OVERRUN',
        'settlement',
        `Partner ${event.partnerId}: contribution ${amount.toFixed(6)} exceeds remaining callable ${tracker.remainingCallable.toFixed(6)}.`,
        { partnerId: event.partnerId }
      );
    }
    tracker.remainingCallable = tracker.remainingCallable.minus(amount);
  }

  if (classification.callableEffect === 'restores') {
    if (event.kind !== 'contribution_correction') return null;
    for (const [, tracker] of trackers) {
      tracker.remainingCallable = tracker.remainingCallable.plus(amount);
    }
  }

  return null;
}

export interface EventStreamState {
  readonly cashSourceLots: Map<string, CashSourceLot>;
  readonly investmentLots: Map<string, InvestmentLot>;
  readonly callableTrackers: Map<string, CallableCommitmentTracker>;
  readonly partnerLedgers: Map<string, PartnerLedgerState>;
  readonly consumptionRecords: ConsumptionRecord[];
  readonly eventEffectRecords: EventEffectRecord[];
  readonly partnerEffectRecords: PartnerEffectRecord[];
  readonly derivedEvents: DerivedEvent[];
  endingCash: Decimal;
  readonly openingCashLots: Map<string, HydratedOpeningCashLot>;
  readonly openingInvestmentSlices: Map<string, HydratedOpeningInvestmentSlice>;
  readonly openingEntitlementPools: Map<string, HydratedOpeningEntitlementPool>;
  readonly openingJournal: OpeningJournalEntry[];
}

function cashSourceLotCollisionRefusal(eventId: string, lotId: string): V2CoreRefusal {
  return refuse(
    'CASH_SOURCE_ALLOCATION_VIOLATION',
    'provenance',
    `Event ${eventId}: cash source lot '${lotId}' already exists.`,
    { eventId }
  );
}

function investmentLotCollisionRefusal(eventId: string, lotId: string): V2CoreRefusal {
  return refuse(
    'INVESTMENT_LOT_RELIEF_VIOLATION',
    'provenance',
    `Event ${eventId}: investment lot '${lotId}' already exists.`,
    { eventId }
  );
}

function appendEventPartnerEffect(
  state: EventStreamState,
  event: V2Event & { kind: 'settled_contribution' },
  field: PartnerEffectField,
  amountUsd: Decimal
): void {
  state.partnerEffectRecords.push({
    origin: 'event',
    eventId: event.eventId,
    instant: event.instant,
    partnerId: event.partnerId,
    field,
    amountUsd: new Decimal(amountUsd),
  });
}

function cloneOpeningJournalEntry(entry: OpeningJournalEntry): OpeningJournalEntry {
  if (entry.kind === 'opening_cash_lot') {
    return {
      ...entry,
      postings: entry.postings.map((posting) => ({
        ...posting,
        owner: { ...posting.owner },
        amountUsd: new Decimal(posting.amountUsd),
      })) as [OpeningJournalPosting, OpeningJournalPosting],
    };
  }

  return {
    ...entry,
    postings: entry.postings.map((posting) => ({
      ...posting,
      owner: { ...posting.owner },
      amountUsd: new Decimal(posting.amountUsd),
    })) as [OpeningInvestmentSliceJournalPosting, OpeningInvestmentSliceJournalPosting],
  };
}

export function cloneEventStreamState(state: EventStreamState): EventStreamState {
  const clonedState = {
    cashSourceLots: new Map<string, CashSourceLot>(),
    investmentLots: new Map<string, InvestmentLot>(),
    callableTrackers: new Map<string, CallableCommitmentTracker>(),
    partnerLedgers: new Map<string, PartnerLedgerState>(),
    consumptionRecords: state.consumptionRecords.map((record) => ({
      ...record,
      amountUsd: new Decimal(record.amountUsd),
    })),
    eventEffectRecords: state.eventEffectRecords.map((record) => ({
      ...record,
      amountUsd: new Decimal(record.amountUsd),
      ...(record.reliefTotal !== undefined ? { reliefTotal: new Decimal(record.reliefTotal) } : {}),
    })),
    partnerEffectRecords: state.partnerEffectRecords.map((record) => ({
      ...record,
      amountUsd: new Decimal(record.amountUsd),
    })),
    derivedEvents: state.derivedEvents.map((event) => ({
      ...event,
      amount: new Decimal(event.amount),
    })),
    endingCash: new Decimal(state.endingCash),
    openingCashLots: new Map<string, HydratedOpeningCashLot>(),
    openingInvestmentSlices: new Map<string, HydratedOpeningInvestmentSlice>(),
    openingEntitlementPools: new Map<string, HydratedOpeningEntitlementPool>(),
    openingJournal: state.openingJournal.map(cloneOpeningJournalEntry),
  } satisfies EventStreamState;

  for (const [key, lot] of state.cashSourceLots) {
    clonedState.cashSourceLots.set(
      key,
      lot.origin === 'opening'
        ? {
            ...lot,
            owner: { ...lot.owner },
            originalAmount: new Decimal(lot.originalAmount),
            remainingBalance: new Decimal(lot.remainingBalance),
          }
        : {
            ...lot,
            originalAmount: new Decimal(lot.originalAmount),
            remainingBalance: new Decimal(lot.remainingBalance),
          }
    );
  }

  for (const [key, lot] of state.investmentLots) {
    clonedState.investmentLots.set(key, {
      ...lot,
      fundingAllocations: lot.fundingAllocations.map((allocation) => ({ ...allocation })),
      costBasis: new Decimal(lot.costBasis),
      relievedAmount: new Decimal(lot.relievedAmount),
    });
  }

  for (const [key, tracker] of state.callableTrackers) {
    clonedState.callableTrackers.set(key, {
      ...tracker,
      remainingCallable: new Decimal(tracker.remainingCallable),
    });
  }

  for (const [key, ledger] of state.partnerLedgers) {
    clonedState.partnerLedgers.set(key, {
      ...ledger,
      settledCapital: new Decimal(ledger.settledCapital),
      paidInCapital: new Decimal(ledger.paidInCapital),
      unreturnedSettledCashCapital: new Decimal(ledger.unreturnedSettledCashCapital),
      cumulativeDistributions: new Decimal(ledger.cumulativeDistributions),
      cumulativeFees: new Decimal(ledger.cumulativeFees),
      accruedPreference: new Decimal(ledger.accruedPreference),
      calledCapitalPeriodDeployment: new Decimal(ledger.calledCapitalPeriodDeployment),
    });
  }

  for (const [key, lot] of state.openingCashLots) {
    clonedState.openingCashLots.set(key, {
      ...lot,
      owner: { ...lot.owner },
      originalAmount: new Decimal(lot.originalAmount),
      remainingBalance: new Decimal(lot.remainingBalance),
    });
  }

  for (const [key, slice] of state.openingInvestmentSlices) {
    clonedState.openingInvestmentSlices.set(key, {
      ...slice,
      owner: { ...slice.owner },
      costBasis: new Decimal(slice.costBasis),
      relievedAmount: new Decimal(slice.relievedAmount),
      remainingBasis: new Decimal(slice.remainingBasis),
      entitlementAmount: new Decimal(slice.entitlementAmount),
    });
  }

  for (const [key, pool] of state.openingEntitlementPools) {
    clonedState.openingEntitlementPools.set(key, {
      ...pool,
      entitlementTotal: new Decimal(pool.entitlementTotal),
    });
  }

  return clonedState;
}

export function initializeEventStreamState(
  input: NormalizedInternalEconomicsInputV2
): EventStreamState {
  const cashSourceLots = new Map<string, CashSourceLot>();
  const investmentLots = new Map<string, InvestmentLot>();

  const callableTrackers = new Map<string, CallableCommitmentTracker>();
  for (const partner of input.partners) {
    callableTrackers.set(partner.partnerId, {
      partnerId: partner.partnerId,
      remainingCallable: new Decimal(partner.remainingCallableCommitment),
    });
  }

  const partnerLedgers = new Map<string, PartnerLedgerState>();
  for (const partner of input.partners) {
    const ledger = input.openingState.investorLedgers.find(
      (l) => l.partnerId === partner.partnerId
    );
    partnerLedgers.set(partner.partnerId, {
      partnerId: partner.partnerId,
      isGp: partner.isGp,
      settledCapital: new Decimal(ledger?.settledCapital ?? '0.000000'),
      paidInCapital: new Decimal(ledger?.paidInCapital ?? '0.000000'),
      unreturnedSettledCashCapital: new Decimal(ledger?.unreturnedSettledCashCapital ?? '0.000000'),
      cumulativeDistributions: new Decimal(ledger?.cumulativeDistributions ?? '0.000000'),
      cumulativeFees: new Decimal(ledger?.cumulativeFees ?? '0.000000'),
      accruedPreference: new Decimal(ledger?.accruedPreference ?? '0.000000'),
      calledCapitalPeriodDeployment: new Decimal(0),
    });
  }

  const openingCashLots = new Map<string, HydratedOpeningCashLot>();
  for (const lot of input.openingState.openingProvenance.cashLots) {
    if (openingCashLots.has(lot.lotId) || cashSourceLots.has(lot.lotId)) {
      throw new Error(`Duplicate opening cash source lot ID ${lot.lotId}.`);
    }
    openingCashLots.set(lot.lotId, {
      lotId: lot.lotId,
      sourceRef: lot.sourceRef,
      owner: lot.owner,
      classification: lot.classification,
      originalAmount: new Decimal(lot.originalAmount),
      remainingBalance: new Decimal(lot.remainingBalance),
    });
  }
  for (const lot of openingCashLots.values()) {
    if (cashSourceLots.has(lot.lotId)) {
      throw new Error(`Duplicate opening cash source lot ID ${lot.lotId}.`);
    }
    cashSourceLots.set(lot.lotId, {
      origin: 'opening',
      lotId: lot.lotId,
      sourceRef: lot.sourceRef,
      owner: { ...lot.owner },
      classification: lot.classification,
      originalAmount: new Decimal(lot.originalAmount),
      remainingBalance: new Decimal(lot.remainingBalance),
    });
  }

  const openingInvestmentSlices = new Map<string, HydratedOpeningInvestmentSlice>();
  const entitlementTotals = new Map<string, Decimal>();
  for (const lot of input.openingState.openingProvenance.investmentLots) {
    const costBasis = new Decimal(lot.costBasis);
    const relievedAmount = new Decimal(lot.relievedAmount);
    const entitlementAmount = new Decimal(lot.entitlementAmount);
    openingInvestmentSlices.set(lot.investmentLotId, {
      investmentLotId: lot.investmentLotId,
      sourceRef: lot.sourceRef,
      entitlementPoolId: lot.entitlementPoolId,
      dealId: lot.dealId,
      securityId: lot.securityId,
      owner: lot.owner,
      costBasis,
      relievedAmount,
      remainingBasis: costBasis.minus(relievedAmount),
      entitlementAmount,
    });
    entitlementTotals.set(
      lot.entitlementPoolId,
      (entitlementTotals.get(lot.entitlementPoolId) ?? new Decimal(0)).plus(entitlementAmount)
    );
  }

  const openingEntitlementPools = new Map<string, HydratedOpeningEntitlementPool>();
  for (const pool of input.openingState.openingProvenance.entitlementPools) {
    openingEntitlementPools.set(pool.entitlementPoolId, {
      entitlementPoolId: pool.entitlementPoolId,
      sourceRef: pool.sourceRef,
      dealId: pool.dealId,
      securityId: pool.securityId,
      entitlementTotal: entitlementTotals.get(pool.entitlementPoolId) ?? new Decimal(0),
    });
  }

  const openingJournal: OpeningJournalEntry[] = [];
  for (const lot of openingCashLots.values()) {
    openingJournal.push({
      entryId: `opening/cash_lot/${lot.lotId}`,
      instant: input.cutoverInstant,
      kind: 'opening_cash_lot',
      sourceRef: lot.sourceRef,
      postings: [
        {
          account: 'cash',
          rowRef: lot.lotId,
          owner: lot.owner,
          amountUsd: new Decimal(lot.remainingBalance),
        },
        {
          account: 'opening_unreturned_capital',
          rowRef: lot.lotId,
          owner: lot.owner,
          amountUsd: new Decimal(lot.remainingBalance).negated(),
        },
      ],
    });
  }
  for (const slice of openingInvestmentSlices.values()) {
    openingJournal.push({
      entryId: `opening/investment_slice/${slice.investmentLotId}`,
      instant: input.cutoverInstant,
      kind: 'opening_investment_slice',
      sourceRef: slice.sourceRef,
      postings: [
        {
          account: 'invested_basis',
          rowRef: slice.investmentLotId,
          owner: slice.owner,
          amountUsd: new Decimal(slice.remainingBasis),
        },
        {
          account: 'opening_unreturned_capital',
          rowRef: slice.investmentLotId,
          owner: slice.owner,
          amountUsd: new Decimal(slice.remainingBasis).negated(),
        },
      ],
    });
  }
  openingJournal.sort((a, b) => {
    if (a.entryId < b.entryId) return -1;
    if (a.entryId > b.entryId) return 1;
    return 0;
  });

  return {
    cashSourceLots,
    investmentLots,
    callableTrackers,
    partnerLedgers,
    consumptionRecords: [],
    eventEffectRecords: [],
    partnerEffectRecords: [],
    derivedEvents: [],
    endingCash: new Decimal(input.openingState.openingCash),
    openingCashLots,
    openingInvestmentSlices,
    openingEntitlementPools,
    openingJournal,
  };
}

export function processSettledContribution(
  event: V2Event & { kind: 'settled_contribution' },
  state: EventStreamState
): V2CoreRefusal | null {
  const amount = new Decimal(event.amountUsd);
  const lotId = `csl:${event.eventId}`;

  const ledger = state.partnerLedgers.get(event.partnerId);
  if (!ledger) {
    return refuse(
      'SCHEMA_VALIDATION_FAILED',
      'settlement',
      `Event ${event.eventId}: partner '${event.partnerId}' is not declared in partners.`,
      { eventId: event.eventId, partnerId: event.partnerId }
    );
  }

  if (state.cashSourceLots.has(lotId)) {
    return cashSourceLotCollisionRefusal(event.eventId, lotId);
  }

  state.cashSourceLots.set(lotId, {
    origin: 'event',
    sourceKind: 'contribution_settlement',
    lotId,
    sourceEventId: event.eventId,
    partnerId: event.partnerId,
    originalAmount: amount,
    remainingBalance: amount,
  });

  state.eventEffectRecords.push({
    eventId: event.eventId,
    instant: event.instant,
    kind: 'settled_contribution',
    amountUsd: new Decimal(amount),
  });

  state.endingCash = state.endingCash.plus(amount);

  ledger.settledCapital = ledger.settledCapital.plus(amount);
  appendEventPartnerEffect(state, event, 'settledCapital', amount);
  ledger.paidInCapital = ledger.paidInCapital.plus(amount);
  appendEventPartnerEffect(state, event, 'paidInCapital', amount);
  ledger.unreturnedSettledCashCapital = ledger.unreturnedSettledCashCapital.plus(amount);
  appendEventPartnerEffect(state, event, 'unreturnedSettledCashCapital', amount);

  if (event.purpose === 'deployment') {
    ledger.calledCapitalPeriodDeployment = ledger.calledCapitalPeriodDeployment.plus(amount);
    appendEventPartnerEffect(state, event, 'calledCapitalPeriodDeployment', amount);
  }

  return null;
}

export function processRealization(
  event: V2Event & { kind: 'realization' },
  state: EventStreamState
): V2CoreRefusal | null {
  const amount = new Decimal(event.amountUsd);

  const reliefError = validateReliefRows(event.reliefRows, state.investmentLots, event.eventId);
  if (reliefError) return reliefError;

  for (const row of event.reliefRows) {
    const lotDealId = state.investmentLots.get(row.investmentLotId)!.dealId;
    if (lotDealId !== event.dealId) {
      return refuse(
        'INVESTMENT_LOT_RELIEF_VIOLATION',
        'provenance',
        `Event ${event.eventId}: relief row lot '${row.investmentLotId}' belongs to deal '${lotDealId}', not event deal '${event.dealId}'.`,
        { eventId: event.eventId }
      );
    }
  }

  const allocatedProceedsTotal = event.reliefRows.reduce(
    (total, row) => total.plus(new Decimal(row.allocatedProceeds)),
    new Decimal(0)
  );
  if (!allocatedProceedsTotal.eq(amount)) {
    const amountUsd = amount.toFixed(6);
    const total = allocatedProceedsTotal.toFixed(6);
    return refuse(
      'INVESTMENT_LOT_RELIEF_VIOLATION',
      'provenance',
      `Event ${event.eventId}: event amount ${amountUsd} must equal allocated proceeds total ${total}.`,
      {
        eventId: event.eventId,
        contextDetails: `{"expectedEventAmountUsd":"${amountUsd}","actualAllocatedProceedsTotalUsd":"${total}"}`,
      }
    );
  }

  const lotId = `proceeds:${event.eventId}`;
  if (state.cashSourceLots.has(lotId)) {
    return cashSourceLotCollisionRefusal(event.eventId, lotId);
  }

  applyReliefRows(event.reliefRows, state.investmentLots);
  state.cashSourceLots.set(lotId, {
    origin: 'event',
    sourceKind: 'realization_proceeds',
    lotId,
    sourceEventId: event.eventId,
    dealId: event.dealId,
    originalAmount: amount,
    remainingBalance: amount,
  });

  state.eventEffectRecords.push({
    eventId: event.eventId,
    instant: event.instant,
    kind: 'realization',
    amountUsd: new Decimal(amount),
    reliefTotal: event.reliefRows.reduce(
      (total, row) => total.plus(new Decimal(row.relievedCostBasis)),
      new Decimal(0)
    ),
  });

  state.endingCash = state.endingCash.plus(amount);
  return null;
}

export function processDeployment(
  event: V2Event & { kind: 'deployment' },
  state: EventStreamState
): V2CoreRefusal | null {
  const amount = new Decimal(event.amountUsd);

  const allocError = validateCashSourceAllocations(
    event.cashSourceAllocations,
    state.cashSourceLots,
    event.eventId
  );
  if (allocError) return allocError;

  const cashSourceAllocationTotal = event.cashSourceAllocations.reduce(
    (total, allocation) => total.plus(new Decimal(allocation.amount)),
    new Decimal(0)
  );
  if (!cashSourceAllocationTotal.eq(amount)) {
    const amountUsd = amount.toFixed(6);
    const total = cashSourceAllocationTotal.toFixed(6);
    return refuse(
      'CASH_SOURCE_ALLOCATION_VIOLATION',
      'provenance',
      `Event ${event.eventId}: event amount ${amountUsd} must equal cash source allocation total ${total}.`,
      {
        eventId: event.eventId,
        contextDetails: `{"expectedEventAmountUsd":"${amountUsd}","actualCashSourceAllocationTotalUsd":"${total}"}`,
      }
    );
  }

  const lotId = `inv:${event.dealId}:${event.securityId}:${event.eventId}`;
  if (state.investmentLots.has(lotId) || state.openingInvestmentSlices.has(lotId)) {
    return investmentLotCollisionRefusal(event.eventId, lotId);
  }

  applyCashSourceAllocations(event.cashSourceAllocations, state.cashSourceLots);
  state.consumptionRecords.push(
    ...event.cashSourceAllocations.map((allocation) => ({
      eventId: event.eventId,
      lotId: allocation.lotId,
      amountUsd: new Decimal(allocation.amount),
    }))
  );
  state.investmentLots.set(lotId, {
    lotId,
    dealId: event.dealId,
    securityId: event.securityId,
    fundingAllocations: event.cashSourceAllocations.map((allocation) => ({ ...allocation })),
    costBasis: amount,
    relievedAmount: new Decimal(0),
  });

  state.eventEffectRecords.push({
    eventId: event.eventId,
    instant: event.instant,
    kind: 'deployment',
    amountUsd: new Decimal(amount),
  });

  state.endingCash = state.endingCash.minus(amount);
  return null;
}

export function processFundExpense(
  event: V2Event & { kind: 'fund_expense_payment' },
  state: EventStreamState
): V2CoreRefusal | null {
  const amount = new Decimal(event.amountUsd);

  const allocError = validateCashSourceAllocations(
    event.cashSourceAllocations,
    state.cashSourceLots,
    event.eventId
  );
  if (allocError) return allocError;

  const cashSourceAllocationTotal = event.cashSourceAllocations.reduce(
    (total, allocation) => total.plus(new Decimal(allocation.amount)),
    new Decimal(0)
  );
  if (!cashSourceAllocationTotal.eq(amount)) {
    const amountUsd = amount.toFixed(6);
    const total = cashSourceAllocationTotal.toFixed(6);
    return refuse(
      'CASH_SOURCE_ALLOCATION_VIOLATION',
      'provenance',
      `Event ${event.eventId}: event amount ${amountUsd} must equal cash source allocation total ${total}.`,
      {
        eventId: event.eventId,
        contextDetails: `{"expectedEventAmountUsd":"${amountUsd}","actualCashSourceAllocationTotalUsd":"${total}"}`,
      }
    );
  }

  applyCashSourceAllocations(event.cashSourceAllocations, state.cashSourceLots);
  state.consumptionRecords.push(
    ...event.cashSourceAllocations.map((allocation) => ({
      eventId: event.eventId,
      lotId: allocation.lotId,
      amountUsd: new Decimal(allocation.amount),
    }))
  );
  state.eventEffectRecords.push({
    eventId: event.eventId,
    instant: event.instant,
    kind: 'fund_expense_payment',
    amountUsd: new Decimal(amount),
  });
  state.endingCash = state.endingCash.minus(amount);
  return null;
}

export function getAccrualScheduleForRange(
  input: NormalizedInternalEconomicsInputV2
): readonly MonthlyPeriod[] {
  return buildMonthlySchedule(input.fundEstablishmentDate, input.calculationDate);
}

export function getPreferredReturnConfig(
  input: NormalizedInternalEconomicsInputV2
): PreferredReturnConfig | null {
  const prefTier = input.waterfallPolicy.find((t) => t.kind === 'preferred_return');
  if (!prefTier || prefTier.kind !== 'preferred_return') return null;

  return {
    annualRate: new Decimal(prefTier.annualRate),
    rateMode: prefTier.rateMode,
  };
}

export function computeAccrualsAtInstant(
  instant: string,
  schedule: readonly MonthlyPeriod[],
  config: PreferredReturnConfig,
  partnerLedgers: Map<string, PartnerLedgerState>,
  gpTreatment: 'pari_passu' | 'excluded',
  lastPostedMonthIndex: number
): { postings: DerivedEvent[]; newLastPostedIndex: number } {
  const postings: DerivedEvent[] = [];
  let newLastPostedIndex = lastPostedMonthIndex;

  for (const period of schedule) {
    if (period.monthIndex <= lastPostedMonthIndex) continue;
    if (period.periodEnd > instant) break;

    for (const [, ledger] of partnerLedgers) {
      if (ledger.isGp && gpTreatment === 'excluded') continue;

      const accrual = computePeriodAccrual(
        ledger.unreturnedSettledCashCapital,
        ledger.accruedPreference,
        config
      );

      if (accrual.gt(0)) {
        ledger.accruedPreference = ledger.accruedPreference.plus(accrual);

        postings.push({
          derivedEventId: `pref:${ledger.partnerId}:${period.monthIndex}`,
          derivedKind: 'management_fee_payment',
          instant: period.periodEnd,
          amount: accrual,
          partnerId: ledger.partnerId,
        });
      }
    }

    newLastPostedIndex = period.monthIndex;
  }

  return { postings, newLastPostedIndex };
}

export function getCurrentEpochMonth(fundEstablishmentDate: string, instant: string): number {
  return computeEpochMonth(fundEstablishmentDate, instant);
}
