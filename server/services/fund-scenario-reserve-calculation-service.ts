import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioCalculationPayloadV1Schema,
  FundScenarioCalculationResponseV1Schema,
  type FundScenarioCalculationResponseV1,
  type FundScenarioResultStalenessStateV1,
  type FundScenarioSetDetailV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { buildReservePortfolioInputForClient } from './reserve-input-builder';
import { buildScenarioReserveSummary } from './fund-scenario-reserve-summary';
import {
  createHttpError,
  fetchScenarioSetDetail,
  insertScenarioSetEvent,
  normalizeActor,
  verifyFundExists,
  type FundScenarioMutationActor,
} from './fund-scenario-set-service.js';

const ASYNC_RESERVE_TIMEOUT_MS = 300_000;
const FUND_SCENARIO_CALC_VERSION = process.env['ALG_FUND_SCENARIO_VERSION'] ?? 'fund-scenarios-v1';

interface SourceConfigRow {
  id: number;
  version: number;
}

interface CurrentPublishedConfigRow {
  version: number;
}

interface FundSizeRow {
  size: string | number;
}

interface SnapshotRow {
  id: number;
  payload: unknown;
  correlation_id: string;
  created_at: Date | string | null;
  snapshot_time: Date | string | null;
}

export interface ReserveScenarioCalculationIdentity {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  currentPublishedConfigVersion: number | null;
  inputHash: string;
  variantCount: number;
}

export function createReserveScenarioInputHash(input: {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  calcVersion: string;
  calculationMode: 'async_reserve_allocation';
  variants: Array<{
    id: string;
    override: unknown;
  }>;
}): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        fundId: input.fundId,
        scenarioSetId: input.scenarioSetId,
        sourceConfigId: input.sourceConfigId,
        sourceConfigVersion: input.sourceConfigVersion,
        calcVersion: input.calcVersion,
        calculationMode: input.calculationMode,
        variants: input.variants
          .map((variant) => ({
            id: variant.id,
            override: variant.override,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      })
    )
    .digest('hex');
}

function parseJsonPayload(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return JSON.parse(value) as unknown;
}

