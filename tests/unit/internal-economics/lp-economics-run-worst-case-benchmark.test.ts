/**
 * lp-economics-run-worst-case-benchmark.test.ts
 *
 * WP-L3 Phase C, T-C18 (P-D7 R5/R6 amendments): a standalone pure-compute
 * benchmark proving the admission-control bound the run service enforces
 * (`MAX_CASH_ASSEMBLY_PERIOD_COUNT = 200`,
 * `MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT = 10000`) is safe -- a worst-case
 * admissible input completes well under the 5-second budget.
 *
 * Isolated from the DB-backed suite by design (phoenix round-5 test-design
 * guidance, folded into P-D7 R6): calls `executeCashAssemblyPeriodLoopV1`
 * directly, no DB, no server bootstrap, so it cannot be caught by the
 * integration suite's known setupFiles resource-ceiling flake vector.
 *
 * Worst-case shape: R6 identified the bucketing scan
 * (`cash-assembly-event-stream-v1.ts`'s per-event linear period search) as
 * the O(events x periods) risk, not the quarterly fold itself. This fixture
 * maximizes that specifically: 200 periods, all `actual` (historical), and
 * 9700 facts cash-flow events spread across their full date range so a
 * meaningful fraction require scanning deep into the sorted bucket list --
 * plus 100 NAV marks and the 200 forecast series points themselves, for an
 * event-count total of exactly 10000 (the firm bound, not exceeding it: a
 * valid, admissible worst-case run, not a rejected one). Historical
 * reconciliation is satisfied by construction (opening state's
 * `cumulativeLpPaidInUsd` equals the summed lp_capital_call amounts), so the
 * loop runs to genuine completion rather than short-circuiting on an early
 * typed-error throw -- the full bucketing + fold cost is actually paid.
 *
 * @module tests/unit/internal-economics/lp-economics-run-worst-case-benchmark
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_CASH_ASSEMBLY_PERIOD_COUNT,
  MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT,
} from '../../../server/services/internal-economics/lp-economics-run-service';
import { INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION } from '../../../shared/contracts/internal-economics/terminal-policy-v1.contract';
import { Decimal } from '../../../shared/lib/decimal-config';
import { executeCashAssemblyPeriodLoopV1 } from '../../../shared/lib/internal-economics/cash-assembly-period-loop-v1';
import { FundAccountingStateObservationV1_1Schema } from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';

const WALL_CLOCK_BUDGET_MS = 5000;
const EPOCH = new Date('2000-01-01T00:00:00.000Z');

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildPeriods(count: number): Array<{ periodStart: string; periodEnd: string }> {
  const periods: Array<{ periodStart: string; periodEnd: string }> = [];
  let cursor = EPOCH;
  for (let index = 0; index < count; index += 1) {
    const periodStart = cursor;
    const periodEnd = addDays(cursor, 89);
    periods.push({ periodStart: isoDate(periodStart), periodEnd: isoDate(periodEnd) });
    cursor = addDays(periodEnd, 1);
  }
  return periods;
}

describe('lp-economics-run-service worst-case benchmark (T-C18)', () => {
  it(`completes a ${MAX_CASH_ASSEMBLY_PERIOD_COUNT}-period, ${MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT}-event bucketing-adversarial input under ${WALL_CLOCK_BUDGET_MS}ms`, () => {
    expect(MAX_CASH_ASSEMBLY_PERIOD_COUNT).toBe(200);
    expect(MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT).toBe(10000);

    const periods = buildPeriods(MAX_CASH_ASSEMBLY_PERIOD_COUNT);
    // 199 historical (`actual`) periods carry the bucketing-adversarial
    // event load; the call-sizing seam requires at least one `projected`
    // period to run at all (`sizeCashAssemblyCallsV1`), so the final period
    // is projected with zero scheduled deployment -- a trivial quarter
    // fold that does not distort the benchmark's dominant cost.
    const historicalPeriods = periods.slice(0, -1);
    const projectedPeriod = periods.at(-1)!;
    const cutoverInstant = `${historicalPeriods.at(-1)!.periodEnd}T23:59:59.999Z`;

    const forecastSeries = [
      ...historicalPeriods.map((period) => ({
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        source: 'actual' as const,
        deployedUsd: '0.000000',
        contributionsUsd: '0.000000',
        distributionsUsd: '0.000000',
        navUsd: '0.000000',
        tvpi: '0.000000000000',
        dpi: '0.000000000000',
        activeCompanyCount: 0,
        projectedCohortCount: 0,
      })),
      {
        periodStart: projectedPeriod.periodStart,
        periodEnd: projectedPeriod.periodEnd,
        source: 'projected' as const,
        deployedUsd: '0.000000',
        contributionsUsd: '0.000000',
        distributionsUsd: '0.000000',
        navUsd: '0.000000',
        tvpi: '0.000000000000',
        dpi: '0.000000000000',
        activeCompanyCount: 0,
        projectedCohortCount: 0,
      },
    ];

    const FACTS_EVENT_COUNT = 9700;
    const NAV_MARK_COUNT = 100;
    const totalEventCount = FACTS_EVENT_COUNT + NAV_MARK_COUNT + 0 + forecastSeries.length;
    expect(totalEventCount).toBe(MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT);

    // Spread events across the FULL date range (not clustered at the very
    // start) so a meaningful fraction require scanning deep into the
    // sorted bucket list -- the O(events x periods) cost R6 identified.
    const factsEvents = Array.from({ length: FACTS_EVENT_COUNT }, (_unused, index) => {
      const periodIndex = index % historicalPeriods.length;
      const period = historicalPeriods[periodIndex]!;
      return {
        eventId: index + 1,
        eventType: 'lp_capital_call' as const,
        effectiveAt: `${period.periodStart}T00:00:00.000Z`,
        amountUsd: '1.000000',
      };
    });
    const cumulativeLpPaidInUsd = factsEvents
      .reduce((total, event) => total.plus(event.amountUsd), new Decimal(0))
      .toFixed(6);

    const factsNavMarks = Array.from({ length: NAV_MARK_COUNT }, (_unused, index) => {
      const periodIndex = index % historicalPeriods.length;
      const period = historicalPeriods[periodIndex]!;
      return {
        markId: index + 1,
        effectiveAt: period.periodStart,
        fairValueUsd: '0.000000',
      };
    });

    const openingState = FundAccountingStateObservationV1_1Schema.parse({
      contractVersion: 'fund-accounting-state-observation/1.1.0',
      cutoverInstant,
      currency: 'USD',
      cashBalanceUsd: '0.000000',
      cumulativeLpPaidInUsd,
      cumulativeGpPaidInUsd: '0.000000',
      gpUnreturnedContributedCapitalUsd: '0.000000',
      lpDistributionsReturnOfCapitalUsd: '0.000000',
      lpDistributionsProfitUsd: '0.000000',
      actualLpDistributionsCumulativeUsd: '0.000000',
      gpInvestmentDistributionsPaidUsd: '0.000000',
      gpCarryPaidUsd: '0.000000',
      accruedPreferredReturnUsd: '0.000000',
      accruedPreferredReturnThroughInstant: cutoverInstant,
      recallableDistributionsCumulativeUsd: '0.000000',
      recallableDistributionsOutstandingUsd: '0.000000',
      recycledProceedsCumulativeUsd: '0.000000',
      realizedProceedsCumulativeUsd: '0.000000',
      methodologyVersion: 'opening-state-methodology/1.0.0',
    });

    const startedAtMs = performance.now();
    const result = executeCashAssemblyPeriodLoopV1({
      factsSnapshotId: 1,
      forecastSnapshotId: 1,
      economicsPolicyVersion: 'internal-economics-policy/1.0.0',
      engineVersion: 'cash-assembly-period-loop-v1/1.0.0',
      methodologyVersion: 'cash-assembly-period-loop-methodology/1.0.0',
      factsEvents,
      factsNavMarks,
      factsPeriodNav: [],
      openingState,
      forecastSeries,
      // Exactly one `projected` period (the last), zero scheduled
      // deployment/fee/expense -- a trivial quarter fold. The benchmark's
      // dominant cost is the bucketing scan over all 200 periods x 10000
      // events, per R6.
      scheduledNeeds: [
        {
          period: {
            periodStart: projectedPeriod.periodStart,
            periodEnd: projectedPeriod.periodEnd,
            source: 'projected',
          },
          scheduledDeploymentUsd: new Decimal(0),
          scheduledFeeUsd: new Decimal(0),
          scheduledExpenseUsd: new Decimal(0),
        },
      ],
      cashBufferQuarters: 0,
      unfundedEnvelopeRemainingUsd: new Decimal('1000000'),
      persistedTerminalResolution: {
        terminalPeriodEnd: projectedPeriod.periodEnd,
        terminalResolutionMethodologyVersion: INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
      },
      terminalMode: 'hold_unrealized',
      carryPct: 0.2,
    });
    const elapsedMs = performance.now() - startedAtMs;

    expect(result.resultStatus).toBe('indicative');
    expect(result.quarters).toHaveLength(1); // exactly one projected period, by construction
    // eslint-disable-next-line no-console -- benchmark visibility, not app logging
    console.log(
      `T-C18 worst-case loop invocation: ${elapsedMs.toFixed(2)}ms (budget ${WALL_CLOCK_BUDGET_MS}ms)`
    );
    expect(elapsedMs).toBeLessThan(WALL_CLOCK_BUDGET_MS);
  });
});
