import { randomUUID } from 'node:crypto';

import { and, eq, sql, type SQL } from 'drizzle-orm';

import { db } from '../../db';
import {
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import { runIdempotentCommand } from '../../lib/idempotent-command';
import {
  DYNAMIC_RESERVE_INTELLIGENCE_CALC_VERSION,
  DYNAMIC_RESERVE_INTELLIGENCE_CONTRACT_VERSION,
  DynamicReserveIntelligenceCommandResponseV1Schema,
  DynamicReserveIntelligencePayloadV1Schema,
  DynamicReserveIntelligenceRunV1Schema,
  PinnedMarginalReserveNonFactsSourcesV1Schema,
  PinnedReserveEnvelopeSourcesV1Schema,
  type DynamicReserveIntelligenceCommandResponseV1,
  type DynamicReserveIntelligencePayloadV1,
  type DynamicReserveIntelligenceRunV1,
  type DynamicReserveOverlayEntryV1,
  type PinnedMarginalReserveNonFactsSourcesV1,
  type PinnedReserveEnvelopeSourcesV1,
} from '../../../shared/contracts/dynamic-reserve-intelligence-v1.contract';
import type { FundCompanyActualsFactsResponse } from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import {
  PersistedFinancialFactsSnapshotV1Schema,
  type PersistedFinancialFactsSnapshotV1,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import Decimal from '../../../shared/lib/decimal-config';
import { financialFactsSnapshots, type FinancialFactsSnapshot } from '../../../shared/schema';
import { fundSnapshots } from '../../../shared/schema/fund';
import { dollarsToCents } from '../../../shared/units';
import {
  resolveFundCalculationMode,
  resolveMoicActionability,
  toH9SnapshotColumns,
  type MoicActionabilityResult,
} from '../fund-calculation-mode-service';
import { getFundMoicRankingSources } from '../fund-moic-ranking-service';
import {
  loadMarginalReserveInputSources,
  type MarginalReserveInputSources,
} from '../moic/marginal-reserve-moic-input-service';
import { buildRoundsToModelEvidence } from '../rounds-to-model-evidence-service';
import {
  loadReserveEnvelopeSources,
  type ReserveEnvelopeSources,
} from './reserve-envelope-service';
import { composeRankedReserveAllocation } from './ranked-reserve-orchestrator';
import { buildRankedReserveInputFromSnapshot } from './ranked-reserve-input-from-snapshot';

const SNAPSHOT_TYPE = 'RESERVE_INTELLIGENCE';

type DynamicReserveIntelligenceDatabase = typeof db;
type DynamicReserveIntelligenceTransaction = Parameters<
  Parameters<DynamicReserveIntelligenceDatabase['transaction']>[0]
>[0];
type DynamicReserveIntelligenceExecutor =
  | Pick<DynamicReserveIntelligenceDatabase, 'execute'>
  | Pick<DynamicReserveIntelligenceTransaction, 'execute'>;

interface PersistedRunRow {
  id: number;
  payload: unknown;
  created_at: Date | string;
}

export type DynamicReserveIntelligenceServiceErrorCode =
  | 'FACTS_RESERVE_EVALUATION_BLOCKED'
  | 'RESERVE_INTELLIGENCE_NOT_FOUND'
  | 'RESERVE_INTELLIGENCE_RUN_NOT_FOUND'
  | 'RESERVE_INTELLIGENCE_SNAPSHOT_WRITE_FAILED';

export class DynamicReserveIntelligenceServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: DynamicReserveIntelligenceServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DynamicReserveIntelligenceServiceError';
    this.statusCode = status;
  }
}

