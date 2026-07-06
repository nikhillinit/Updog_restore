import { z } from 'zod';

import { DecimalStringSchema } from '../lp-reporting/cash-flow-event.contract';
import { DatasetTrustStateSchema, StructuredWarningSchema } from '../provenance-envelope.contract';
import {
  FundCompanyActualsCurrencyStatusSchema,
  FundCompanyActualsPlanningFmvStatusSchema,
} from '../fund-actuals/fund-company-actuals-fact.contract';

/**
 * Contract version pre-commitment (ADR-031 decision 3). No cache stores this
 * response today, by design: the dual forecast is compute-on-request and its
 * freshness window is the disclosed 60s HTTP/client pair. If a later slice
 * adds server-side caching, the cache key MUST embed this constant so shape
 * changes and key bumps land in the same diff.
 */
export const DUAL_FORECAST_CONTRACT_VERSION = 1;

const PositiveIdSchema = z.number().int().positive();
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoDateSchema = z.string().date();
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export const DualForecastConfigSourceSchema = z.enum([
  'published',
  'legacy_default_no_published_config',
  'legacy_default_invalid_config',
  'legacy_default_missing_target_metrics',
]);

export const DualForecastConfigMetadataSchema = z
  .object({
    source: DualForecastConfigSourceSchema,
    version: z.number().int().nullable(),
    publishedAt: z.string().nullable(),
    fallbackReason: z.string().nullable(),
  })
  .strict();

export const DualForecastSourceMetadataSchema = z
  .object({
    construction: z.literal('construction_forecast_jcurve'),
    current: z.literal('projected_metrics_calculator'),
    actual: z.literal('actual_metrics_calculator'),
  })
  .strict();

export const DualForecastMetricsSchema = z
  .object({
    nav: z.number(),
    calledCapital: z.number(),
    distributions: z.number(),
    tvpi: z.number().nullable(),
    dpi: z.number().nullable(),
    rvpi: z.number().nullable(),
    irr: z.number().nullable(),
  })
  .strict();

export const DualForecastPointModeSchema = z.enum(['actual', 'forecast']);

/**
 * PR-2 per-quarter Construction-vs-Current variance (PRD #1020): each field is
 * `current` minus `construction` for the same quarter; ratio deltas are null
 * whenever either side is null. Same shape as the metrics they difference.
 */
export const DualForecastVarianceSchema = DualForecastMetricsSchema;

export const DualForecastPointSchema = z
  .object({
    quarterIndex: z.number().int(),
    label: z.string(),
    date: z.string(),
    construction: DualForecastMetricsSchema,
    actual: DualForecastMetricsSchema.nullable(),
    currentMode: DualForecastPointModeSchema,
    current: DualForecastMetricsSchema,
    variance: DualForecastVarianceSchema,
  })
  .strict();

/**
 * PR-1 shadow-read provenance (ADR-031): per-company trust state and anchor
 * attribution copied verbatim from the facts contract - money stays decimal
 * strings, never parsed numbers. The numeric series are NOT derived from
 * these values until the PR-2 blend lands.
 */
export const DualForecastActualsFactsCompanySchema = z
  .object({
    companyId: PositiveIdSchema,
    companyName: z.string().min(1),
    trustState: DatasetTrustStateSchema,
    planningFmvStatus: FundCompanyActualsPlanningFmvStatusSchema,
    currency: CurrencyCodeSchema,
    currencyStatus: FundCompanyActualsCurrencyStatusSchema,
    latestRoundDate: IsoDateSchema.nullable(),
    latestRoundValuation: DecimalStringSchema.nullable(),
    latestPlanningFmvDate: IsoDateSchema.nullable(),
    latestPlanningFmvValue: DecimalStringSchema.nullable(),
    warnings: z.array(StructuredWarningSchema),
  })
  .strict();

/**
 * Additive provenance block. `null` means the facts fetch itself failed;
 * the failure is disclosed in the top-level warnings and the read surface
 * still renders (ADR-028 disclose-not-block).
 */
export const DualForecastActualsFactsSchema = z
  .object({
    asOfDate: IsoDateSchema,
    generatedAt: z.string().datetime(),
    inputHash: Sha256Schema,
    companies: z.array(DualForecastActualsFactsCompanySchema),
    warnings: z.array(StructuredWarningSchema),
  })
  .strict();

/**
 * ADR-029 anchor ladder attribution: which value anchored a company's NAV
 * contribution. `planning_fmv` = active Planning FMV mark; `planning_fmv_stale`
 * = stale mark, disclosed; `legacy_current_valuation` = the un-provenanced
 * `portfolio_companies.currentValuation` fallback; `none` = the disclosed zero
 * that used to be silent.
 */
