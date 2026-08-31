import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import { canonicalJson } from '../../../../shared/lib/canonical-json';
import type {
  InternalEconomicsInputV2Wire,
  V2Event,
} from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import {
  cloneEventStreamState,
  initializeEventStreamState,
  processDeployment,
  processSettledContribution,
  type EventStreamState,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { processEventsV2ForTest } from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';

function normalize(events: readonly V2Event[] = []) {
  const wire: InternalEconomicsInputV2Wire = buildMinimalV2Input({ events: [...events] });
  const result = verifyAndNormalizeInternalEconomicsInputV2(wire);
  if (!result.ok) throw new Error(`normalization failed: ${result.refusal.message}`);
  return { input: result.input, state: initializeEventStreamState(result.input) };
}

function sortedEntries<T>(map: Map<string, T>): [string, T][] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function snapshotState(state: EventStreamState): string {
  const decimal = (value: Decimal) => value.toFixed(6);

  return canonicalJson({
    cashSourceLots: sortedEntries(state.cashSourceLots)
      .filter(([, lot]) => lot.origin === 'event')
      .map(([mapKey, lot]) => ({
        mapKey,
        lotId: lot.lotId,
        sourceEventId: lot.sourceEventId,
        ...(lot.sourceKind === 'contribution_settlement'
          ? { partnerId: lot.partnerId }
          : { dealId: lot.dealId }),
        originalAmount: decimal(lot.originalAmount),
        remainingBalance: decimal(lot.remainingBalance),
      })),
    investmentLots: sortedEntries(state.investmentLots).map(([mapKey, lot]) => ({
      mapKey,
      lotId: lot.lotId,
      dealId: lot.dealId,
      securityId: lot.securityId,
      costBasis: decimal(lot.costBasis),
      relievedAmount: decimal(lot.relievedAmount),
    })),
    callableTrackers: sortedEntries(state.callableTrackers).map(([mapKey, tracker]) => ({
      mapKey,
      partnerId: tracker.partnerId,
      remainingCallable: decimal(tracker.remainingCallable),
    })),
    partnerLedgers: sortedEntries(state.partnerLedgers).map(([mapKey, ledger]) => ({
      mapKey,
      partnerId: ledger.partnerId,
      isGp: ledger.isGp,
      settledCapital: decimal(ledger.settledCapital),
      paidInCapital: decimal(ledger.paidInCapital),
      unreturnedSettledCashCapital: decimal(ledger.unreturnedSettledCashCapital),
      cumulativeDistributions: decimal(ledger.cumulativeDistributions),
      cumulativeFees: decimal(ledger.cumulativeFees),
      accruedPreference: decimal(ledger.accruedPreference),
      calledCapitalPeriodDeployment: decimal(ledger.calledCapitalPeriodDeployment),
    })),
    derivedEvents: state.derivedEvents.map((event) => ({
      ...event,
      amount: decimal(event.amount),
    })),
    endingCash: decimal(state.endingCash),
    openingCashLots: sortedEntries(state.openingCashLots).map(([mapKey, lot]) => ({
      mapKey,
      lotId: lot.lotId,
      sourceRef: lot.sourceRef,
      owner: { ...lot.owner },
      classification: lot.classification,
      originalAmount: decimal(lot.originalAmount),
      remainingBalance: decimal(lot.remainingBalance),
    })),
    openingInvestmentSlices: sortedEntries(state.openingInvestmentSlices).map(
      ([mapKey, slice]) => ({
        mapKey,
        investmentLotId: slice.investmentLotId,
        sourceRef: slice.sourceRef,
        entitlementPoolId: slice.entitlementPoolId,
        dealId: slice.dealId,
        securityId: slice.securityId,
        owner: { ...slice.owner },
        costBasis: decimal(slice.costBasis),
        relievedAmount: decimal(slice.relievedAmount),
        remainingBasis: decimal(slice.remainingBasis),
        entitlementAmount: decimal(slice.entitlementAmount),
      })
    ),
    openingEntitlementPools: sortedEntries(state.openingEntitlementPools).map(([mapKey, pool]) => ({
      mapKey,
      entitlementPoolId: pool.entitlementPoolId,
      sourceRef: pool.sourceRef,
      dealId: pool.dealId,
      securityId: pool.securityId,
      entitlementTotal: decimal(pool.entitlementTotal),
    })),
    openingJournal: state.openingJournal.map((entry) => ({
      ...entry,
      postings: entry.postings.map((posting) => ({
        ...posting,
        owner: { ...posting.owner },
        amountUsd: decimal(posting.amountUsd),
      })),
    })),
  });
}

function contribution(eventId: string, instant: string, amountUsd = '100.000000'): V2Event {
  return {
    eventId,
    instant,
    amountUsd,
    kind: 'settled_contribution',
    partnerId: 'lp-1',
    purpose: 'deployment',
    settlementSourceRef: `ref:${eventId}`,
  };
}

function deployment(
  eventId: string,
  instant: string,
  amountUsd: string,
  lotId: string,
  securityId = 's-1'
): V2Event {
  return {
    eventId,
    instant,
    amountUsd,
    kind: 'deployment',
    dealId: 'd-1',
    securityId,
    cashSourceAllocations: [{ lotId, amount: amountUsd }],
  };
}

function mismatchedDeployment(eventId: string, instant: string): V2Event {
  return {
    eventId,
    instant,
    amountUsd: '50.000000',
    kind: 'deployment',
    dealId: 'd-1',
    securityId: 's-2',
    cashSourceAllocations: [{ lotId: 'csl:atomicity-contribution', amount: '40.000000' }],
  };
}

describe('F3b event-stream atomicity', () => {
  it.each([
    [
      'first',
      [
        deployment('atomicity-first-refusal', '2025-02-01T00:00:00Z', '40.000000', 'missing'),
        contribution('atomicity-first-contribution', '2025-03-01T00:00:00Z'),
      ],
    ],
    [
      'middle',
      [
        contribution('atomicity-contribution', '2025-02-01T00:00:00Z'),
        deployment(
          'atomicity-first-deployment',
          '2025-03-01T00:00:00Z',
          '40.000000',
          'csl:atomicity-contribution'
        ),
        mismatchedDeployment('atomicity-middle-refusal', '2025-04-01T00:00:00Z'),
        deployment(
          'atomicity-trailing-deployment',
          '2025-05-01T00:00:00Z',
          '20.000000',
          'csl:atomicity-contribution',
          's-3'
        ),
      ],
    ],
    [
      'last',
      [
        contribution('atomicity-last-contribution', '2025-02-01T00:00:00Z'),
        deployment(
          'atomicity-last-deployment',
          '2025-03-01T00:00:00Z',
          '40.000000',
          'csl:atomicity-last-contribution'
        ),
        mismatchedDeployment('atomicity-last-refusal', '2025-04-01T00:00:00Z'),
      ],
    ],
  ])('does not publish state when %s event refuses', (_position, events) => {
    const { input, state } = normalize(events);
    const before = snapshotState(state);
    const result = processEventsV2ForTest(input, state);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
    expect(snapshotState(state)).toBe(before);
  });

  it('clones every state field and nested mutable value independently', () => {
    const { state } = normalize();
    processSettledContribution(contribution('clone-contribution', '2025-02-01T00:00:00Z'), state);
    const deploymentRefusal = processDeployment(
      deployment('clone-deployment', '2025-03-01T00:00:00Z', '40.000000', 'csl:clone-contribution'),
      state
    );
    expect(deploymentRefusal).toBeNull();
    state.derivedEvents.push({
      derivedEventId: 'clone-derived',
      derivedKind: 'distribution',
      instant: '2025-04-01T00:00:00Z',
      amount: new Decimal('3.000000'),
    });

    const clone = cloneEventStreamState(state);

    expect(snapshotState(clone)).toBe(snapshotState(state));
    expect(clone.cashSourceLots).not.toBe(state.cashSourceLots);
    expect(clone.investmentLots).not.toBe(state.investmentLots);
    expect(clone.callableTrackers).not.toBe(state.callableTrackers);
    expect(clone.partnerLedgers).not.toBe(state.partnerLedgers);
    expect(clone.derivedEvents).not.toBe(state.derivedEvents);
    expect(clone.endingCash).not.toBe(state.endingCash);
    expect(clone.openingCashLots).not.toBe(state.openingCashLots);
    expect(clone.openingInvestmentSlices).not.toBe(state.openingInvestmentSlices);
    expect(clone.openingEntitlementPools).not.toBe(state.openingEntitlementPools);
    expect(clone.openingJournal).not.toBe(state.openingJournal);

    for (const [key, lot] of state.cashSourceLots) {
      const cloned = clone.cashSourceLots.get(key)!;
      expect(cloned).not.toBe(lot);
      expect(cloned.originalAmount).not.toBe(lot.originalAmount);
      expect(cloned.remainingBalance).not.toBe(lot.remainingBalance);
    }
    for (const [key, lot] of state.investmentLots) {
      const cloned = clone.investmentLots.get(key)!;
      expect(cloned).not.toBe(lot);
      expect(cloned.costBasis).not.toBe(lot.costBasis);
      expect(cloned.relievedAmount).not.toBe(lot.relievedAmount);
    }
    for (const [key, tracker] of state.callableTrackers) {
      expect(clone.callableTrackers.get(key)).not.toBe(tracker);
      expect(clone.callableTrackers.get(key)!.remainingCallable).not.toBe(
        tracker.remainingCallable
      );
    }
    for (const [key, ledger] of state.partnerLedgers) {
      expect(clone.partnerLedgers.get(key)).not.toBe(ledger);
      expect(clone.partnerLedgers.get(key)!.settledCapital).not.toBe(ledger.settledCapital);
    }
    expect(clone.derivedEvents[0]).not.toBe(state.derivedEvents[0]);
    expect(clone.derivedEvents[0]!.amount).not.toBe(state.derivedEvents[0]!.amount);
    for (const [key, lot] of state.openingCashLots) {
      const cloned = clone.openingCashLots.get(key)!;
      expect(cloned).not.toBe(lot);
      expect(cloned.owner).not.toBe(lot.owner);
      expect(cloned.originalAmount).not.toBe(lot.originalAmount);
      expect(cloned.remainingBalance).not.toBe(lot.remainingBalance);
    }
    for (const [key, slice] of state.openingInvestmentSlices) {
      const cloned = clone.openingInvestmentSlices.get(key)!;
      expect(cloned).not.toBe(slice);
      expect(cloned.owner).not.toBe(slice.owner);
      expect(cloned.costBasis).not.toBe(slice.costBasis);
    }
    for (const [key, pool] of state.openingEntitlementPools) {
      const cloned = clone.openingEntitlementPools.get(key)!;
      expect(cloned).not.toBe(pool);
      expect(cloned.entitlementTotal).not.toBe(pool.entitlementTotal);
    }
    expect(clone.openingJournal[0]).not.toBe(state.openingJournal[0]);
    expect(clone.openingJournal[0]!.postings).not.toBe(state.openingJournal[0]!.postings);
    expect(clone.openingJournal[0]!.postings[0]).not.toBe(state.openingJournal[0]!.postings[0]);
    expect(clone.openingJournal[0]!.postings[0]!.owner).not.toBe(
      state.openingJournal[0]!.postings[0]!.owner
    );
    expect(clone.openingJournal[0]!.postings[0]!.amountUsd).not.toBe(
      state.openingJournal[0]!.postings[0]!.amountUsd
    );

    clone.cashSourceLots.get('csl:clone-contribution')!.remainingBalance = new Decimal('1.000000');
    clone.partnerLedgers.get('lp-1')!.settledCapital = new Decimal('1.000000');
    clone.derivedEvents.pop();
    clone.openingJournal.pop();
    expect(state.cashSourceLots.get('csl:clone-contribution')!.remainingBalance.toFixed(6)).toBe(
      '60.000000'
    );
    expect(state.partnerLedgers.get('lp-1')!.settledCapital.toFixed(6)).toBe('500100.000000');
    expect(state.derivedEvents).toHaveLength(1);
    expect(state.openingJournal.length).toBeGreaterThan(0);
  });

  it('returns fully applied staged state on success without mutating caller state', () => {
    const events = [
      contribution('staged-contribution', '2025-02-01T00:00:00Z'),
      deployment(
        'staged-deployment',
        '2025-03-01T00:00:00Z',
        '40.000000',
        'csl:staged-contribution'
      ),
    ];
    const { input, state } = normalize(events);
    const before = snapshotState(state);
    const result = processEventsV2ForTest(input, state);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).not.toBe(state);
    expect(snapshotState(state)).toBe(before);
    expect(
      result.state.cashSourceLots.get('csl:staged-contribution')!.remainingBalance.toFixed(6)
    ).toBe('60.000000');
    expect(result.state.investmentLots.has('inv:d-1:s-1:staged-deployment')).toBe(true);
  });

  it('refuses callable overrun inside chronology before applying contribution', () => {
    const { input, state } = normalize([
      contribution('callable-overrun', '2025-02-01T00:00:00Z', '500001.000000'),
    ]);
    const before = snapshotState(state);
    const result = processEventsV2ForTest(input, state);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('COMMITMENT_OVERRUN');
    expect(snapshotState(state)).toBe(before);
  });
});
