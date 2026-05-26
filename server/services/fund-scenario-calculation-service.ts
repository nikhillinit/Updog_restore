import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioCalculationPayloadV1Schema,
  FundScenarioCalculationResponseV1Schema,
  type FundScenarioCalculationPayloadV1,
  type FundScenarioCalculationResponseV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
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
  verifyFundExists,
  type FundScenarioMutationActor,
} from './fund-scenario-set-service.js';

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

function parseJsonPayload(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return JSON.parse(value) as unknown;
}

function createInputHash(input: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
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
        AND metadata ->> 'input_hash' = $6
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

async function persistScenarioSnapshot(
  client: PoolClient,
  input: {
    fundId: number;
    scenarioSetId: string;
    sourceConfigId: number;
    sourceConfigVersion: number;
    correlationId: string;
    payload: FundScenarioCalculationPayloadV1;
    inputHash: string;
  }
): Promise<FundScenarioCalculationResponseV1> {
  const result = await client.query<SnapshotRow>(
    `INSERT INTO fund_snapshots (
       fund_id,
       type,
       payload,
       calc_version,
       correlation_id,
       metadata,
       snapshot_time,
       config_id,
       config_version,
       scenario_set_id
     )
     VALUES ($1, 'SCENARIOS', $2, $3, $4, $5, NOW(), $6, $7, $8)
     RETURNING id, payload, correlation_id, created_at, snapshot_time`,
    [
      input.fundId,
      input.payload,
      FUND_SCENARIO_CALC_VERSION,
      input.correlationId,
      {
        input_hash: input.inputHash,
        calculation_mode: 'sync_fee_profile',
        timeout_ms: SYNC_CALCULATION_TIMEOUT_MS,
      },
      input.sourceConfigId,
      input.sourceConfigVersion,
      input.scenarioSetId,
    ]
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
    const scenarioSet = await fetchScenarioSetDetail(client, fundId, scenarioSetId);

    if (scenarioSet.archivedAt !== null) {
      throw createHttpError(409, `Scenario set ${scenarioSetId} is archived`, {
        code: 'scenario_set_archived',
      });
    }

    const sourceConfig = await loadSourceConfig(
      client,
      fundId,
      scenarioSet.sourceConfigId,
      scenarioSet.sourceConfigVersion
    );
    const currentPublishedVersion = await loadCurrentPublishedVersion(client, fundId);
    const sourceConfigBody = parseSourceConfig(fundId, sourceConfig);
    const inputHash = createInputHash({
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      currentPublishedVersion,
      calcVersion: FUND_SCENARIO_CALC_VERSION,
      variants: scenarioSet.variants.map((variant) => ({
        id: variant.id,
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
      return reusableSnapshot;
    }

    const startedAt = performance.now();
    const variants = scenarioSet.variants.map((variant) => {
      assertWithinSyncDeadline(startedAt);
      const variantConfig: FundDraftWriteV1 = {
        ...sourceConfigBody,
        feeProfiles: variant.override.payload.feeProfiles,
      };
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

    const response = await persistScenarioSnapshot(client, {
      fundId,
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      correlationId: crypto.randomUUID(),
      payload,
      inputHash,
    });

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
    if (
      currentPublishedVersion != null &&
      currentPublishedVersion > response.payload.sourceConfigVersion
    ) {
      response.payload.staleness.state = 'STALE_PUBLISH';
      response.payload.staleness.currentPublishedConfigVersion = currentPublishedVersion;
    }

    return response;
  });
}
