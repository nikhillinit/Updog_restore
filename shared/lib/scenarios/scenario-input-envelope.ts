import { canonicalJson, canonicalizeScenarioValue } from './canonicalize';

export const SCENARIO_INPUT_HASH_VERSION = 'scenario-input-hash-v1' as const;
export const FUND_SCENARIOS_CONTRACT_VERSION = 'fund-scenarios-v1' as const;

export type ScenarioInputCalculationMode =
  | 'sync_fee_profile'
  | 'sync_allocation'
  | 'sync_sector_profile'
  | 'async_reserve_allocation';
export type ScenarioInputOverrideType =
  | 'fee_profile'
  | 'allocation'
  | 'sector_profile'
  | 'reserve_allocation';

export interface ScenarioInputHashEnvelopeV1 {
  version: typeof SCENARIO_INPUT_HASH_VERSION;
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

export function normalizeScenarioInputEnvelope(envelope: ScenarioInputHashEnvelopeV1) {
  return {
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
}

export function canonicalScenarioInputString(envelope: ScenarioInputHashEnvelopeV1): string {
  return canonicalJson(normalizeScenarioInputEnvelope(envelope));
}
