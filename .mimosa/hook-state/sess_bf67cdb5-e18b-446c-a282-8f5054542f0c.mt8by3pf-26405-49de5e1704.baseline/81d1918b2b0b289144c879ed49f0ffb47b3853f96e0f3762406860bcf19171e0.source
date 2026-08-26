/**
 * Internal analysis -- quarterly draft checkpoints and immutable reference snapshots.
 *
 * PLAN_61 Task 18 (Wave G). Periodic artifacts are INTERNAL reference snapshots on
 * one coherent facts basis -- never closes, restatements, or approved reports. There
 * is deliberately no approval state, no recipient, and no export shape in this
 * contract.
 *
 * Two lifecycle shapes:
 * - A draft is mutable. `periodStart`/`periodEnd` never change; refresh advances
 *   `knowledgeCutoff` and repins every component from ONE canonical facts snapshot
 *   built at that cutoff (defect D6), bumping `version` (which rotates the ETag).
 * - A reference is immutable. Saving a draft creates one. A late correction starts a
 *   new draft FROM a saved reference; saving that draft sets `supersedesReferenceId`,
 *   so references form a linear chain and the terminal member is the default for
 *   comparison.
 *
 * Reserve and economics references are nullable: periodic analysis does not
 * hard-depend on Waves E/F.
 *
 * @module shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract
 */

import { z } from 'zod';

export const ANALYSIS_REFERENCE_CONTRACT_VERSION = 'analysis-reference-snapshot-v1' as const;

/**
 * Rejection code for a save whose pinned components do not all resolve to the
 * draft's `financialFactsSnapshotId` (defect D6). An operator may override by
 * saving explicitly with `acknowledgeMixedBasis`, which persists
 * `mixedBasisAtSave` on the reference.
 */
export const MIXED_FACTS_BASIS = 'MIXED_FACTS_BASIS' as const;

export const ANALYSIS_PERIOD_KINDS = ['quarterly', 'manual'] as const;
export const AnalysisPeriodKindSchema = z.enum(ANALYSIS_PERIOD_KINDS);

export const ANALYSIS_REVISION_EVENT_TYPES = [
  'created',
  'refreshed',
  'saved',
  'mixed_basis_acknowledged',
] as const;
export const AnalysisRevisionEventTypeSchema = z.enum(ANALYSIS_REVISION_EVENT_TYPES);

const PositiveIntSchema = z.number().int().positive();
const IsoDateSchema = z.string().date();
const IsoDateTimeSchema = z.string().datetime();

const DAY_MS = 86_400_000;
const QUARTER_START_MONTHS = [0, 3, 6, 9] as const;

/** UTC `YYYY-MM-DD` for a Date, independent of host timezone. */
function utcIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Midnight-UTC epoch ms for a `YYYY-MM-DD` string. */
function utcDayStart(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

/**
 * The calendar quarter containing `value`, in UTC. Quarter is 1-indexed so that
 * `quarterPeriod(year, quarter)` reads the way a GP says it out loud.
 */
export function quarterOf(value: Date): { year: number; quarter: number } {
  return {
    year: value.getUTCFullYear(),
    quarter: Math.floor(value.getUTCMonth() / 3) + 1,
  };
}

/** The quarter immediately before the given one, rolling the year at Q1. */
export function previousQuarter(year: number, quarter: number): { year: number; quarter: number } {
  return quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 };
}

/** Inclusive UTC date bounds of a calendar quarter. */
export function quarterPeriod(
  year: number,
  quarter: number
): { periodKind: 'quarterly'; periodStart: string; periodEnd: string } {
  const startMonth = QUARTER_START_MONTHS[quarter - 1];
  if (startMonth === undefined) {
    throw new RangeError(`quarter must be 1-4, received ${quarter}`);
  }
  const start = new Date(Date.UTC(year, startMonth, 1));
  // Day 0 of the following quarter's first month is that quarter's last day.
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return { periodKind: 'quarterly', periodStart: utcIsoDate(start), periodEnd: utcIsoDate(end) };
}

/** True when the inclusive bounds are exactly a calendar quarter. */
export function isCalendarQuarterPeriod(periodStart: string, periodEnd: string): boolean {
  const start = new Date(utcDayStart(periodStart));
  if (Number.isNaN(start.getTime())) return false;
  const month = start.getUTCMonth();
  if (start.getUTCDate() !== 1 || !QUARTER_START_MONTHS.includes(month as 0 | 3 | 6 | 9)) {
    return false;
  }
  const expected = quarterPeriod(start.getUTCFullYear(), Math.floor(month / 3) + 1);
  return expected.periodStart === periodStart && expected.periodEnd === periodEnd;
}

