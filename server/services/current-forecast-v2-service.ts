import { randomUUID } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../db';
import { assertOwnedByFund, type FundScopedOwnershipDatabase } from '../lib/fund-scoped-ownership';
import {
  CurrentForecastV2InputSchema,
  ENGINE_VERSION,
  type CurrentForecastV2,
} from '../../shared/contracts/current-forecast-v2.contract';
import {
  CurrentPlanVersionV1Schema,
  type CurrentPlanVersionV1,
} from '../../shared/contracts/current-plan-version-v1.contract';
import {
  PersistedFinancialFactsSnapshotV1Schema,
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

type CurrentForecastDatabase = typeof db;
type FactsWithId = PersistedFinancialFactsSnapshotV1 & { readonly id: number };

export type CurrentForecastV2ServiceErrorCode =
  'NO_CURRENT_PLAN_VERSION' | 'NO_FACTS_SNAPSHOT' | 'CURRENT_FORECAST_BASIS_MISMATCH';

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
  const snapshot = PersistedFinancialFactsSnapshotV1Schema.parse({
    policyVersion: row.policyVersion,
    fundId: row.fundId,
    asOfDate: row.asOfDate,
    knowledgeCutoff: row.knowledgeCutoff.toISOString(),
    vehicleScope: row.vehicleScope,
    vehicleIds: row.vehicleIds,
    selectionSetHash: row.selectionSetHash,
    sourceFactsInputHash: row.sourceFactsInputHash,
    snapshotInputHash: row.snapshotInputHash,
    consumerEvaluations: row.consumerEvaluations,
    payload: row.payload,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
  });
  return { ...snapshot, id: row.id };
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
  const database = input.database ?? db;
  const planRow = await loadCurrentPlanVersion(input, database);
  const factsRow = await loadFactsSnapshot(input, database);
  const plan = currentPlanVersionFromRow(planRow);
  const facts = factsSnapshotFromRow(factsRow);
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

  await database.insert(fundSnapshots).values({
    fundId: input.fundId,
    type: 'CURRENT_FORECAST_V2',
    payload: result,
    state: null,
    scenarioSetId: null,
    snapshotTime: new Date(input.clock),
    calcVersion: ENGINE_VERSION,
    correlationId: randomUUID(),
  });

  return result;
}