export interface DynamicReserveIntelligenceDependencies {
  database: DynamicReserveIntelligenceDatabase;
  clock: () => Date;
  randomId: () => string;
  getFundMoicRankingSources: typeof getFundMoicRankingSources;
  resolveFundCalculationMode: typeof resolveFundCalculationMode;
  buildRoundsToModelEvidence: typeof buildRoundsToModelEvidence;
  resolveMoicActionability: typeof resolveMoicActionability;
  loadMarginalReserveInputSources: typeof loadMarginalReserveInputSources;
  loadReserveEnvelopeSources: typeof loadReserveEnvelopeSources;
}

const DEFAULT_DEPENDENCIES: DynamicReserveIntelligenceDependencies = {
  database: db,
  clock: () => new Date(),
  randomId: randomUUID,
  getFundMoicRankingSources,
  resolveFundCalculationMode,
  buildRoundsToModelEvidence,
  resolveMoicActionability,
  loadMarginalReserveInputSources,
  loadReserveEnvelopeSources,
};

function dependencies(
  overrides?: Partial<DynamicReserveIntelligenceDependencies>
): DynamicReserveIntelligenceDependencies {
  return { ...DEFAULT_DEPENDENCIES, ...overrides };
}

function snapshotFromRow(row: FinancialFactsSnapshot): PersistedFinancialFactsSnapshotV1 {
  return PersistedFinancialFactsSnapshotV1Schema.parse({
    policyVersion: row.policyVersion,
    ...(row.policyVersion === 'financial-facts-policy/1.1.0' ||
    row.policyVersion === 'financial-facts-policy/1.2.0' ||
    row.policyVersion === 'financial-facts-policy/1.3.0'
      ? { payloadSchemaId: row.payloadSchemaId }
      : {}),
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
}

function hydrateSnapshotFacts(
  snapshot: PersistedFinancialFactsSnapshotV1
): FundCompanyActualsFactsResponse {
  return {
    ...snapshot.payload.companyActuals,
    generatedAt: snapshot.createdAt,
    facts: snapshot.payload.companyActuals.facts.map((fact) => ({
      ...fact,
      provenance: {
        ...fact.provenance,
        core: {
          ...fact.provenance.core,
          generatedAt: snapshot.createdAt,
        },
      },
    })),
  };
}

async function loadFactsSnapshot(input: {
  database: DynamicReserveIntelligenceDatabase;
  fundId: number;
  snapshotId: number;
}): Promise<PersistedFinancialFactsSnapshotV1> {
  await assertOwnedByFund({
    db: input.database as unknown as FundScopedOwnershipDatabase,
    fundId: input.fundId,
    ref: { kind: 'facts_snapshot', id: input.snapshotId },
  });
  const [row] = await input.database
    .select()
    .from(financialFactsSnapshots)
    .where(
      and(
        eq(financialFactsSnapshots.id, input.snapshotId),
        eq(financialFactsSnapshots.fundId, input.fundId)
      )
    )
    .limit(1);
  if (!row) {
    throw new DynamicReserveIntelligenceServiceError(
      404,
      'RESERVE_INTELLIGENCE_RUN_NOT_FOUND',
      'The financial-facts snapshot was not found in this fund.'
    );
  }
  return snapshotFromRow(row);
}

function pinMarginalNonFactsSources(
  sources: MarginalReserveInputSources
): PinnedMarginalReserveNonFactsSourcesV1 {
  return PinnedMarginalReserveNonFactsSourcesV1Schema.parse({
    sourceSnapshotDate: sources.sourceSnapshotDate,
    baseCurrency: sources.baseCurrency,
    companies: sources.companies.map((company) => ({
      ...company,
      plannedReservesCents:
        company.plannedReservesCents === null ? null : String(company.plannedReservesCents),
    })),
    approvedAllocations: sources.approvedAllocations.map((allocation) => ({
      ...allocation,
      finalPlannedReservesCents:
        allocation.finalPlannedReservesCents === null
          ? null
          : String(allocation.finalPlannedReservesCents),
      decidedAt: allocation.decidedAt?.toISOString() ?? null,
      updatedAt: allocation.updatedAt.toISOString(),
    })),
    publishedAssumptions:
      sources.publishedAssumptions === null
        ? null
        : {
            ...sources.publishedAssumptions,
            publishedAt: sources.publishedAssumptions.publishedAt?.toISOString() ?? null,
          },
  });
}

function pinEnvelopeSources(sources: ReserveEnvelopeSources): PinnedReserveEnvelopeSourcesV1 {
  return PinnedReserveEnvelopeSourcesV1Schema.parse({
    fund: { ...sources.fund },
    investments: sources.investments.map((investment) => ({ ...investment })),
    config:
      sources.config === null
        ? null
        : {
            ...sources.config,
            expenses: sources.config.expenses?.map((expense) => ({ ...expense })) ?? null,
          },
  });
}

function executeRows<T>(executor: DynamicReserveIntelligenceExecutor, query: SQL): Promise<T[]> {
  return Promise.resolve(executor.execute(query)).then((result: unknown) => {
    if (
      typeof result === 'object' &&
      result !== null &&
      'rows' in result &&
      Array.isArray((result as { rows?: unknown }).rows)
    ) {
      return (result as { rows: T[] }).rows;
    }
    if (Array.isArray(result)) return result as T[];
    return [];
  });
}

function runFromRow(row: PersistedRunRow): DynamicReserveIntelligenceRunV1 {
  const createdAt =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString();
  return DynamicReserveIntelligenceRunV1Schema.parse({
    snapshotId: row.id,
    createdAt,
    result: DynamicReserveIntelligencePayloadV1Schema.parse(row.payload),
  });
}

async function loadRunByIdempotencyKey(input: {
  executor: DynamicReserveIntelligenceExecutor;
  fundId: number;
  idempotencyKey: string;
}): Promise<DynamicReserveIntelligenceRunV1 | null> {
  const rows = await executeRows<PersistedRunRow>(
    input.executor,
    sql`
      SELECT id, payload, created_at
      FROM fund_snapshots
      WHERE fund_id = ${input.fundId}
        AND type = ${SNAPSHOT_TYPE}
        AND payload -> 'provenance' ->> 'idempotencyKey' = ${input.idempotencyKey}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `
  );
  return rows[0] ? runFromRow(rows[0]) : null;
}

async function loadRun(input: {
  executor: DynamicReserveIntelligenceExecutor;
  fundId: number;
  snapshotId?: number;
}): Promise<DynamicReserveIntelligenceRunV1 | null> {
  const rows =
    input.snapshotId === undefined
      ? await executeRows<PersistedRunRow>(
          input.executor,
          sql`
            SELECT id, payload, created_at
            FROM fund_snapshots
            WHERE fund_id = ${input.fundId}
              AND type = ${SNAPSHOT_TYPE}
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          `
        )
      : await executeRows<PersistedRunRow>(
          input.executor,
          sql`
            SELECT id, payload, created_at
            FROM fund_snapshots
            WHERE fund_id = ${input.fundId}
              AND id = ${input.snapshotId}
              AND type = ${SNAPSHOT_TYPE}
            LIMIT 1
          `
        );
  return rows[0] ? runFromRow(rows[0]) : null;
}

function buildPayload(input: {
  fundId: number;
  financialFactsSnapshotId: number;
  factsSnapshot: PersistedFinancialFactsSnapshotV1;
  marginalNonFactsSources: PinnedMarginalReserveNonFactsSourcesV1;
  envelopeSources: PinnedReserveEnvelopeSourcesV1;
  overlay: readonly DynamicReserveOverlayEntryV1[] | undefined;
  actorId: number | null;
  suppliedAt: string;
  idempotencyKey: string;
  requestHash: string;
  effectiveMode: 'shadow' | 'on';
  h9Actionability: MoicActionabilityResult['actionability'];
}): DynamicReserveIntelligencePayloadV1 {
  const composeInput = buildRankedReserveInputFromSnapshot({
    factsSnapshot: input.factsSnapshot,
    marginalNonFactsSources: input.marginalNonFactsSources,
    envelopeSources: input.envelopeSources,
  });
  const composed = composeRankedReserveAllocation(composeInput);
  const allocationByCompany = new Map(
    composed.allocations.map((allocation) => [allocation.companyId, allocation] as const)
  );
  const systemAllocationCentsByCompany = new Map(
    composed.allocations.map(
      (allocation) => [allocation.companyId, dollarsToCents(allocation.allocated)] as const
    )
  );
  const overlayByCompany = new Map(
    (input.overlay ?? []).map((entry) => [entry.companyId, entry.plannedReserveCents] as const)
  );
  const candidateIds = new Set(composeInput.candidates.map((candidate) => candidate.companyId));
  const totalSystemAllocatedCents = [...systemAllocationCentsByCompany.values()].reduce(
    (sum, allocatedCents) => sum + allocatedCents,
    0
  );
  const totalOverlayPlannedCents =
    input.overlay === undefined
      ? null
      : input.overlay.reduce((sum, entry) => sum + entry.plannedReserveCents, 0);
  const companies = composeInput.candidates
    .map((candidate) => {
      const allocation = allocationByCompany.get(candidate.companyId);
      const systemAllocatedCents = systemAllocationCentsByCompany.get(candidate.companyId) ?? 0;
      const overlayPlannedCents = overlayByCompany.get(candidate.companyId) ?? null;
      return {
        companyId: candidate.companyId,
        name: candidate.name,
        canonicalStage: candidate.canonicalStage,
        status: candidate.status,
        rank: allocation?.rank ?? null,
        marginalMoic: candidate.marginalMoic,
        systemAllocatedCents,
        overlayPlannedCents,
        deltaCents:
          overlayPlannedCents === null ? null : overlayPlannedCents - systemAllocatedCents,
        concentration:
          totalSystemAllocatedCents === 0
            ? null
            : new Decimal(systemAllocatedCents).div(totalSystemAllocatedCents).toFixed(6),
      };
    })
    .sort(
      (left, right) =>
        (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
        left.companyId - right.companyId
    );

  return DynamicReserveIntelligencePayloadV1Schema.parse({
    contractVersion: DYNAMIC_RESERVE_INTELLIGENCE_CONTRACT_VERSION,
    fundId: input.fundId,
    actionability:
      input.effectiveMode === 'on' && input.h9Actionability === 'actionable' && !composed.failSafe
        ? 'actionable'
        : 'non_actionable',
    companies,
    fund: {
      totalSystemAllocatedCents,
      totalOverlayPlannedCents,
      totalDeltaCents:
        totalOverlayPlannedCents === null
          ? null
          : totalOverlayPlannedCents - totalSystemAllocatedCents,
      followOnCapacityCents:
        composeInput.envelope.availableReservesCents - totalSystemAllocatedCents,
      failSafe: composed.failSafe,
      failSafeReason: composed.failSafeReason,
      excluded: composed.excluded,
      disclosedDefaults: composed.disclosedDefaults,
      neutralPolicies: composed.neutralPolicies,
    },
    constraintFindings: (input.overlay ?? [])
      .filter((entry) => !candidateIds.has(entry.companyId))
      .map((entry) => ({
        code: 'overlay_unknown_company' as const,
        companyId: entry.companyId,
      })),
    provenance: {
      financialFactsSnapshotId: input.financialFactsSnapshotId,
      factsInputHash: composed.factsInputHash,
      assumptionsHash: composed.assumptionsHash,
      envelopeInputHash: composed.envelopeInputHash,
      effectiveMode: input.effectiveMode,
      h9Actionability: input.h9Actionability,
      overlayProvenance: {
        suppliedBy: input.actorId,
        suppliedAt: input.suppliedAt,
      },
      overlay: input.overlay === undefined ? null : input.overlay,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      calcVersion: DYNAMIC_RESERVE_INTELLIGENCE_CALC_VERSION,
      asOfDate: input.factsSnapshot.asOfDate,
      factsSnapshot: input.factsSnapshot,
      marginalNonFactsSources: input.marginalNonFactsSources,
      envelopeSources: input.envelopeSources,
    },
  });
}

export async function createDynamicReserveIntelligenceRun(input: {
  fundId: number;
  financialFactsSnapshotId: number;
  overlay?: readonly DynamicReserveOverlayEntryV1[];
  idempotencyKey: string;
  actorId: number | null;
  dependencies?: Partial<DynamicReserveIntelligenceDependencies>;
}): Promise<DynamicReserveIntelligenceCommandResponseV1> {
  const deps = dependencies(input.dependencies);
  const commandRequest = {
    fundId: input.fundId,
    financialFactsSnapshotId: input.financialFactsSnapshotId,
    overlay: input.overlay ?? null,
    contractVersion: DYNAMIC_RESERVE_INTELLIGENCE_CONTRACT_VERSION,
  };
  const existing = await loadRunByIdempotencyKey({
    executor: deps.database,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
  });
  if (existing) {
    const replay = await runIdempotentCommand<DynamicReserveIntelligenceRunV1>({
      db: deps.database,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      request: commandRequest,
      contractVersion: DYNAMIC_RESERVE_INTELLIGENCE_CONTRACT_VERSION,
      insert: async () => null,
      loadExisting: async () => ({
        row: existing,
        requestHash: existing.result.provenance.requestHash,
      }),
    });
    return DynamicReserveIntelligenceCommandResponseV1Schema.parse({
      ...replay.row,
      replayed: replay.replayed,
    });
  }

  const factsSnapshot = await loadFactsSnapshot({
    database: deps.database,
    fundId: input.fundId,
    snapshotId: input.financialFactsSnapshotId,
  });
  const reserveEvaluation = factsSnapshot.consumerEvaluations.find(
    (evaluation) => evaluation.consumer === 'reserve'
  );
  if (reserveEvaluation?.status === 'blocked') {
    throw new DynamicReserveIntelligenceServiceError(
      422,
      'FACTS_RESERVE_EVALUATION_BLOCKED',
      'The financial-facts snapshot blocks reserve intelligence.'
    );
  }

  const commandTime = deps.clock();
  const snapshotFacts = hydrateSnapshotFacts(factsSnapshot);
  const sources = await deps.getFundMoicRankingSources(
    input.fundId,
    deps.database,
    { status: 'available', response: snapshotFacts },
    commandTime
  );
  const mode = await deps.resolveFundCalculationMode({ fundId: input.fundId, sources });
  const effectiveMode = mode.effectiveMode;
  if (effectiveMode === 'off' || mode.killSwitchActive) {
    throw new DynamicReserveIntelligenceServiceError(
      404,
      'RESERVE_INTELLIGENCE_NOT_FOUND',
      'Reserve intelligence is not available.'
    );
  }
  const evidence = await deps.buildRoundsToModelEvidence({ fundId: input.fundId });
  const h9 = await deps.resolveMoicActionability({
    fundId: input.fundId,
    sources,
    evidence,
  });
  const [marginalSources, envelopeSourceRows] = await Promise.all([
    deps.loadMarginalReserveInputSources(
      { fundId: input.fundId, asOfDate: factsSnapshot.asOfDate },
      { facts: snapshotFacts }
    ),
    deps.loadReserveEnvelopeSources({
      fundId: input.fundId,
      asOfDate: factsSnapshot.asOfDate,
    }),
  ]);
  const marginalNonFactsSources = pinMarginalNonFactsSources({
    ...marginalSources,
    sourceSnapshotDate: factsSnapshot.asOfDate,
  });
  const envelopeSources = pinEnvelopeSources(envelopeSourceRows);
  const suppliedAt = commandTime.toISOString();

  const stored = await deps.database.transaction(async (transaction) =>
    runIdempotentCommand<DynamicReserveIntelligenceRunV1>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      request: commandRequest,
      contractVersion: DYNAMIC_RESERVE_INTELLIGENCE_CONTRACT_VERSION,
      insert: async (requestHash) => {
        await transaction.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.fundId}:${input.idempotencyKey}`}, 0))`
        );
        const concurrent = await loadRunByIdempotencyKey({
          executor: transaction,
          fundId: input.fundId,
          idempotencyKey: input.idempotencyKey,
        });
        if (concurrent) return null;

        const payload = buildPayload({
          fundId: input.fundId,
          financialFactsSnapshotId: input.financialFactsSnapshotId,
          factsSnapshot,
          marginalNonFactsSources,
          envelopeSources,
          overlay: input.overlay,
          actorId: input.actorId,
          suppliedAt,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          effectiveMode,
          h9Actionability: h9.actionability,
        });
        const [inserted] = await transaction
          .insert(fundSnapshots)
          .values({
            fundId: input.fundId,
            type: SNAPSHOT_TYPE,
            payload,
            state: null,
            scenarioSetId: null,
            snapshotTime: new Date(suppliedAt),
            calcVersion: DYNAMIC_RESERVE_INTELLIGENCE_CALC_VERSION,
            correlationId: deps.randomId(),
            ...toH9SnapshotColumns(h9),
          })
          .returning({ id: fundSnapshots.id, createdAt: fundSnapshots.createdAt });
        if (!inserted?.createdAt) {
          throw new DynamicReserveIntelligenceServiceError(
            500,
            'RESERVE_INTELLIGENCE_SNAPSHOT_WRITE_FAILED',
            'Reserve intelligence snapshot insert did not return a persisted row.'
          );
        }
        return DynamicReserveIntelligenceRunV1Schema.parse({
          snapshotId: inserted.id,
          createdAt: inserted.createdAt.toISOString(),
          result: payload,
        });
      },
      loadExisting: async () => {
        const concurrent = await loadRunByIdempotencyKey({
          executor: transaction,
          fundId: input.fundId,
          idempotencyKey: input.idempotencyKey,
        });
        return concurrent
          ? {
              row: concurrent,
              requestHash: concurrent.result.provenance.requestHash,
            }
          : null;
      },
    })
  );

  return DynamicReserveIntelligenceCommandResponseV1Schema.parse({
    ...stored.row,
    replayed: stored.replayed,
  });
}

export async function getLatestDynamicReserveIntelligenceRun(input: {
  fundId: number;
  dependencies?: Partial<DynamicReserveIntelligenceDependencies>;
}): Promise<DynamicReserveIntelligenceRunV1> {
  const deps = dependencies(input.dependencies);
  const run = await loadRun({ executor: deps.database, fundId: input.fundId });
  if (!run) {
    throw new DynamicReserveIntelligenceServiceError(
      404,
      'RESERVE_INTELLIGENCE_RUN_NOT_FOUND',
      'No reserve intelligence run was found for this fund.'
    );
  }
  return run;
}

export async function getDynamicReserveIntelligenceRun(input: {
  fundId: number;
  snapshotId: number;
  dependencies?: Partial<DynamicReserveIntelligenceDependencies>;
}): Promise<DynamicReserveIntelligenceRunV1> {
  const deps = dependencies(input.dependencies);
  const run = await loadRun({
    executor: deps.database,
    fundId: input.fundId,
    snapshotId: input.snapshotId,
  });
  if (!run) {
    throw new DynamicReserveIntelligenceServiceError(
      404,
      'RESERVE_INTELLIGENCE_RUN_NOT_FOUND',
      'The reserve intelligence run was not found in this fund.'
    );
  }
  return run;
}
