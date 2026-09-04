import { randomUUID } from 'node:crypto';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../db';
import { assertOwnedByFund, type FundScopedOwnershipDatabase } from '../lib/fund-scoped-ownership';
import { runWithTransactionFallback } from '../lib/transaction-support';
import {
  CurrentForecastV2InputSchema,
  CurrentForecastV2Schema,
  type CurrentForecastV2,
} from '../../shared/contracts/current-forecast-v2.contract';
import {
  CurrentPlanVersionV1Schema,
  type CurrentPlanVersionV1,
} from '../../shared/contracts/current-plan-version-v1.contract';
import {
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  type PersistedFinancialFactsSnapshotV1,
} from '../../shared/contracts/financial-facts-snapshot-v1.contract';
import {
  CurrentForecastBasisMismatchError,
  runCohortProjectionV2,
  type CurrentForecastBasisMismatchCode,
} from '../../shared/core/cohorts/CohortProjectionV2';
import { currentPlanVersions, type CurrentPlanVersionRow } from '../../shared/schema/current-plans';
import {
  financialFactsSnapshots,
  type FinancialFactsSnapshot,
} from '../../shared/schema/financial-facts-snapshots';
import { fundSnapshots } from '../../shared/schema/fund';
import { getLatestFinancialFactsSnapshot } from './financial-facts-snapshot-service';
import { parsePersistedFactsRow } from './financial-facts/parse-persisted-facts-row';

export type CurrentForecastDatabase = typeof db;
type CurrentForecastTransaction = Parameters<
  Parameters<CurrentForecastDatabase['transaction']>[0]
>[0];
type FactsWithId = PersistedFinancialFactsSnapshotV1 & { readonly id: number };

/** Stored in fund_snapshots.calc_version (varchar(20)); ENGINE_VERSION remains the engine identity. */
export const CURRENT_FORECAST_V2_CALC_VERSION = 'cf-v2/1.0.0' as const;

export type CurrentForecastV2ServiceErrorCode =
  | 'NO_CURRENT_PLAN_VERSION'
  | 'NO_FACTS_SNAPSHOT'
  | 'UNSUPPORTED_FACTS_POLICY'
  | 'FACTS_FORECAST_EVALUATION_BLOCKED'
  | 'FORECAST_SNAPSHOT_WRITE_FAILED'
  | 'CURRENT_FORECAST_BASIS_MISMATCH';

export class CurrentForecastV2ServiceError extends Error {
  readonly statusCode: number;
  readonly basisMismatchCode: CurrentForecastBasisMismatchCode | undefined;

  constructor(
    readonly status: number,
    readonly code: CurrentForecastV2ServiceErrorCode,
    message: string,
    options?: { basisMismatchCode?: CurrentForecastBasisMismatchCode }
  ) {
    super(message);
    this.name = 'CurrentForecastV2ServiceError';
    this.statusCode = status;
    this.basisMismatchCode = options?.basisMismatchCode;
  }
}

export interface RunCurrentForecastV2Input {
  fundId: number;
  currentPlanVersionId?: string;
  financialFactsSnapshotId?: string;
  clock: string;
  database?: CurrentForecastDatabase;
}

export interface RunCurrentForecastV2Receipt {
  result: CurrentForecastV2;
  fundSnapshotId: number;
}

function currentPlanVersionFromRow(row: CurrentPlanVersionRow): CurrentPlanVersionV1 {
  return CurrentPlanVersionV1Schema.parse({
    contractVersion: 'current-plan-version-v1',
    id: String(row.id),
    fundId: row.fundId,
    version: row.version,
    sourceConfigId: row.sourceConfigId,
    sourceConfigVersion: row.sourceConfigVersion,
    sourceFactsSnapshotId: String(row.sourceFactsSnapshotId),
    deployableCapitalUsd: row.deployableCapitalUsd,
    planTransformationVersion: row.planTransformationVersion,
    allocations: row.allocations,
    pacingAssumptions: row.pacingAssumptions,
    cohortAssumptions: row.cohortAssumptions,
    reservePolicyVersion: row.reservePolicyVersion,
    assumptionsHash: row.assumptionsHash,
    supersedesVersionId: row.supersedesVersionId === null ? null : String(row.supersedesVersionId),
    supersededByVersionId:
      row.supersededByVersionId === null ? null : String(row.supersededByVersionId),
    createdAt: row.createdAt.toISOString(),
  });
}

function factsSnapshotFromRow(row: FinancialFactsSnapshot): FactsWithId {
  const parsed = parsePersistedFactsRow(row);
  if (
    parsed.kind === 'unsupported' ||
    parsed.snapshot.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_4_0
  ) {
    const policyVersion = parsed.kind === 'unsupported' ? parsed.policyVersion : parsed.snapshot.policyVersion;
    throw new CurrentForecastV2ServiceError(
      422,
      'UNSUPPORTED_FACTS_POLICY',
      `Financial-facts policy ${policyVersion} is not supported by Current Forecast V2.`
    );
  }
  return parsed.snapshot;
}

