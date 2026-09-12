import { canonicalJson, canonicalizeScenarioValue } from './canonicalize';
import { z } from 'zod';
import {
  CAPITAL_PLANNING_VERSION,
  CAPITAL_PREIMAGE_VERSION,
  CapitalHashV1Schema,
  CapitalVersionV1Schema,
  CAPITAL_PLANNING_PROVISIONAL_LIMITS,
  CapitalPathV1Schema,
  CapitalPlanningInputV1Schema,
  type CapitalIssueV1,
  type CapitalPlanningInputV1,
} from '../../contracts/capital-planning-v1.contract';
import { FundScenarioCapitalStoredOverrideV1Schema } from '../../contracts/fund-scenario-sets-v1.contract';

export const SCENARIO_INPUT_HASH_V1_VERSION = 'scenario-input-hash-v1' as const;
export const SCENARIO_INPUT_HASH_V2_VERSION = 'scenario-input-hash-v2' as const;
export const SCENARIO_INPUT_HASH_VERSION = SCENARIO_INPUT_HASH_V2_VERSION;
export const COMPARISON_LINEAGE_VERSION = 'comparison-lineage-v1' as const;
export const FUND_SCENARIOS_CONTRACT_VERSION = 'fund-scenarios-v1' as const;

export function expandedCapitalRows(inputs: readonly CapitalPlanningInputV1[]): number {
  return inputs.reduce(
    (total, input) =>
      total +
      input.allocations.reduce(
        (rows, allocation) =>
          rows +
          allocation.deploymentPeriodYears *
            12 *
            (1 + allocation.followOnRounds.length) *
            (allocation.plannedCompanyCount === undefined ? 1 : 2),
        0
      ),
    0
  );
}

