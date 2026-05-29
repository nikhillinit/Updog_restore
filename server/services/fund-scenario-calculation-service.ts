import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioCalculationPayloadV1Schema,
  FundScenarioCalculationResponseV1Schema,
  ScenarioSetResultSummaryV1Schema,
  type FundScenarioCalculationPayloadV1,
  type FundScenarioCalculationResponseV1,
  type FundScenarioResultStalenessStateV1,
  type FundScenarioVariantOverrideV1,
  type ScenarioSetResultSummaryV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  FUND_SCENARIOS_CONTRACT_VERSION,
  SCENARIO_INPUT_HASH_VERSION,
} from '@shared/lib/scenarios/scenario-input-envelope';
import {
  FundDraftWriteV1Schema,
  type FundDraftWriteV1,
} from '@shared/contracts/fund-draft-write-v1.contract';
import { hasEconomicsAssumptions, runEconomicsModel } from '@shared/lib/economics/economics-engine';
import {
  createHttpError,
  fetchScenarioSetDetail,
  insertScenarioSetEvent,
  normalizeActor,
  parseCount,
  verifyFundExists,
  type FundScenarioMutationActor,
} from './fund-scenario-set-service.js';
import { createScenarioInputHash } from '../lib/scenarios/scenario-input-hash';
import {
  acquireScenarioCalculationRun,
  markScenarioCalculationRunCompleted,
  markScenarioCalculationRunRunning,
} from './fund-scenario-calculation-run-service';

const SYNC_CALCULATION_TIMEOUT_MS = 10_000;
const FUND_SCENARIO_CALC_VERSION = process.env['ALG_FUND_SCENARIO_VERSION'] ?? 'fund-scenarios-v1';

interface SourceConfigRow {
  id: number;
  version: number;
  config: unknown;
}

interface CurrentPublishedConfigRow {
  version: number;
}

interface SnapshotRow {
  id: number;
  payload: unknown;
  correlation_id: string;
  created_at: Date | string | null;
  snapshot_time: Date | string | null;
}

interface AllScenarioResultsRow {
  scenario_set_id: string;
  scenario_set_name: string;
  source_config_id: number;
  source_config_version: number;
  variant_count: string | number;
  snapshot_payload: unknown | null;
}

interface FeeProfileScenarioSnapshotInput {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  correlationId: string;
  payload: FundScenarioCalculationPayloadV1;
  inputHash: string;
}

export type AllScenarioResultsForFund =
  | { kind: 'none_exist' }
  | { kind: 'none_calculated'; scenarioSetCount: number }
  | { kind: 'calculated'; sets: ScenarioSetResultSummaryV1[] };

const STALENESS_ORDER: Record<FundScenarioResultStalenessStateV1, number> = {
  CURRENT: 0,
  UNAVAILABLE: 1,
  CALCULATING: 2,
  STALE_PUBLISH: 3,
  STALE_CONFIG: 4,
  FAILED: 5,
};

function parseJsonPayload(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return JSON.parse(value) as unknown;
}

const INSERT_FEE_PROFILE_SCENARIO_SNAPSHOT_SQL = `WITH inserted AS (
       INSERT INTO fund_snapshots (
       fund_id,
       type,
       payload,
       calc_version,
       correlation_id,
       metadata,
       snapshot_time,
       config_id,
       config_version,
       state_hash,
       scenario_set_id
     )
      VALUES ($1, 'SCENARIOS', $2, $3, $4, $5, NOW(), $6, $7, $8, $9)
      /* fund_snapshots_scenarios_dedup_idx */
      ON CONFLICT (fund_id, scenario_set_id, config_id, config_version, state_hash)
        WHERE type = 'SCENARIOS'
          AND scenario_set_id IS NOT NULL
          AND config_id IS NOT NULL
          AND config_version IS NOT NULL
          AND state_hash IS NOT NULL
      DO NOTHING
      RETURNING id, payload, correlation_id, created_at, snapshot_time
      )
      SELECT id, payload, correlation_id, created_at, snapshot_time FROM inserted
      UNION ALL
      SELECT id, payload, correlation_id, created_at, snapshot_time
        FROM fund_snapshots
       WHERE fund_id = $1
         AND scenario_set_id = $9
         AND config_id = $6
         AND config_version = $7
         AND state_hash = $8
         AND type = 'SCENARIOS'
       ORDER BY created_at DESC
       LIMIT 1`;

