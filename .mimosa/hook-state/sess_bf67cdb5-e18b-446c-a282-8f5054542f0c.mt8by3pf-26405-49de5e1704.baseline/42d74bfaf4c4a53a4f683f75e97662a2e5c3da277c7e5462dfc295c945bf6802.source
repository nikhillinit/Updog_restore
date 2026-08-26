/**
 * Internal LP economics run contract (D8 request/idempotency surface + D9
 * result envelope), contract version `lp-economics/1.0.0`.
 *
 * WP-L3's run service is an assembler/persister around the frozen
 * `executeCashAssemblyPeriodLoopV1` seam. This module carries every
 * schema-shaped piece of that surface:
 *
 *  - `LpEconomicsRunRequestV1Schema` — explicit basis IDs only (ADR-065
 *    item 1: no latest-resolution anywhere): policy version, facts
 *    snapshot, plan version, forecast snapshot, terminal mode, and the
 *    pinned evaluation `clock` (D9: clock is BASIS — it participates in the
 *    idempotency preimage and the result hash and replays byte-identical).
 *  - `LpEconomicsRunIdempotencyPreimageV1Schema` — P-D8 (R1 amendment):
 *    route-injected `fundId` + `contractVersion` + the normalized request
 *    body + `engineVersion` + `methodologyVersion`. Nothing resolved from
 *    the DB participates (basis IDs already pin immutable rows); the
 *    engine/methodology axis is a deployed-code property and must change
 *    the preimage so upgrades never silently replay stale results.
 *  - The run-unavailability reason registry (persisted `unavailable`,
 *    HTTP 200) in section 8 gate order, including the three gate-ratified
 *    additions `FACTS_ECONOMICS_EVALUATION_BLOCKED` (L3-Q7),
 *    `OPENING_STATE_CONTRACT_INELIGIBLE` (L3-Q6/P-D10 R5), and
 *    `OPENING_STATE_INELIGIBLE` (P-D7 R10), plus the indicative-phase
 *    registry (the D-11 pair and `FLOAT64_WATERFALL_PATH`).
 *  - Reason shape `{ code, detail?, context? }` with typed context
 *    obligations: `OPENING_STATE_INELIGIBLE` carries `{ field, valueUsd }`
 *    (the four frozen-loop opening-balance fields, canonical 6dp value);
 *    `OPENING_STATE_CONTRACT_INELIGIBLE` carries
 *    `context.detail = 'OPENING_STATE_CONTRACT_V1_INELIGIBLE'` as the
 *    version discriminant.
 *  - The D9 result envelope: waterfall template pinned to the single
 *    `deal_by_deal` member (whole_fund arrives only as a V2 publish, so the
 *    template axis is expressed as a pinned literal on every member and the
 *    operative runtime discrimination is the nested `resultStatus` union);
 *    `indicative` carries quarters/events/totals plus nonempty reasons,
 *    `unavailable` carries nonempty reasons only. Quarter rows are exactly
 *    the frozen loop's emitted rows; event rows are the loop's rows PLUS
 *    the section 6 enrichment fields (`eventSequence`, `eventId`,
 *    `sourceRefs`, `eventKind`). The E1-resolved unreturned-capital fields
 *    are deliberately absent from event rows (legacy ledger must never
 *    populate them). Totals follow section 6(c)'s three-way split; the IRR
 *    block reuses the ADR-010 XIRR diagnostic taxonomy. Money passes
 *    through as canonical 6dp decimal strings, ratios as 12dp; never
 *    `number` round-trips.
 *  - Schema-only result surfaces. Crypto-bearing reason sort/dedupe and
 *    event-ID helpers live in `lp-economics-run-v1.hash.ts` and are not
 *    re-exported here.
 *
 * NOTE: this module is browser-safe. Runtime hashing belongs to the
 * server-safe hash sibling so schema consumers never reach `node:crypto`.
 *
 * Governing docs: docs/superpowers/plans/
 * 2026-07-31-task163-wp-l3-service-persistence-plan.md (sections 5, 6, 8;
 * P-D8/P-D10) and docs/superpowers/specs/
 * 2026-07-30-task163-deal-by-deal-scoping-design.md (D8 lines 478-549, D9
 * lines 551-677, registry lines 766-846).
 *
 * @module shared/contracts/internal-economics/lp-economics-run-v1.contract
 */
