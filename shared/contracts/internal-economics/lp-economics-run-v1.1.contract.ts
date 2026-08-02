import { z } from 'zod';

import {
  LpEconomicsIrrBasisV1Schema,
  LpEconomicsQuarterRowV1Schema,
  LpEconomicsRunUnavailabilityReasonV1Schema,
  LpEconomicsTotalsV1Schema,
  LpEconomicsWaterfallEventV1Schema,
} from './lp-economics-run-v1.contract';
import { TerminalModeV1Schema } from './terminal-policy-v1.contract';
import { XirrDiagnosticSchema } from '../lp-reporting/lp-metric-run.contract';
import { MoneyDecimalStringSchema, RatioDecimalStringSchema } from '../../lib/decimal-string';

export const LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1 = 'lp-economics/1.1.0' as const;
export const LP_ECONOMICS_RUN_COMMAND_KIND_V1_1 = 'internal-economics-run:create' as const;

export const LpEconomicsRunRequestV1_1Schema = z
  .object({
    policyVersionId: z.number().int().positive(),
    factsSnapshotId: z.number().int().positive(),
    planVersionId: z.number().int().positive(),
    forecastSnapshotId: z.number().int().positive(),
    terminalMode: TerminalModeV1Schema,
    clock: z.string().datetime(),
  })
  .strict();
export type LpEconomicsRunRequestV1_1 = Readonly<z.infer<typeof LpEconomicsRunRequestV1_1Schema>>;

export const LpEconomicsRunIdempotencyPreimageV1_1Schema = z
  .object({
    commandKind: z.literal(LP_ECONOMICS_RUN_COMMAND_KIND_V1_1),
    fundId: z.number().int().positive(),
    contractVersion: z.literal(LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1),
    request: LpEconomicsRunRequestV1_1Schema,
    engineVersion: z.string().min(1),
    methodologyVersion: z.string().min(1),
  })
  .strict();
export type LpEconomicsRunIdempotencyPreimageV1_1 = Readonly<
  z.infer<typeof LpEconomicsRunIdempotencyPreimageV1_1Schema>
>;

export function buildLpEconomicsRunIdempotencyPreimageV1_1(input: {
  readonly fundId: number;
  readonly request: LpEconomicsRunRequestV1_1;
  readonly engineVersion: string;
  readonly methodologyVersion: string;
}): LpEconomicsRunIdempotencyPreimageV1_1 {
  return LpEconomicsRunIdempotencyPreimageV1_1Schema.parse({
    commandKind: LP_ECONOMICS_RUN_COMMAND_KIND_V1_1,
    fundId: input.fundId,
    contractVersion: LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1,
    request: input.request,
    engineVersion: input.engineVersion,
    methodologyVersion: input.methodologyVersion,
  });
}

export const LP_ECONOMICS_INDICATIVE_REASON_CODES_V1_1 = [
  'FLOAT64_WATERFALL_PATH',
  'LP_NET_NAV_FLAT_SHARE_APPROXIMATION',
] as const;

export const LpEconomicsIndicativeReasonCodeV1_1Schema = z.enum(
  LP_ECONOMICS_INDICATIVE_REASON_CODES_V1_1
);
export type LpEconomicsIndicativeReasonCodeV1_1 = z.infer<
  typeof LpEconomicsIndicativeReasonCodeV1_1Schema
>;

const LpEconomicsReasonContextV1_1Schema = z.record(z.string(), z.string());

export const LpEconomicsIndicativeReasonV1_1Schema = z
  .object({
    code: LpEconomicsIndicativeReasonCodeV1_1Schema,
    detail: z.string().min(1).optional(),
    context: LpEconomicsReasonContextV1_1Schema.optional(),
  })
  .strict();
export type LpEconomicsIndicativeReasonV1_1 = Readonly<
  z.infer<typeof LpEconomicsIndicativeReasonV1_1Schema>
>;

const LpEconomicsResultEnvelopeCommonV1_1 = {
  waterfallTemplate: z.literal('deal_by_deal'),
  clock: z.string().datetime(),
  currency: z.literal('USD'),
  perspective: z.literal('lp_net'),
  precisionMode: z.literal('decimal_native_with_float64_xirr'),
} as const;

const LpEconomicsValueResultFieldsV1_1 = {
  quarters: z.array(LpEconomicsQuarterRowV1Schema),
  waterfallEvents: z.array(LpEconomicsWaterfallEventV1Schema),
  totals: LpEconomicsTotalsV1Schema,
  terminalNavBeforeRealizationUsd: MoneyDecimalStringSchema,
  lpNetIrr: RatioDecimalStringSchema.nullable(),
  lpNetIrrBasis: LpEconomicsIrrBasisV1Schema,
  lpNetIrrDiagnostic: XirrDiagnosticSchema,
} as const;

export const LpEconomicsAvailableResultV1_1Schema = z
  .object({
    ...LpEconomicsResultEnvelopeCommonV1_1,
    resultStatus: z.literal('available'),
    ...LpEconomicsValueResultFieldsV1_1,
    reasons: z.tuple([]),
  })
  .strict();
export type LpEconomicsAvailableResultV1_1 = Readonly<
  z.infer<typeof LpEconomicsAvailableResultV1_1Schema>
>;

export const LpEconomicsIndicativeResultV1_1Schema = z
  .object({
    ...LpEconomicsResultEnvelopeCommonV1_1,
    resultStatus: z.literal('indicative'),
    ...LpEconomicsValueResultFieldsV1_1,
    reasons: z.array(LpEconomicsIndicativeReasonV1_1Schema).min(1),
  })
  .strict();
export type LpEconomicsIndicativeResultV1_1 = Readonly<
  z.infer<typeof LpEconomicsIndicativeResultV1_1Schema>
>;

export const LpEconomicsUnavailableResultV1_1Schema = z
  .object({
    ...LpEconomicsResultEnvelopeCommonV1_1,
    resultStatus: z.literal('unavailable'),
    reasons: z.array(LpEconomicsRunUnavailabilityReasonV1Schema).min(1),
  })
  .strict();
export type LpEconomicsUnavailableResultV1_1 = Readonly<
  z.infer<typeof LpEconomicsUnavailableResultV1_1Schema>
>;

export const LpEconomicsResultV1_1Schema = z.discriminatedUnion('resultStatus', [
  LpEconomicsAvailableResultV1_1Schema,
  LpEconomicsIndicativeResultV1_1Schema,
  LpEconomicsUnavailableResultV1_1Schema,
]);
export type LpEconomicsResultV1_1 = Readonly<z.infer<typeof LpEconomicsResultV1_1Schema>>;
