/**
 * KPI OBSERVATION CONTRACT v1 (issue #1300, ruling GR2-4a).
 *
 * One KPI observation is one measured or projected value, for one portfolio
 * company, for one metric, over one period. The metric set is the managing
 * partner's fixed v1 list and is deliberately closed: a new metric is a contract
 * version, not a free-text row.
 *
 * This surface is INTERNAL-ONLY and CSV-first. There is deliberately no
 * company-facing request form, no recipient, no send, and no export endpoint in
 * v1, and `tests/unit/source/kpi-observation-boundary.test.ts` keeps it that way.
 *
 * Money crosses the wire as a fixed 6-decimal-place string (never a float), the
 * same boundary the economics and current-plan contracts use.
 *
 * @module shared/contracts/kpi/kpi-observation-v1.contract
 */

import { z } from 'zod';

import { MoneyDecimalStringSchema } from '../../lib/decimal-string';

export const KPI_OBSERVATION_CONTRACT_VERSION = 'kpi-observation/1.0.0' as const;

/**
 * The fixed v1 metric set: revenue/ARR, cash balance, monthly burn, runway,
 * headcount, next financing target and date, one company-specific KPI, and a
 * qualitative update.
 */
export const KPI_METRICS = [
  'revenue_arr',
  'cash_balance',
  'monthly_burn',
  'runway_months',
  'headcount',
  'next_financing_target',
  'next_financing_date',
  'company_specific',
  'qualitative_update',
] as const;

export const KpiMetricSchema = z.enum(KPI_METRICS);
export type KpiMetric = z.infer<typeof KpiMetricSchema>;

export const KPI_VALUE_KINDS = ['money', 'number', 'date', 'text'] as const;
export const KpiValueKindSchema = z.enum(KPI_VALUE_KINDS);
export type KpiValueKind = z.infer<typeof KpiValueKindSchema>;

/**
 * Metric -> value kind is fixed, not caller-chosen. The database mirrors this map
 * as a CHECK constraint, so a drifting client cannot store a text runway.
 */
export const KPI_METRIC_VALUE_KIND: Readonly<Record<KpiMetric, KpiValueKind>> = {
  revenue_arr: 'money',
  cash_balance: 'money',
  monthly_burn: 'money',
  runway_months: 'number',
  headcount: 'number',
  next_financing_target: 'money',
  next_financing_date: 'date',
  company_specific: 'number',
  qualitative_update: 'text',
};

/** Metrics whose value is a magnitude and can never be negative. */
export const KPI_NON_NEGATIVE_METRICS: ReadonlySet<KpiMetric> = new Set<KpiMetric>([
  'revenue_arr',
  'cash_balance',
  'monthly_burn',
  'runway_months',
  'headcount',
  'next_financing_target',
]);

export const KPI_BASES = ['actual', 'projected'] as const;
export const KpiBasisSchema = z.enum(KPI_BASES);
export type KpiBasis = z.infer<typeof KpiBasisSchema>;

/** How the row entered the system. Set by the server, never by the caller. */
export const KPI_SOURCES = ['manual', 'csv_import'] as const;
export const KpiSourceSchema = z.enum(KPI_SOURCES);
export type KpiSource = z.infer<typeof KpiSourceSchema>;

export const KPI_REVIEW_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export const KpiReviewStatusSchema = z.enum(KPI_REVIEW_STATUSES);
export type KpiReviewStatus = z.infer<typeof KpiReviewStatusSchema>;

const PositiveIntSchema = z.number().int().positive();
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');

/**
 * Non-money numerics (runway months, headcount, the company-specific KPI) use the
 * same fixed 6-decimal-place string boundary as money so no KPI value is ever a
 * float on the wire.
 */
export const KpiNumberDecimalStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)\.\d{6}$/, 'Expected a fixed 6-decimal-place numeric string.');

