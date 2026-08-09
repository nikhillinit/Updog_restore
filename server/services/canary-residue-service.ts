import { sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { productionFundPredicate } from '../lib/canary-exclusion';
import { funds } from '@shared/schema/fund';

const RELEASE_CANARY_TTL_HOURS_ENV = 'RELEASE_CANARY_TTL_HOURS';

const RESIDUE_CAP_ENV = {
  portfolioCompany: 'RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE',
  fund: 'RELEASE_CANARY_MAX_FUND_RESIDUE',
  fundConfig: 'RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE',
  fundEvent: 'RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE',
  notification: 'RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE',
  total: 'RELEASE_CANARY_MAX_TOTAL_RESIDUE',
} as const;

export type CanaryResidueCounts = {
  portfolioCompany: number;
  fund: number;
  fundConfig: number;
  fundEvent: number;
  notification: number;
  total: number;
};

export type CanaryRuntimePolicy = CanaryResidueCounts & {
  ttlHours: number;
};

export const CANARY_TERMINAL_STATUSES = ['completed', 'failed', 'expired'] as const;
export type CanaryTerminalStatus = (typeof CANARY_TERMINAL_STATUSES)[number];
export const CANARY_TERMINAL_SOURCE_STATUSES = ['created', 'running'] as const;
export type CanaryTerminalSourceStatus = (typeof CANARY_TERMINAL_SOURCE_STATUSES)[number];

export class CanaryResiduePreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanaryResiduePreflightError';
  }
}

export class CanaryResidueCapExceededError extends CanaryResiduePreflightError {
  readonly field: keyof CanaryResidueCounts;
  readonly current: number;
  readonly projected: number;
  readonly limit: number;

  constructor(field: keyof CanaryResidueCounts, current: number, projected: number, limit: number) {
    super(`Release canary ${field} residue cap exceeded`);
    this.name = 'CanaryResidueCapExceededError';
    this.field = field;
    this.current = current;
    this.projected = projected;
    this.limit = limit;
  }
}

export class CanaryRunTransitionConflictError extends Error {
  readonly code = 'CANARY_RUN_TRANSITION_CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'CanaryRunTransitionConflictError';
  }
}

function requiredNonNegativeInteger(name: string): number {
  const raw = process.env[name]?.trim();
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CanaryResiduePreflightError(`${name} is required and must be a non-negative integer`);
  }
  return value;
}

function requiredPositiveNumber(name: string): number {
  const raw = process.env[name]?.trim();
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new CanaryResiduePreflightError(`${name} is required and must be positive`);
  }
  return value;
}

export function readCanaryRuntimePolicy(): CanaryRuntimePolicy {
  return {
    portfolioCompany: requiredNonNegativeInteger(RESIDUE_CAP_ENV.portfolioCompany),
    fund: requiredNonNegativeInteger(RESIDUE_CAP_ENV.fund),
    fundConfig: requiredNonNegativeInteger(RESIDUE_CAP_ENV.fundConfig),
    fundEvent: requiredNonNegativeInteger(RESIDUE_CAP_ENV.fundEvent),
    notification: requiredNonNegativeInteger(RESIDUE_CAP_ENV.notification),
    total: requiredNonNegativeInteger(RESIDUE_CAP_ENV.total),
    ttlHours: requiredPositiveNumber(RELEASE_CANARY_TTL_HOURS_ENV),
  };
}

type SqlExecutor = Pick<typeof db, 'execute'>;

type ResidueRow = Record<keyof CanaryResidueCounts, unknown>;

const canaryFundPredicate = sql`data_origin = 'release_canary'`;

