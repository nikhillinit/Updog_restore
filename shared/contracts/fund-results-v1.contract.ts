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
import { FundStateReadV1Schema } from './fund-state-read-v1.contract';

// ── Section discriminated-union schemas ──

/** Non-available section variant: pending, unavailable, or failed */
export const SectionUnavailableSchema = z
  .object({
    status: z.enum(['pending', 'unavailable', 'failed']),
    reason: z.string(),
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
        // Phase 3: these sections can only be unavailable
        scorecard: SectionUnavailableSchema,
        scenarios: SectionUnavailableSchema,
        waterfall: SectionUnavailableSchema,
      })
      .strict(),
  })
  .strict();

// ── Inferred TypeScript types ──

export type SectionUnavailable = z.infer<typeof SectionUnavailableSchema>;
export type ReserveResultsSection = z.infer<typeof ReserveResultsSectionSchema>;
export type PacingResultsSection = z.infer<typeof PacingResultsSectionSchema>;
export type FundResultsReadV1 = z.infer<typeof FundResultsReadV1Schema>;
