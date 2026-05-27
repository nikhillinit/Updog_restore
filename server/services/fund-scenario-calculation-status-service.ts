import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioCalculationStatusV1Schema,
  type FundScenarioCalculationStatusV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { getReserveScenarioCalculationIdentity } from './fund-scenario-reserve-calculation-service.js';

interface SnapshotStatusRow {
  id: number;
  correlation_id: string;
  created_at: Date | string | null;
}

interface EventStatusRow {
  event_type: 'calculation_queued' | 'calculation_started' | 'calculation_failed' | 'calculated';
  change_summary_json: unknown;
  created_at: Date | string | null;
}

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
  eventType: EventStatusRow['event_type']
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

export async function getFundScenarioCalculationStatus(
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioCalculationStatusV1> {
  const identity = await getReserveScenarioCalculationIdentity(fundId, scenarioSetId);

  return transaction(async (client) => {
    const snapshotResult = await client.query<SnapshotStatusRow>(
      `SELECT id, correlation_id, created_at
         FROM fund_snapshots
        WHERE fund_id = $1
          AND scenario_set_id = $2
          AND type = 'SCENARIOS'
          AND metadata ->> 'input_hash' = $3
          AND metadata ->> 'calculation_mode' = 'async_reserve_allocation'
        ORDER BY created_at DESC
        LIMIT 1`,
      [fundId, scenarioSetId, identity.inputHash]
    );
    const eventResult = await client.query<EventStatusRow>(
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
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [fundId, scenarioSetId, identity.inputHash]
    );
    const snapshot = snapshotResult.rows[0];
    const event = eventResult.rows[0];
    const summary = event ? parseChangeSummary(event.change_summary_json) : {};

    if (snapshot) {
      return FundScenarioCalculationStatusV1Schema.parse({
        fundId,
        scenarioSetId,
        calculationMode: 'async_reserve_allocation',
        status: 'succeeded',
        jobId: typeof summary['job_id'] === 'string' ? summary['job_id'] : null,
        correlationId: snapshot.correlation_id,
        snapshotId: snapshot.id,
        lastEventAt: nullableIso(event?.created_at ?? snapshot.created_at),
        lastError: null,
      });
    }

    if (event) {
      return FundScenarioCalculationStatusV1Schema.parse({
        fundId,
        scenarioSetId,
        calculationMode: 'async_reserve_allocation',
        status: eventStatus(event.event_type),
        jobId: typeof summary['job_id'] === 'string' ? summary['job_id'] : null,
        correlationId:
          typeof summary['correlation_id'] === 'string' ? summary['correlation_id'] : null,
        snapshotId: null,
        lastEventAt: nullableIso(event.created_at),
        lastError:
          event.event_type === 'calculation_failed' && typeof summary['error_message'] === 'string'
            ? summary['error_message']
            : null,
      });
    }

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
  });
}