function countQuery(runId?: string): SQL {
  const runFilter = runId === undefined ? sql`` : sql` AND f.canary_run_id = ${runId}`;
  return sql`
    WITH canary_funds AS (
      SELECT f.id
      FROM funds AS f
      WHERE ${canaryFundPredicate}${runFilter}
    )
    SELECT
      (SELECT count(*)::int FROM portfoliocompanies AS pc
       WHERE pc.fund_id IN (SELECT id FROM canary_funds)) AS "portfolioCompany",
      (SELECT count(*)::int FROM funds AS f
       WHERE f.id IN (SELECT id FROM canary_funds)) AS "fund",
      (SELECT count(*)::int FROM fundconfigs AS fc
       WHERE fc.fund_id IN (SELECT id FROM canary_funds)) AS "fundConfig",
      (SELECT count(*)::int FROM fund_events AS fe
       WHERE fe.fund_id IN (SELECT id FROM canary_funds)) AS "fundEvent",
      (SELECT count(*)::int
       FROM capital_call_notification_outbox AS outbox
       JOIN lp_capital_calls AS calls ON calls.id = outbox.capital_call_id
       WHERE calls.fund_id IN (SELECT id FROM canary_funds)) AS "notification"
  `;
}

function numberFromRow(row: Record<string, unknown>, key: keyof CanaryResidueCounts): number {
  return numberFromValue(row[key], key);
}

function numberFromValue(value: unknown, key: string): number {
  const numericValue = Number(value);
  if (!Number.isSafeInteger(numericValue) || numericValue < 0) {
    throw new CanaryResiduePreflightError(
      `Residue count ${key} was not a safe non-negative integer`
    );
  }
  return numericValue;
}

function countsFromRow(row: Record<string, unknown> | undefined): CanaryResidueCounts {
  if (!row) throw new CanaryResiduePreflightError('Residue count query returned no row');
  const counts = {
    portfolioCompany: numberFromRow(row, 'portfolioCompany'),
    fund: numberFromRow(row, 'fund'),
    fundConfig: numberFromRow(row, 'fundConfig'),
    fundEvent: numberFromRow(row, 'fundEvent'),
    notification: numberFromRow(row, 'notification'),
  };
  return { ...counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}

async function readResidueCounts(
  database: SqlExecutor,
  runId?: string
): Promise<CanaryResidueCounts> {
  const result = await database.execute(countQuery(runId));
  return countsFromRow(result.rows[0] as ResidueRow | undefined);
}

export async function preflightCanaryCreation(
  database: SqlExecutor,
  policy: CanaryRuntimePolicy = readCanaryRuntimePolicy()
): Promise<CanaryResidueCounts> {
  try {
    // This probe makes exclusion availability an explicit precondition. A
    // missing data-origin column, broken predicate, or unavailable funds query
    // aborts before any canary row is mutated.
    await database.execute(
      sql`SELECT count(*)::int AS count FROM ${funds} WHERE ${productionFundPredicate()}`
    );
    const current = await readResidueCounts(database);
    const projected: CanaryResidueCounts = {
      ...current,
      fund: current.fund + 1,
      fundConfig: current.fundConfig + 1,
      fundEvent: current.fundEvent + 1,
      total: current.total + 3,
    };

    for (const field of Object.keys(current) as Array<keyof CanaryResidueCounts>) {
      if (projected[field] > policy[field]) {
        throw new CanaryResidueCapExceededError(
          field,
          current[field],
          projected[field],
          policy[field]
        );
      }
    }
    return current;
  } catch (error) {
    if (error instanceof CanaryResiduePreflightError) throw error;
    throw new CanaryResiduePreflightError('Release canary residue exclusion preflight unavailable');
  }
}

export async function reconcileReleaseCanaryRun(
  runId: string,
  database: SqlExecutor = db
): Promise<CanaryResidueCounts> {
  try {
    const counts = await readResidueCounts(database, runId);
    const result = await database.execute(sql`
      UPDATE release_canary_runs
      SET portfolio_company_residue_count = ${counts.portfolioCompany},
          fund_residue_count = ${counts.fund},
          fund_config_residue_count = ${counts.fundConfig},
          fund_event_residue_count = ${counts.fundEvent},
          notification_residue_count = ${counts.notification},
          total_residue_count = ${counts.total},
          updated_at = clock_timestamp()
      WHERE id = ${runId}
    `);
    if (result.rowCount !== 1) {
      throw new CanaryResiduePreflightError('Release canary run reconciliation target not found');
    }
    return counts;
  } catch (error) {
    if (error instanceof CanaryResiduePreflightError) throw error;
    throw new CanaryResiduePreflightError('Release canary residue reconciliation unavailable');
  }
}

type CanaryRunTerminalRow = {
  status: string;
  version: unknown;
  portfolio_company_residue_count: unknown;
  fund_residue_count: unknown;
  fund_config_residue_count: unknown;
  fund_event_residue_count: unknown;
  notification_residue_count: unknown;
  total_residue_count: unknown;
};

function versionFromRow(row: CanaryRunTerminalRow): number {
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new CanaryRunTransitionConflictError('Release canary run version is invalid');
  }
  return version;
}

