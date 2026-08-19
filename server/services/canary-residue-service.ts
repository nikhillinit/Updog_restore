import { sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { productionFundPredicate } from '../lib/canary-exclusion';
import { funds } from '@shared/schema/fund';
import { RELEASE_CANARY_RESERVED_RESIDUE } from '@shared/contracts/release-canary-residue-characterization-v1.contract';

export { RELEASE_CANARY_RESERVED_RESIDUE };

const RELEASE_CANARY_TTL_HOURS_ENV = 'RELEASE_CANARY_TTL_HOURS';

const RESIDUE_CAP_ENV = {
  portfolioCompany: 'RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE',
  fund: 'RELEASE_CANARY_MAX_FUND_RESIDUE',
  fundConfig: 'RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE',
  fundEvent: 'RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE',
  notification: 'RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE',
  grant: 'RELEASE_CANARY_MAX_GRANT_RESIDUE',
  calculation: 'RELEASE_CANARY_MAX_CALCULATION_RESIDUE',
  mutationReceipt: 'RELEASE_CANARY_MAX_MUTATION_RECEIPT_RESIDUE',
  scenario: 'RELEASE_CANARY_MAX_SCENARIO_RESIDUE',
  reporting: 'RELEASE_CANARY_MAX_REPORTING_RESIDUE',
  total: 'RELEASE_CANARY_MAX_TOTAL_RESIDUE',
} as const;

export type CanaryResidueCounts = {
  portfolioCompany: number;
  fund: number;
  fundConfig: number;
  fundEvent: number;
  notification: number;
  grant: number;
  calculation: number;
  mutationReceipt: number;
  scenario: number;
  reporting: number;
  total: number;
};

export type CanaryResidueGroup = Exclude<keyof CanaryResidueCounts, 'total'>;

/**
 * Authoritative group-to-table mapping shared by the counting service, the
 * residue assertion script, and the purge script. Fund scoping:
 * - 'id': the funds row itself;
 * - 'fund_id': direct fund_id column;
 * - { via, on }: one join hop to a direct fund_id parent.
 */
export const CANARY_RESIDUE_GROUP_TABLES: Readonly<
  Record<
    CanaryResidueGroup,
    ReadonlyArray<{
      table: string;
      scope: 'id' | 'fund_id' | { via: string; on: string };
    }>
  >
> = Object.freeze({
  portfolioCompany: [{ table: 'portfoliocompanies', scope: 'fund_id' }],
  fund: [{ table: 'funds', scope: 'id' }],
  fundConfig: [{ table: 'fundconfigs', scope: 'fund_id' }],
  fundEvent: [{ table: 'fund_events', scope: 'fund_id' }],
  notification: [
    {
      table: 'capital_call_notification_outbox',
      scope: { via: 'lp_capital_calls', on: 'capital_call_id' },
    },
  ],
  grant: [{ table: 'user_fund_grants', scope: 'fund_id' }],
  calculation: [
    { table: 'calc_runs', scope: 'fund_id' },
    { table: 'fund_snapshots', scope: 'fund_id' },
  ],
  mutationReceipt: [
    { table: 'portfolio_company_update_receipts', scope: 'fund_id' },
    { table: 'fund_scenario_calculation_commands', scope: 'fund_id' },
  ],
  scenario: [
    { table: 'fund_scenario_sets', scope: 'fund_id' },
    {
      table: 'fund_scenario_variants',
      scope: { via: 'fund_scenario_sets', on: 'scenario_set_id' },
    },
    { table: 'fund_scenario_set_events', scope: 'fund_id' },
    { table: 'fund_scenario_calculation_runs', scope: 'fund_id' },
  ],
  reporting: [
    { table: 'planning_fmv_override_requests', scope: 'fund_id' },
    { table: 'valuation_marks', scope: 'fund_id' },
    { table: 'reconciliation_runs', scope: 'fund_id' },
    { table: 'lp_metric_runs', scope: 'fund_id' },
    { table: 'evidence_records', scope: 'fund_id' },
    { table: 'narrative_runs', scope: 'fund_id' },
    { table: 'lp_report_packages', scope: 'fund_id' },
    { table: 'lp_report_package_exports', scope: 'fund_id' },
  ],
});

export const CANARY_RESIDUE_GROUPS = Object.freeze(
  Object.keys(CANARY_RESIDUE_GROUP_TABLES)
) as readonly CanaryResidueGroup[];

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

export class CanaryActiveRunError extends CanaryResiduePreflightError {
  readonly runId: string;
  readonly runStatus: string;
  readonly expired: boolean;

  constructor(runId: string, runStatus: string, expired: boolean) {
    super(
      expired
        ? 'Release canary run is nonterminal past its TTL and requires reconciliation'
        : 'Another release canary run is still active'
    );
    this.name = 'CanaryActiveRunError';
    this.runId = runId;
    this.runStatus = runStatus;
    this.expired = expired;
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
  const value = raw === undefined || raw === '' ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CanaryResiduePreflightError(`${name} is required and must be a non-negative integer`);
  }
  return value;
}

function requiredPositiveNumber(name: string): number {
  const raw = process.env[name]?.trim();
  const value = raw === undefined || raw === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new CanaryResiduePreflightError(`${name} is required and must be positive`);
  }
  return value;
}