/**
 * The `job_outbox` dedupe key for a quarterly draft. The unique
 * `(job_type, dedupe_key)` index makes scheduler replay a no-op, so the planner
 * can insert unconditionally with `onConflictDoNothing`.
 */
export function quarterlyDedupeKey(fundId: number, periodStart: string, periodEnd: string): string {
  return `quarterly:${fundId}:${periodStart}:${periodEnd}`;
}

/**
 * Every calendar quarter that is past due and still inside the catch-up bound,
 * OLDEST FIRST.
 *
 * A quarter becomes due on the first UTC day after its end. The planner returns a
 * LIST, not just the latest, so a process that missed its window still enqueues
 * every period it owes (defect D5).
 *
 * `catchupDays` bounds the lookback so a long outage cannot flood the outbox
 * (R33-b). Note the interaction with quarterly cadence: quarters are ~91 days
 * apart, so the 30-day default normally yields zero or one period. That is
 * intentional -- the manual admin trigger route is the escape hatch for a longer
 * outage, and it accepts an explicit period or a wider lookback.
 */
export function enumerateDueQuarterlyPeriods(
  now: Date,
  catchupDays: number
): Array<{ periodKind: 'quarterly'; periodStart: string; periodEnd: string }> {
  if (!Number.isInteger(catchupDays) || catchupDays < 1) {
    throw new RangeError(`catchupDays must be a positive integer, received ${catchupDays}`);
  }

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const earliestDueUtc = todayUtc - (catchupDays - 1) * DAY_MS;
  const due: Array<{ periodKind: 'quarterly'; periodStart: string; periodEnd: string }> = [];

  let cursor = quarterOf(now);
  // Walk back from the quarter containing `now`. The loop is bounded by the
  // catch-up window; the iteration cap is a runaway guard, not a business rule.
  for (let step = 0; step < 64; step += 1) {
    cursor = previousQuarter(cursor.year, cursor.quarter);
    const period = quarterPeriod(cursor.year, cursor.quarter);
    const dueUtc = utcDayStart(period.periodEnd) + DAY_MS;
    if (dueUtc > todayUtc) continue;
    if (dueUtc < earliestDueUtc) break;
    due.push(period);
  }

  return due.reverse();
}

export const AnalysisPeriodSchema = z
  .object({
    periodKind: AnalysisPeriodKindSchema,
    periodStart: IsoDateSchema,
    periodEnd: IsoDateSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (utcDayStart(value.periodEnd) < utcDayStart(value.periodStart)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodEnd'],
        message: 'periodEnd must be on or after periodStart.',
      });
      return;
    }
    if (
      value.periodKind === 'quarterly' &&
      !isCalendarQuarterPeriod(value.periodStart, value.periodEnd)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodStart'],
        message: 'A quarterly period must span exactly one calendar quarter.',
      });
    }
  });

/**
 * The single coherent basis every pinned component is derived from.
 * `financialFactsSnapshotId` is the anchor: refresh builds ONE snapshot at the new
 * cutoff and rebuilds every consumer from it (defect D6).
 *
 * `forecastFundSnapshotId` points at a `fund_snapshots` row with
 * `type = 'CURRENT_FORECAST_V2'` -- there is no dedicated forecast-run table.
 * Reserve and economics pins stay null until Waves E/F land.
 */
export const AnalysisBasisSchema = z
  .object({
    financialFactsSnapshotId: PositiveIntSchema,
    knowledgeCutoff: IsoDateTimeSchema,
    forecastFundSnapshotId: PositiveIntSchema.nullable(),
    reserveReferenceId: PositiveIntSchema.nullable(),
    economicsReferenceId: PositiveIntSchema.nullable(),
  })
  .strict();