function feeProfileScenarioSnapshotParams(input: FeeProfileScenarioSnapshotInput): unknown[] {
  return [
    input.fundId,
    input.payload,
    FUND_SCENARIO_CALC_VERSION,
    input.correlationId,
    {
      input_hash: input.inputHash,
      calculation_mode: 'sync_fee_profile',
      override_type: 'fee_profile',
      timeout_ms: SYNC_CALCULATION_TIMEOUT_MS,
    },
    input.sourceConfigId,
    input.sourceConfigVersion,
    input.inputHash,
    input.scenarioSetId,
  ];
}

function applyScenarioReadStaleness(
  payload: FundScenarioCalculationPayloadV1,
  currentPublishedVersion: number | null
): FundScenarioResultStalenessStateV1 {
  if (
    payload.staleness.state === 'STALE_CONFIG' ||
    payload.staleness.state === 'CALCULATING' ||
    payload.staleness.state === 'FAILED' ||
    payload.staleness.state === 'UNAVAILABLE'
  ) {
    return payload.staleness.state;
  }

  if (currentPublishedVersion != null && currentPublishedVersion > payload.sourceConfigVersion) {
    return 'STALE_PUBLISH';
  }

  return 'CURRENT';
}

function mapScenarioVariantSummary(variant: FundScenarioCalculationPayloadV1['variants'][number]) {
  if (variant.overrideType === 'fee_profile') {
    return {
      variantId: variant.variantId,
      name: variant.name,
      overrideType: variant.overrideType,
      economicsSummary: variant.economics.summary,
    };
  }

  return {
    variantId: variant.variantId,
    name: variant.name,
    overrideType: variant.overrideType,
    reserveSummary: {
      totalScenarioAllocationCents: variant.reserve.totalScenarioAllocationCents,
      totalAllocationDeltaCents: variant.reserve.totalAllocationDeltaCents,
      avgConfidence: variant.reserve.avgConfidence,
      highConfidenceCount: variant.reserve.highConfidenceCount,
      warningCount: variant.reserve.warnings.length,
    },
  };
}

function mapScenarioResultSummary(
  row: AllScenarioResultsRow,
  currentPublishedVersion: number | null
): ScenarioSetResultSummaryV1 {
  const payload = FundScenarioCalculationPayloadV1Schema.parse(
    parseJsonPayload(row.snapshot_payload)
  );
  const staleness = applyScenarioReadStaleness(payload, currentPublishedVersion);

  return ScenarioSetResultSummaryV1Schema.parse({
    scenarioSetId: row.scenario_set_id,
    name: row.scenario_set_name,
    sourceConfigId: row.source_config_id,
    sourceConfigVersion: row.source_config_version,
    currentPublishedConfigVersion: currentPublishedVersion,
    calculatedAt: payload.calculatedAt,
    staleness,
    variantCount: parseCount(row.variant_count),
    variants: payload.variants.map(mapScenarioVariantSummary),
  });
}

export function worstScenarioStaleness(
  states: FundScenarioResultStalenessStateV1[]
): FundScenarioResultStalenessStateV1 {
  if (states.length === 0) {
    return 'UNAVAILABLE';
  }

  return states.reduce<FundScenarioResultStalenessStateV1>(
    (worst, state) => (STALENESS_ORDER[state] > STALENESS_ORDER[worst] ? state : worst),
    'CURRENT'
  );
}

function assertWithinSyncDeadline(startedAt: number): void {
  const elapsedMs = performance.now() - startedAt;
  if (elapsedMs <= SYNC_CALCULATION_TIMEOUT_MS) {
    return;
  }

  throw createHttpError(504, 'Fee-profile scenario calculation exceeded the 10s sync limit', {
    code: 'scenario_calculation_timeout',
    details: { timeoutMs: SYNC_CALCULATION_TIMEOUT_MS },
  });
}