import { z } from 'zod';

import { MoneyDecimalStringSchema, RatioDecimalStringSchema } from '../../lib/decimal-string';
import type { CashAssemblyWaterfallEventV1 } from '../../lib/internal-economics/cash-assembly-period-loop-v1';
import type { CashAssemblyQuarterRowV1 } from '../../lib/internal-economics/cash-assembly-types-v1';
import { XirrDiagnosticSchema } from '../lp-reporting/lp-metric-run.contract';
import { TerminalModeV1Schema } from './terminal-policy-v1.contract';

export const LP_ECONOMICS_RUN_CONTRACT_VERSION = 'lp-economics/1.0.0' as const;

// ---------------------------------------------------------------------------
// Run request (explicit basis IDs only) + idempotency preimage (P-D8).
// ---------------------------------------------------------------------------

export const LpEconomicsRunRequestV1Schema = z
  .object({
    policyVersionId: z.number().int().positive(),
    factsSnapshotId: z.number().int().positive(),
    planVersionId: z.number().int().positive(),
    forecastSnapshotId: z.number().int().positive(),
    /**
     * Must exactly match the pinned policy's terminal mode (section 5:
     * mismatch is a typed request-validation rejection, never a run
     * outcome). Duplicated in the request for explicitness, not override.
     */
    terminalMode: TerminalModeV1Schema,
    /** Pinned evaluation clock (BASIS — replays byte-identical). */
    clock: z.string().datetime(),
  })
  .strict();
export type LpEconomicsRunRequestV1 = Readonly<z.infer<typeof LpEconomicsRunRequestV1Schema>>;

export const LpEconomicsRunIdempotencyPreimageV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    contractVersion: z.literal(LP_ECONOMICS_RUN_CONTRACT_VERSION),
    request: LpEconomicsRunRequestV1Schema,
    engineVersion: z.string().min(1),
    methodologyVersion: z.string().min(1),
  })
  .strict();
export type LpEconomicsRunIdempotencyPreimageV1 = Readonly<
  z.infer<typeof LpEconomicsRunIdempotencyPreimageV1Schema>
>;

/** Pure preimage assembly; the service hashes the returned object. */
export function buildLpEconomicsRunIdempotencyPreimageV1(input: {
  readonly fundId: number;
  readonly request: LpEconomicsRunRequestV1;
  readonly engineVersion: string;
  readonly methodologyVersion: string;
}): LpEconomicsRunIdempotencyPreimageV1 {
  return LpEconomicsRunIdempotencyPreimageV1Schema.parse({
    fundId: input.fundId,
    contractVersion: LP_ECONOMICS_RUN_CONTRACT_VERSION,
    request: input.request,
    engineVersion: input.engineVersion,
    methodologyVersion: input.methodologyVersion,
  });
}

// ---------------------------------------------------------------------------
// Reason registries (run-unavailability phase + indicative phase).
// ---------------------------------------------------------------------------

/**
 * Persisted run-unavailability registry in section 8 gate order (ratified
 * registry, scoping-design lines 803-834, plus the three gate-ratified
 * additions named in the module docstring).
 */
export const LP_ECONOMICS_RUN_UNAVAILABILITY_REASON_CODES_V1 = [
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
] as const;

export const LpEconomicsRunUnavailabilityReasonCodeV1Schema = z.enum(
  LP_ECONOMICS_RUN_UNAVAILABILITY_REASON_CODES_V1
);
export type LpEconomicsRunUnavailabilityReasonCodeV1 = z.infer<
  typeof LpEconomicsRunUnavailabilityReasonCodeV1Schema
>;

/**
 * Indicative-phase registry: the D-11 pair the frozen loop emits plus the
 * ratified `FLOAT64_WATERFALL_PATH` cap for any float64 waterfall path.
 */
