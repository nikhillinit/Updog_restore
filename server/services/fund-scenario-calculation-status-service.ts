import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioCalculationStatusV1Schema,
  type FundScenarioCalculationStatusV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import type { PoolClient } from 'pg';
import { getReserveScenarioCalculationIdentity } from './fund-scenario-reserve-calculation-service.js';
import { findCompletedScenarioRun } from './fund-scenario-calculation-run-service.js';

interface SnapshotStatusRow {
  id: number;
  correlation_id: string;
  created_at: Date | string | null;
}

interface EventStatusRow {
  event_type: ScenarioCalculationEventType;
  change_summary_json: unknown;
  created_at: Date | string | null;
}

type ScenarioCalculationEventType =
  | 'calculation_queued'
  | 'calculation_started'
  | 'calculation_failed'
  | 'calculated';

function parseChangeSummary(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  }
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function nullableIso(value: Date | string | null): string | null {
  return value == null ? null : new Date(value).toISOString();
}

function eventStatus(
  eventType: ScenarioCalculationEventType
): FundScenarioCalculationStatusV1['status'] {
  switch (eventType) {
    case 'calculation_queued':
      return 'queued';
    case 'calculation_started':
      return 'calculating';
    case 'calculation_failed':
      return 'failed';
    case 'calculated':
      return 'succeeded';
  }
}

async function findCompletedRunSnapshot(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  snapshotId: number,
  inputHash: string
): Promise<SnapshotStatusRow | null> {
  const result = await client.query<SnapshotStatusRow>(
    `SELECT id, correlation_id, created_at
       FROM fund_snapshots
      WHERE fund_id = $1
        AND id = $2
        AND scenario_set_id = $3
        AND type = 'SCENARIOS'
        AND state_hash = $4
        AND metadata ->> 'calculation_mode' = 'async_reserve_allocation'
      LIMIT 1`,
    [fundId, snapshotId, scenarioSetId, inputHash]
  );

  return result.rows[0] ?? null;
}

async function findLatestScenarioEvent(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  inputHash: string,
  hashKind: 'scenario-input-hash-v1' | 'scenario-input-hash-v2'
): Promise<EventStatusRow | null> {
  const result = await client.query<EventStatusRow>(
    `SELECT event_type, change_summary_json, created_at
       FROM fund_scenario_set_events
      WHERE fund_id = $1
        AND scenario_set_id = $2
        AND event_type IN (
          'calculation_queued',
          'calculation_started',
          'calculation_failed',
          'calculated'
        )
        AND change_summary_json ->> 'input_hash' = $3
        AND COALESCE(
          change_summary_json ->> 'hash_kind',
          'scenario-input-hash-v1'
        ) = $4
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [fundId, scenarioSetId, inputHash, hashKind]
  );

  return result.rows[0] ?? null;
}

function summaryString(summary: Record<string, unknown>, key: string): string | null {
  return typeof summary[key] === 'string' ? summary[key] : null;
}

function failedEventError(event: EventStatusRow, summary: Record<string, unknown>): string | null {
  if (event.event_type !== 'calculation_failed') {
    return null;
  }

  return summaryString(summary, 'error_message');
}

function buildSucceededStatus(input: {
  fundId: number;
  scenarioSetId: string;
  snapshot: SnapshotStatusRow;
  event: EventStatusRow | null;
  summary: Record<string, unknown>;
}): FundScenarioCalculationStatusV1 {
  return FundScenarioCalculationStatusV1Schema.parse({
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    calculationMode: 'async_reserve_allocation',
    status: 'succeeded',
    jobId: summaryString(input.summary, 'job_id'),
    correlationId: input.snapshot.correlation_id,
    snapshotId: input.snapshot.id,
    lastEventAt: nullableIso(input.event?.created_at ?? input.snapshot.created_at),
    lastError: null,
  });
}

function buildEventStatus(input: {
  fundId: number;
  scenarioSetId: string;
  event: EventStatusRow;
  summary: Record<string, unknown>;
}): FundScenarioCalculationStatusV1 {
  return FundScenarioCalculationStatusV1Schema.parse({
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    calculationMode: 'async_reserve_allocation',
    status: eventStatus(input.event.event_type),
    jobId: summaryString(input.summary, 'job_id'),
    correlationId: summaryString(input.summary, 'correlation_id'),
    snapshotId: null,
    lastEventAt: nullableIso(input.event.created_at),
    lastError: failedEventError(input.event, input.summary),
  });
}

function buildNotRequestedStatus(
  fundId: number,
  scenarioSetId: string
): FundScenarioCalculationStatusV1 {
  return FundScenarioCalculationStatusV1Schema.parse({
    fundId,
    scenarioSetId,
    calculationMode: 'async_reserve_allocation',
    status: 'not_requested',
    jobId: null,
    correlationId: null,
    snapshotId: null,
    lastEventAt: null,
    lastError: null,
  });
}

function buildCalculationStatus(input: {
  fundId: number;
  scenarioSetId: string;
  snapshot: SnapshotStatusRow | null;
  event: EventStatusRow | null;
}): FundScenarioCalculationStatusV1 {
  const summary = input.event ? parseChangeSummary(input.event.change_summary_json) : {};

  if (input.snapshot) {
    return buildSucceededStatus({ ...input, snapshot: input.snapshot, summary });
  }

  if (input.event) {
    return buildEventStatus({ ...input, event: input.event, summary });
  }

  return buildNotRequestedStatus(input.fundId, input.scenarioSetId);
}

export async function getFundScenarioCalculationStatus(
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioCalculationStatusV1> {
  const identity = await getReserveScenarioCalculationIdentity(fundId, scenarioSetId);

  return transaction(async (client) => {
    const completedRun = await findCompletedScenarioRun(client, {
      fundId,
      scenarioSetId,
      sourceConfigId: identity.sourceConfigId,
      sourceConfigVersion: identity.sourceConfigVersion,
      calculationMode: 'async_reserve_allocation',
      overrideType: 'reserve_allocation',
      inputHash: identity.inputHash,
      hashKind: identity.inputLineage.hashKind,
      modelInputsAsOfDate: identity.inputLineage.modelInputsAsOfDate,
      comparisonLineageVersion: identity.inputLineage.comparisonLineageVersion,
    });
    const snapshot =
      completedRun?.snapshotId == null
        ? null
        : await findCompletedRunSnapshot(
            client,
            fundId,
            scenarioSetId,
            completedRun.snapshotId,
            identity.inputHash
          );
    const event = await findLatestScenarioEvent(
      client,
      fundId,
      scenarioSetId,
      identity.inputHash,
      identity.inputLineage.hashKind
    );

    return buildCalculationStatus({
      fundId,
      scenarioSetId,
      snapshot,
      event,
    });
  });
}
