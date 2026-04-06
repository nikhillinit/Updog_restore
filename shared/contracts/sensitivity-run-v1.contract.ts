/**
 * SensitivityRunV1 -- Canonical contract for sensitivity analysis runs.
 *
 * Persists the lifecycle of a sensitivity calculation (one-way, two-way,
 * or stress) attached to a fund. The kind/status enums match the CHECK
 * constraints declared in the migration; any change here MUST be mirrored
 * to the SQL CHECK and to the corresponding service guards.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/sensitivity-run-v1.contract
 */

import { z } from 'zod';

export const SensitivityRunKindSchema = z.enum(['one_way', 'two_way', 'stress']);
export const SensitivityRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);

export const SensitivityRunV1Schema = z
  .object({
    id: z.number().int(),
    fundId: z.number().int(),
    kind: SensitivityRunKindSchema,
    status: SensitivityRunStatusSchema,
    /** Caller-supplied parameters; opaque JSONB blob, validated upstream by kind-specific schemas. */
    params: z.unknown(),
    /** Calculation output; null until status transitions to completed. */
    results: z.unknown().nullable(),
    createdBy: z.number().int(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    durationMs: z.number().int().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict();

export type SensitivityRunV1 = z.infer<typeof SensitivityRunV1Schema>;
export type SensitivityRunKind = z.infer<typeof SensitivityRunKindSchema>;
export type SensitivityRunStatus = z.infer<typeof SensitivityRunStatusSchema>;