export const LP_ECONOMICS_INDICATIVE_REASON_CODES_V1 = [
  'DECIMAL_CORE_UNCERTIFIED',
  'FLOAT64_WATERFALL_PATH',
  'LP_NET_NAV_FLAT_SHARE_APPROXIMATION',
] as const;

export const LpEconomicsIndicativeReasonCodeV1Schema = z.enum(
  LP_ECONOMICS_INDICATIVE_REASON_CODES_V1
);
export type LpEconomicsIndicativeReasonCodeV1 = z.infer<
  typeof LpEconomicsIndicativeReasonCodeV1Schema
>;

// ---------------------------------------------------------------------------
// Reason shape { code, detail?, context? } + typed context obligations.
// ---------------------------------------------------------------------------

const LpEconomicsReasonContextV1Schema = z.record(z.string(), z.string());

export const OPENING_STATE_CONTRACT_V1_INELIGIBLE_DETAIL =
  'OPENING_STATE_CONTRACT_V1_INELIGIBLE' as const;

/**
 * The four opening-balance fields the frozen loop checks, in its exact
 * fixed order (read-only mirror of the loop's own ineligibility list; the
 * service checks them in this order pre-invocation per P-D10 R10).
 */
export const OPENING_STATE_INELIGIBLE_FIELDS_V1 = [
  'cumulativeGpPaidInUsd',
  'gpUnreturnedContributedCapitalUsd',
  'gpInvestmentDistributionsPaidUsd',
  'accruedPreferredReturnUsd',
] as const;

export const OpeningStateIneligibleContextV1Schema = z
  .object({
    field: z.enum(OPENING_STATE_INELIGIBLE_FIELDS_V1),
    valueUsd: MoneyDecimalStringSchema,
  })
  .strict();
export type OpeningStateIneligibleContextV1 = Readonly<
  z.infer<typeof OpeningStateIneligibleContextV1Schema>
>;

export const LpEconomicsRunUnavailabilityReasonV1Schema = z
  .object({
    code: LpEconomicsRunUnavailabilityReasonCodeV1Schema,
    detail: z.string().min(1).optional(),
    context: LpEconomicsReasonContextV1Schema.optional(),
  })
  .strict()
  .superRefine((reason, ctx) => {
    if (reason.code === 'OPENING_STATE_INELIGIBLE') {
      const parsedContext = OpeningStateIneligibleContextV1Schema.safeParse(reason.context);
      if (!parsedContext.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['context'],
          message:
            'OPENING_STATE_INELIGIBLE requires context {field, valueUsd} with a frozen-loop field name and canonical 6dp value.',
        });
      }
    }
    if (
      reason.code === 'OPENING_STATE_CONTRACT_INELIGIBLE' &&
      reason.context?.['detail'] !== OPENING_STATE_CONTRACT_V1_INELIGIBLE_DETAIL
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['context'],
        message:
          'OPENING_STATE_CONTRACT_INELIGIBLE requires the OPENING_STATE_CONTRACT_V1_INELIGIBLE context.detail discriminant.',
      });
    }
  });
export type LpEconomicsRunUnavailabilityReasonV1 = Readonly<
  z.infer<typeof LpEconomicsRunUnavailabilityReasonV1Schema>
>;

export const LpEconomicsIndicativeReasonV1Schema = z
  .object({
    code: LpEconomicsIndicativeReasonCodeV1Schema,
    detail: z.string().min(1).optional(),
    context: LpEconomicsReasonContextV1Schema.optional(),
  })
  .strict();
export type LpEconomicsIndicativeReasonV1 = Readonly<
  z.infer<typeof LpEconomicsIndicativeReasonV1Schema>
>;

// ---------------------------------------------------------------------------
// D9 value rows: frozen-loop quarter rows verbatim; events + enrichment.
// ---------------------------------------------------------------------------