async function loadSourceConfig(
  client: PoolClient,
  fundId: number,
  configId: number,
  configVersion: number
): Promise<SourceConfigRow> {
  const result = await client.query<SourceConfigRow>(
    `SELECT id, version, config
       FROM fundconfigs
      WHERE fund_id = $1
        AND id = $2
        AND version = $3
      LIMIT 1`,
    [fundId, configId, configVersion]
  );

  const sourceConfig = result.rows[0];
  if (!sourceConfig) {
    throw createHttpError(409, `Scenario source config ${configId} could not be loaded`, {
      code: 'scenario_source_config_missing',
      details: { sourceConfigId: configId, sourceConfigVersion: configVersion },
    });
  }

  return sourceConfig;
}

async function loadCurrentPublishedVersion(
  client: PoolClient,
  fundId: number
): Promise<number | null> {
  const result = await client.query<CurrentPublishedConfigRow>(
    `SELECT version
       FROM fundconfigs
      WHERE fund_id = $1
        AND is_published = TRUE
      ORDER BY version DESC
      LIMIT 1`,
    [fundId]
  );

  return result.rows[0]?.version ?? null;
}

function parseSourceConfig(fundId: number, sourceConfig: SourceConfigRow): FundDraftWriteV1 {
  const parsed = FundDraftWriteV1Schema.safeParse(sourceConfig.config);
  if (!parsed.success) {
    throw createHttpError(409, `Scenario source config for fund ${fundId} is invalid`, {
      code: 'scenario_source_config_invalid',
      details: {
        sourceConfigId: sourceConfig.id,
        sourceConfigVersion: sourceConfig.version,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String),
          message: issue.message,
        })),
      },
    });
  }

  if (!hasEconomicsAssumptions(parsed.data)) {
    throw createHttpError(
      409,
      `Scenario source config for fund ${fundId} has no economics assumptions`,
      {
        code: 'scenario_economics_not_configured',
        details: {
          sourceConfigId: sourceConfig.id,
          sourceConfigVersion: sourceConfig.version,
        },
      }
    );
  }

  return parsed.data;
}

function responseFromSnapshot(row: SnapshotRow): FundScenarioCalculationResponseV1 {
  const payload = FundScenarioCalculationPayloadV1Schema.parse(parseJsonPayload(row.payload));
  return FundScenarioCalculationResponseV1Schema.parse({
    snapshotId: row.id,
    correlationId: row.correlation_id,
    source: 'fund_snapshots',
    payload,
  });
}

function withReadTimeStaleness(
  response: FundScenarioCalculationResponseV1,
  currentPublishedVersion: number | null
): FundScenarioCalculationResponseV1 {
  response.payload.staleness.state = applyScenarioReadStaleness(
    response.payload,
    currentPublishedVersion
  );
  response.payload.staleness.currentPublishedConfigVersion = currentPublishedVersion;
  return response;
}

function applyFeeProfileOverride(
  sourceConfig: FundDraftWriteV1,
  override: Extract<FundScenarioVariantOverrideV1, { overrideType: 'fee_profile' }>
): FundDraftWriteV1 {
  const economicsAssumptions = sourceConfig.economicsAssumptions;
  const variantConfig: FundDraftWriteV1 = {
    ...sourceConfig,
    feeProfiles: override.payload.feeProfiles,
  };

  if (economicsAssumptions == null) {
    return variantConfig;
  }

  return {
    ...variantConfig,
    economicsAssumptions: {
      ...economicsAssumptions,
      feeModel: {
        source: 'legacy_fee_profiles',
      },
    },
  };
}

function assertFeeProfileScenarioSet(
  variants: Array<{ override: FundScenarioVariantOverrideV1 }>
): void {
  if (variants.every((variant) => variant.override.overrideType === 'fee_profile')) {
    return;
  }

  throw createHttpError(409, 'Use calculate-reserve for reserve-allocation scenario sets', {
    code: 'scenario_calculation_mode_mismatch',
  });
}

