import type { PoolClient } from 'pg';
import {
  FundScenarioCapitalCalculationPayloadV1Schema,
  FundScenarioCapitalCalculateResponseV1Schema,
  type FundScenarioCapitalCalculationPayloadV1,
  type FundScenarioCapitalCalculateResponseV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { CAPITAL_PLANNING_PROVISIONAL_LIMITS } from '@shared/contracts/capital-planning-v1.contract';
import { assertCalculationSize } from '@shared/lib/capital-planning/calculation-support';
import { createHttpError } from './fund-scenario-set-service.js';
import {
  decodeCapitalSavedSnapshot,
  type CapitalSavedResult,
  type CapitalSavedScenarioContext,
  type CapitalSnapshotRow,
} from './fund-scenario-capital-read-service.js';

export interface CapitalSnapshotLookupIdentity {
  snapshotId: number;
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  inputHash: string;
  calculationVersion: string;
}

export async function findReusableCapitalScenarioSnapshot(
  client: PoolClient,
  identity: CapitalSnapshotLookupIdentity,
  context: CapitalSavedScenarioContext
): Promise<CapitalSavedResult | null> {
  const result = await client.query<CapitalSnapshotRow>(
    `SELECT id, fund_id, scenario_set_id, config_id, config_version,
            calc_version, state_hash, correlation_id, payload
       FROM fund_snapshots
      WHERE id = $1 AND fund_id = $2 AND scenario_set_id = $3
        AND config_id = $4 AND config_version = $5
        AND state_hash = $6 AND calc_version = $7 AND type = 'SCENARIOS'`,
    [
      identity.snapshotId,
      identity.fundId,
      identity.scenarioSetId,
      identity.sourceConfigId,
      identity.sourceConfigVersion,
      identity.inputHash,
      identity.calculationVersion,
    ]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (
    row.id !== identity.snapshotId ||
    row.state_hash !== identity.inputHash ||
    row.calc_version !== identity.calculationVersion
  ) {
    throw createHttpError(500, 'Stored capital snapshot does not match its run', {
      code: 'scenario_saved_data_invalid',
    });
  }
  return decodeCapitalSavedSnapshot(row, context);
}

export async function persistCapitalScenarioSnapshot(
  client: PoolClient,
  input: {
    payload: FundScenarioCapitalCalculationPayloadV1;
    correlationId: string;
    metadata?: Record<string, unknown>;
  },
  context: CapitalSavedScenarioContext
): Promise<CapitalSavedResult> {
  if (!FundScenarioCapitalCalculationPayloadV1Schema.safeParse(input.payload).success) {
    throw createHttpError(500, 'Capital calculation payload failed validation', {
      code: 'scenario_response_invalid',
    });
  }
  assertCalculationSize(
    input.payload,
    CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxSnapshotBytes,
    'snapshot'
  );
  const payload = input.payload;
  const result = await client.query<CapitalSnapshotRow>(
    `WITH inserted AS (
       INSERT INTO fund_snapshots (
         fund_id, type, payload, calc_version, correlation_id, metadata,
         snapshot_time, config_id, config_version, state_hash, scenario_set_id
       ) VALUES ($1, 'SCENARIOS', $2, $3, $4, $5, NOW(), $6, $7, $8, $9)
       ON CONFLICT (fund_id, scenario_set_id, config_id, config_version, state_hash)
       WHERE type = 'SCENARIOS' AND scenario_set_id IS NOT NULL
         AND config_id IS NOT NULL AND config_version IS NOT NULL AND state_hash IS NOT NULL
       DO NOTHING
       RETURNING id, fund_id, scenario_set_id, config_id, config_version,
                 calc_version, state_hash, correlation_id, payload
     )
     SELECT * FROM inserted
     UNION ALL
     SELECT id, fund_id, scenario_set_id, config_id, config_version,
            calc_version, state_hash, correlation_id, payload
       FROM fund_snapshots
      WHERE fund_id = $1 AND scenario_set_id = $9 AND config_id = $6
        AND config_version = $7 AND state_hash = $8 AND type = 'SCENARIOS'
     LIMIT 1`,
    [
      payload.fundId,
      JSON.stringify(payload),
      payload.calculationVersion,
      input.correlationId,
      input.metadata ?? {},
      payload.sourceConfigId,
      payload.sourceConfigVersion,
      payload.inputHash,
      payload.scenarioSetId,
    ]
  );
  const row = result.rows[0];
  if (!row) {
    throw createHttpError(500, 'Capital snapshot insert did not return an id', {
      code: 'scenario_snapshot_insert_failed',
    });
  }
  if (row.state_hash !== payload.inputHash || row.calc_version !== payload.calculationVersion) {
    throw createHttpError(500, 'Stored capital snapshot does not match its calculation', {
      code: 'scenario_saved_data_invalid',
    });
  }
  return decodeCapitalSavedSnapshot(row, context);
}

/** Call before the owning transaction returns; transport sends these exact bytes. */
export function prepareCapitalCalculateResponse(savedResult: CapitalSavedResult): {
  response: FundScenarioCapitalCalculateResponseV1;
  serializedResponse: string;
} {
  const response = {
    contractVersion: 'fund-scenario-capital-calculate/1.0.0' as const,
    representation: 'capital-plan-v1' as const,
    ...savedResult,
  };
  if (!FundScenarioCapitalCalculateResponseV1Schema.safeParse(response).success) {
    throw createHttpError(500, 'Capital calculation response failed validation', {
      code: 'scenario_response_invalid',
    });
  }
  return { response, serializedResponse: JSON.stringify(response) };
}