export const KpiObservationValueSchema = z.discriminatedUnion('valueKind', [
  z.object({ valueKind: z.literal('money'), amountUsd: MoneyDecimalStringSchema }).strict(),
  z.object({ valueKind: z.literal('number'), number: KpiNumberDecimalStringSchema }).strict(),
  z.object({ valueKind: z.literal('date'), date: IsoDateSchema }).strict(),
  z.object({ valueKind: z.literal('text'), text: z.string().min(1).max(4000) }).strict(),
]);
export type KpiObservationValue = z.infer<typeof KpiObservationValueSchema>;

/** The decimal string carried by a money or number value, or null for the rest. */
export function numericStringOfValue(value: KpiObservationValue): string | null {
  if (value.valueKind === 'money') return value.amountUsd;
  if (value.valueKind === 'number') return value.number;
  return null;
}

interface MetricShapeIssueContext {
  metric: KpiMetric;
  value: KpiObservationValue;
  companyKpiLabel: string | null | undefined;
}

/**
 * The three cross-field rules every request and every stored row must satisfy:
 * the value kind matches the metric, magnitude metrics are non-negative, and the
 * company-specific KPI carries exactly the label that names it.
 */
export function metricShapeIssues(context: MetricShapeIssueContext): string[] {
  const issues: string[] = [];
  const expectedKind = KPI_METRIC_VALUE_KIND[context.metric];
  if (context.value.valueKind !== expectedKind) {
    issues.push(`Metric "${context.metric}" requires a "${expectedKind}" value.`);
    return issues;
  }

  const numeric = numericStringOfValue(context.value);
  if (numeric !== null && numeric.startsWith('-') && KPI_NON_NEGATIVE_METRICS.has(context.metric)) {
    issues.push(`Metric "${context.metric}" cannot be negative.`);
  }

  const hasLabel = context.companyKpiLabel !== null && context.companyKpiLabel !== undefined;
  if (context.metric === 'company_specific' && !hasLabel) {
    issues.push('Metric "company_specific" requires companyKpiLabel.');
  }
  if (context.metric !== 'company_specific' && hasLabel) {
    issues.push('companyKpiLabel is only valid for metric "company_specific".');
  }

  return issues;
}

const ObservationCoreShape = {
  portfolioCompanyId: PositiveIntSchema,
  metric: KpiMetricSchema,
  periodStart: IsoDateSchema,
  periodEnd: IsoDateSchema,
  basis: KpiBasisSchema,
  value: KpiObservationValueSchema,
  /** Names the metric when it is the one company-specific KPI; null otherwise. */
  companyKpiLabel: z.string().min(1).max(120).nullable().optional(),
  /** Free-text provenance, e.g. "AlphaTech June board deck". */
  sourceLabel: z.string().min(1).max(200).nullable().optional(),
  /** The submitter's note about this value. */
  comment: z.string().min(1).max(4000).nullable().optional(),
  /** When the company reported it, which is not when we recorded it. */
  submittedAt: z.string().datetime(),
};

function refineObservationShape(
  data: {
    metric: KpiMetric;
    value: KpiObservationValue;
    companyKpiLabel?: string | null | undefined;
    periodStart: string;
    periodEnd: string;
  },
  ctx: z.RefinementCtx
): void {
  for (const message of metricShapeIssues({
    metric: data.metric,
    value: data.value,
    companyKpiLabel: data.companyKpiLabel,
  })) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
  if (data.periodEnd < data.periodStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['periodEnd'],
      message: 'periodEnd must not precede periodStart.',
    });
  }
}

export const KpiObservationCreateRequestSchema = z
  .object(ObservationCoreShape)
  .strict()
  .superRefine(refineObservationShape);
export type KpiObservationCreateRequest = z.infer<typeof KpiObservationCreateRequestSchema>;

/**
 * A review decides; it never un-decides. Returning a row to `pending` would
 * erase who reviewed it and when, so the request set is the two terminal
 * outcomes only.
 */
export const KpiReviewDecisionSchema = z.enum(['accepted', 'rejected']);
export type KpiReviewDecision = z.infer<typeof KpiReviewDecisionSchema>;

