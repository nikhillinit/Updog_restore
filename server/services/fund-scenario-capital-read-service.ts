import type { PoolClient } from 'pg';
import {
  FundScenarioCapitalCalculationPayloadSchema,
  FundScenarioCapitalCalculateResponseSchema,
  type FundScenarioCapitalCalculationPayload,
  type FundScenarioCapitalDetailResponse,
  type FundScenarioCapitalResultsResponse,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { canonicalJson, sha256CanonicalJson } from '@shared/lib/canonical-json';
import { createHttpError } from './fund-scenario-set-service';

export interface CapitalSnapshotRow {
  id: number;
  fund_id: number;
  scenario_set_id: string;
  config_id: number;
  config_version: number;
  calc_version: string;
  state_hash: string;
  correlation_id: string;
  payload: unknown;
}

export interface CapitalSavedScenarioContext {
  fundId: number;
  id: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  sourceBundleHash: string;
  interpretationVersion: string;
  baselineVariantId: string;
  variants: ReadonlyArray<
    Pick<
      FundScenarioCapitalDetailResponse['variants'][number],
      'id' | 'scenarioSetId' | 'sortOrder' | 'override'
    >
  >;
}

export type CapitalSavedResult = NonNullable<FundScenarioCapitalResultsResponse['savedResult']>;

function invalidSnapshot(): never {
  throw createHttpError(500, 'Stored capital snapshot identity or payload is invalid', {
    code: 'scenario_saved_data_invalid',
  });
}

/** Decode original persisted bytes using saved context only. */
export function decodeCapitalSavedSnapshot(
  row: CapitalSnapshotRow,
  detail: CapitalSavedScenarioContext
): CapitalSavedResult {
  if (!FundScenarioCapitalCalculationPayloadSchema.safeParse(row.payload).success) {
    invalidSnapshot();
  }
  // A successful parse is evidence of validity, not a replacement payload.
  const payload = row.payload as FundScenarioCapitalCalculationPayload;
  if (
    row.fund_id !== detail.fundId ||
    row.scenario_set_id !== detail.id ||
    row.config_id !== detail.sourceConfigId ||
    row.config_version !== detail.sourceConfigVersion ||
    row.state_hash !== payload.inputHash ||
    row.calc_version !== payload.calculationVersion ||
    payload.fundId !== detail.fundId ||
    payload.scenarioSetId !== detail.id ||
    payload.sourceConfigId !== detail.sourceConfigId ||
    payload.sourceConfigVersion !== detail.sourceConfigVersion ||
    payload.sourceBundleHash !== detail.sourceBundleHash ||
    payload.interpretationVersion !== detail.interpretationVersion ||
    payload.methodVersion !==
      (detail.variants[0]?.override.payload.methodVersion ??
        detail.variants[0]?.override.payload.input.contractVersion) ||
    payload.baselineVariantId !== detail.baselineVariantId ||
    payload.variants.length !== detail.variants.length
  ) {
    invalidSnapshot();
  }
  for (const [index, variant] of payload.variants.entries()) {
    const savedVariant = detail.variants[index];
    const source = variant.result.sourceBundle;
    if (
      !savedVariant ||
      savedVariant.sortOrder !== index ||
      savedVariant.scenarioSetId !== detail.id ||
      variant.variantId !== savedVariant.id ||
      variant.scenarioSetId !== detail.id ||
      canonicalJson(variant.result.input) !== canonicalJson(savedVariant.override.payload.input) ||
      canonicalJson(source) !== canonicalJson(savedVariant.override.payload.sourceBundle) ||
      sha256CanonicalJson(source.projection) !== source.sourceBundleHash ||
      canonicalJson(variant.result.benchmarkSnapshots ?? null) !==
        canonicalJson(savedVariant.override.payload.benchmarkSnapshots ?? null)
    ) {
      invalidSnapshot();
    }
  }
  const savedResult = {
    snapshotId: row.id,
    correlationId: row.correlation_id,
    source: 'fund_snapshots' as const,
    payload,
  };
  if (
    !FundScenarioCapitalCalculateResponseSchema.safeParse({
      contractVersion:
        payload.contractVersion === 'fund-scenario-capital-calculation/2.0.0'
          ? 'fund-scenario-capital-calculate/2.0.0'
          : 'fund-scenario-capital-calculate/1.0.0',
      representation:
        payload.contractVersion === 'fund-scenario-capital-calculation/2.0.0'
          ? 'capital-plan-v2'
          : 'capital-plan-v1',
      ...savedResult,
    }).success
  )
    invalidSnapshot();
  return savedResult as CapitalSavedResult;
}

/** Read and validate persisted results without rebuilding any saved field. */
export async function fetchCapitalSavedSnapshot(
  client: PoolClient,
  detail: FundScenarioCapitalDetailResponse
): Promise<FundScenarioCapitalResultsResponse['savedResult']> {
  const result = await client.query<CapitalSnapshotRow>(
    `SELECT id, fund_id, scenario_set_id, config_id, config_version,
            calc_version, state_hash, correlation_id, payload
       FROM fund_snapshots
      WHERE fund_id = $1 AND scenario_set_id = $2 AND type = 'SCENARIOS'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [detail.fundId, detail.id]
  );
  return result.rows[0] ? decodeCapitalSavedSnapshot(result.rows[0], detail) : null;
}
