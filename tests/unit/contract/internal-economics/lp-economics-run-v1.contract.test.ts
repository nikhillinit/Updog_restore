import { describe, expect, it } from 'vitest';

import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';
import type { CashAssemblyQuarterRowV1 } from '../../../../shared/lib/internal-economics/cash-assembly-types-v1';
import type { CashAssemblyWaterfallEventV1 } from '../../../../shared/lib/internal-economics/cash-assembly-period-loop-v1';
import {
  LP_ECONOMICS_RUN_CONTRACT_VERSION,
  LP_ECONOMICS_RUN_UNAVAILABILITY_REASON_CODES_V1,
  LP_ECONOMICS_INDICATIVE_REASON_CODES_V1,
  OPENING_STATE_CONTRACT_V1_INELIGIBLE_DETAIL,
  LpEconomicsRunRequestV1Schema,
  LpEconomicsRunIdempotencyPreimageV1Schema,
  LpEconomicsRunUnavailabilityReasonCodeV1Schema,
  LpEconomicsIndicativeReasonCodeV1Schema,
  LpEconomicsRunUnavailabilityReasonV1Schema,
  LpEconomicsIndicativeReasonV1Schema,
  LpEconomicsQuarterRowV1Schema,
  LpEconomicsWaterfallEventV1Schema,
  LpEconomicsTotalsV1Schema,
  LpEconomicsResultV1Schema,
  buildLpEconomicsRunIdempotencyPreimageV1,
  buildLpEconomicsEventIdV1,
  sortAndDedupeLpEconomicsReasonsV1,
  type LpEconomicsRunRequestV1,
} from '../../../../shared/contracts/internal-economics/lp-economics-run-v1.contract';

const validRequest = {
  policyVersionId: 11,
  factsSnapshotId: 22,
  planVersionId: 33,
  forecastSnapshotId: 44,
  terminalMode: 'liquidate_at_horizon',
  clock: '2026-06-30T23:59:59.000Z',
} satisfies LpEconomicsRunRequestV1;

// Hand-mirrored from the frozen loop's emitted shapes; the strict parses below
// prove exact field parity at runtime (extra or missing fields fail).
const quarterRow = {
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  source: 'projected',
  openingCashUsd: '1000000.000000',
  lpCapitalCallUsd: '500000.000000',
  gpCommitmentCallUsd: '0.000000',
  portfolioDeploymentUsd: '400000.000000',
  managementFeesUsd: '0.000000',
  fundExpensesUsd: '0.000000',
  grossRealizedProceedsUsd: '250000.000000',
  lpDistributionUsd: '200000.000000',
  gpInvestmentDistributionUsd: '0.000000',
  gpCarryDistributedUsd: '50000.000000',
  endingCashUsd: '1100000.000000',
  grossNavUsd: '9000000.000000',
  lpNetNavUsd: '7200000.000000',
  cumulativeLpPaidInUsd: '10500000.000000',
  cumulativeLpDistributedUsd: '4575000.000000',
  dpi: '0.435714285714',
  rvpi: '0.685714285714',
  tvpi: '1.121428571428',
} satisfies CashAssemblyQuarterRowV1;

const loopEvent = {
  periodEnd: '2026-09-30',
  sourceId: 'forecast|2026-09-30|distribution',
  grossDistributionUsd: '250000.000000',
  lpCapitalReturnUsd: '150000.000000',
  lpProfitUsd: '50000.000000',
  gpInvestmentDistributionUsd: '0.000000',
  gpCarryUsd: '50000.000000',
} satisfies CashAssemblyWaterfallEventV1;

const enrichedEvent = {
  ...loopEvent,
  eventSequence: 0,
  eventId: buildLpEconomicsEventIdV1({
    sourceId: loopEvent.sourceId,
    periodEnd: loopEvent.periodEnd,
    eventSequence: 0,
  }),
  sourceRefs: [{ sourceId: loopEvent.sourceId }],
  eventKind: 'forecast_quarterly_distribution',
};

const totals = {
  lpCapitalCallUsd: '500000.000000',
  gpCommitmentCallUsd: '0.000000',
  portfolioDeploymentUsd: '400000.000000',
  managementFeesUsd: '0.000000',
  fundExpensesUsd: '0.000000',
  grossRealizedProceedsUsd: '250000.000000',
  lpCapitalReturnUsd: '150000.000000',
  lpProfitUsd: '50000.000000',
  lpDistributionUsd: '200000.000000',
  gpInvestmentDistributionUsd: '0.000000',
  gpCarryDistributedUsd: '50000.000000',
  endingCashUsd: '1100000.000000',
  grossNavUsd: '9000000.000000',
  lpNetNavUsd: '7200000.000000',
  dpi: '0.435714285714',
  rvpi: '0.685714285714',
  tvpi: '1.121428571428',
};