export function readCanaryRuntimePolicy(): CanaryRuntimePolicy {
  const groupCaps = Object.fromEntries(
    CANARY_RESIDUE_GROUPS.map((group) => [group, requiredNonNegativeInteger(RESIDUE_CAP_ENV[group])])
  ) as Record<CanaryResidueGroup, number>;
  const total = requiredNonNegativeInteger(RESIDUE_CAP_ENV.total);
  const groupCapSum = CANARY_RESIDUE_GROUPS.reduce((sum, group) => sum + groupCaps[group], 0);
  if (total !== groupCapSum) {
    throw new CanaryResiduePreflightError(
      `${RESIDUE_CAP_ENV.total} must equal the sum of the ten group caps ` +
        `(configured total ${total}, group sum ${groupCapSum})`
    );
  }
  return {
    ...groupCaps,
    total,
    ttlHours: requiredPositiveNumber(RELEASE_CANARY_TTL_HOURS_ENV),
  };
}

type SqlExecutor = Pick<typeof db, 'execute'>;

type ResidueRow = Record<keyof CanaryResidueCounts, unknown>;

const canaryFundPredicate = sql`data_origin = 'release_canary'`;

function tableCountSql(entry: {
  table: string;
  scope: 'id' | 'fund_id' | { via: string; on: string };
}): SQL {
  const table = sql.raw(entry.table);
  if (entry.scope === 'id') {
    return sql`(SELECT count(*)::int FROM ${table} AS t
       WHERE t.id IN (SELECT id FROM canary_funds))`;
  }
  if (entry.scope === 'fund_id') {
    return sql`(SELECT count(*)::int FROM ${table} AS t
       WHERE t.fund_id IN (SELECT id FROM canary_funds))`;
  }
  const parent = sql.raw(entry.scope.via);
  const joinColumn = sql.raw(entry.scope.on);
  return sql`(SELECT count(*)::int FROM ${table} AS t
       JOIN ${parent} AS p ON p.id = t.${joinColumn}
       WHERE p.fund_id IN (SELECT id FROM canary_funds))`;
}

function groupCountSql(group: CanaryResidueGroup): SQL {
  const parts = CANARY_RESIDUE_GROUP_TABLES[group].map((entry) => tableCountSql(entry));
  return sql.join(parts, sql` + `);
}

