import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '../db';
import { assertOwnedByFund, type FundScopedOwnershipDatabase } from '../lib/fund-scoped-ownership';
import { runIdempotentCommand } from '../lib/idempotent-command';
import { PersistedFinancialFactsSnapshotV1Schema } from '../../shared/contracts/financial-facts-snapshot-v1.contract';
import { FundDraftWriteV1Schema } from '../../shared/contracts/fund-draft-write-v1.contract';
import {
  CurrentPlanVersionV1Schema,
  type CurrentPlanVersionV1,
} from '../../shared/contracts/current-plan-version-v1.contract';
import { deriveCurrentPlanV1 } from '../../shared/lib/current-plan/derive-current-plan-v1';
import { currentPlanVersions, type CurrentPlanVersionRow } from '../../shared/schema/current-plans';
import { fundConfigs } from '../../shared/schema/fund';
import { getLatestFinancialFactsSnapshot } from './financial-facts-snapshot-service';

const CURRENT_PLAN_CONTRACT_VERSION = 'current-plan-version-v1' as const;

type CurrentPlanDatabase = typeof db;
type FactsSnapshotRow = NonNullable<Awaited<ReturnType<typeof getLatestFinancialFactsSnapshot>>>;

export type CurrentPlanVersionServiceErrorCode =
  | 'NO_PUBLISHED_CONFIG'
  | 'NO_FACTS_SNAPSHOT'
  | 'PLAN_DERIVATION_INCOMPLETE'
  | 'OWNERSHIP_STRATEGY_UNSUPPORTED'
  | 'FEE_PROFILE_ABSENT'
  | 'CURRENT_PLAN_HEAD_CONFLICT';

export class CurrentPlanVersionServiceError extends Error {
  readonly statusCode: number;
  readonly missingFields: readonly string[] | undefined;

  constructor(
    readonly status: number,
    readonly code: CurrentPlanVersionServiceErrorCode,
    message: string,
    options?: { missingFields?: readonly string[] }
  ) {
    super(message);
    this.name = 'CurrentPlanVersionServiceError';
    this.statusCode = status;
    this.missingFields = options?.missingFields;
  }
}

export interface MintCurrentPlanVersionInput {
  fundId: number;
  asOfDate?: string;
  idempotencyKey: string;
  actorId?: number;
  database?: CurrentPlanDatabase;
}

export interface GetCurrentPlanVersionsInput {
  fundId: number;
  database?: CurrentPlanDatabase;
}

