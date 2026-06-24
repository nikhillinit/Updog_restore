import { z } from 'zod';

import { FinancialProvenanceSchema } from './financial-provenance.contract';

export const DatasetTrustStateSchema = z.enum(['LIVE', 'PARTIAL', 'UNAVAILABLE', 'FAILED']);

export const WarningCodeSchema = z.enum([
  'ROUND_ADAPTER_FAILED',
  'CURRENCY_MISMATCH_BLOCK',
  'DATA_STALE',
  'ROLE_CLASSIFICATION_AMBIGUOUS',
  'ROLE_TOLERANCE_OVERRIDDEN',
  'ROUND_MODEL_OVERRIDE_APPLIED',
  'INVALID_ROUND_AMOUNT',
  'NON_EQUITY_AMOUNT_ONLY',
  'EMPTY_FUND',
]);

export const StructuredWarningSchema = z
  .object({
    code: WarningCodeSchema,
    severity: z.enum(['info', 'warning', 'blocking']),
    message: z.string().min(1),
    source: z.string().min(1).optional(),
  })
  .strict();

function hasWarningCode(
  warnings: Array<z.infer<typeof StructuredWarningSchema>>,
  code: z.infer<typeof WarningCodeSchema>
): boolean {
  return warnings.some((warning) => warning.code === code);
}

function requireHashBoundComputed(
  value: z.infer<typeof FinancialProvenanceSchema>,
  ctx: z.RefinementCtx
): void {
  for (const field of ['inputHash', 'assumptionsHash'] as const) {
    if (!value[field]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['core', field],
        message: `${field} is required for non-FAILED computed provenance envelopes`,
      });
    }
  }
}

export const ProvenanceEnvelopeSchema = z
  .object({
    trustState: DatasetTrustStateSchema,
    core: FinancialProvenanceSchema,
    structuredWarnings: z.array(StructuredWarningSchema),
    sourceAsOf: z.string().datetime().optional(),
    staleAfterSeconds: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.trustState !== 'FAILED' && value.core.sourceKind === 'computed') {
      requireHashBoundComputed(value.core, ctx);
    }

    if (value.trustState === 'LIVE') {
      if (value.core.sourceKind !== 'computed') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'sourceKind'],
          message:
            'PR-D LIVE provenance must be computed; imported_actual LIVE is deferred to PR-E',
        });
      }
      if (!value.core.isFinanciallyActionable || value.core.actionability !== 'actionable') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'actionability'],
          message: 'LIVE provenance must be financially actionable',
        });
      }
      if (value.core.quarantineReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'quarantineReason'],
          message: 'LIVE provenance cannot include quarantineReason',
        });
      }
    }

    if (value.trustState === 'PARTIAL') {
      if (value.core.sourceKind !== 'computed') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'sourceKind'],
          message: 'PARTIAL provenance must be computed',
        });
      }
      if (value.core.isFinanciallyActionable || value.core.actionability !== 'input_only') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'actionability'],
          message: 'PARTIAL provenance must be non-actionable input_only computed evidence',
        });
      }
      if (value.core.quarantineReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'quarantineReason'],
          message: 'PARTIAL provenance cannot include quarantineReason',
        });
      }
      if (value.structuredWarnings.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['structuredWarnings'],
          message: 'PARTIAL provenance requires at least one structured warning',
        });
      }
    }

    if (value.trustState === 'UNAVAILABLE') {
      if (
        value.core.sourceKind !== 'computed' ||
        value.core.actionability !== 'quarantined' ||
        value.core.quarantineReason !== 'currency_mismatch' ||
        !hasWarningCode(value.structuredWarnings, 'CURRENCY_MISMATCH_BLOCK')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['trustState'],
          message:
            'UNAVAILABLE PR-D provenance is reserved for computed currency_mismatch quarantine',
        });
      }
    }

    if (value.trustState === 'FAILED') {
      if (
        value.core.sourceKind !== 'prototype_blocked' ||
        value.core.actionability !== 'non_actionable' ||
        value.core.quarantineReason !== 'round_adapter_failed' ||
        !hasWarningCode(value.structuredWarnings, 'ROUND_ADAPTER_FAILED')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['trustState'],
          message: 'FAILED provenance must be prototype_blocked round_adapter_failed provenance',
        });
      }
    }
  });

export type DatasetTrustState = z.infer<typeof DatasetTrustStateSchema>;
export type WarningCode = z.infer<typeof WarningCodeSchema>;
export type StructuredWarning = z.infer<typeof StructuredWarningSchema>;
export type ProvenanceEnvelope = z.infer<typeof ProvenanceEnvelopeSchema>;