function countQuery(runId?: string): SQL {
  const runFilter = runId === undefined ? sql`` : sql` AND f.canary_run_id = ${runId}`;
  const selections = CANARY_RESIDUE_GROUPS.map(
    (group) => sql`${groupCountSql(group)} AS ${sql.raw(`"${group}"`)}`
  );
  return sql`
    WITH canary_funds AS (
      SELECT f.id
      FROM funds AS f
      WHERE ${canaryFundPredicate}${runFilter}
    )
    SELECT
      ${sql.join(selections, sql`,
      `)}
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
  const counts = Object.fromEntries(
    CANARY_RESIDUE_GROUPS.map((group) => [group, numberFromRow(row, group)])
  ) as Record<CanaryResidueGroup, number>;
  const total = CANARY_RESIDUE_GROUPS.reduce((sum, group) => sum + counts[group], 0);
  return { ...counts, total };
}

async function readResidueCounts(
  database: SqlExecutor,
  runId?: string
): Promise<CanaryResidueCounts> {
  const result = await database.execute(countQuery(runId));
  return countsFromRow(result.rows[0] as ResidueRow | undefined);
}

async function rejectActiveCanaryRun(database: SqlExecutor): Promise<void> {
  const result = await database.execute(sql`
    SELECT id, status, expires_at <= clock_timestamp() AS expired
    FROM release_canary_runs
    WHERE status IN ('created', 'running')
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const row = result.rows[0] as
    | { id: string; status: string; expired: boolean | 't' | 'f' }
    | undefined;
  if (row) {
    throw new CanaryActiveRunError(
      String(row.id),
      String(row.status),
      row.expired === true || row.expired === 't'
    );
  }
}

/**
 * Reserve the full successful-run residue vector before any canary row is
 * written. The one-active-run rule (enforced here under the caller's
 * release_canary_creation advisory lock) is what makes this in-memory
 * reservation safe across the run's later writes.
 */
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
    await rejectActiveCanaryRun(database);
    const current = await readResidueCounts(database);
    const projected = Object.fromEntries(
      (Object.keys(current) as Array<keyof CanaryResidueCounts>).map((field) => [
        field,
        current[field] + RELEASE_CANARY_RESERVED_RESIDUE[field],
      ])
    ) as CanaryResidueCounts;

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

const RESIDUE_COLUMN_BY_GROUP: Record<CanaryResidueGroup, string> = {
  portfolioCompany: 'portfolio_company_residue_count',
  fund: 'fund_residue_count',
  fundConfig: 'fund_config_residue_count',
  fundEvent: 'fund_event_residue_count',
  notification: 'notification_residue_count',
  grant: 'grant_residue_count',
  calculation: 'calculation_residue_count',
  mutationReceipt: 'mutation_receipt_residue_count',
  scenario: 'scenario_residue_count',
  reporting: 'reporting_residue_count',
};

export async function reconcileReleaseCanaryRun(
  runId: string,
  database: SqlExecutor = db
): Promise<CanaryResidueCounts> {
  try {
    const counts = await readResidueCounts(database, runId);
    const assignments = CANARY_RESIDUE_GROUPS.map(
      (group) => sql`${sql.raw(RESIDUE_COLUMN_BY_GROUP[group])} = ${counts[group]}`
    );
    const result = await database.execute(sql`
      UPDATE release_canary_runs
      SET ${sql.join(assignments, sql`,
          `)},
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
} & Record<string, unknown>;

function versionFromRow(row: CanaryRunTerminalRow): number {
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new CanaryRunTransitionConflictError('Release canary run version is invalid');
  }
  return version;
}

function countsFromTerminalRow(row: CanaryRunTerminalRow): CanaryResidueCounts {
  const counts = Object.fromEntries(
    CANARY_RESIDUE_GROUPS.map((group) => [
      group,
      numberFromValue(row[RESIDUE_COLUMN_BY_GROUP[group]], RESIDUE_COLUMN_BY_GROUP[group]),
    ])
  ) as Record<CanaryResidueGroup, number>;
  return {
    ...counts,
    total: numberFromValue(row['total_residue_count'], 'total_residue_count'),
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

    const residueColumns = CANARY_RESIDUE_GROUPS.map((group) =>
      sql.raw(RESIDUE_COLUMN_BY_GROUP[group])
    );
    const currentResult = await tx.execute(sql`
      SELECT status,
             version,
             ${sql.join(residueColumns, sql`,
             `)},
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
