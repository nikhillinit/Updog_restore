import { sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import {
  CurrentForecastV2Schema,
  type CurrentForecastV2,
} from '../../shared/contracts/current-forecast-v2.contract';
import {
  getCurrentForecastReferenceById,
  type CurrentForecastReferenceRecord,
} from './current-forecast-reference-service';

/**
 * Held serving loader (PLAN_61 Task 13.2, P1/D9): resolve the pinned
 * served-pointer head into the ORIGINAL forecast payload it named. A missing
 * pointer head, missing snapshot, or contract-invalid payload throws - the
 * route surfaces an error envelope; the legacy lane is never a fallback.
 */

export type CurrentForecastHeldDatabase = typeof db;

export class CurrentForecastHeldError extends Error {
  constructor(
    readonly code: 'HELD_REFERENCE_MISSING',
    message: string
  ) {
    super(message);
    this.name = 'CurrentForecastHeldError';
  }
}

export interface HeldCurrentForecast {
  reference: CurrentForecastReferenceRecord;
  forecast: CurrentForecastV2;
}

type SnapshotRow = { payload: unknown };

async function executeRows<T>(
  database: { execute: (query: SQL) => Promise<unknown> },
  query: SQL
): Promise<T[]> {
  const result = (await database.execute(query)) as { rows: T[] };
  return result.rows;
}

export async function loadHeldCurrentForecast(params: {
  fundId: number;
  referenceId: number;
  database?: CurrentForecastHeldDatabase;
}): Promise<HeldCurrentForecast> {
  const database = params.database ?? db;

  const reference = await getCurrentForecastReferenceById({
    fundId: params.fundId,
    referenceId: params.referenceId,
    database,
  });
  if (!reference) {
    throw new CurrentForecastHeldError(
      'HELD_REFERENCE_MISSING',
      `current-forecast reference ${params.referenceId} not found for fund ${params.fundId}`
    );
  }

  const rows = await executeRows<SnapshotRow>(
    database,
    sql`
      SELECT payload
      FROM fund_snapshots
      WHERE id = ${reference.fundSnapshotId}
        AND fund_id = ${params.fundId}
        AND type = 'CURRENT_FORECAST_V2'
      LIMIT 1
    `
  );
  const snapshot = rows[0];
  if (!snapshot) {
    throw new CurrentForecastHeldError(
      'HELD_REFERENCE_MISSING',
      `pinned snapshot ${reference.fundSnapshotId} for reference ${reference.id} not found for fund ${params.fundId}`
    );
  }

  const parsed = CurrentForecastV2Schema.safeParse(snapshot.payload);
  if (!parsed.success) {
    throw new CurrentForecastHeldError(
      'HELD_REFERENCE_MISSING',
      `pinned snapshot ${reference.fundSnapshotId} payload failed the current-forecast-v2 contract`
    );
  }

  return { reference, forecast: parsed.data };
}