export const AnalysisDraftV1Schema = z
  .object({
    contractVersion: z.literal(ANALYSIS_REFERENCE_CONTRACT_VERSION),
    draftId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    period: AnalysisPeriodSchema,
    basis: AnalysisBasisSchema,
    /** Non-null when this draft is a late correction started from a saved reference. */
    sourceReferenceId: PositiveIntSchema.nullable(),
    /**
     * Non-null once saved; a saved draft is closed to further refresh. The
     * reference it produced is reachable via that reference's `sourceDraftId`.
     */
    savedAt: IsoDateTimeSchema.nullable(),
    /** Monotonic; backs the ETag. Refresh bumps it. */
    version: PositiveIntSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const AnalysisReferenceV1Schema = z
  .object({
    contractVersion: z.literal(ANALYSIS_REFERENCE_CONTRACT_VERSION),
    referenceId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    period: AnalysisPeriodSchema,
    basis: AnalysisBasisSchema,
    /**
     * True when the operator knowingly saved components that did not all resolve
     * to `basis.financialFactsSnapshotId`. Consumers MUST render the warning on
     * every load of the reference, not only at save time (R34-d).
     */
    mixedBasisAtSave: z.boolean(),
    /** The reference this one corrects; null for the first in a chain. */
    supersedesReferenceId: PositiveIntSchema.nullable(),
    sourceDraftId: PositiveIntSchema.nullable(),
    createdBy: PositiveIntSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const AnalysisRevisionEventV1Schema = z
  .object({
    eventId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    draftId: PositiveIntSchema.nullable(),
    referenceId: PositiveIntSchema.nullable(),
    eventType: AnalysisRevisionEventTypeSchema,
    detail: z.record(z.unknown()),
    actorId: PositiveIntSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

/** Manual draft creation. Quarterly drafts come from the outbox planner instead. */
export const AnalysisDraftCreateRequestSchema = z
  .object({
    periodKind: AnalysisPeriodKindSchema.default('manual'),
    periodStart: IsoDateSchema,
    periodEnd: IsoDateSchema,
  })
  .strict();

export const AnalysisDraftRefreshRequestSchema = z.object({}).strict();

export const AnalysisDraftEconomicsReferencePatchRequestSchema = z
  .object({
    economicsReferenceId: PositiveIntSchema.nullable(),
  })
  .strict();

export const AnalysisDraftSaveRequestSchema = z
  .object({
    /**
     * Explicit operator override of the one-basis coherence check. Without it a
     * mixed bundle rejects with MIXED_FACTS_BASIS.
     */
    acknowledgeMixedBasis: z.boolean().default(false),
  })
  .strict();

/** Admin trigger for the quarterly planner: an explicit period, or a wider lookback. */
export const QuarterlyDraftRunRequestSchema = z
  .object({
    periodStart: IsoDateSchema.optional(),
    periodEnd: IsoDateSchema.optional(),
    catchupDays: z.number().int().min(1).max(3650).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.periodStart === undefined) !== (value.periodEnd === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodEnd'],
        message: 'periodStart and periodEnd must be supplied together.',
      });
    }
    if (value.periodStart !== undefined && value.catchupDays !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['catchupDays'],
        message: 'catchupDays cannot be combined with an explicit period.',
      });
    }
  });

export const AnalysisDraftListResponseSchema = z
  .object({ drafts: z.array(AnalysisDraftV1Schema) })
  .strict();

export const AnalysisDraftDetailResponseSchema = z
  .object({ draft: AnalysisDraftV1Schema })
  .strict();

export const AnalysisReferenceListResponseSchema = z
  .object({ references: z.array(AnalysisReferenceV1Schema) })
  .strict();

export const AnalysisReferenceDetailResponseSchema = z
  .object({
    reference: AnalysisReferenceV1Schema,
    revisionHistory: z.array(AnalysisRevisionEventV1Schema),
  })
  .strict();

export const QuarterlyDraftRunResponseSchema = z
  .object({ enqueued: z.number().int().nonnegative(), periods: z.array(AnalysisPeriodSchema) })
  .strict();

export type AnalysisPeriodKind = z.infer<typeof AnalysisPeriodKindSchema>;
export type AnalysisRevisionEventType = z.infer<typeof AnalysisRevisionEventTypeSchema>;
export type AnalysisPeriod = z.infer<typeof AnalysisPeriodSchema>;
export type AnalysisBasis = z.infer<typeof AnalysisBasisSchema>;
export type AnalysisDraftV1 = z.infer<typeof AnalysisDraftV1Schema>;
export type AnalysisReferenceV1 = z.infer<typeof AnalysisReferenceV1Schema>;
export type AnalysisRevisionEventV1 = z.infer<typeof AnalysisRevisionEventV1Schema>;
export type AnalysisDraftCreateRequest = z.output<typeof AnalysisDraftCreateRequestSchema>;
export type AnalysisDraftEconomicsReferencePatchRequest = z.infer<
  typeof AnalysisDraftEconomicsReferencePatchRequestSchema
>;
export type AnalysisDraftSaveRequest = z.output<typeof AnalysisDraftSaveRequestSchema>;
export type QuarterlyDraftRunRequest = z.infer<typeof QuarterlyDraftRunRequestSchema>;
export type AnalysisDraftListResponse = z.infer<typeof AnalysisDraftListResponseSchema>;
export type AnalysisDraftDetailResponse = z.infer<typeof AnalysisDraftDetailResponseSchema>;
export type AnalysisReferenceListResponse = z.infer<typeof AnalysisReferenceListResponseSchema>;
export type AnalysisReferenceDetailResponse = z.infer<typeof AnalysisReferenceDetailResponseSchema>;
export type QuarterlyDraftRunResponse = z.infer<typeof QuarterlyDraftRunResponseSchema>;