function applyScenarioReadStaleness(
  response: FundScenarioCalculationResponseV1,
  currentPublishedVersion: number | null
): FundScenarioCalculationResponseV1 {
  const state = response.payload.staleness.state;
  const nextState: FundScenarioResultStalenessStateV1 =
    state === 'STALE_CONFIG' ||
    state === 'CALCULATING' ||
    state === 'FAILED' ||
    state === 'UNAVAILABLE'
      ? state
      : currentPublishedVersion != null &&
          currentPublishedVersion > response.payload.sourceConfigVersion
        ? 'STALE_PUBLISH'
        : 'CURRENT';

  response.payload.staleness.state = nextState;
  response.payload.staleness.currentPublishedConfigVersion = currentPublishedVersion;
  return response;
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

function assertReserveScenarioSet(scenarioSet: FundScenarioSetDetailV1): void {
  if (
    scenarioSet.variants.every((variant) => variant.override.overrideType === 'reserve_allocation')
  ) {
    return;
  }

  throw createHttpError(409, 'Use calculate for fee-profile scenario sets', {
    code: 'scenario_calculation_mode_mismatch',
  });
}

async function loadSourceConfig(
  client: PoolClient,
  fundId: number,
  configId: number,
  configVersion: number
): Promise<SourceConfigRow> {
  const result = await client.query<SourceConfigRow>(
    `SELECT id, version
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

async function loadFundSizeCents(client: PoolClient, fundId: number): Promise<number | null> {
  const result = await client.query<FundSizeRow>('SELECT size FROM funds WHERE id = $1 LIMIT 1', [
    fundId,
  ]);
  const size = result.rows[0]?.size;
  if (size == null) {
    return null;
  }
  const parsed = typeof size === 'number' ? size : Number.parseFloat(size);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

async function loadReserveScenarioIdentityInTransaction(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  options: { forUpdate?: boolean } = {}
): Promise<{
  scenarioSet: FundScenarioSetDetailV1;
  sourceConfig: SourceConfigRow;
  currentPublishedVersion: number | null;
  inputHash: string;
}> {
  await verifyFundExists(client, fundId);
  const scenarioSetOptions =
    options.forUpdate === undefined ? undefined : { forUpdate: options.forUpdate };
  const scenarioSet = await fetchScenarioSetDetail(
    client,
    fundId,
    scenarioSetId,
    scenarioSetOptions
  );
  assertReserveScenarioSet(scenarioSet);

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
  const inputHash = createReserveScenarioInputHash({
    fundId,
    scenarioSetId,
    sourceConfigId: sourceConfig.id,
    sourceConfigVersion: sourceConfig.version,
    calcVersion: FUND_SCENARIO_CALC_VERSION,
    calculationMode: 'async_reserve_allocation',
    variants: scenarioSet.variants.map((variant) => ({
      id: variant.id,
      override: variant.override,
    })),
  });

  return { scenarioSet, sourceConfig, currentPublishedVersion, inputHash };
}

export async function getReserveScenarioCalculationIdentity(
  fundId: number,
  scenarioSetId: string
): Promise<ReserveScenarioCalculationIdentity> {
  return transaction(async (client) => {
    const { scenarioSet, sourceConfig, currentPublishedVersion, inputHash } =
      await loadReserveScenarioIdentityInTransaction(client, fundId, scenarioSetId);

    return {
      fundId,
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      currentPublishedConfigVersion: currentPublishedVersion,
      inputHash,
      variantCount: scenarioSet.variants.length,
    };
  });
}

async function findReusableReserveScenarioSnapshot(
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
        AND metadata ->> 'calculation_mode' = 'async_reserve_allocation'
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

async function persistReserveScenarioSnapshot(
  client: PoolClient,
  input: {
    fundId: number;
    scenarioSetId: string;
    sourceConfigId: number;
    sourceConfigVersion: number;
    correlationId: string;
    payload: unknown;
    inputHash: string;
    variantCount: number;
    companyCount: number;
    warningCount: number;
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
      ON CONFLICT (fund_id, scenario_set_id)
      WHERE scenario_set_id IS NOT NULL AND type = 'SCENARIOS'
      DO UPDATE SET
        payload = EXCLUDED.payload,
        calc_version = EXCLUDED.calc_version,
        correlation_id = EXCLUDED.correlation_id,
        metadata = EXCLUDED.metadata,
        snapshot_time = EXCLUDED.snapshot_time,
        config_id = EXCLUDED.config_id,
        config_version = EXCLUDED.config_version,
        created_at = NOW()
      RETURNING id, payload, correlation_id, created_at, snapshot_time`,
    [
      input.fundId,
      input.payload,
      FUND_SCENARIO_CALC_VERSION,
      input.correlationId,
      {
        input_hash: input.inputHash,
        calculation_mode: 'async_reserve_allocation',
        timeout_ms: ASYNC_RESERVE_TIMEOUT_MS,
        variant_count: input.variantCount,
        company_count: input.companyCount,
        warning_count: input.warningCount,
        override_type: 'reserve_allocation',
      },
      input.sourceConfigId,
      input.sourceConfigVersion,
      input.scenarioSetId,
    ]
  );

  const snapshot = result.rows[0];
  if (!snapshot) {
    throw createHttpError(500, 'Reserve scenario snapshot insert did not return an id', {
      code: 'scenario_snapshot_insert_failed',
    });
  }

  return responseFromSnapshot(snapshot);
}

async function recordCalculationFailedEvent(input: {
  fundId: number;
  scenarioSetId: string;
  actor: FundScenarioMutationActor;
  correlationId: string;
  jobId: string | null;
  inputHash: string | null;
  error: unknown;
}): Promise<void> {
  try {
    await transaction(async (client) => {
      await insertScenarioSetEvent(client, {
        scenarioSetId: input.scenarioSetId,
        fundId: input.fundId,
        eventType: 'calculation_failed',
        actor: normalizeActor(input.actor),
        changeSummary: {
          headline: 'Reserve scenario calculation failed',
          calculation_mode: 'async_reserve_allocation',
          correlation_id: input.correlationId,
          job_id: input.jobId,
          input_hash: input.inputHash,
          error_message: input.error instanceof Error ? input.error.message : String(input.error),
        },
      });
    });
  } catch {
    // Preserve the original calculation failure.
  }
}

export async function runReserveScenarioCalculation(input: {
  fundId: number;
  scenarioSetId: string;
  correlationId: string;
  actor: FundScenarioMutationActor;
  jobId: string | null;
}): Promise<FundScenarioCalculationResponseV1> {
  let inputHashForFailure: string | null = null;

  try {
    return await transaction(async (client) => {
      const { scenarioSet, sourceConfig, currentPublishedVersion, inputHash } =
        await loadReserveScenarioIdentityInTransaction(client, input.fundId, input.scenarioSetId, {
          forUpdate: true,
        });
      inputHashForFailure = inputHash;
      const reusableSnapshot = await findReusableReserveScenarioSnapshot(client, {
        fundId: input.fundId,
        scenarioSetId: input.scenarioSetId,
        sourceConfigId: sourceConfig.id,
        sourceConfigVersion: sourceConfig.version,
        inputHash,
      });

      if (reusableSnapshot) {
        return applyScenarioReadStaleness(reusableSnapshot, currentPublishedVersion);
      }

      await insertScenarioSetEvent(client, {
        scenarioSetId: input.scenarioSetId,
        fundId: input.fundId,
        eventType: 'calculation_started',
        actor: normalizeActor(input.actor),
        changeSummary: {
          headline: 'Started reserve scenario calculation',
          calculation_mode: 'async_reserve_allocation',
          correlation_id: input.correlationId,
          job_id: input.jobId,
          input_hash: inputHash,
        },
      });

      const portfolio = await buildReservePortfolioInputForClient(client, input.fundId);
      const fundSizeCents = await loadFundSizeCents(client, input.fundId);
      const variants = scenarioSet.variants.map((variant) => {
        if (variant.override.overrideType !== 'reserve_allocation') {
          throw createHttpError(409, 'Use calculate for fee-profile scenario sets', {
            code: 'scenario_calculation_mode_mismatch',
          });
        }

        return {
          variantId: variant.id,
          scenarioSetId: variant.scenarioSetId,
          name: variant.name,
          overrideType: variant.override.overrideType,
          reserve: buildScenarioReserveSummary({
            fundId: input.fundId,
            fundSizeCents,
            portfolio,
            override: variant.override,
          }),
        };
      });
      const warningCount = variants.reduce(
        (sum, variant) => sum + variant.reserve.warnings.length,
        0
      );
      const calculatedAt = new Date().toISOString();
      const stalenessState =
        currentPublishedVersion != null && currentPublishedVersion > sourceConfig.version
          ? 'STALE_PUBLISH'
          : 'CURRENT';
      const payload = FundScenarioCalculationPayloadV1Schema.parse({
        version: 'fund-scenarios-v1',
        calculationMode: 'async_reserve_allocation',
        fundId: input.fundId,
        scenarioSetId: input.scenarioSetId,
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

      const response = await persistReserveScenarioSnapshot(client, {
        fundId: input.fundId,
        scenarioSetId: input.scenarioSetId,
        sourceConfigId: sourceConfig.id,
        sourceConfigVersion: sourceConfig.version,
        correlationId: input.correlationId,
        payload,
        inputHash,
        variantCount: variants.length,
        companyCount: portfolio.length,
        warningCount,
      });

      await insertScenarioSetEvent(client, {
        scenarioSetId: input.scenarioSetId,
        fundId: input.fundId,
        eventType: 'calculated',
        actor: normalizeActor(input.actor),
        changeSummary: {
          headline: 'Calculated reserve scenario set',
          calculation_mode: 'async_reserve_allocation',
          correlation_id: input.correlationId,
          job_id: input.jobId,
          input_hash: inputHash,
          snapshot_id: response.snapshotId,
          variant_count: variants.length,
          company_count: portfolio.length,
          warning_count: warningCount,
          source_config_version: sourceConfig.version,
          staleness_state: stalenessState,
        },
      });

      return response;
    });
  } catch (error) {
    await recordCalculationFailedEvent({
      fundId: input.fundId,
      scenarioSetId: input.scenarioSetId,
      actor: input.actor,
      correlationId: input.correlationId,
      jobId: input.jobId,
      inputHash: inputHashForFailure,
      error,
    });
    throw error;
  }
}
