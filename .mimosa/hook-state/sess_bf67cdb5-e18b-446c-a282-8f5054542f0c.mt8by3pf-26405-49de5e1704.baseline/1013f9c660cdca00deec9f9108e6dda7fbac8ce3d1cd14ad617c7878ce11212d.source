import { sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import { runWithTransactionFallback } from '../lib/transaction-support';
import {
  FundCalculationModeIdempotencyConflictError,
  FundCalculationModeInProgressError,
  FundCalculationModeVersionConflictError,
  type FundCalculationModeDatabase,
  type FundCalculationModeTransaction,
} from './fund-calculation-mode-service';
import { CURRENT_FORECAST_CALCULATION_KEY } from './current-forecast-calc-mode-resolver';

export const CURRENT_FORECAST_RESUME_ROUTE =
  'POST /api/admin/funds/:fundId/calculation-modes/current-forecast/resume';

type ExecuteResult<T> = { rows: T[] };

async function executeRows<T>(
  executor: Pick<FundCalculationModeTransaction, 'execute'>,
  query: SQL
): Promise<T[]> {
  const result = (await executor.execute(query)) as ExecuteResult<T>;
  return result.rows;
}

export class CurrentForecastResumePreCutoverError extends Error {
  readonly code = 'resume_requires_post_activation';

  constructor(readonly fundId: number) {
    super(`Fund ${fundId} current-forecast cannot resume before activation.`);
    this.name = 'CurrentForecastResumePreCutoverError';
  }
}

export interface CurrentForecastResumeResponse {
  calculationKey: typeof CURRENT_FORECAST_CALCULATION_KEY;
  configuredMode: 'on';
  killSwitchActive: false;
  activatedAt: string;
  cutoverReferenceId: number;
  version: number;
}

type ResumeModeRow = {
  id: number;
  configured_mode: 'off' | 'shadow' | 'on';
  kill_switch_active: boolean;
  activated_at: Date | string | null;
  cutover_reference_id: number | null;
  version: number;
};

type ResumeLedgerRow = {
  request_hash: string;
  response_body: unknown;
  status: 'pending' | 'completed';
};

function responseFromLedger(value: unknown): CurrentForecastResumeResponse {
  const parsed: unknown = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { calculationKey?: unknown }).calculationKey === CURRENT_FORECAST_CALCULATION_KEY &&
    (parsed as { configuredMode?: unknown }).configuredMode === 'on' &&
    (parsed as { killSwitchActive?: unknown }).killSwitchActive === false &&
    typeof (parsed as { activatedAt?: unknown }).activatedAt === 'string' &&
    typeof (parsed as { cutoverReferenceId?: unknown }).cutoverReferenceId === 'number' &&
    typeof (parsed as { version?: unknown }).version === 'number'
  ) {
    return parsed as CurrentForecastResumeResponse;
  }

  throw new Error('Completed current-forecast resume ledger row has an invalid response body');
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Re-arm an already activated current-forecast mode. Resume is recovery only:
 * it never advances or rolls back the served pointer, and it preserves every
 * activation field while clearing held controls in one optimistic write.
 */
