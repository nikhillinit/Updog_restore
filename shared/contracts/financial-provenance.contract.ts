import { z } from 'zod';

export const FinancialSourceKindSchema = z.enum([
  'computed',
  'imported_actual',
  'user_assumption',
  'static_template',
  'demo_seed',
  'prototype_blocked',
  'legacy_unknown',
]);

export const FinancialActionabilitySchema = z.enum([
  'actionable',
  'input_only',
  'non_actionable',
  'quarantined',
  'unknown_legacy',
]);

export const FinancialProvenanceSchema = z
  .object({
    sourceKind: FinancialSourceKindSchema,
    actionability: FinancialActionabilitySchema,
    sourceEngine: z.string().min(1).optional(),
    engineVersion: z.string().min(1).optional(),
    calculationVersion: z.string().min(1).optional(),
    inputHash: z.string().min(1).optional(),
    assumptionsHash: z.string().min(1).optional(),
    scenarioHash: z.string().min(1).optional(),
    generatedAt: z.string().datetime(),
    generatedBy: z.union([z.string().min(1), z.number()]).optional(),
    sourceRoute: z.string().min(1).optional(),
    sourceCommitSha: z.string().min(7).optional(),
    isFinanciallyActionable: z.boolean(),
    quarantineReason: z.string().min(1).optional(),
    warnings: z.array(z.string()).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isFinanciallyActionable && value.actionability !== 'actionable') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actionability'],
        message: 'Financially actionable provenance must use actionable actionability',
      });
    }

    if (value.actionability === 'actionable' && !value.isFinanciallyActionable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isFinanciallyActionable'],
        message: 'Actionable provenance must set isFinanciallyActionable to true',
      });
    }

    if (
      value.isFinanciallyActionable &&
      value.sourceKind !== 'computed' &&
      value.sourceKind !== 'imported_actual'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isFinanciallyActionable'],
        message: 'Only computed or imported_actual results may be financially actionable',
      });
    }

    if (value.isFinanciallyActionable && value.sourceKind === 'computed') {
      for (const field of ['sourceEngine', 'engineVersion', 'inputHash', 'assumptionsHash']) {
        if (!value[field as keyof typeof value]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `Computed actionable result requires ${field}`,
          });
        }
      }
    }

    if (
      (value.actionability === 'quarantined' || value.sourceKind === 'prototype_blocked') &&
      !value.quarantineReason
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quarantineReason'],
        message: 'Quarantined or prototype-blocked provenance requires quarantineReason',
      });
    }

    if (value.isFinanciallyActionable && value.quarantineReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quarantineReason'],
        message: 'Financially actionable provenance cannot include quarantineReason',
      });
    }
  });

export type FinancialSourceKind = z.infer<typeof FinancialSourceKindSchema>;
export type FinancialActionability = z.infer<typeof FinancialActionabilitySchema>;
export type FinancialProvenance = z.infer<typeof FinancialProvenanceSchema>;
