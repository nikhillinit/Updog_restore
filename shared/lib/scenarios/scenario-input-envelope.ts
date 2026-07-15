import { canonicalJson, canonicalizeScenarioValue } from './canonicalize';

export const SCENARIO_INPUT_HASH_V1_VERSION = 'scenario-input-hash-v1' as const;
export const SCENARIO_INPUT_HASH_V2_VERSION = 'scenario-input-hash-v2' as const;
export const SCENARIO_INPUT_HASH_VERSION = SCENARIO_INPUT_HASH_V2_VERSION;
export const COMPARISON_LINEAGE_VERSION = 'comparison-lineage-v1' as const;
export const FUND_SCENARIOS_CONTRACT_VERSION = 'fund-scenarios-v1' as const;

export type ScenarioInputHashKind =
  | typeof SCENARIO_INPUT_HASH_V1_VERSION
  | typeof SCENARIO_INPUT_HASH_V2_VERSION;

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
  | 'fee_profile'
  | 'allocation'
  | 'sector_profile'
  | 'methodology'
  | 'reserve_allocation';

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

export type ScenarioInputHashEnvelope =
  | ScenarioInputHashEnvelopeV1
  | ScenarioInputHashEnvelopeV2;

export function normalizeScenarioInputEnvelope(envelope: ScenarioInputHashEnvelope) {
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