export const LpEconomicsQuarterRowV1Schema = z
  .object({
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    source: z.enum(['actual', 'projected']),
    openingCashUsd: MoneyDecimalStringSchema,
    lpCapitalCallUsd: MoneyDecimalStringSchema,
    gpCommitmentCallUsd: MoneyDecimalStringSchema,
    portfolioDeploymentUsd: MoneyDecimalStringSchema,
    managementFeesUsd: MoneyDecimalStringSchema,
    fundExpensesUsd: MoneyDecimalStringSchema,
    grossRealizedProceedsUsd: MoneyDecimalStringSchema,
    lpDistributionUsd: MoneyDecimalStringSchema,
    gpInvestmentDistributionUsd: MoneyDecimalStringSchema,
    gpCarryDistributedUsd: MoneyDecimalStringSchema,
    endingCashUsd: MoneyDecimalStringSchema,
    grossNavUsd: MoneyDecimalStringSchema,
    lpNetNavUsd: MoneyDecimalStringSchema,
    cumulativeLpPaidInUsd: MoneyDecimalStringSchema,
    cumulativeLpDistributedUsd: MoneyDecimalStringSchema,
    dpi: RatioDecimalStringSchema.nullable(),
    rvpi: RatioDecimalStringSchema.nullable(),
    tvpi: RatioDecimalStringSchema.nullable(),
  })
  .strict();
export type LpEconomicsQuarterRowV1 = Readonly<z.infer<typeof LpEconomicsQuarterRowV1Schema>>;

export const LpEconomicsEventKindV1Schema = z.enum([
  'forecast_quarterly_distribution',
  'terminal_realization',
]);
export type LpEconomicsEventKindV1 = z.infer<typeof LpEconomicsEventKindV1Schema>;

/** Typed wrapper around the frozen loop's bare `sourceId` string. */
export const LpEconomicsEventSourceRefV1Schema = z.object({ sourceId: z.string().min(1) }).strict();
export type LpEconomicsEventSourceRefV1 = Readonly<
  z.infer<typeof LpEconomicsEventSourceRefV1Schema>
>;

/**
 * Frozen-loop event fields verbatim PLUS the section 6 enrichment fields.
 * `eventId` is basis-derived only (never run-derived — D9 excludes run IDs
 * from the result hash); see `buildLpEconomicsEventIdV1`.
 */
export const LpEconomicsWaterfallEventV1Schema = z
  .object({
    periodEnd: z.string().date(),
    sourceId: z.string().min(1),
    grossDistributionUsd: MoneyDecimalStringSchema,
    lpCapitalReturnUsd: MoneyDecimalStringSchema,
    lpProfitUsd: MoneyDecimalStringSchema,
    gpInvestmentDistributionUsd: MoneyDecimalStringSchema,
    gpCarryUsd: MoneyDecimalStringSchema,
    eventSequence: z.number().int().nonnegative(),
    eventId: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRefs: z.array(LpEconomicsEventSourceRefV1Schema).min(1),
    eventKind: LpEconomicsEventKindV1Schema,
  })
  .strict();
export type LpEconomicsWaterfallEventV1 = Readonly<
  z.infer<typeof LpEconomicsWaterfallEventV1Schema>
>;

/**
 * Section 6(c) totals: (i) quarter-summed flow fields, (ii) the
 * event-summed LP capital-return/profit split, (iii) terminal-quarter-row
 * pass-through for the stock/ratio fields (never re-derived).
 */
export const LpEconomicsTotalsV1Schema = z
  .object({
    lpCapitalCallUsd: MoneyDecimalStringSchema,
    gpCommitmentCallUsd: MoneyDecimalStringSchema,
    portfolioDeploymentUsd: MoneyDecimalStringSchema,
    managementFeesUsd: MoneyDecimalStringSchema,
    fundExpensesUsd: MoneyDecimalStringSchema,
    grossRealizedProceedsUsd: MoneyDecimalStringSchema,
    lpCapitalReturnUsd: MoneyDecimalStringSchema,
    lpProfitUsd: MoneyDecimalStringSchema,
    lpDistributionUsd: MoneyDecimalStringSchema,
    gpInvestmentDistributionUsd: MoneyDecimalStringSchema,
    gpCarryDistributedUsd: MoneyDecimalStringSchema,
    endingCashUsd: MoneyDecimalStringSchema,
    grossNavUsd: MoneyDecimalStringSchema,
    lpNetNavUsd: MoneyDecimalStringSchema,
    dpi: RatioDecimalStringSchema.nullable(),
    rvpi: RatioDecimalStringSchema.nullable(),
    tvpi: RatioDecimalStringSchema.nullable(),
  })
  .strict();