export const KpiObservationReviewRequestSchema = z
  .object({
    reviewStatus: KpiReviewDecisionSchema,
    reviewComment: z.string().min(1).max(4000).nullable().optional(),
  })
  .strict();
export type KpiObservationReviewRequest = z.infer<typeof KpiObservationReviewRequestSchema>;

export const KpiObservationListQuerySchema = z
  .object({
    portfolioCompanyId: z.coerce.number().int().positive().optional(),
    metric: KpiMetricSchema.optional(),
    basis: KpiBasisSchema.optional(),
    reviewStatus: KpiReviewStatusSchema.optional(),
    /** Inclusive lower bound on periodStart. */
    periodFrom: IsoDateSchema.optional(),
    /** Inclusive upper bound on periodEnd. */
    periodTo: IsoDateSchema.optional(),
  })
  .strict();
export type KpiObservationListQuery = z.infer<typeof KpiObservationListQuerySchema>;

export const KpiObservationV1Schema = z
  .object({
    contractVersion: z.literal(KPI_OBSERVATION_CONTRACT_VERSION),
    observationId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    portfolioCompanyId: PositiveIntSchema,
    metric: KpiMetricSchema,
    periodStart: IsoDateSchema,
    periodEnd: IsoDateSchema,
    basis: KpiBasisSchema,
    value: KpiObservationValueSchema,
    companyKpiLabel: z.string().min(1).max(120).nullable(),
    source: KpiSourceSchema,
    sourceLabel: z.string().min(1).max(200).nullable(),
    comment: z.string().min(1).max(4000).nullable(),
    submittedAt: z.string().datetime(),
    reviewStatus: KpiReviewStatusSchema,
    reviewComment: z.string().min(1).max(4000).nullable(),
    reviewedAt: z.string().datetime().nullable(),
    /** Monotonic row version; it backs the ETag a review must echo in If-Match. */
    version: PositiveIntSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine(refineObservationShape);
export type KpiObservationV1 = z.infer<typeof KpiObservationV1Schema>;

export const KpiObservationListResponseSchema = z
  .object({ data: z.array(KpiObservationV1Schema) })
  .strict();
export type KpiObservationListResponse = z.infer<typeof KpiObservationListResponseSchema>;

/** One rejected CSV row. Accepted rows come back as full observations. */
export const KpiCsvRowRejectionSchema = z
  .object({ row: PositiveIntSchema, code: z.string().min(1), message: z.string().min(1) })
  .strict();
export type KpiCsvRowRejection = z.infer<typeof KpiCsvRowRejectionSchema>;

/**
 * CSV content rides as base64 inside JSON, the same transport the LP reporting
 * import lane uses, so one body shape carries both the file and its metadata.
 */
export const KpiObservationImportRequestSchema = z
  .object({
    csvBase64: z.string().min(1),
    /** Applied to every row that does not carry its own source_label. */
    sourceLabel: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();
export type KpiObservationImportRequest = z.infer<typeof KpiObservationImportRequestSchema>;

export const KpiObservationImportResponseSchema = z
  .object({
    imported: z.array(KpiObservationV1Schema),
    rejected: z.array(KpiCsvRowRejectionSchema),
    replayed: z.boolean(),
  })
  .strict();
export type KpiObservationImportResponse = z.infer<typeof KpiObservationImportResponseSchema>;

/**
 * The fixed v1 import template. The header is exact and ordered; there is no
 * mapping profile and no caller-supplied column mapping in v1.
 */
export const KPI_CSV_TEMPLATE_HEADER = [
  'portfolio_company_id',
  'metric',
  'period_start',
  'period_end',
  'basis',
  'value',
  'company_kpi_label',
  'source_label',
  'comment',
  'submitted_at',
] as const;

/**
 * Deliberately tighter than the financial-observations lane's 5000: each KPI row
 * lands through its own idempotent command so partial batches stay recoverable,
 * and one quarterly collection for a 4-person team is tens of rows, not thousands.
 */
export const KPI_CSV_MAX_ROWS = 1000;