async function findReusableScenarioSnapshot(
  client: PoolClient,
  input: {
    fundId: number;
    scenarioSetId: string;
    sourceConfigId: number;
    sourceConfigVersion: number;
    inputHash: string;
  }
): Promise<FundScenarioCalculationResponseV1 | null> {
  const result = await client.query<SnapshotRow>(
    `SELECT id, payload, correlation_id, created_at, snapshot_time
       FROM fund_snapshots
      WHERE fund_id = $1
        AND scenario_set_id = $2
        AND type = 'SCENARIOS'
        AND config_id = $3
        AND config_version = $4
        AND calc_version = $5
        AND state_hash = $6
      ORDER BY created_at DESC
      LIMIT 1`,
    [
      input.fundId,
      input.scenarioSetId,
      input.sourceConfigId,
      input.sourceConfigVersion,
      FUND_SCENARIO_CALC_VERSION,
      input.inputHash,
    ]
  );

  const snapshot = result.rows[0];
  return snapshot ? responseFromSnapshot(snapshot) : null;
}

export async function persistFeeProfileScenarioSnapshot(
  client: PoolClient,
  input: FeeProfileScenarioSnapshotInput
): Promise<FundScenarioCalculationResponseV1> {
  const result = await client.query<SnapshotRow>(
    INSERT_FEE_PROFILE_SCENARIO_SNAPSHOT_SQL,
    feeProfileScenarioSnapshotParams(input)
  );

  const snapshot = result.rows[0];
  if (!snapshot) {
    throw createHttpError(500, 'Scenario snapshot insert did not return an id', {
      code: 'scenario_snapshot_insert_failed',
    });
  }

  return responseFromSnapshot(snapshot);
}

export async function calculateFundScenarioSet(
  fundId: number,
  scenarioSetId: string,
  actorInput: FundScenarioMutationActor = {}
): Promise<FundScenarioCalculationResponseV1> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const scenarioSet = await fetchScenarioSetDetail(client, fundId, scenarioSetId, {
      forUpdate: true,
    });

    if (scenarioSet.archivedAt !== null) {
      throw createHttpError(409, `Scenario set ${scenarioSetId} is archived`, {
        code: 'scenario_set_archived',
      });
    }
    assertFeeProfileScenarioSet(scenarioSet.variants);

    const sourceConfig = await loadSourceConfig(
      client,
      fundId,
      scenarioSet.sourceConfigId,
      scenarioSet.sourceConfigVersion
    );
    const currentPublishedVersion = await loadCurrentPublishedVersion(client, fundId);
    const sourceConfigBody = parseSourceConfig(fundId, sourceConfig);
    const inputHash = createScenarioInputHash({
      version: SCENARIO_INPUT_HASH_VERSION,
      contractVersion: FUND_SCENARIOS_CONTRACT_VERSION,
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      calculationMode: 'sync_fee_profile',
      overrideType: 'fee_profile',
      engineVersion: FUND_SCENARIO_CALC_VERSION,
      variants: scenarioSet.variants.map((variant) => ({
        variantId: variant.id,
        sortOrder: variant.sortOrder,
        override: variant.override,
      })),
    });

    const reusableSnapshot = await findReusableScenarioSnapshot(client, {
      fundId,
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      inputHash,
    });
    if (reusableSnapshot) {
      return withReadTimeStaleness(reusableSnapshot, currentPublishedVersion);
    }

    const correlationId = crypto.randomUUID();
    const run = await acquireScenarioCalculationRun(client, {
      fundId,
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      calculationMode: 'sync_fee_profile',
      overrideType: 'fee_profile',
      inputHash,
      correlationId,
    });
    if (run.status === 'completed' && run.snapshotId !== null) {
      const completedSnapshot = await findReusableScenarioSnapshot(client, {
        fundId,
        scenarioSetId,
        sourceConfigId: sourceConfig.id,
        sourceConfigVersion: sourceConfig.version,
        inputHash,
      });
      if (completedSnapshot) {
        return withReadTimeStaleness(completedSnapshot, currentPublishedVersion);
      }
    }
    await markScenarioCalculationRunRunning(client, run.id);

    const startedAt = performance.now();
    const variants = scenarioSet.variants.map((variant) => {
      assertWithinSyncDeadline(startedAt);
      if (variant.override.overrideType !== 'fee_profile') {
        throw createHttpError(409, 'Use calculate-reserve for reserve-allocation scenario sets', {
          code: 'scenario_calculation_mode_mismatch',
        });
      }
      const variantConfig = applyFeeProfileOverride(sourceConfigBody, variant.override);
      const economics = runEconomicsModel(variantConfig);
      assertWithinSyncDeadline(startedAt);

      return {
        variantId: variant.id,
        scenarioSetId: variant.scenarioSetId,
        name: variant.name,
        overrideType: variant.override.overrideType,
        economics,
      };
    });

    const calculatedAt = new Date().toISOString();
    const stalenessState =
      currentPublishedVersion != null && currentPublishedVersion > sourceConfig.version
        ? 'STALE_PUBLISH'
        : 'CURRENT';
    const payload = FundScenarioCalculationPayloadV1Schema.parse({
      version: 'fund-scenarios-v1',
      calculationMode: 'sync_fee_profile',
      fundId,
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      staleness: {
        state: stalenessState,
        sourceConfigVersion: sourceConfig.version,
        currentPublishedConfigVersion: currentPublishedVersion,
      },
      calculatedAt,
      variants,
    });

    const response = await persistFeeProfileScenarioSnapshot(client, {
      fundId,
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      correlationId,
      payload,
      inputHash,
    });
    await markScenarioCalculationRunCompleted(client, run.id, response.snapshotId);

    await insertScenarioSetEvent(client, {
      scenarioSetId,
      fundId,
      eventType: 'calculated',
      actor: normalizeActor(actorInput),
      changeSummary: {
        headline: 'Calculated fee-profile scenario set',
        snapshot_id: response.snapshotId,
        variant_count: variants.length,
        source_config_version: sourceConfig.version,
        staleness_state: stalenessState,
      },
    });

    return response;
  });
}