const envelopeCommon = {
  waterfallTemplate: 'deal_by_deal',
  clock: '2026-06-30T23:59:59.000Z',
  currency: 'USD',
  perspective: 'lp_net',
  precisionMode: 'decimal_native_with_float64_xirr',
} as const;

const indicativeResult = {
  ...envelopeCommon,
  resultStatus: 'indicative',
  quarters: [quarterRow],
  waterfallEvents: [enrichedEvent],
  totals,
  terminalNavBeforeRealizationUsd: '9000000.000000',
  lpNetIrr: '0.142500000000',
  lpNetIrrBasis: 'cash_plus_terminal_nav',
  lpNetIrrDiagnostic: {
    convergence: 'converged',
    iterations: 12,
    method: 'newton',
    boundHit: null,
    failureReason: null,
  },
  reasons: [{ code: 'DECIMAL_CORE_UNCERTIFIED' }, { code: 'LP_NET_NAV_FLAT_SHARE_APPROXIMATION' }],
};

const unavailableResult = {
  ...envelopeCommon,
  resultStatus: 'unavailable',
  reasons: [{ code: 'MAIN_FUND_VEHICLE_ABSENT', detail: 'no main_fund vehicle on roster' }],
};

describe('lp-economics run contract (D8/D9)', () => {
  it('pins the contract version literal', () => {
    expect(LP_ECONOMICS_RUN_CONTRACT_VERSION).toBe('lp-economics/1.0.0');
  });

  it('round-trips a run request of explicit basis IDs only', () => {
    expect(LpEconomicsRunRequestV1Schema.parse(validRequest)).toEqual(validRequest);
  });

  it('rejects requests missing any basis ID (no latest-resolution fallback shape)', () => {
    for (const key of [
      'policyVersionId',
      'factsSnapshotId',
      'planVersionId',
      'forecastSnapshotId',
      'terminalMode',
      'clock',
    ] as const) {
      const { [key]: _omitted, ...rest } = validRequest;
      expect(LpEconomicsRunRequestV1Schema.safeParse(rest).success).toBe(false);
    }
  });

  it('rejects non-positive-integer basis IDs and unknown keys', () => {
    expect(
      LpEconomicsRunRequestV1Schema.safeParse({ ...validRequest, policyVersionId: 0 }).success
    ).toBe(false);
    expect(
      LpEconomicsRunRequestV1Schema.safeParse({ ...validRequest, factsSnapshotId: 2.5 }).success
    ).toBe(false);
    expect(LpEconomicsRunRequestV1Schema.safeParse({ ...validRequest, latest: true }).success).toBe(
      false
    );
  });

  it('builds the P-D8 idempotency preimage (fundId + contractVersion + body + engine/methodology versions)', () => {
    const preimage = buildLpEconomicsRunIdempotencyPreimageV1({
      fundId: 5,
      request: validRequest,
      engineVersion: 'internal-economics-engine/1.0.0',
      methodologyVersion: 'internal-economics-cash-assembly/1.0.0',
    });

    expect(preimage).toEqual({
      fundId: 5,
      contractVersion: 'lp-economics/1.0.0',
      request: validRequest,
      engineVersion: 'internal-economics-engine/1.0.0',
      methodologyVersion: 'internal-economics-cash-assembly/1.0.0',
    });
    expect(LpEconomicsRunIdempotencyPreimageV1Schema.parse(preimage)).toEqual(preimage);

    // An engine/methodology bump changes the canonical preimage identity
    // (T-C10's changed-preimage 409 depends on this).
    const bumped = buildLpEconomicsRunIdempotencyPreimageV1({
      fundId: 5,
      request: validRequest,
      engineVersion: 'internal-economics-engine/1.1.0',
      methodologyVersion: 'internal-economics-cash-assembly/1.0.0',
    });
    expect(canonicalSha256(bumped)).not.toBe(canonicalSha256(preimage));
  });

  it('carries the complete run-unavailability registry in section 8 order', () => {
    expect(LP_ECONOMICS_RUN_UNAVAILABILITY_REASON_CODES_V1).toEqual([
      'MAIN_FUND_VEHICLE_ABSENT',
      'MAIN_FUND_SCOPED_FORECAST_UNAVAILABLE',
      'MAIN_FUND_COMMITMENT_ABSENT',
      'MAIN_FUND_CURRENCY_UNSUPPORTED',
      'CONFIG_LINEAGE_MISMATCH',
      'FORECAST_UNAVAILABLE',
      'FORECAST_FAILED',
      'FORECAST_HELD_UNSUPPORTED',
      'FACTS_ECONOMICS_EVALUATION_BLOCKED',
      'OPENING_CASH_UNAVAILABLE',
      'OPENING_STATE_CONTRACT_INELIGIBLE',
      'OPENING_STATE_INELIGIBLE',
      'GP_COMMITMENT_UNSUPPORTED',
      'FORECAST_FEE_BASIS_INCOMPATIBLE',
      'TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED',
      'TERMINAL_RESOLUTION_MISMATCH',
      'TERMINAL_BEFORE_CUTOVER',
      'FORECAST_HORIZON_SHORT',
      'FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE',
      'POST_TERM_ACTIVITY',
      'NEGATIVE_SOURCE_MONEY',
      'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE',
      'COMMITTED_CAPITAL_EXCEEDED',
    ]);
    expect(LpEconomicsRunUnavailabilityReasonCodeV1Schema.options).toEqual(
      LP_ECONOMICS_RUN_UNAVAILABILITY_REASON_CODES_V1
    );
  });

  it('carries the indicative reason registry (D-11 pair + float64 waterfall path)', () => {
    expect(LP_ECONOMICS_INDICATIVE_REASON_CODES_V1).toEqual([
      'DECIMAL_CORE_UNCERTIFIED',
      'FLOAT64_WATERFALL_PATH',
      'LP_NET_NAV_FLAT_SHARE_APPROXIMATION',
    ]);
    expect(LpEconomicsIndicativeReasonCodeV1Schema.options).toEqual(
      LP_ECONOMICS_INDICATIVE_REASON_CODES_V1
    );
  });

  it('parses a bare-code reason and rejects empty details and unknown keys', () => {
    expect(
      LpEconomicsRunUnavailabilityReasonV1Schema.parse({ code: 'FORECAST_UNAVAILABLE' })
    ).toEqual({ code: 'FORECAST_UNAVAILABLE' });
    expect(
      LpEconomicsRunUnavailabilityReasonV1Schema.safeParse({
        code: 'FORECAST_UNAVAILABLE',
        detail: '',
      }).success
    ).toBe(false);
    expect(
      LpEconomicsRunUnavailabilityReasonV1Schema.safeParse({
        code: 'FORECAST_UNAVAILABLE',
        extra: 'x',
      }).success
    ).toBe(false);
    expect(
      LpEconomicsRunUnavailabilityReasonV1Schema.safeParse({ code: 'NOT_A_CODE' }).success
    ).toBe(false);
  });

  it('requires the {field, valueUsd} context on OPENING_STATE_INELIGIBLE', () => {
    const valid = {
      code: 'OPENING_STATE_INELIGIBLE',
      context: { field: 'cumulativeGpPaidInUsd', valueUsd: '250000.000000' },
    };
    expect(LpEconomicsRunUnavailabilityReasonV1Schema.parse(valid)).toEqual(valid);

    for (const context of [
      undefined,
      {},
      { field: 'cashBalanceUsd', valueUsd: '1.000000' },
      { field: 'accruedPreferredReturnUsd', valueUsd: '12.5' },
      { field: 'accruedPreferredReturnUsd', valueUsd: '1.000000', extra: 'x' },
    ]) {
      expect(
        LpEconomicsRunUnavailabilityReasonV1Schema.safeParse({
          code: 'OPENING_STATE_INELIGIBLE',
          ...(context !== undefined && { context }),
        }).success
      ).toBe(false);
    }
  });

  it('requires the v1 version discriminant on OPENING_STATE_CONTRACT_INELIGIBLE', () => {
    expect(OPENING_STATE_CONTRACT_V1_INELIGIBLE_DETAIL).toBe(
      'OPENING_STATE_CONTRACT_V1_INELIGIBLE'
    );
    const valid = {
      code: 'OPENING_STATE_CONTRACT_INELIGIBLE',
      context: { detail: 'OPENING_STATE_CONTRACT_V1_INELIGIBLE' },
    };
    expect(LpEconomicsRunUnavailabilityReasonV1Schema.parse(valid)).toEqual(valid);

    expect(
      LpEconomicsRunUnavailabilityReasonV1Schema.safeParse({
        code: 'OPENING_STATE_CONTRACT_INELIGIBLE',
      }).success
    ).toBe(false);
    expect(
      LpEconomicsRunUnavailabilityReasonV1Schema.safeParse({
        code: 'OPENING_STATE_CONTRACT_INELIGIBLE',
        context: { detail: 'V2_INELIGIBLE' },
      }).success
    ).toBe(false);
  });

  it('parses loop-emitted quarter rows verbatim and rejects drifted shapes', () => {
    expect(LpEconomicsQuarterRowV1Schema.parse(quarterRow)).toEqual(quarterRow);
    expect(
      LpEconomicsQuarterRowV1Schema.safeParse({ ...quarterRow, extraField: '0.000000' }).success
    ).toBe(false);
    const { tvpi: _tvpi, ...missingTvpi } = quarterRow;
    expect(LpEconomicsQuarterRowV1Schema.safeParse(missingTvpi).success).toBe(false);
    expect(
      LpEconomicsQuarterRowV1Schema.safeParse({ ...quarterRow, openingCashUsd: '1.00' }).success
    ).toBe(false);
    // Pre-positive-paid-in ratios are null, never fabricated zero.
    expect(
      LpEconomicsQuarterRowV1Schema.safeParse({
        ...quarterRow,
        dpi: null,
        rvpi: null,
        tvpi: null,
      }).success
    ).toBe(true);
  });

  it('parses enriched waterfall events (loop fields + enrichment) and pins eventKind', () => {
    expect(LpEconomicsWaterfallEventV1Schema.parse(enrichedEvent)).toEqual(enrichedEvent);
    expect(LpEconomicsWaterfallEventV1Schema.safeParse(loopEvent).success).toBe(false);
    expect(
      LpEconomicsWaterfallEventV1Schema.safeParse({ ...enrichedEvent, eventKind: 'forecast_exit' })
        .success
    ).toBe(false);
    expect(
      LpEconomicsWaterfallEventV1Schema.safeParse({ ...enrichedEvent, sourceRefs: [] }).success
    ).toBe(false);
    expect(
      LpEconomicsWaterfallEventV1Schema.safeParse({ ...enrichedEvent, eventId: 'not-a-hash' })
        .success
    ).toBe(false);
    expect(
      LpEconomicsWaterfallEventV1Schema.safeParse({
        ...enrichedEvent,
        eventKind: 'terminal_realization',
      }).success
    ).toBe(true);
    // The ratified E1 contingency: the legacy-ledger-only unreturned-capital
    // fields must never appear on emitted events.
    expect(
      LpEconomicsWaterfallEventV1Schema.safeParse({
        ...enrichedEvent,
        lpUnreturnedCapitalBeforeUsd: '0.000000',
      }).success
    ).toBe(false);
  });

  it('derives deterministic, basis-only event IDs', () => {
    const first = buildLpEconomicsEventIdV1({
      sourceId: 'src-a',
      periodEnd: '2026-09-30',
      eventSequence: 0,
    });
    const replay = buildLpEconomicsEventIdV1({
      sourceId: 'src-a',
      periodEnd: '2026-09-30',
      eventSequence: 0,
    });
    const shifted = buildLpEconomicsEventIdV1({
      sourceId: 'src-a',
      periodEnd: '2026-09-30',
      eventSequence: 1,
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(replay).toBe(first);
    expect(shifted).not.toBe(first);
  });

  it('parses the section 6(c) totals block', () => {
    expect(LpEconomicsTotalsV1Schema.parse(totals)).toEqual(totals);
    const { lpProfitUsd: _lpProfit, ...missingSplit } = totals;
    expect(LpEconomicsTotalsV1Schema.safeParse(missingSplit).success).toBe(false);
    expect(LpEconomicsTotalsV1Schema.safeParse({ ...totals, netIrr: null }).success).toBe(false);
  });

  it('parses the indicative branch of the D9 envelope', () => {
    const parsed = LpEconomicsResultV1Schema.parse(indicativeResult);
    expect(parsed.resultStatus).toBe('indicative');
    expect(parsed.waterfallTemplate).toBe('deal_by_deal');
    if (parsed.resultStatus === 'indicative') {
      expect(parsed.quarters).toHaveLength(1);
      expect(parsed.lpNetIrr).toBe('0.142500000000');
    }
  });

  it('parses the unavailable branch (reasons only, no value arrays)', () => {
    const parsed = LpEconomicsResultV1Schema.parse(unavailableResult);
    expect(parsed.resultStatus).toBe('unavailable');
    expect(
      LpEconomicsResultV1Schema.safeParse({ ...unavailableResult, quarters: [] }).success
    ).toBe(false);
    expect(LpEconomicsResultV1Schema.safeParse({ ...unavailableResult, totals }).success).toBe(
      false
    );
  });

  it('requires nonempty reasons on both branches', () => {
    expect(LpEconomicsResultV1Schema.safeParse({ ...indicativeResult, reasons: [] }).success).toBe(
      false
    );
    expect(LpEconomicsResultV1Schema.safeParse({ ...unavailableResult, reasons: [] }).success).toBe(
      false
    );
  });

  it('locks the envelope literals (template, currency, perspective, precision mode)', () => {
    expect(
      LpEconomicsResultV1Schema.safeParse({ ...unavailableResult, waterfallTemplate: 'whole_fund' })
        .success
    ).toBe(false);
    expect(
      LpEconomicsResultV1Schema.safeParse({ ...unavailableResult, currency: 'EUR' }).success
    ).toBe(false);
    expect(
      LpEconomicsResultV1Schema.safeParse({ ...unavailableResult, perspective: 'gp_net' }).success
    ).toBe(false);
    expect(
      LpEconomicsResultV1Schema.safeParse({
        ...unavailableResult,
        precisionMode: 'float64',
      }).success
    ).toBe(false);
  });

  it('accepts a null IRR with its diagnostic on the indicative branch', () => {
    expect(
      LpEconomicsResultV1Schema.safeParse({
        ...indicativeResult,
        lpNetIrr: null,
        lpNetIrrBasis: 'cash_only',
        lpNetIrrDiagnostic: {
          convergence: 'failed',
          iterations: 0,
          method: 'none',
          boundHit: null,
          failureReason: 'NO_SIGN_CHANGE',
        },
      }).success
    ).toBe(true);
  });

  it('sorts reasons by code then detail with a deterministic final tiebreak', () => {
    const input = [
      { code: 'POST_TERM_ACTIVITY', detail: 'z-detail' },
      { code: 'COMMITTED_CAPITAL_EXCEEDED' },
      { code: 'POST_TERM_ACTIVITY', detail: 'a-detail' },
      { code: 'NEGATIVE_SOURCE_MONEY' },
    ];
    expect(sortAndDedupeLpEconomicsReasonsV1(input)).toEqual([
      { code: 'COMMITTED_CAPITAL_EXCEEDED' },
      { code: 'NEGATIVE_SOURCE_MONEY' },
      { code: 'POST_TERM_ACTIVITY', detail: 'a-detail' },
      { code: 'POST_TERM_ACTIVITY', detail: 'z-detail' },
    ]);
  });

  it('dedupes on the canonicalSha256 of the full {code, detail, context} tuple', () => {
    const deduped = sortAndDedupeLpEconomicsReasonsV1([
      {
        code: 'OPENING_STATE_INELIGIBLE',
        context: { field: 'cumulativeGpPaidInUsd', valueUsd: '1.000000' },
      },
      // Same tuple content, different context key order: must collapse.
      {
        code: 'OPENING_STATE_INELIGIBLE',
        context: { valueUsd: '1.000000', field: 'cumulativeGpPaidInUsd' },
      },
      // Different context value: must survive (context discriminants are
      // never collapsed by a code-only dedupe).
      {
        code: 'OPENING_STATE_INELIGIBLE',
        context: { field: 'accruedPreferredReturnUsd', valueUsd: '2.000000' },
      },
    ]);
    expect(deduped).toHaveLength(2);
    expect(
      new Set(
        deduped.map((reason) =>
          canonicalSha256({ code: reason.code, detail: reason.detail, context: reason.context })
        )
      ).size
    ).toBe(2);
  });

  it('is order-insensitive end to end (T-C14 shape)', () => {
    const reasons = [
      { code: 'FORECAST_UNAVAILABLE' },
      { code: 'CONFIG_LINEAGE_MISMATCH', detail: 'plan/config divergence' },
      { code: 'OPENING_CASH_UNAVAILABLE' },
    ];
    const forward = sortAndDedupeLpEconomicsReasonsV1(reasons);
    const reversed = sortAndDedupeLpEconomicsReasonsV1([...reasons].reverse());
    expect(reversed).toEqual(forward);
    expect(canonicalSha256(reversed)).toBe(canonicalSha256(forward));
  });

  it('keeps indicative reasons within the indicative registry', () => {
    expect(
      LpEconomicsIndicativeReasonV1Schema.safeParse({ code: 'MAIN_FUND_VEHICLE_ABSENT' }).success
    ).toBe(false);
    expect(LpEconomicsIndicativeReasonV1Schema.parse({ code: 'FLOAT64_WATERFALL_PATH' })).toEqual({
      code: 'FLOAT64_WATERFALL_PATH',
    });
  });
});
