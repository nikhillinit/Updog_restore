import { z } from 'zod';

import {
  LP_ECONOMICS_RUN_CONTRACT_VERSION,
  LpEconomicsResultV1Schema,
} from './lp-economics-run-v1.contract';
import {
  LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1,
  LpEconomicsResultV1_1Schema,
} from './lp-economics-run-v1.1.contract';
import { TerminalModeV1Schema } from './terminal-policy-v1.contract';

export const INTERNAL_LP_ECONOMICS_RUN_RECEIPT_VERSION_V1 =
  'internal-lp-economics-run-receipt/1.0.0' as const;

export const ALLOWLISTED_LP_ECONOMICS_FAILURE_CODES_V1 = [
  'FACT_AFTER_CUTOVER',
  'PARTIAL_PROJECTED_PERIOD',
  'SCHEDULE_GRID_MISMATCH',
  'HISTORICAL_RECONCILIATION_MISMATCH',
  'CORE_ROW_MAPPING_MISMATCH',
  'TERMINAL_RECONCILIATION_FAILED',
  'MONOTONICITY_VIOLATION',
  'CARRY_PCT_INVALID',
  'PREF_BEARING_UNSUPPORTED_V1',
  'OPENING_STATE_INVALID',
  'CARRY_RATIO_INVALID',
  'EVENT_INPUT_INVALID',
  'DUPLICATE_EVENT_ID',
  'CONSERVATION_FAILED',
  'UNRETURNED_CAPITAL_MONOTONICITY',
  'FUND_LIFE_GRID_UNREPRESENTABLE',
  'INVARIANT_VIOLATION',
  'NEGATIVE_SCHEDULED_AMOUNT',
  'NONZERO_FEE_EXPENSE_UNSUPPORTED_V1',
  'INVALID_USD_AMOUNT',
  'INVALID_TARGET_CENTS',
  'INVALID_ENTITLEMENT',
  'NEGATIVE_LRM_SHORTFALL',
  'OUTPUT_CONSERVATION_FAILED',
  'FULL_PRECISION_CONSERVATION_FAILED',
] as const;

export const AllowlistedLpEconomicsFailureCodeV1Schema = z.enum(
  ALLOWLISTED_LP_ECONOMICS_FAILURE_CODES_V1
);
export type AllowlistedLpEconomicsFailureCodeV1 = z.infer<
  typeof AllowlistedLpEconomicsFailureCodeV1Schema
>;

export type BoundedJsonSafeFailureValueV1 =
  | null
  | boolean
  | number
  | string
  | BoundedJsonSafeFailureValueV1[]
  | { [key: string]: BoundedJsonSafeFailureValueV1 };
export type BoundedJsonSafeFailureContextV1 = Readonly<
  Record<string, BoundedJsonSafeFailureValueV1>
>;

const FORBIDDEN_FAILURE_CONTEXT_KEY_PARTS = [
  'persistence',
  'actor',
  'createdby',
  'idempotency',
  'requesthash',
  'cache',
  'redis',
  'transaction',
  'storage',
  'snapshotid',
  'snapshottype',
  'correlation',
  'rawrow',
  'replay',
  'xmin',
] as const;

const utf8Length = (value: string): number => new TextEncoder().encode(value).byteLength;
const normalizedKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const JsonPrimitiveSchema: z.ZodType<null | boolean | number | string> = z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string(),
]);

function jsonValueSchemaAtDepth(depth: number): z.ZodType<BoundedJsonSafeFailureValueV1> {
  if (depth === 3) return JsonPrimitiveSchema;
  const next = z.lazy(() => jsonValueSchemaAtDepth(depth + 1));
  const array = z.array(next).max(16);
  const object = z.record(z.string(), next).superRefine(validateContextObject);
  return z.union([JsonPrimitiveSchema, array, object]);
}

function validateContextObject(value: Record<string, unknown>, ctx: z.RefinementCtx): void {
  const keys = Object.keys(value);
  if (keys.length > 16) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Failure context objects may have at most 16 keys.' });
  }
  for (const key of keys) {
    if (key.length < 1 || key.length > 64) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Failure context keys must contain 1-64 characters.' });
    }
    const normalized = normalizedKey(key);
    if (FORBIDDEN_FAILURE_CONTEXT_KEY_PARTS.some((part) => normalized.includes(part))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Failure context contains forbidden metadata.' });
    }
  }
}

const ContextValueSchema = jsonValueSchemaAtDepth(0).superRefine((value, ctx) => {
  if (typeof value === 'string' && utf8Length(value) > 512) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Failure context strings may contain at most 512 UTF-8 bytes.' });
  }
});

