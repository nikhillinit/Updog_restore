/**
 * FundResultsReadV1 -- Canonical read contract for GET /api/funds/:id/results
 *
 * Single-shape DTO with per-section discriminated unions. Top-level status
 * is derived from lifecycle calculation state, not section availability.
 * Sections independently advertise available/pending/unavailable/failed.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/fund-results-v1.contract
 */

import { z } from 'zod';
import { EconomicsResultReasonCodeSchema, EconomicsResultV1Schema } from './economics-v1.contract';
import { FundStateReadV1Schema } from './fund-state-read-v1.contract';

// ── Section discriminated-union schemas ──

/** Non-available section variant: pending, unavailable, or failed */
export const SectionUnavailableSchema = z
  .object({
    status: z.enum(['pending', 'unavailable', 'failed']),
    reason: z.string(),
    reasonCode: z
      .enum([
        'NO_PUBLISHED_CONFIG',
        'CALCULATION_PENDING',
        'STALE_EVIDENCE',
        'INVALID_PUBLISHED_CONFIG',
        'NO_AUTHORITATIVE_SOURCE',
      ])
      .optional(),
  })
  .strict();

/** Section payload: reserve calculation results */
export const ReserveResultsSectionSchema = z
  .object({
    totalAllocation: z.number(),
    reserveRatio: z.number(),
    avgConfidence: z.number(),
    allocations: z.array(
      z
        .object({
          allocation: z.number(),
          confidence: z.number(),
          rationale: z.string(),
        })
        .strict()
    ),
  })
  .strict();

/** Section payload: pacing calculation results */
export const PacingResultsSectionSchema = z
  .object({
    deploymentRate: z.number(),
    yearsToFullDeploy: z.number(),
    totalQuarters: z.number(),
    marketCondition: z.enum(['bull', 'bear', 'neutral']),
    deployments: z.array(
      z
        .object({
          quarter: z.number(),
          deployment: z.number(),
          note: z.string(),
        })
        .strict()
    ),
  })
  .strict();

/** Per-field source-tagged fact for scorecard provenance tracking */
const SourcedNumber = (source: string) =>
  z.object({ value: z.number(), source: z.literal(source) }).strict();
const SourcedString = (source: string) =>
  z.object({ value: z.string(), source: z.literal(source) }).strict();

/** Section payload: truthful overview assembled from persisted evidence */
export const ScorecardPayloadSchema = z
  .object({
    fundName: SourcedString('funds'),
    fundSize: SourcedNumber('funds'),
    vintageYear: SourcedNumber('funds').optional(),
    reserveRatio: SourcedNumber('fund_snapshots').optional(),
    avgConfidence: SourcedNumber('fund_snapshots').optional(),
    yearsToFullDeploy: SourcedNumber('fund_snapshots').optional(),
    lastCalculatedAt: SourcedString('fund_state').optional(),
  })
  .strict();

/** Section payload: published waterfall setup summary */
export const WaterfallSetupSectionSchema = z
  .object({
    view: z.literal('setup-summary'),
    type: z.enum(['american', 'hybrid']),
    tierCount: z.number().int().nonnegative(),
    tiers: z.array(
      z
        .object({
          name: z.string(),
          preferredReturn: z.number().nullable(),
          catchUp: z.number().nullable(),
          gpSplit: z.number(),
          lpSplit: z.number(),
          condition: z.enum(['irr', 'moic', 'none']).nullable(),
          conditionValue: z.number().nullable(),
        })
        .strict()
    ),
    recyclingEnabled: z.boolean().nullable(),
    recyclingType: z.enum(['exits', 'fees', 'both']).nullable(),
    recyclingCap: z.number().nullable(),
    recyclingPeriod: z.number().nullable(),
    exitRecyclingRate: z.number().nullable(),
    mgmtFeeRecyclingRate: z.number().nullable(),
    allowFutureRecycling: z.boolean().nullable(),
  })
  .strict();

/**
 * Generic available-section wrapper. Takes a payload schema and returns
 * a strict object schema with status, metadata, and the typed payload.
 */
export function SectionAvailableSchema<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z
    .object({
      status: z.literal('available'),
      calculatedAt: z.string().nullable(),
      source: z.literal('fund_snapshots'),
      legacyEvidence: z.boolean(),
      payload: payloadSchema,
    })
    .strict();
}

// Pre-built section unions for reserve and pacing
const ReserveSectionSchema = z.union([
  SectionAvailableSchema(ReserveResultsSectionSchema),
  SectionUnavailableSchema,
]);

const PacingSectionSchema = z.union([
  SectionAvailableSchema(PacingResultsSectionSchema),
  SectionUnavailableSchema,
]);

const ScorecardSectionSchema = z.union([
  z
    .object({
      status: z.literal('available'),
      payload: ScorecardPayloadSchema,
    })
    .strict(),
  SectionUnavailableSchema,
]);

const WaterfallSectionSchema = z.union([
  z
    .object({
      status: z.literal('available'),
      source: z.literal('fund_config'),
      configVersion: z.number().int(),
      publishedAt: z.string().nullable(),
      payload: WaterfallSetupSectionSchema,
    })
    .strict(),
  SectionUnavailableSchema,
]);

export const EconomicsResultsSectionSchema = z.union([
  z
    .object({
      status: z.literal('available'),
      source: z.literal('fund_snapshots'),
      configVersion: z.number().int(),
      calculatedAt: z.string().nullable(),
      payload: EconomicsResultV1Schema,
    })
    .strict(),
  z
    .object({
      status: z.enum(['pending', 'unavailable', 'failed']),
      reason: z.string(),
      reasonCode: EconomicsResultReasonCodeSchema.optional(),
    })
    .strict(),
]);

/** Top-level fund results read DTO */
export const FundResultsReadV1Schema = z
  .object({
    status: z.enum(['pending', 'calculating', 'ready', 'failed']),
    fundId: z.number().int(),
    fund: z
      .object({
        name: z.string(),
        vintageYear: z.number(),
        size: z.number(),
      })
      .strict(),
    lifecycle: FundStateReadV1Schema,
    sections: z
      .object({
        reserve: ReserveSectionSchema,
        pacing: PacingSectionSchema,
        scorecard: ScorecardSectionSchema,
        scenarios: SectionUnavailableSchema,
        waterfall: WaterfallSectionSchema,
        economics: EconomicsResultsSectionSchema,
      })
      .strict(),
  })
  .strict();

// ── Inferred TypeScript types ──

export type SectionUnavailable = z.infer<typeof SectionUnavailableSchema>;
export type ReserveResultsSection = z.infer<typeof ReserveResultsSectionSchema>;
export type PacingResultsSection = z.infer<typeof PacingResultsSectionSchema>;
export type ScorecardPayload = z.infer<typeof ScorecardPayloadSchema>;
export type WaterfallSetupSection = z.infer<typeof WaterfallSetupSectionSchema>;
export type EconomicsResultsSection = z.infer<typeof EconomicsResultsSectionSchema>;
export type FundResultsReadV1 = z.infer<typeof FundResultsReadV1Schema>;