async function loadCurrentPlanVersion(
  input: RunCurrentForecastV2Input,
  database: CurrentForecastDatabase
): Promise<CurrentPlanVersionRow> {
  let row: CurrentPlanVersionRow | undefined;

  if (input.currentPlanVersionId !== undefined) {
    await assertOwnedByFund({
      db: database as unknown as FundScopedOwnershipDatabase,
      fundId: input.fundId,
      ref: { kind: 'current_plan_version', id: input.currentPlanVersionId },
    });
    const [selected] = await database
      .select()
      .from(currentPlanVersions)
      .where(eq(currentPlanVersions.id, Number.parseInt(input.currentPlanVersionId, 10)))
      .limit(1);
    row = selected;
  } else {
    const [head] = await database
      .select()
      .from(currentPlanVersions)
      .where(
        and(
          eq(currentPlanVersions.fundId, input.fundId),
          isNull(currentPlanVersions.supersededByVersionId)
        )
      )
      .limit(1);
    row = head;
  }

  if (!row) {
    throw new CurrentForecastV2ServiceError(
      409,
      'NO_CURRENT_PLAN_VERSION',
      'A current plan version is required to run the current forecast.'
    );
  }

  if (input.currentPlanVersionId === undefined) {
    await assertOwnedByFund({
      db: database as unknown as FundScopedOwnershipDatabase,
      fundId: input.fundId,
      ref: { kind: 'current_plan_version', id: row.id },
    });
  }
  return row;
}

/** Resolve current-plan identity without starting forecast evaluation. */
export async function resolveCurrentForecastPlanVersionId(params: {
  fundId: number;
  database?: CurrentForecastDatabase;
}): Promise<number | null> {
  const database = params.database ?? db;
  const [row] = await database
    .select({ id: currentPlanVersions.id })
    .from(currentPlanVersions)
    .where(
      and(
        eq(currentPlanVersions.fundId, params.fundId),
        isNull(currentPlanVersions.supersededByVersionId)
      )
    )
    .limit(1);
  return row?.id ?? null;
}

async function loadFactsSnapshot(
  input: RunCurrentForecastV2Input,
  database: CurrentForecastDatabase
): Promise<FinancialFactsSnapshot> {
  let row: FinancialFactsSnapshot | null | undefined;

  if (input.financialFactsSnapshotId !== undefined) {
    await assertOwnedByFund({
      db: database as unknown as FundScopedOwnershipDatabase,
      fundId: input.fundId,
      ref: { kind: 'facts_snapshot', id: input.financialFactsSnapshotId },
    });
    const [selected] = await database
      .select()
      .from(financialFactsSnapshots)
      .where(eq(financialFactsSnapshots.id, Number.parseInt(input.financialFactsSnapshotId, 10)))
      .limit(1);
    row = selected;
  } else {
    row = await getLatestFinancialFactsSnapshot({ fundId: input.fundId, database });
  }

  if (!row) {
    throw new CurrentForecastV2ServiceError(
      422,
      'NO_FACTS_SNAPSHOT',
      'A financial-facts snapshot is required to run the current forecast.'
    );
  }

  if (input.financialFactsSnapshotId === undefined) {
    await assertOwnedByFund({
      db: database as unknown as FundScopedOwnershipDatabase,
      fundId: input.fundId,
      ref: { kind: 'facts_snapshot', id: row.id },
    });
  }
  return row;
}

export async function runCurrentForecastV2(
  input: RunCurrentForecastV2Input
): Promise<CurrentForecastV2> {
  return (await runCurrentForecastV2WithReceipt(input)).result;
}