export type LpEconomicsTotalsV1 = Readonly<z.infer<typeof LpEconomicsTotalsV1Schema>>;

// ---------------------------------------------------------------------------
// D9 result envelope.
// ---------------------------------------------------------------------------

export const LpEconomicsIrrBasisV1Schema = z.enum(['cash_only', 'cash_plus_terminal_nav']);
export type LpEconomicsIrrBasisV1 = z.infer<typeof LpEconomicsIrrBasisV1Schema>;

const LpEconomicsResultEnvelopeCommonV1 = {
  waterfallTemplate: z.literal('deal_by_deal'),
  clock: z.string().datetime(),
  currency: z.literal('USD'),
  perspective: z.literal('lp_net'),
  precisionMode: z.literal('decimal_native_with_float64_xirr'),
} as const;

export const LpEconomicsIndicativeResultV1Schema = z
  .object({
    ...LpEconomicsResultEnvelopeCommonV1,
    resultStatus: z.literal('indicative'),
    quarters: z.array(LpEconomicsQuarterRowV1Schema),
    waterfallEvents: z.array(LpEconomicsWaterfallEventV1Schema),
    totals: LpEconomicsTotalsV1Schema,
    terminalNavBeforeRealizationUsd: MoneyDecimalStringSchema,
    lpNetIrr: RatioDecimalStringSchema.nullable(),
    lpNetIrrBasis: LpEconomicsIrrBasisV1Schema,
    lpNetIrrDiagnostic: XirrDiagnosticSchema,
    reasons: z.array(LpEconomicsIndicativeReasonV1Schema).min(1),
  })
  .strict();
export type LpEconomicsIndicativeResultV1 = Readonly<
  z.infer<typeof LpEconomicsIndicativeResultV1Schema>
>;

export const LpEconomicsUnavailableResultV1Schema = z
  .object({
    ...LpEconomicsResultEnvelopeCommonV1,
    resultStatus: z.literal('unavailable'),
    reasons: z.array(LpEconomicsRunUnavailabilityReasonV1Schema).min(1),
  })
  .strict();
export type LpEconomicsUnavailableResultV1 = Readonly<
  z.infer<typeof LpEconomicsUnavailableResultV1Schema>
>;

/**
 * D9 envelope. `available` is typed nowhere in V1 (D-11 addendum:
 * `resultStatus` stays `indicative` end to end until the certification
 * path lands as its own later act; the schema admits only the
 * `indicative`/`unavailable` pair, so an `available` payload cannot parse).
 */
export const LpEconomicsResultV1Schema = z.discriminatedUnion('resultStatus', [
  LpEconomicsIndicativeResultV1Schema,
  LpEconomicsUnavailableResultV1Schema,
]);
export type LpEconomicsResultV1 = Readonly<z.infer<typeof LpEconomicsResultV1Schema>>;

// ---------------------------------------------------------------------------
// Compile-time parity pins against the frozen loop's emitted types
// (pass-through discipline; type-only imports — the frozen modules are
// never executed or edited by this contract).
// ---------------------------------------------------------------------------

type _StaticAssert<T extends true> = T;
type _LoopQuarterRowParsesVerbatim = _StaticAssert<
  CashAssemblyQuarterRowV1 extends LpEconomicsQuarterRowV1 ? true : false
>;
type _ContractQuarterRowAddsNothing = _StaticAssert<
  LpEconomicsQuarterRowV1 extends CashAssemblyQuarterRowV1 ? true : false
>;
type _EnrichedEventCarriesEveryLoopField = _StaticAssert<
  LpEconomicsWaterfallEventV1 extends CashAssemblyWaterfallEventV1 ? true : false
>;
