import type { PoolClient } from 'pg';
import {
  FundScenarioCapitalCalculationPayloadV1Schema,
  FundScenarioCapitalCalculateResponseV1Schema,
  type FundScenarioCapitalCalculationPayloadV1,
  type FundScenarioCapitalDetailResponseV1,
  type FundScenarioCapitalResultsResponseV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { canonicalJson, sha256CanonicalJson } from '@shared/lib/canonical-json';
import { createHttpError } from './fund-scenario-set-service';

interface CapitalSnapshotRow {
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

const READABLE_INTERPRETATIONS = new Set([
  'capital-source-interpretation/1.0.0',
  'capital-source-interpretation/1.0.1',
]);

function invalidSnapshot(): never {
  throw createHttpError(500, 'Stored capital snapshot identity or payload is invalid', {
    code: 'scenario_saved_data_invalid',
  });
}

/** Read and validate persisted results without rebuilding any saved field. */
export async function fetchCapitalSavedSnapshot(
  client: PoolClient,
  detail: FundScenarioCapitalDetailResponseV1
): Promise<FundScenarioCapitalResultsResponseV1['savedResult']> {
  const result = await client.query<CapitalSnapshotRow>(
    `SELECT id, fund_id, scenario_set_id, config_id, config_version,
            calc_version, state_hash, correlation_id, payload
       FROM fund_snapshots
      WHERE fund_id = $1 AND scenario_set_id = $2 AND type = 'SCENARIOS'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [detail.fundId, detail.id]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!FundScenarioCapitalCalculationPayloadV1Schema.safeParse(row.payload).success) {
    invalidSnapshot();
  }
  // A successful parse is evidence of validity, not a replacement payload.
  const payload = row.payload as FundScenarioCapitalCalculationPayloadV1;
  if (!READABLE_INTERPRETATIONS.has(payload.interpretationVersion)) {
    throw createHttpError(409, 'The saved capital snapshot version is not readable', {
      code: 'scenario_saved_version_unsupported',
    });
  }
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
    !FundScenarioCapitalCalculateResponseV1Schema.safeParse({
      contractVersion: 'fund-scenario-capital-calculate/1.0.0',
      representation: 'capital-plan-v1',
      ...savedResult,
    }).success
  ) {
    invalidSnapshot();
  }
  return savedResult;
}