function countsFromTerminalRow(row: CanaryRunTerminalRow): CanaryResidueCounts {
  return {
    portfolioCompany: numberFromValue(
      row.portfolio_company_residue_count,
      'portfolio_company_residue_count'
    ),
    fund: numberFromValue(row.fund_residue_count, 'fund_residue_count'),
    fundConfig: numberFromValue(row.fund_config_residue_count, 'fund_config_residue_count'),
    fundEvent: numberFromValue(row.fund_event_residue_count, 'fund_event_residue_count'),
    notification: numberFromValue(row.notification_residue_count, 'notification_residue_count'),
    total: numberFromValue(row.total_residue_count, 'total_residue_count'),
  };
}

/** Reconcile residue and terminalize one run atomically with a version fence. */
export async function transitionReleaseCanaryRun(
  runId: string,
  status: CanaryTerminalStatus,
  expectedVersion: number,
  allowedSourceStatuses: readonly CanaryTerminalSourceStatus[],
  database: typeof db = db
): Promise<CanaryResidueCounts> {
  return database.transaction(async (tx) => {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new CanaryRunTransitionConflictError('Expected release canary run version is invalid');
    }
    if (allowedSourceStatuses.length === 0) {
      throw new CanaryRunTransitionConflictError('No release canary source statuses were allowed');
    }

    const currentResult = await tx.execute(sql`
      SELECT status,
             version,
             portfolio_company_residue_count,
             fund_residue_count,
             fund_config_residue_count,
             fund_event_residue_count,
             notification_residue_count,
             total_residue_count
      FROM release_canary_runs
      WHERE id = ${runId}
      FOR UPDATE
    `);
    const current = currentResult.rows[0] as CanaryRunTerminalRow | undefined;
    if (!current) {
      throw new CanaryRunTransitionConflictError('Release canary run was not found');
    }

    const currentStatus = current.status;
    if (currentStatus === 'purged') {
      throw new CanaryRunTransitionConflictError('Purged release canary runs cannot transition');
    }

    if (CANARY_TERMINAL_STATUSES.includes(currentStatus as CanaryTerminalStatus)) {
      if (currentStatus === status) {
        return countsFromTerminalRow(current);
      }
      throw new CanaryRunTransitionConflictError(
        `Release canary run already transitioned to ${currentStatus}`
      );
    }

    if (versionFromRow(current) !== expectedVersion) {
      throw new CanaryRunTransitionConflictError('Release canary run version conflict');
    }
    if (!allowedSourceStatuses.includes(currentStatus as CanaryTerminalSourceStatus)) {
      throw new CanaryRunTransitionConflictError(
        `Release canary run cannot transition from ${currentStatus}`
      );
    }

    const counts = await reconcileReleaseCanaryRun(runId, tx);
    const terminalTimestamp =
      status === 'completed'
        ? sql`completed_at = clock_timestamp(),`
        : status === 'failed'
          ? sql`failed_at = clock_timestamp(),`
          : sql``;
    const result = await tx.execute(sql`
      UPDATE release_canary_runs
      SET status = ${status},
          ${terminalTimestamp}
          version = version + 1,
          updated_at = clock_timestamp()
      WHERE id = ${runId}
        AND version = ${expectedVersion}
        AND status IN (${sql.join(allowedSourceStatuses.map((source) => sql`${source}`), sql`, `)})
    `);
    if (result.rowCount !== 1) {
      throw new CanaryRunTransitionConflictError('Release canary run transition lost its fence');
    }
    return counts;
  });
}