/** Preserve typed capital refusals through nested normalized/draft request unions. */
export function capitalSchemaIssues(
  issues: readonly z.ZodIssue[],
  input: unknown,
  prefix = 'input'
): CapitalIssueV1[] {
  const limits = CAPITAL_PLANNING_PROVISIONAL_LIMITS;
  const leaves: z.ZodIssue[] = [];
  const visit = (issue: z.ZodIssue): void => {
    if (leaves.length >= limits.maxSourceFacts) return;
    if (issue.code === 'invalid_union')
      issue.unionErrors.forEach((error) => error.issues.forEach(visit));
    else leaves.push(issue);
  };
  issues.forEach(visit);
  const safePrefix = CapitalPathV1Schema.safeParse(prefix).success ? prefix : 'input';
  const mapped = leaves.map((issue): CapitalIssueV1 => {
    const suffix = issue.path.reduce<string>(
      (path, part) => (typeof part === 'number' ? `${path}[${part}]` : `${path}.${String(part)}`),
      ''
    );
    const fullPath = `${safePrefix}${suffix}`;
    const value = issue.path.reduce<unknown>(
      (current, part) =>
        current !== null && typeof current === 'object'
          ? (current as Record<string | number, unknown>)[part]
          : undefined,
      input
    );
    const declarationCount = issue.message === 'INPUT_TOO_LARGE: too many unit declarations';
    const rowCount = issue.message === 'INPUT_TOO_LARGE: provisional monthly row ceiling exceeded';
    const timeOrigin =
      issue.message === 'TIME_ORIGIN_UNRESOLVED' ||
      issue.message === 'TIME_ORIGIN_UNRESOLVED: window boundaries must share a month origin';
    const unsupportedPolicy =
      issue.code === 'invalid_union_discriminator' &&
      issue.path[issue.path.length - 2] === 'checkPolicy' &&
      issue.path[issue.path.length - 1] === 'type';
    const unsupportedMapping =
      issue.code === 'unrecognized_keys' &&
      issue.keys.includes('transactionType') &&
      issue.path[issue.path.length - 1] === 'performanceCase' &&
      value !== null &&
      typeof value === 'object' &&
      'transactionType' in value &&
      [
        'secondary',
        'transfer',
        'safe_conversion',
        'note_conversion',
        'warrant_conversion',
        'ownership_only',
        'ambiguous_seniority',
      ].includes(String(value.transactionType));
    const declarationPath = issue.path[issue.path.length - 1];
    const oversizedDeclarationPath =
      issue.code === 'too_big' &&
      issue.type === 'string' &&
      issue.path[issue.path.length - 2] === 'unitDeclarations' &&
      typeof declarationPath === 'string';
    let observed = oversizedDeclarationPath
      ? declarationPath.length
      : typeof value === 'string' || Array.isArray(value)
        ? value.length
        : typeof value === 'number'
          ? value
          : declarationCount && value !== null && typeof value === 'object'
            ? Object.keys(value).length
            : undefined;
    if (rowCount && Array.isArray(value)) {
      const parsedInputs = value.map((variant: unknown) => {
        const payload = (variant as { override?: { payload?: unknown } } | null)?.override?.payload;
        const candidate =
          payload !== null && typeof payload === 'object' && 'input' in payload
            ? payload.input
            : payload;
        return CapitalPlanningInputV1Schema.safeParse(candidate);
      });
      observed = parsedInputs.every((parsed) => parsed.success)
        ? expandedCapitalRows(
            parsedInputs.flatMap((parsed) => (parsed.success ? [parsed.data] : []))
          )
        : undefined;
    }
    const limit = declarationCount
      ? limits.maxDeclarations
      : rowCount
        ? limits.maxExpandedRows
        : issue.code === 'too_big' && typeof issue.maximum === 'number'
          ? issue.maximum
          : undefined;
    const sizeIssue =
      limit !== undefined &&
      observed !== undefined &&
      Number.isSafeInteger(limit) &&
      Number.isSafeInteger(observed) &&
      limit >= 0 &&
      observed > limit;
    return {
      code: sizeIssue
        ? 'INPUT_TOO_LARGE'
        : timeOrigin
          ? 'TIME_ORIGIN_UNRESOLVED'
          : unsupportedMapping
            ? 'INSTRUMENT_MAPPING_UNSUPPORTED'
            : unsupportedPolicy
              ? 'POLICY_UNSUPPORTED'
              : 'INVALID_INPUT',
      path: CapitalPathV1Schema.safeParse(
        unsupportedMapping ? `${fullPath}.transactionType` : fullPath
      ).success
        ? unsupportedMapping
          ? `${fullPath}.transactionType`
          : fullPath
        : safePrefix,
      message: issue.message.slice(0, 2000),
      support: timeOrigin
        ? 'incomplete'
        : unsupportedMapping || unsupportedPolicy
          ? 'unsupported'
          : 'invalid',
      ...(sizeIssue ? { limit, observed } : {}),
    };
  });
  const unique = mapped.filter(
    (issue, index) =>
      mapped.findIndex(
        (other) =>
          other.code === issue.code && other.path === issue.path && other.message === issue.message
      ) === index
  );
  return unique.sort(
    (left, right) => Number(left.code === 'INVALID_INPUT') - Number(right.code === 'INVALID_INPUT')
  );
}

export type ScenarioInputHashKind =
  typeof SCENARIO_INPUT_HASH_V1_VERSION | typeof SCENARIO_INPUT_HASH_V2_VERSION;

export type ScenarioInputLineage =
  | {
      hashKind: typeof SCENARIO_INPUT_HASH_V1_VERSION;
      modelInputsAsOfDate: null;
      comparisonLineageVersion: null;
    }
  | {
      hashKind: typeof SCENARIO_INPUT_HASH_V2_VERSION;
      modelInputsAsOfDate: string;
      comparisonLineageVersion: typeof COMPARISON_LINEAGE_VERSION;
    };