export async function getScenarioResults(
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioCalculationResponseV1 | null> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    await fetchScenarioSetDetail(client, fundId, scenarioSetId);

    const result = await client.query<SnapshotRow>(
      `SELECT id, payload, correlation_id, created_at, snapshot_time
         FROM fund_snapshots
        WHERE fund_id = $1
          AND scenario_set_id = $2
          AND type = 'SCENARIOS'
        ORDER BY created_at DESC
        LIMIT 1`,
      [fundId, scenarioSetId]
    );

    const snapshot = result.rows[0];
    if (!snapshot) {
      return null;
    }

    const response = responseFromSnapshot(snapshot);

    const currentPublishedVersion = await loadCurrentPublishedVersion(client, fundId);
    return withReadTimeStaleness(response, currentPublishedVersion);
  });
}

export async function getAllScenarioResultsForFund(
  fundId: number
): Promise<AllScenarioResultsForFund> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const currentPublishedVersion = await loadCurrentPublishedVersion(client, fundId);

    const result = await client.query<AllScenarioResultsRow>(
      `SELECT
         s.id AS scenario_set_id,
         s.name AS scenario_set_name,
         s.source_config_id,
         s.source_config_version,
         vc.variant_count,
         latest.payload AS snapshot_payload
       FROM fund_scenario_sets s
       JOIN LATERAL (
         SELECT COUNT(*)::int AS variant_count
           FROM fund_scenario_variants v
          WHERE v.scenario_set_id = s.id
       ) vc ON TRUE
       LEFT JOIN LATERAL (
         -- ADR-022 scenario-aware: reads scenario fund_snapshots rows for fund-results scenarios.
         SELECT fs.payload
           FROM fund_snapshots fs
          WHERE fs.fund_id = s.fund_id
            AND fs.scenario_set_id = s.id
            AND fs.type = 'SCENARIOS'
          ORDER BY fs.created_at DESC
          LIMIT 1
       ) latest ON TRUE
      WHERE s.fund_id = $1
        AND s.archived_at IS NULL
      ORDER BY s.updated_at DESC, s.id DESC`,
      [fundId]
    );

    if (result.rows.length === 0) {
      return { kind: 'none_exist' };
    }

    const calculatedRows = result.rows.filter((row) => row.snapshot_payload !== null);
    if (calculatedRows.length === 0) {
      return { kind: 'none_calculated', scenarioSetCount: result.rows.length };
    }

    return {
      kind: 'calculated',
      sets: calculatedRows.map((row) => mapScenarioResultSummary(row, currentPublishedVersion)),
    };
  });
}