function validateStringByteLimits(
  value: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number> = []
): void {
  if (typeof value === 'string') {
    if (utf8Length(value) > 512) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Failure context strings may contain at most 512 UTF-8 bytes.' });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateStringByteLimits(item, ctx, [...path, index]));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    Object.entries(value).forEach(([key, item]) => validateStringByteLimits(item, ctx, [...path, key]));
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export const BoundedJsonSafeFailureContextV1Schema: z.ZodType<BoundedJsonSafeFailureContextV1> = z
  .record(z.string(), ContextValueSchema)
  .superRefine((value, ctx) => {
    validateContextObject(value, ctx);
    validateStringByteLimits(value, ctx);
    if (utf8Length(canonicalJson(value)) > 4096) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Failure context may contain at most 4096 canonical UTF-8 bytes.' });
    }
  });

const CanonicalTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .datetime({ offset: false, precision: 3 });
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const PositiveIdSchema = z.number().int().positive();

const BasisSchema = z
  .object({
    policyVersionId: PositiveIdSchema,
    capitalEnvelopeVersionId: PositiveIdSchema,
    factsSnapshotId: PositiveIdSchema,
    knowledgeCutoff: CanonicalTimestampSchema,
    planVersionId: PositiveIdSchema,
    forecastSnapshotId: PositiveIdSchema,
    evaluationClock: CanonicalTimestampSchema,
    terminalMode: TerminalModeV1Schema,
    terminalPeriodEnd: z.string().date(),
    terminalResolutionMethodologyVersion: z.string().min(1),
  })
  .strict();

const VersionsSchema = z
  .object({
    calculationContractVersion: z.enum([
      LP_ECONOMICS_RUN_CONTRACT_VERSION,
      LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1,
    ]),
    engineVersion: z.string().min(1),
    methodologyVersion: z.string().min(1),
    resultCalculationVersion: z
      .enum([LP_ECONOMICS_RUN_CONTRACT_VERSION, LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1])
      .nullable(),
  })
  .strict();

const HashesSchema = z
  .object({
    capitalEnvelopeHash: Sha256Schema,
    policyAssumptionsHash: Sha256Schema,
    factsSnapshotInputHash: Sha256Schema,
    planAssumptionsHash: Sha256Schema,
    forecastInputHash: Sha256Schema,
    inputHash: Sha256Schema,
    resultHash: Sha256Schema.nullable(),
  })
  .strict();

const OutcomeSchema = z.discriminatedUnion('runState', [
  z
    .object({
      runState: z.literal('completed'),
      result: z.union([LpEconomicsResultV1Schema, LpEconomicsResultV1_1Schema]),
    })
    .strict(),
  z
    .object({
      runState: z.literal('failed'),
      failure: z
        .object({
          code: AllowlistedLpEconomicsFailureCodeV1Schema,
          context: BoundedJsonSafeFailureContextV1Schema,
        })
        .strict(),
    })
    .strict(),
]);

export const InternalLpEconomicsRunReceiptV1Schema = z
  .object({
    receiptVersion: z.literal(INTERNAL_LP_ECONOMICS_RUN_RECEIPT_VERSION_V1),
    runId: PositiveIdSchema,
    fundId: PositiveIdSchema,
    createdAt: CanonicalTimestampSchema,
    basis: BasisSchema,
    versions: VersionsSchema,
    hashes: HashesSchema,
    outcome: OutcomeSchema,
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if (receipt.outcome.runState === 'failed') {
      if (receipt.versions.resultCalculationVersion !== null || receipt.hashes.resultHash !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Failed receipts must not carry result version or hash.' });
      }
      return;
    }

    const resultVersion = receipt.versions.resultCalculationVersion;
    if (resultVersion === null || receipt.hashes.resultHash === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Completed receipts require result version and hash.' });
      return;
    }
    if (resultVersion !== receipt.versions.calculationContractVersion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Calculation and result versions must match exactly.' });
      return;
    }
    const parser = resultVersion === LP_ECONOMICS_RUN_CONTRACT_VERSION
      ? LpEconomicsResultV1Schema
      : LpEconomicsResultV1_1Schema;
    if (!parser.safeParse(receipt.outcome.result).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome', 'result'], message: 'Result does not match its exact calculation version.' });
    }
  });

export type InternalLpEconomicsRunReceiptV1 = Readonly<
  z.infer<typeof InternalLpEconomicsRunReceiptV1Schema>
>;