export async function runCurrentForecastV2WithReceipt(
  input: RunCurrentForecastV2Input
): Promise<RunCurrentForecastV2Receipt> {
  const database = input.database ?? db;
  const planRow = await loadCurrentPlanVersion(input, database);
  const factsRow = await loadFactsSnapshot(input, database);
  const plan = currentPlanVersionFromRow(planRow);
  const facts = factsSnapshotFromRow(factsRow);
  const forecastEvaluation = facts.consumerEvaluations.find(
    (evaluation) => evaluation.consumer === 'forecast'
  );
  if (forecastEvaluation?.status === 'blocked') {
    throw new CurrentForecastV2ServiceError(
      422,
      'FACTS_FORECAST_EVALUATION_BLOCKED',
      'The financial-facts snapshot blocks Current Forecast V2.'
    );
  }
  const engineInput = CurrentForecastV2InputSchema.parse({
    fundId: input.fundId,
    financialFactsSnapshotId: String(facts.id),
    currentPlanVersionId: plan.id,
    asOfDate: facts.asOfDate,
    knowledgeCutoff: facts.knowledgeCutoff,
    clock: input.clock,
  });

  let result: CurrentForecastV2;
  try {
    result = runCohortProjectionV2(engineInput, plan, facts);
  } catch (error) {
    if (error instanceof CurrentForecastBasisMismatchError) {
      throw new CurrentForecastV2ServiceError(
        409,
        'CURRENT_FORECAST_BASIS_MISMATCH',
        error.message,
        { basisMismatchCode: error.code }
      );
    }
    throw error;
  }

  const [inserted] = await database
    .insert(fundSnapshots)
    .values({
      fundId: input.fundId,
      type: 'CURRENT_FORECAST_V2',
      payload: result,
      state: null,
      scenarioSetId: null,
      snapshotTime: new Date(input.clock),
      calcVersion: CURRENT_FORECAST_V2_CALC_VERSION,
      correlationId: randomUUID(),
    })
    .returning({ id: fundSnapshots.id });

  if (inserted === undefined || !Number.isSafeInteger(inserted.id) || inserted.id <= 0) {
    throw new CurrentForecastV2ServiceError(
      500,
      'FORECAST_SNAPSHOT_WRITE_FAILED',
      'Current Forecast V2 snapshot insert did not return a persisted snapshot id.'
    );
  }

  return { result, fundSnapshotId: inserted.id };
}

function currentForecastReceiptPredicate(input: {
  fundId: number;
  financialFactsSnapshotId: number;
  currentPlanVersionId: number;
  clock: string;
}) {
  return and(
    eq(fundSnapshots.fundId, input.fundId),
    eq(fundSnapshots.type, 'CURRENT_FORECAST_V2'),
    sql`${fundSnapshots.payload}->>'financialFactsSnapshotId' = ${String(input.financialFactsSnapshotId)}`,
    sql`${fundSnapshots.payload}->>'currentPlanVersionId' = ${String(input.currentPlanVersionId)}`,
    eq(fundSnapshots.snapshotTime, new Date(input.clock))
  );
}

async function findCurrentForecastV2Receipt(
  input: {
    fundId: number;
    financialFactsSnapshotId: number;
    currentPlanVersionId: number;
    clock: string;
  },
  database: CurrentForecastDatabase
): Promise<RunCurrentForecastV2Receipt | null> {
  const [row] = await database
    .select({ id: fundSnapshots.id, payload: fundSnapshots.payload })
    .from(fundSnapshots)
    .where(currentForecastReceiptPredicate(input))
    .orderBy(asc(fundSnapshots.id))
    .limit(1);

  if (!row) return null;
  return {
    result: CurrentForecastV2Schema.parse(row.payload),
    fundSnapshotId: row.id,
  };
}

/**
 * Pin one baseline receipt for an exact facts/plan/clock basis. The advisory
 * lock is transaction-scoped, so concurrent callers serialize without adding
 * a schema constraint. When neon-http cannot open a transaction, the advisory
 * lock is skipped because it is xact-scoped; select-before-insert plus the
 * lowest-snapshot-id lookup remains defense-in-depth for duplicate receipts.
 */
export async function getOrCreateCurrentForecastV2WithReceipt(
  input: RunCurrentForecastV2Input
): Promise<RunCurrentForecastV2Receipt> {
  const database = input.database ?? db;

  return runWithTransactionFallback<
    CurrentForecastDatabase,
    CurrentForecastTransaction,
    RunCurrentForecastV2Receipt
  >(database, async (transaction, context) => {
    const planRow = await loadCurrentPlanVersion(input, transaction);
    const factsRow = await loadFactsSnapshot(input, transaction);
    const basis = {
      fundId: input.fundId,
      financialFactsSnapshotId: factsRow.id,
      currentPlanVersionId: planRow.id,
      clock: input.clock,
    };
    const basisTuple = JSON.stringify([
      basis.fundId,
      basis.financialFactsSnapshotId,
      basis.currentPlanVersionId,
      basis.clock,
    ]);

    if (context.transactional) {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${basisTuple}, 0::bigint))`
      );
    }

    const existing = await findCurrentForecastV2Receipt(basis, transaction);
    if (existing) return existing;

    const created = await runCurrentForecastV2WithReceipt({
      ...input,
      currentPlanVersionId: String(planRow.id),
      financialFactsSnapshotId: String(factsRow.id),
      database: transaction,
    });

    if (!context.transactional) {
      // Autocommit callers can race after the select; return the lowest id if
      // another caller inserted the same exact basis first.
      return (await findCurrentForecastV2Receipt(basis, transaction)) ?? created;
    }
    return created;
  });
}