export const DualForecastNavAnchorSchema = z.enum([
  'planning_fmv',
  'planning_fmv_stale',
  'legacy_current_valuation',
  'none',
]);

const NonNegativeIntSchema = z.number().int().nonnegative();

/**
 * ADR-030 response-level rollup: a per-trust-state count map over the facts
 * companies. Deliberately NOT a worst-of scalar; a badge stays derivable
 * client-side.
 */
export const DualForecastTrustCountsSchema = z
  .object({
    LIVE: NonNegativeIntSchema,
    PARTIAL: NonNegativeIntSchema,
    UNAVAILABLE: NonNegativeIntSchema,
    FAILED: NonNegativeIntSchema,
  })
  .strict();

/**
 * Per-company NAV anchor attribution (ADR-029/030). `inNavUniverse` is false
 * for exited/written-off companies and for facts companies missing from the
 * portfolio read - they contribute no NAV and `anchor`/`contribution` are
 * null. `trustState` is null when the company has no facts entry (a live
 * company outside the facts universe descends the ladder on legacy rungs).
 * `contribution` is money, so it stays a decimal string.
 */
export const DualForecastNavAnchorCompanySchema = z
  .object({
    companyId: PositiveIdSchema,
    companyName: z.string().min(1),
    inNavUniverse: z.boolean(),
    trustState: DatasetTrustStateSchema.nullable(),
    anchor: DualForecastNavAnchorSchema.nullable(),
    contribution: DecimalStringSchema.nullable(),
  })
  .strict();

/**
 * PR-2 blend disclosure block (ADR-029/030/032). `null` means the facts fetch
 * failed (`actualsFacts` is null too) and the series is NOT blended - it falls
 * back to the legacy calculator NAV, disclosed via the top-level warnings.
 */
export const DualForecastNavAnchoringSchema = z
  .object({
    blendedNav: DecimalStringSchema,
    countsByTrustState: DualForecastTrustCountsSchema,
    companies: z.array(DualForecastNavAnchorCompanySchema),
  })
  .strict();

/**
 * PR-2 structured disclosure of the Current-projection fallback (PRD #1020):
 * `fallback_default` means the projection engine failed and the future
 * Current quarters come from `getDefaultProjectedMetrics` - previously a
 * silent string warning.
 */
export const DualForecastCurrentProjectionSchema = z
  .object({
    status: z.enum(['projected', 'fallback_default']),
    fallbackReason: z.string().nullable(),
  })
  .strict();

export const DualForecastResponseSchema = z
  .object({
    fundId: PositiveIdSchema,
    fundName: z.string(),
    asOfDate: z.string(),
    series: z.array(DualForecastPointSchema),
    sources: DualForecastSourceMetadataSchema,
    config: DualForecastConfigMetadataSchema,
    actualsFacts: DualForecastActualsFactsSchema.nullable(),
    navAnchoring: DualForecastNavAnchoringSchema.nullable(),
    currentProjection: DualForecastCurrentProjectionSchema,
    warnings: z.array(z.string()),
  })
  .strict();

export type DualForecastConfigSource = z.infer<typeof DualForecastConfigSourceSchema>;
export type DualForecastConfigMetadata = z.infer<typeof DualForecastConfigMetadataSchema>;
export type DualForecastSourceMetadata = z.infer<typeof DualForecastSourceMetadataSchema>;
export type DualForecastMetrics = z.infer<typeof DualForecastMetricsSchema>;
export type DualForecastPointMode = z.infer<typeof DualForecastPointModeSchema>;
export type DualForecastPoint = z.infer<typeof DualForecastPointSchema>;
export type DualForecastActualsFactsCompany = z.infer<typeof DualForecastActualsFactsCompanySchema>;
export type DualForecastActualsFacts = z.infer<typeof DualForecastActualsFactsSchema>;
export type DualForecastNavAnchor = z.infer<typeof DualForecastNavAnchorSchema>;
export type DualForecastTrustCounts = z.infer<typeof DualForecastTrustCountsSchema>;
export type DualForecastNavAnchorCompany = z.infer<typeof DualForecastNavAnchorCompanySchema>;
export type DualForecastNavAnchoring = z.infer<typeof DualForecastNavAnchoringSchema>;
export type DualForecastCurrentProjection = z.infer<typeof DualForecastCurrentProjectionSchema>;
export type DualForecastResponse = z.infer<typeof DualForecastResponseSchema>;