export async function resumeCurrentForecast(params: {
  fundId: number;
  expectedVersion: number;
  idempotencyKey: string;
  actorId: number | null;
  database?: FundCalculationModeDatabase;
}): Promise<{ response: CurrentForecastResumeResponse; replayed: boolean }> {
  const database = params.database ?? db;
  const requestHash = canonicalSha256({
    route: CURRENT_FORECAST_RESUME_ROUTE,
    fundId: params.fundId,
    calculationKey: CURRENT_FORECAST_CALCULATION_KEY,
    expectedVersion: params.expectedVersion,
  });

  return runWithTransactionFallback<
    FundCalculationModeDatabase,
    FundCalculationModeTransaction,
    { response: CurrentForecastResumeResponse; replayed: boolean }
  >(database, async (tx) => {
    const claimed = await executeRows<{ id: number }>(
      tx,
      sql`
        INSERT INTO fund_calculation_mode_requests
          (fund_id, calculation_key, idempotency_key, request_hash, created_by, status)
        VALUES
          (${params.fundId}, ${CURRENT_FORECAST_CALCULATION_KEY}, ${params.idempotencyKey}, ${requestHash}, ${params.actorId}, 'pending')
        ON CONFLICT (fund_id, calculation_key, idempotency_key) DO NOTHING
        RETURNING id
      `
    );

    if (claimed.length === 0) {
      const existing = await executeRows<ResumeLedgerRow>(
        tx,
        sql`
          SELECT request_hash, response_body, status
          FROM fund_calculation_mode_requests
          WHERE fund_id = ${params.fundId}
            AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}
            AND idempotency_key = ${params.idempotencyKey}
          LIMIT 1
        `
      );
      const row = existing[0];
      if (!row) {
        throw new Error('Resume idempotency claim conflict did not return an existing request');
      }
      if (row.request_hash !== requestHash) {
        throw new FundCalculationModeIdempotencyConflictError(
          'Idempotency-Key reused with a different current-forecast resume request'
        );
      }
      if (row.status !== 'completed' || row.response_body === null) {
        throw new FundCalculationModeInProgressError();
      }
      return { response: responseFromLedger(row.response_body), replayed: true };
    }

    const modeRows = await executeRows<ResumeModeRow>(
      tx,
      sql`
        SELECT id, configured_mode, kill_switch_active, activated_at, cutover_reference_id, version
        FROM fund_calculation_modes
        WHERE fund_id = ${params.fundId}
          AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}
        FOR UPDATE
      `
    );
    const mode = modeRows[0];
    if (!mode) {
      throw new CurrentForecastResumePreCutoverError(params.fundId);
    }
    if (mode.version !== params.expectedVersion) {
      throw new FundCalculationModeVersionConflictError(params.expectedVersion, mode.version);
    }
    if (mode.activated_at === null || mode.cutover_reference_id === null) {
      throw new CurrentForecastResumePreCutoverError(params.fundId);
    }

    const updated = await executeRows<ResumeModeRow>(
      tx,
      sql`
        UPDATE fund_calculation_modes
        SET configured_mode = 'on',
            kill_switch_active = false,
            version = version + 1,
            updated_by = ${params.actorId},
            updated_at = NOW()
        WHERE id = ${mode.id}
          AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}
          AND version = ${params.expectedVersion}
        RETURNING id, configured_mode, kill_switch_active, activated_at, cutover_reference_id, version
      `
    );
    const updatedMode = updated[0];
    if (
      !updatedMode ||
      updatedMode.activated_at === null ||
      updatedMode.cutover_reference_id === null
    ) {
      throw new FundCalculationModeVersionConflictError(params.expectedVersion, mode.version);
    }

    const response: CurrentForecastResumeResponse = {
      calculationKey: CURRENT_FORECAST_CALCULATION_KEY,
      configuredMode: 'on',
      killSwitchActive: false,
      activatedAt: toIsoString(updatedMode.activated_at),
      cutoverReferenceId: updatedMode.cutover_reference_id,
      version: updatedMode.version,
    };
    // In neon-http fallback mode each statement autocommits. The atomic
    // INSERT..ON CONFLICT claim and version-guarded UPDATE preserve safety;
    // a crash between them leaves a pending ledger row, surfaced as
    // FundCalculationModeInProgressError and recoverable with a fresh key
    // after refetching the current mode version.
    await tx.execute(sql`
      UPDATE fund_calculation_mode_requests
      SET status = 'completed',
          response_status = 200,
          response_body = ${JSON.stringify(response)}::jsonb
      WHERE fund_id = ${params.fundId}
        AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}
        AND idempotency_key = ${params.idempotencyKey}
    `);

    return { response, replayed: false };
  });
}
