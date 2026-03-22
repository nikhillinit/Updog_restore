/**
 * FundStateReadV1 -- Canonical read contract for GET /api/funds/:id/state
 *
 * Two-axis lifecycle DTO: config publication state and calculation state
 * are kept separate and never conflated. This is the single source of truth
 * for fund lifecycle status.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/fund-state-read-v1.contract
 */

import { z } from 'zod';

/**
 * Snapshot types that must ALL be present (for the published configVersion)
 * before calculation status can be `ready`.
 *
 * IMPORTANT: Changing this constant requires a backfill migration.
 * If a new type is added (e.g. 'COHORT'), all existing funds without that
 * snapshot type will regress to `calculating`. Plan accordingly.
 */
export const EXPECTED_SNAPSHOT_TYPES = ['RESERVE', 'PACING'] as const;

/** Calculation lifecycle status derived from calcRuns + attributed snapshots */
export const CalculationStatusSchema = z.enum([
  'not_requested',
  'submitted',
  'calculating',
  'ready',
  'failed',
]);

/** Config publication axis */
export const ConfigStateSchema = z
  .object({
    /** Highest version number across all configs for this fund */
    latestVersion: z.number().int().nullable(),
    /** Version number of the current draft (null if no draft exists) */
    draftVersion: z.number().int().nullable(),
    /** Version number of the published config (null if never published) */
    publishedVersion: z.number().int().nullable(),
    /** Whether an active draft exists */
    hasDraft: z.boolean(),
    /** Whether a published config exists */
    hasPublished: z.boolean(),
    /** ISO 8601 timestamp when the current published config was published */
    publishedAt: z.string().datetime().nullable(),
    /** ISO 8601 timestamp when the draft was last updated */
    draftUpdatedAt: z.string().datetime().nullable(),
    /** ISO 8601 timestamp when the published config was last updated */
    publishedUpdatedAt: z.string().datetime().nullable(),
  })
  .strict();

/** Calculation lifecycle axis */
export const CalculationStateSchema = z
  .object({
    /** Derived calculation status */
    status: CalculationStatusSchema,
    /** Config version the latest calcRun targets */
    configVersion: z.number().int().nullable(),
    /** calcRun row ID */
    runId: z.number().int().nullable(),
    /** Correlation ID for tracing */
    correlationId: z.string().nullable(),
    /** Raw dispatch state from calcRuns table */
    dispatchState: z.enum(['pending', 'dispatched', 'partial', 'failed']).nullable(),
    /** Snapshot types that have been produced for the published configVersion */
    availableSnapshotTypes: z.array(z.string()),
    /** Snapshot types required for `ready` status */
    expectedSnapshotTypes: z.array(z.string()),
    /** ISO 8601 timestamp of the most recent snapshot calculation */
    lastCalculatedAt: z.string().datetime().nullable(),
    /** Last error from the calcRun (null if no error) */
    lastError: z.string().nullable(),
    /** True when status is derived from unattributed (configVersion=null) snapshots */
    legacyEvidence: z.boolean(),
  })
  .strict();

/** Legacy compatibility fields (read-only, not authoritative) */
export const LegacyStateSchema = z
  .object({
    /** Whether the funds.engineResults column has data */
    engineResultsPresent: z.boolean(),
  })
  .strict();

/** Top-level fund state read DTO */
export const FundStateReadV1Schema = z
  .object({
    fundId: z.number().int(),
    configState: ConfigStateSchema,
    calculationState: CalculationStateSchema,
    legacy: LegacyStateSchema,
  })
  .strict();

export type FundStateReadV1 = z.infer<typeof FundStateReadV1Schema>;
export type CalculationStatus = z.infer<typeof CalculationStatusSchema>;