export function resolveScenarioInputLineage(
  modelInputsAsOfDate: string | undefined
): ScenarioInputLineage {
  return modelInputsAsOfDate === undefined
    ? {
        hashKind: SCENARIO_INPUT_HASH_V1_VERSION,
        modelInputsAsOfDate: null,
        comparisonLineageVersion: null,
      }
    : {
        hashKind: SCENARIO_INPUT_HASH_V2_VERSION,
        modelInputsAsOfDate,
        comparisonLineageVersion: COMPARISON_LINEAGE_VERSION,
      };
}

export type ScenarioInputCalculationMode =
  | 'sync_fee_profile'
  | 'sync_allocation'
  | 'sync_sector_profile'
  | 'sync_methodology'
  | 'async_reserve_allocation';
export type ScenarioInputOverrideType =
  'fee_profile' | 'allocation' | 'sector_profile' | 'methodology' | 'reserve_allocation';

interface ScenarioInputHashEnvelopeBase {
  contractVersion: typeof FUND_SCENARIOS_CONTRACT_VERSION;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  calculationMode: ScenarioInputCalculationMode;
  overrideType: ScenarioInputOverrideType;
  engineVersion: string;
  variants: ReadonlyArray<{
    variantId: string;
    sortOrder: number;
    override: unknown;
  }>;
}

export interface ScenarioInputHashEnvelopeV1 extends ScenarioInputHashEnvelopeBase {
  version: typeof SCENARIO_INPUT_HASH_V1_VERSION;
}

export interface ScenarioInputHashEnvelopeV2 extends ScenarioInputHashEnvelopeBase {
  version: typeof SCENARIO_INPUT_HASH_V2_VERSION;
  modelInputsAsOfDate: string;
}

export type ScenarioInputHashEnvelope = ScenarioInputHashEnvelopeV1 | ScenarioInputHashEnvelopeV2;

export function normalizeScenarioInputEnvelope(envelope: ScenarioInputHashEnvelope) {
  const candidate = envelope as unknown as Record<string, unknown>;
  if (
    candidate['calculationMode'] === 'sync_capital_plan' ||
    candidate['overrideType'] === 'capital_plan' ||
    CAPITAL_ONLY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(candidate, key)) ||
    envelope.variants.some(
      ({ override }) =>
        override !== null &&
        typeof override === 'object' &&
        (override as Record<string, unknown>)['overrideType'] === 'capital_plan'
    )
  ) {
    throw new TypeError('Capital fields require the capital scenario input envelope');
  }
  const normalized = {
    version: envelope.version,
    contractVersion: envelope.contractVersion,
    scenarioSetId: envelope.scenarioSetId,
    sourceConfigId: envelope.sourceConfigId,
    sourceConfigVersion: envelope.sourceConfigVersion,
    calculationMode: envelope.calculationMode,
    overrideType: envelope.overrideType,
    engineVersion: envelope.engineVersion,
    variants: [...envelope.variants]
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0)
      )
      .map((variant) => ({
        variantId: variant.variantId,
        sortOrder: variant.sortOrder,
        override: canonicalizeScenarioValue(variant.override) ?? null,
      })),
  };

  return envelope.version === SCENARIO_INPUT_HASH_V2_VERSION
    ? { ...normalized, modelInputsAsOfDate: envelope.modelInputsAsOfDate }
    : normalized;
}

export function canonicalScenarioInputString(envelope: ScenarioInputHashEnvelope): string {
  return canonicalJson(normalizeScenarioInputEnvelope(envelope));
}

const CAPITAL_ONLY_KEYS = [
  'calculationDomain',
  'capitalPreimageVersion',
  'methodVersion',
  'interpretationVersion',
  'baselineVariantId',
  'sourceBundleHash',
  'unitDeclarations',
  'sourceBundle',
  'benchmarkSnapshots',
] as const;