function factsSnapshotFromRow(row: FactsSnapshotRow) {
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

function currentPlanVersionFromRow(row: CurrentPlanVersionRow): CurrentPlanVersionV1 {
  return CurrentPlanVersionV1Schema.parse({
    contractVersion: CURRENT_PLAN_CONTRACT_VERSION,
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

export async function mintCurrentPlanVersion(
  input: MintCurrentPlanVersionInput
): Promise<CurrentPlanVersionV1> {
  const database = input.database ?? db;
  const publishedConfig = await database.query.fundConfigs.findFirst({
    where: and(eq(fundConfigs.fundId, input.fundId), eq(fundConfigs.isPublished, true)),
    orderBy: (configs, { desc: orderDescending }) => orderDescending(configs.version),
  });
  if (!publishedConfig) {
    throw new CurrentPlanVersionServiceError(
      409,
      'NO_PUBLISHED_CONFIG',
      'A published fund configuration is required to mint a current plan version.'
    );
  }

  const factsRow = await getLatestFinancialFactsSnapshot({
    fundId: input.fundId,
    database,
  });
  if (!factsRow) {
    throw new CurrentPlanVersionServiceError(
      422,
      'NO_FACTS_SNAPSHOT',
      'A financial-facts snapshot is required to mint a current plan version.'
    );
  }

  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId: input.fundId,
    ref: { kind: 'facts_snapshot', id: factsRow.id },
  });

  const factsSnapshot = factsSnapshotFromRow(factsRow);
  const derivation = deriveCurrentPlanV1({
    config: FundDraftWriteV1Schema.parse(publishedConfig.config),
    sourceConfigId: publishedConfig.id,
    sourceConfigVersion: publishedConfig.version,
    factsSnapshot,
    asOfDate: input.asOfDate ?? factsSnapshot.asOfDate,
  });
  if (!derivation.ok) {
    throw new CurrentPlanVersionServiceError(422, derivation.code, derivation.detail, {
      ...(derivation.missingFields != null ? { missingFields: derivation.missingFields } : {}),
    });
  }

  const stored = await database.transaction(async (transaction) => {
    return runIdempotentCommand<CurrentPlanVersionRow>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      contractVersion: CURRENT_PLAN_CONTRACT_VERSION,
      request: {
        fundId: input.fundId,
        assumptionsHash: derivation.plan.assumptionsHash,
        contractVersion: CURRENT_PLAN_CONTRACT_VERSION,
      },
      loadExisting: async () => {
        const [existing] = await transaction
          .select()
          .from(currentPlanVersions)
          .where(
            and(
              eq(currentPlanVersions.fundId, input.fundId),
              eq(currentPlanVersions.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        return existing ? { row: existing, requestHash: existing.requestHash } : null;
      },
      insert: async (requestHash) => {
        const [latestVersion] = await transaction
          .select({ version: currentPlanVersions.version })
          .from(currentPlanVersions)
          .where(eq(currentPlanVersions.fundId, input.fundId))
          .orderBy(desc(currentPlanVersions.version))
          .limit(1);
        const [oldHead] = await transaction
          .select()
          .from(currentPlanVersions)
          .where(
            and(
              eq(currentPlanVersions.fundId, input.fundId),
              isNull(currentPlanVersions.supersededByVersionId)
            )
          )
          .limit(1);

        // A partial unique index forbids inserting a second NULL head. Insert the successor
        // as temporarily non-head, then flip both links before the transaction commits.
        const [inserted] = await transaction
          .insert(currentPlanVersions)
          .values({
            fundId: input.fundId,
            version: (latestVersion?.version ?? 0) + 1,
            sourceConfigId: derivation.plan.sourceConfigId,
            sourceConfigVersion: derivation.plan.sourceConfigVersion,
            sourceFactsSnapshotId: factsRow.id,
            deployableCapitalUsd: derivation.plan.deployableCapitalUsd,
            planTransformationVersion: derivation.plan.planTransformationVersion,
            allocations: derivation.plan.allocations,
            pacingAssumptions: derivation.plan.pacingAssumptions,
            cohortAssumptions: derivation.plan.cohortAssumptions,
            reservePolicyVersion: derivation.plan.reservePolicyVersion,
            assumptionsHash: derivation.plan.assumptionsHash,
            supersedesVersionId: oldHead?.id ?? null,
            supersededByVersionId: oldHead?.id ?? null,
            idempotencyKey: input.idempotencyKey,
            requestHash,
          })
          .onConflictDoNothing({
            target: [currentPlanVersions.fundId, currentPlanVersions.idempotencyKey],
          })
          .returning();
        if (!inserted) return null;
        if (!oldHead) return inserted;

        const [superseded] = await transaction
          .update(currentPlanVersions)
          .set({ supersededByVersionId: inserted.id })
          .where(
            and(
              eq(currentPlanVersions.id, oldHead.id),
              eq(currentPlanVersions.fundId, input.fundId),
              isNull(currentPlanVersions.supersededByVersionId)
            )
          )
          .returning({ id: currentPlanVersions.id });
        if (!superseded) {
          throw new CurrentPlanVersionServiceError(
            409,
            'CURRENT_PLAN_HEAD_CONFLICT',
            'The current plan head changed while minting a successor.'
          );
        }

        const [newHead] = await transaction
          .update(currentPlanVersions)
          .set({ supersededByVersionId: null })
          .where(eq(currentPlanVersions.id, inserted.id))
          .returning();
        if (!newHead) {
          throw new CurrentPlanVersionServiceError(
            409,
            'CURRENT_PLAN_HEAD_CONFLICT',
            'The successor plan could not be promoted to the current head.'
          );
        }
        return newHead;
      },
    });
  });

  return currentPlanVersionFromRow(stored.row);
}

export async function getCurrentPlanVersions(
  input: GetCurrentPlanVersionsInput
): Promise<CurrentPlanVersionV1[]> {
  const database = input.database ?? db;
  const rows = await database
    .select()
    .from(currentPlanVersions)
    .where(eq(currentPlanVersions.fundId, input.fundId))
    .orderBy(desc(currentPlanVersions.version));

  return rows.map(currentPlanVersionFromRow);
}
