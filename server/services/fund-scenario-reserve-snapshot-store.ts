import type { PoolClient } from 'pg';
import {
  FundScenarioCalculationPayloadV1Schema,
  FundScenarioCalculationResponseV1Schema,
  type FundScenarioCalculationPayloadV1,
  type FundScenarioCalculationResponseV1,
  type FundScenarioResultStalenessStateV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import type { ReserveInputTrustSummary } from '../../shared/contracts/reserve-input-provenance.contract';
import { createHttpError } from './fund-scenario-set-service.js';

export const ASYNC_RESERVE_TIMEOUT_MS = 300_000;
export const FUND_SCENARIO_CALC_VERSION =
  process.env['ALG_FUND_SCENARIO_VERSION'] ?? 'fund-scenarios-v1';

const RESERVE_SCENARIO_SNAPSHOT_UPSERT_SQL = `WITH inserted AS (
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

interface SnapshotRow {
  id: number;
  payload: unknown;
  correlation_id: string;
  created_at: Date | string | null;
  snapshot_time: Date | string | null;
}

export interface ReserveScenarioSnapshotInput {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  correlationId: string;
  payload: FundScenarioCalculationPayloadV1;
  inputHash: string;
  variantCount: number;
  companyCount: number;
  warningCount: number;
  reserveInputTrustSummary: ReserveInputTrustSummary;
}

function parseJsonPayload(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return JSON.parse(value) as unknown;
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

function reserveScenarioSnapshotMetadata(input: ReserveScenarioSnapshotInput) {
  const reserveInputTrustSummaryHash = canonicalSha256({
    kind: 'reserve_input_trust_summary',
    summary: input.reserveInputTrustSummary,
  });

  return {
    input_hash: input.inputHash,
    calculation_mode: 'async_reserve_allocation',
    timeout_ms: ASYNC_RESERVE_TIMEOUT_MS,
    variant_count: input.variantCount,
    company_count: input.companyCount,
    warning_count: input.warningCount,
    override_type: 'reserve_allocation',
    reserve_input_trust_summary: input.reserveInputTrustSummary,
    reserve_input_trust_summary_hash: reserveInputTrustSummaryHash,
  };
}

export function applyScenarioReadStaleness(
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

export async function findReusableReserveScenarioSnapshot(
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

export async function persistReserveScenarioSnapshot(
  client: PoolClient,
  input: ReserveScenarioSnapshotInput
): Promise<FundScenarioCalculationResponseV1> {
  const result = await client.query<SnapshotRow>(RESERVE_SCENARIO_SNAPSHOT_UPSERT_SQL, [
    input.fundId,
    input.payload,
    FUND_SCENARIO_CALC_VERSION,
    input.correlationId,
    reserveScenarioSnapshotMetadata(input),
    input.sourceConfigId,
    input.sourceConfigVersion,
    input.inputHash,
    input.scenarioSetId,
  ]);

  const snapshot = result.rows[0];
  if (!snapshot) {
    throw createHttpError(500, 'Reserve scenario snapshot insert did not return an id', {
      code: 'scenario_snapshot_insert_failed',
    });
  }

  return responseFromSnapshot(snapshot);
}