const capitalEnvelopeFields = {
  contractVersion: z.literal(FUND_SCENARIOS_CONTRACT_VERSION),
  fundId: z.number().int().positive(),
  scenarioSetId: z.string().uuid(),
  sourceConfigId: z.number().int().positive(),
  sourceConfigVersion: z.number().int().positive(),
  calculationDomain: z.literal('capital_plan'),
  calculationMode: z.literal('sync_capital_plan'),
  overrideType: z.literal('capital_plan'),
  capitalPreimageVersion: z.literal(CAPITAL_PREIMAGE_VERSION),
  methodVersion: z.literal(CAPITAL_PLANNING_VERSION),
  interpretationVersion: CapitalVersionV1Schema,
  engineVersion: z.string().min(1).max(20),
  baselineVariantId: z.string().uuid(),
  sourceBundleHash: CapitalHashV1Schema,
  variants: z
    .array(
      z
        .object({
          variantId: z.string().uuid(),
          sortOrder: z.number().int().min(0).max(4),
          override: FundScenarioCapitalStoredOverrideV1Schema,
        })
        .strict()
    )
    .min(1)
    .max(5),
};

const CapitalScenarioInputHashEnvelopeSchema = z.discriminatedUnion('version', [
  z
    .object({ ...capitalEnvelopeFields, version: z.literal(SCENARIO_INPUT_HASH_V1_VERSION) })
    .strict(),
  z
    .object({
      ...capitalEnvelopeFields,
      version: z.literal(SCENARIO_INPUT_HASH_V2_VERSION),
      modelInputsAsOfDate: z.string().date(),
    })
    .strict(),
]);

export type CapitalScenarioInputHashEnvelope = Omit<
  z.infer<typeof CapitalScenarioInputHashEnvelopeSchema>,
  'variants'
> & {
  variants: ReadonlyArray<
    z.infer<typeof CapitalScenarioInputHashEnvelopeSchema>['variants'][number]
  >;
} & (
    | { version: typeof SCENARIO_INPUT_HASH_V1_VERSION }
    | { version: typeof SCENARIO_INPUT_HASH_V2_VERSION; modelInputsAsOfDate: string }
  );

/** Saved-only identity: validation never resolves an interpreter or benchmark catalog. */
export function normalizeCapitalScenarioInputEnvelope(envelope: CapitalScenarioInputHashEnvelope) {
  if (!CapitalScenarioInputHashEnvelopeSchema.safeParse(envelope).success) {
    throw new TypeError('Invalid capital scenario input envelope');
  }
  const variants = [...envelope.variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const firstBundle = variants[0]!.override.payload.sourceBundle;
  const businessDate =
    envelope.version === SCENARIO_INPUT_HASH_V2_VERSION ? envelope.modelInputsAsOfDate : null;
  if (
    variants[0]!.variantId !== envelope.baselineVariantId ||
    new Set(variants.map((variant) => variant.variantId)).size !== variants.length ||
    variants.some((variant, index) => {
      const bundle = variant.override.payload.sourceBundle;
      return (
        variant.sortOrder !== index ||
        bundle.sourceBundleHash !== envelope.sourceBundleHash ||
        bundle.projection.fundId !== envelope.fundId ||
        bundle.projection.sourceConfigId !== envelope.sourceConfigId ||
        bundle.projection.sourceConfigVersion !== envelope.sourceConfigVersion ||
        bundle.interpretationVersion !== envelope.interpretationVersion ||
        bundle.modelInputsAsOfDate !== businessDate ||
        canonicalJson(bundle) !== canonicalJson(firstBundle)
      );
    })
  ) {
    throw new TypeError('Capital scenario input identity is inconsistent');
  }
  // Use original validated values, preserving historical optional-field omission.
  return {
    ...envelope,
    ...(envelope.version === SCENARIO_INPUT_HASH_V2_VERSION
      ? { comparisonLineageVersion: COMPARISON_LINEAGE_VERSION }
      : {}),
    variants: variants.map((variant) => ({
      variantId: variant.variantId,
      sortOrder: variant.sortOrder,
      override: canonicalizeScenarioValue(variant.override),
    })),
  };
}

export function canonicalCapitalScenarioInputString(
  envelope: CapitalScenarioInputHashEnvelope
): string {
  return canonicalJson(normalizeCapitalScenarioInputEnvelope(envelope));
}
