import { z } from 'zod';

import {
  FundCompanyActualsCurrencyStatusSchema,
  Sha256Schema,
} from '../fund-actuals/fund-company-actuals-fact.contract';
import { DecimalStringSchema } from '../lp-reporting/cash-flow-event.contract';
import { StructuredWarningSchema } from '../provenance-envelope.contract';

export const SeededFieldSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('seeded'),
      value: DecimalStringSchema,
      source: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      value: z.null(),
      reason: z.enum(['currency_blocked', 'facts_unavailable', 'source_missing']),
    })
    .strict(),
]);

export const SeededNullableFieldSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('seeded'),
      value: DecimalStringSchema,
      source: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      value: z.null(),
      reason: z.enum(['currency_blocked', 'facts_unavailable', 'no_active_fmv', 'fmv_stale']),
    })
    .strict(),
]);

export const UserRequiredFieldSchema = z
  .object({
    value: z.null(),
    status: z.literal('user_required'),
  })
  .strict();

export const ScenarioCaseSeedV1Schema = z
  .object({
    contractVersion: z.literal('scenario-case-seed-v1'),
    fundId: z.number().int().positive(),
    companyId: z.number().int().positive(),
    asOfDate: z.string().date(),
    factsInputHash: Sha256Schema,
    trustState: z.enum(['LIVE', 'PARTIAL', 'UNAVAILABLE', 'FAILED']),
    currencyStatus: FundCompanyActualsCurrencyStatusSchema,
    fields: z
      .object({
        investment: SeededFieldSchema,
        followOns: SeededFieldSchema,
        fmv: SeededNullableFieldSchema,
        exitValuation: z
          .object({
            value: z.null(),
            status: z.literal('user_required'),
            marketReference: DecimalStringSchema.nullable(),
          })
          .strict(),
        probability: UserRequiredFieldSchema,
        ownershipAtExit: UserRequiredFieldSchema,
      })
      .strict(),
    warnings: z.array(StructuredWarningSchema),
  })
  .strict()
  .superRefine((seed, context) => {
    const monetaryFields = ['investment', 'followOns', 'fmv'] as const;

    if (seed.currencyStatus !== 'base_currency') {
      for (const fieldName of monetaryFields) {
        const field = seed.fields[fieldName];
        if (field.status !== 'unavailable' || field.reason !== 'currency_blocked') {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fields', fieldName],
            message: 'Non-base-currency facts cannot seed monetary fields',
          });
        }
      }
    }

    if (seed.trustState === 'UNAVAILABLE' || seed.trustState === 'FAILED') {
      for (const fieldName of monetaryFields) {
        if (seed.fields[fieldName].status === 'seeded') {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fields', fieldName],
            message: `${seed.trustState} facts cannot seed monetary fields`,
          });
        }
      }
    }

    if (seed.trustState === 'FAILED' && seed.fields.exitValuation.marketReference !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields', 'exitValuation', 'marketReference'],
        message: 'Failed facts cannot disclose a market reference',
      });
    }
  });

export type ScenarioCaseSeedV1 = z.infer<typeof ScenarioCaseSeedV1Schema>;
