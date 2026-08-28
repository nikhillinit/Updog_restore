import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db.js';
import {
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../lib/fund-scoped-ownership.js';
import {
  replayIdempotentCommandIfPresent,
  runIdempotentCommand,
  type IdempotentCommandReplayOptions,
} from '../lib/idempotent-command.js';
import { generateLockKey } from '../lib/locks.js';
import { createRouteLogger } from '../lib/route-logger.js';
import { runInTransaction } from '../lib/transaction-support.js';
import {
  ConstructionReconciliationLatestResponseSchema,
  ConstructionReconciliationPresentationEnvelopeSchema,
  ConstructionReconciliationRequestSchema,
  ConstructionReconciliationResultSchema,
  ConstructionReconciliationValueSchema,
  type ConstructionReconciliationLatestResponse,
  type ConstructionReconciliationPresentationEnvelope,
  type ConstructionReconciliationRequest,
  type ConstructionReconciliationResult,
} from '../../shared/contracts/construction-reconciliation-v1.contract.js';
import {
  FinancialFactsPayloadV1_0_0Schema,
  FinancialFactsPayloadV1Schema,
  FinancialFactsPayloadV2Schema,
  FinancialFactsPayloadV3Schema,
  FinancialFactsPayloadV4Schema,
} from '../../shared/contracts/financial-facts-snapshot-v1.contract.js';
import {
  CurrentPlanVersionV1Schema,
  type CurrentPlanVersionV1,
} from '../../shared/contracts/current-plan-version-v1.contract.js';
import {
  CALC_SUBSTRATE_CONTRACT_VERSION,
  Sha256HexSchema,
  type CalcBasis,
} from '../../shared/core/calc-substrate/calc-basis.js';
import { toDatasetTrustState } from '../../shared/core/calc-substrate/calc-result.js';
import { computeResultHash } from '../../shared/core/calc-substrate/hash-admission.js';
import { canonicalSha256 } from '../../shared/lib/canonical-hash.js';
import { Decimal } from '../../shared/lib/decimal-config.js';
import { toFixedDecimalString } from '../../shared/lib/decimal-string.js';
import {
  StructuredWarningSchema,
  type StructuredWarning,
} from '../../shared/contracts/provenance-envelope.contract.js';
import {
  currentPlanVersions,
  type CurrentPlanVersionRow,
} from '../../shared/schema/current-plans.js';
import {
  financialFactsSnapshots,
  type FinancialFactsSnapshot,
} from '../../shared/schema/financial-facts-snapshots.js';
import { funds, fundSnapshots } from '../../shared/schema/fund.js';

const routeLog = createRouteLogger('construction-reconciliation');

const CONTRACT_VERSION = 'construction-reconciliation/1.0.0' as const;
const CALCULATION_KEY = 'construction-reconciliation' as const;
const ENGINE_VERSION = 'construction-rec-v1' as const;
const METHODOLOGY_VERSION = CONTRACT_VERSION;
const SNAPSHOT_TYPE = 'CONSTRUCTION_RECONCILIATION' as const;

type ConstructionReconciliationDatabase = typeof db;
type ConstructionReconciliationTransaction = Parameters<
  Parameters<ConstructionReconciliationDatabase['transaction']>[0]
>[0];
type ConstructionReconciliationExecutor =
  ConstructionReconciliationDatabase | ConstructionReconciliationTransaction;
type FundSnapshotRow = typeof fundSnapshots.$inferSelect;

const FinancialFactsPayloadSchema = z.union([
  FinancialFactsPayloadV1_0_0Schema,
  FinancialFactsPayloadV1Schema,
  FinancialFactsPayloadV2Schema,
  FinancialFactsPayloadV3Schema,
  FinancialFactsPayloadV4Schema,
]);

type FactsPayload = z.infer<typeof FinancialFactsPayloadSchema>;
export type ConstructionReconciliationActualFact = FactsPayload['companyActuals']['facts'][number];

const SnapshotMetadataSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(128),
    requestHash: Sha256HexSchema,
    currentPlanVersionId: z.number().int().positive(),
    financialFactsSnapshotId: z.number().int().positive(),
    // The facts snapshot id the caller supplied, or null when the server
    // resolved the current head. Needed to recompute the stored requestHash,
    // whose preimage is the request exactly as supplied.
    requestedFactsSnapshotId: z.number().int().positive().nullable(),
    asOfDate: z.string().date(),
    // Provenance-side warnings captured at compute time so replays and
    // GET-latest reads keep serving the original financial disclosures.
    structuredWarnings: z.array(StructuredWarningSchema),
  })
  .strict();

type SnapshotMetadata = z.infer<typeof SnapshotMetadataSchema>;

export class ConstructionReconciliationServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ConstructionReconciliationServiceError';
  }
}

export interface RunConstructionReconciliationInput {
  fundId: number;
  idempotencyKey: string;
  request: ConstructionReconciliationRequest;
  correlationId?: string;
  database?: ConstructionReconciliationDatabase;
}

export interface ConstructionReconciliationRunResult {
  envelope: ConstructionReconciliationPresentationEnvelope;
  replayed: boolean;
  /** True when a persisted snapshot row exists for the command (fresh insert or replay). */
  persisted: boolean;
}

export interface ConstructionReconciliationServiceOptions {
  database?: ConstructionReconciliationDatabase;
}

function invalidStoredSnapshot(
  row: FundSnapshotRow,
  reason: string,
  cause?: unknown
): ConstructionReconciliationServiceError {
  routeLog.error(
    {
      err: cause,
      fundId: row.fundId,
      snapshotId: row.id,
      reason,
    },
    'Persisted construction reconciliation failed integrity validation'
  );
  return new ConstructionReconciliationServiceError(
    500,
    'CONSTRUCTION_RECONCILIATION_SNAPSHOT_INVALID',
    'Persisted construction reconciliation failed integrity validation.'
  );
}

function requestHashForStoredSnapshot(row: FundSnapshotRow, metadata: SnapshotMetadata): string {
  return canonicalSha256({
    contractVersion: CONTRACT_VERSION,
    fundId: row.fundId,
    currentPlanVersionId: metadata.currentPlanVersionId,
    ...(metadata.requestedFactsSnapshotId === null
      ? {}
      : { financialFactsSnapshotId: metadata.requestedFactsSnapshotId }),
  });
}

function parseStoredSnapshot(
  row: FundSnapshotRow,
  expectedIdempotencyKey?: string
): { metadata: SnapshotMetadata; result: ConstructionReconciliationResult } {
  let metadata: SnapshotMetadata;
  try {
    metadata = SnapshotMetadataSchema.parse(row.metadata);
  } catch (error) {
    throw invalidStoredSnapshot(row, 'metadata_shape', error);
  }

  if (expectedIdempotencyKey !== undefined && metadata.idempotencyKey !== expectedIdempotencyKey) {
    throw invalidStoredSnapshot(row, 'idempotency_key_mismatch');
  }

  if (metadata.requestHash !== requestHashForStoredSnapshot(row, metadata)) {
    throw invalidStoredSnapshot(row, 'request_hash_mismatch');
  }

  if (row.calcVersion !== ENGINE_VERSION) {
    throw invalidStoredSnapshot(row, 'calc_version_mismatch');
  }

  let result: ConstructionReconciliationResult;
  try {
    result = ConstructionReconciliationResultSchema.parse(row.payload);
  } catch (error) {
    throw invalidStoredSnapshot(row, 'payload_contract', error);
  }

  // The C1A basis is fully specified by the plan; a stored payload whose basis
  // drifts from the pinned constants fails closed even if hashes are
  // self-consistent.
  const basis = result.basis;
  if (
    basis.contractVersion !== CALC_SUBSTRATE_CONTRACT_VERSION ||
    basis.calculationKey !== CALCULATION_KEY ||
    basis.configuredMode !== 'on' ||
    basis.effectiveMode !== 'on' ||
    basis.killSwitchActive !== false ||
    basis.engineVersion !== ENGINE_VERSION ||
    basis.methodologyVersion !== METHODOLOGY_VERSION
  ) {
    throw invalidStoredSnapshot(row, 'basis_constants');
  }

  if (result.state !== 'available' && result.state !== 'indicative') {
    throw invalidStoredSnapshot(row, 'non_persistable_state');
  }

  if (row.stateHash !== result.resultHash) {
    throw invalidStoredSnapshot(row, 'state_hash_mismatch');
  }

  let recomputedHash: string;
  try {
    recomputedHash = computeResultHash(result.basis, result.value);
  } catch (error) {
    throw invalidStoredSnapshot(row, 'result_hash_recompute_failed', error);
  }

  if (recomputedHash !== result.resultHash) {
    throw invalidStoredSnapshot(row, 'result_hash_mismatch');
  }

  if (metadata.asOfDate !== result.value.asOfDate) {
    throw invalidStoredSnapshot(row, 'as_of_date_mismatch');
  }

  return { metadata, result };
}

function presentationEnvelopeFromResult(
  result: ConstructionReconciliationResult,
  structuredWarnings: StructuredWarning[]
): ConstructionReconciliationPresentationEnvelope {
  return ConstructionReconciliationPresentationEnvelopeSchema.parse({
    result,
    structuredWarnings,
    trustState: toDatasetTrustState(result.state),
  });
}

function presentationEnvelopeFromStoredSnapshot(
  row: FundSnapshotRow,
  expectedIdempotencyKey?: string
): ConstructionReconciliationPresentationEnvelope {
  const { metadata, result } = parseStoredSnapshot(row, expectedIdempotencyKey);
  return presentationEnvelopeFromResult(result, metadata.structuredWarnings);
}

function loadExistingFactory(
  database: ConstructionReconciliationExecutor,
  fundId: number,
  idempotencyKey: string
): IdempotentCommandReplayOptions<FundSnapshotRow>['loadExisting'] {
  return async () => {
    const [row] = await database
      .select()
      .from(fundSnapshots)
      .where(
        and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, SNAPSHOT_TYPE),
          isNull(fundSnapshots.scenarioSetId),
          sql`${fundSnapshots.metadata}->>'idempotencyKey' = ${idempotencyKey}`
        )
      )
      .orderBy(desc(fundSnapshots.id))
      .limit(1);

    if (row === undefined) return null;

    const { metadata } = parseStoredSnapshot(row, idempotencyKey);
    return { row, requestHash: metadata.requestHash };
  };
}

async function assertFundExists(
  database: ConstructionReconciliationExecutor,
  fundId: number
): Promise<void> {
  const [fund] = await database
    .select({ id: funds.id })
    .from(funds)
    .where(eq(funds.id, fundId))
    .limit(1);

  if (fund === undefined) {
    throw new ConstructionReconciliationServiceError(
      404,
      'FUND_NOT_FOUND',
      `Fund ${fundId} was not found.`
    );
  }
}

function planFromRow(row: CurrentPlanVersionRow): CurrentPlanVersionV1 {
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

async function loadCurrentPlan(
  database: ConstructionReconciliationExecutor,
  fundId: number,
  planId: number
): Promise<{ row: CurrentPlanVersionRow; plan: CurrentPlanVersionV1 }> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind: 'current_plan_version', id: planId },
  });

  const [row] = await database
    .select()
    .from(currentPlanVersions)
    .where(
      and(
        eq(currentPlanVersions.id, planId),
        eq(currentPlanVersions.fundId, fundId),
        isNull(currentPlanVersions.supersededByVersionId)
      )
    )
    .limit(1);

  if (row === undefined) {
    throw new ConstructionReconciliationServiceError(
      409,
      'CURRENT_PLAN_VERSION_NOT_HEAD',
      `Current plan version ${planId} is not the current head for fund ${fundId}.`
    );
  }

  return { row, plan: planFromRow(row) };
}

async function resolveCurrentFactsSnapshotId(
  database: ConstructionReconciliationExecutor,
  fundId: number
): Promise<number> {
  const [row] = await database
    .select({ id: financialFactsSnapshots.id })
    .from(financialFactsSnapshots)
    .where(
      and(
        eq(financialFactsSnapshots.fundId, fundId),
        sql`NOT EXISTS (
          SELECT 1
          FROM ${financialFactsSnapshots} AS successor
          WHERE successor.fund_id = ${financialFactsSnapshots.fundId}
            AND successor.supersedes_snapshot_id = ${financialFactsSnapshots.id}
        )`
      )
    )
    .orderBy(desc(financialFactsSnapshots.id))
    .limit(1);

  if (row === undefined) {
    throw new ConstructionReconciliationServiceError(
      409,
      'FINANCIAL_FACTS_SNAPSHOT_NOT_CURRENT',
      `No current financial-facts snapshot exists for fund ${fundId}.`
    );
  }

  return row.id;
}

async function loadCurrentFactsSnapshot(
  database: ConstructionReconciliationExecutor,
  fundId: number,
  snapshotId: number
): Promise<{ row: FinancialFactsSnapshot; payload: FactsPayload }> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind: 'facts_snapshot', id: snapshotId },
  });

  const [row] = await database
    .select()
    .from(financialFactsSnapshots)
    .where(
      and(
        eq(financialFactsSnapshots.id, snapshotId),
        eq(financialFactsSnapshots.fundId, fundId),
        sql`NOT EXISTS (
          SELECT 1
          FROM ${financialFactsSnapshots} AS successor
          WHERE successor.fund_id = ${financialFactsSnapshots.fundId}
            AND successor.supersedes_snapshot_id = ${financialFactsSnapshots.id}
        )`
      )
    )
    .limit(1);

  if (row === undefined) {
    throw new ConstructionReconciliationServiceError(
      409,
      'FINANCIAL_FACTS_SNAPSHOT_NOT_CURRENT',
      `Financial-facts snapshot ${snapshotId} is not current for fund ${fundId}.`
    );
  }

  const parsedPayload = FinancialFactsPayloadSchema.safeParse(row.payload);
  if (!parsedPayload.success) {
    throw new ConstructionReconciliationServiceError(
      500,
      'FINANCIAL_FACTS_SNAPSHOT_INVALID',
      'The selected financial-facts snapshot does not satisfy its persisted contract.'
    );
  }

  const payload = parsedPayload.data;
  if (
    payload.companyActuals.fundId !== fundId ||
    payload.companyActuals.asOfDate !== row.asOfDate ||
    payload.companyActuals.facts.some((fact) => fact.fundId !== fundId)
  ) {
    throw new ConstructionReconciliationServiceError(
      500,
      'FINANCIAL_FACTS_SNAPSHOT_INVALID',
      'The selected financial-facts snapshot has inconsistent fund or as-of-date anchors.'
    );
  }

  return { row, payload };
}

export function reduceState(facts: readonly ConstructionReconciliationActualFact[]):
  | { state: 'available'; reasonCodes: [] }
  | { state: 'indicative'; reasonCodes: ['STALE_SOURCE'] }
  | {
      state: 'unavailable';
      reasonCodes: ['INPUT_MISSING'] | ['UPSTREAM_UNAVAILABLE'] | ['INPUT_INVALID'];
    } {
  if (facts.length === 0) {
    return { state: 'unavailable', reasonCodes: ['INPUT_MISSING'] };
  }

  if (
    facts.some(
      (fact) =>
        fact.provenance.trustState === 'UNAVAILABLE' || fact.provenance.trustState === 'FAILED'
    )
  ) {
    return { state: 'unavailable', reasonCodes: ['UPSTREAM_UNAVAILABLE'] };
  }

  if (
    facts.some(
      (fact) => fact.currencyStatus === 'mismatch_blocked' || fact.currencyStatus === 'unknown'
    )
  ) {
    return { state: 'unavailable', reasonCodes: ['INPUT_INVALID'] };
  }

  if (facts.some((fact) => fact.provenance.trustState === 'PARTIAL')) {
    return { state: 'indicative', reasonCodes: ['STALE_SOURCE'] };
  }

  return { state: 'available', reasonCodes: [] };
}

export function buildValue(params: {
  plan: CurrentPlanVersionV1;
  facts: readonly ConstructionReconciliationActualFact[];
  asOfDate: string;
}): z.infer<typeof ConstructionReconciliationValueSchema> {
  const deployableCapital = new Decimal(params.plan.deployableCapitalUsd);
  const plannedInitial = params.plan.allocations.reduce(
    (sum, allocation) => sum.plus(allocation.initialCapitalUsd),
    new Decimal(0)
  );
  const plannedFollowOn = params.plan.allocations.reduce(
    (sum, allocation) => sum.plus(allocation.followOnCapitalUsd),
    new Decimal(0)
  );
  const plannedTotal = plannedInitial.plus(plannedFollowOn);
  const plannedCapitalOverDeployable = Decimal.max(plannedTotal.minus(deployableCapital), 0);
  const actualInitial = params.facts.reduce(
    (sum, fact) => sum.plus(fact.initialInvestmentAmount),
    new Decimal(0)
  );
  const actualFollowOn = params.facts.reduce(
    (sum, fact) => sum.plus(fact.followOnInvestmentAmount),
    new Decimal(0)
  );
  const excludedNonEquity = params.facts.reduce(
    (sum, fact) => sum.plus(fact.amountOnlyNonEquityAmount),
    new Decimal(0)
  );
  const actualTotalEquity = actualInitial.plus(actualFollowOn);
  const remainingDeployable = Decimal.max(deployableCapital.minus(actualTotalEquity), 0);
  const plannedRemaining = Decimal.max(plannedTotal.minus(actualTotalEquity), 0);
  const remainingDeployableGap = remainingDeployable.minus(plannedRemaining);

  return ConstructionReconciliationValueSchema.parse({
    deployableCapitalUsd: toFixedDecimalString(deployableCapital, 6),
    plannedInitialUsd: toFixedDecimalString(plannedInitial, 6),
    plannedFollowOnUsd: toFixedDecimalString(plannedFollowOn, 6),
    plannedTotalUsd: toFixedDecimalString(plannedTotal, 6),
    plannedCapitalOverDeployableUsd: toFixedDecimalString(plannedCapitalOverDeployable, 6),
    actualInitialUsd: toFixedDecimalString(actualInitial, 6),
    actualFollowOnUsd: toFixedDecimalString(actualFollowOn, 6),
    actualTotalEquityUsd: toFixedDecimalString(actualTotalEquity, 6),
    excludedNonEquityUsd: toFixedDecimalString(excludedNonEquity, 6),
    remainingDeployableUsd: toFixedDecimalString(remainingDeployable, 6),
    plannedRemainingUsd: toFixedDecimalString(plannedRemaining, 6),
    remainingDeployableGapUsd: toFixedDecimalString(remainingDeployableGap, 6),
    asOfDate: params.asOfDate,
    currency: 'USD',
  });
}

export function buildResult(params: {
  basis: CalcBasis;
  plan: CurrentPlanVersionV1;
  facts: readonly ConstructionReconciliationActualFact[];
  asOfDate: string;
}): ConstructionReconciliationResult {
  try {
    const reduced = reduceState(params.facts);
    if (reduced.state === 'unavailable') {
      return ConstructionReconciliationResultSchema.parse({
        state: reduced.state,
        basis: params.basis,
        reasonCodes: reduced.reasonCodes,
      });
    }

    const value = buildValue({
      plan: params.plan,
      facts: params.facts,
      asOfDate: params.asOfDate,
    });
    const resultHash = computeResultHash(params.basis, value);
    return ConstructionReconciliationResultSchema.parse({
      state: reduced.state,
      basis: params.basis,
      value,
      resultHash,
      reasonCodes: reduced.reasonCodes,
    });
  } catch (error) {
    routeLog.error({ err: error }, 'Construction reconciliation calculation failed');
    return ConstructionReconciliationResultSchema.parse({
      state: 'failed',
      basis: params.basis,
      reasonCodes: ['ENGINE_ERROR'],
    });
  }
}

export function structuredWarningsFromFacts(
  facts: readonly ConstructionReconciliationActualFact[]
): StructuredWarning[] {
  return facts.flatMap((fact) => fact.warnings);
}

function buildBasis(params: {
  fundId: number;
  currentPlanVersionId: number;
  financialFactsSnapshotId: number;
  snapshotInputHash: string;
  assumptionsHash: string;
}): CalcBasis {
  return {
    contractVersion: CALC_SUBSTRATE_CONTRACT_VERSION,
    calculationKey: CALCULATION_KEY,
    configuredMode: 'on',
    effectiveMode: 'on',
    killSwitchActive: false,
    engineVersion: ENGINE_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    inputHash: canonicalSha256({
      fundId: params.fundId,
      currentPlanVersionId: params.currentPlanVersionId,
      financialFactsSnapshotId: params.financialFactsSnapshotId,
      snapshotInputHash: params.snapshotInputHash,
    }),
    assumptionsHash: params.assumptionsHash,
  };
}

function snapshotCorrelationId(value: string | undefined): string {
  const candidate = value?.trim();
  return candidate !== undefined && candidate.length > 0 && candidate.length <= 36
    ? candidate
    : randomUUID();
}

function persistedEnvelopeFromStoredSnapshotWithLabels(
  row: FundSnapshotRow
): ConstructionReconciliationLatestResponse {
  const { metadata, result } = parseStoredSnapshot(row);
  return ConstructionReconciliationLatestResponseSchema.parse({
    state: 'persisted',
    result,
    structuredWarnings: metadata.structuredWarnings,
    trustState: toDatasetTrustState(result.state),
    currentPlanVersionId: metadata.currentPlanVersionId,
    financialFactsSnapshotId: metadata.financialFactsSnapshotId,
    asOfDate: metadata.asOfDate,
  });
}

export async function runConstructionReconciliation(
  input: RunConstructionReconciliationInput
): Promise<ConstructionReconciliationRunResult> {
  const database = input.database ?? db;
  const parsedRequest = ConstructionReconciliationRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    throw new ConstructionReconciliationServiceError(
      400,
      'INVALID_CONSTRUCTION_RECONCILIATION_REQUEST',
      'The construction reconciliation request is invalid.',
      parsedRequest.error.format()
    );
  }
  const request = parsedRequest.data;

  if (request.fundId !== input.fundId) {
    throw new ConstructionReconciliationServiceError(
      400,
      'FUND_ID_MISMATCH',
      'Request fundId must equal the route fundId.'
    );
  }

  const loadExisting = loadExistingFactory(database, input.fundId, input.idempotencyKey);
  const replayOptions: IdempotentCommandReplayOptions<FundSnapshotRow> = {
    db: database,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
    request,
    contractVersion: CONTRACT_VERSION,
    loadExisting,
  };

  const preTransactionReplay = await replayIdempotentCommandIfPresent(replayOptions);
  if (preTransactionReplay !== null) {
    return {
      envelope: presentationEnvelopeFromStoredSnapshot(
        preTransactionReplay.row,
        input.idempotencyKey
      ),
      replayed: true,
      persisted: true,
    };
  }

  return runInTransaction(database, async (transaction) => {
    const lockKey = generateLockKey('construction-reconciliation', String(input.fundId));
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(${lockKey.toString()}::bigint)`);

    const postLockReplay = await replayIdempotentCommandIfPresent({
      ...replayOptions,
      db: transaction,
      loadExisting: loadExistingFactory(transaction, input.fundId, input.idempotencyKey),
    });
    if (postLockReplay !== null) {
      return {
        envelope: presentationEnvelopeFromStoredSnapshot(postLockReplay.row, input.idempotencyKey),
        replayed: true,
        persisted: true,
      };
    }

    await assertFundExists(transaction, input.fundId);
    const { row: planRow, plan } = await loadCurrentPlan(
      transaction,
      input.fundId,
      request.currentPlanVersionId
    );
    const requestedFactsSnapshotId = request.financialFactsSnapshotId ?? null;
    const factsSnapshotId =
      requestedFactsSnapshotId ?? (await resolveCurrentFactsSnapshotId(transaction, input.fundId));
    const { row: factsRow, payload } = await loadCurrentFactsSnapshot(
      transaction,
      input.fundId,
      factsSnapshotId
    );
    const facts = payload.companyActuals.facts;
    const basis = buildBasis({
      fundId: input.fundId,
      currentPlanVersionId: planRow.id,
      financialFactsSnapshotId: factsRow.id,
      snapshotInputHash: factsRow.snapshotInputHash,
      assumptionsHash: planRow.assumptionsHash,
    });
    const result = buildResult({
      basis,
      plan,
      facts,
      asOfDate: factsRow.asOfDate,
    });
    const envelope = presentationEnvelopeFromResult(result, structuredWarningsFromFacts(facts));

    if (result.state !== 'available' && result.state !== 'indicative') {
      return { envelope, replayed: false, persisted: false };
    }

    const snapshotTime = new Date();
    const command = await runIdempotentCommand<FundSnapshotRow>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      request,
      contractVersion: CONTRACT_VERSION,
      loadExisting: loadExistingFactory(transaction, input.fundId, input.idempotencyKey),
      insert: async (requestHash) => {
        const [inserted] = await transaction
          .insert(fundSnapshots)
          .values({
            fundId: input.fundId,
            type: SNAPSHOT_TYPE,
            payload: result,
            calcVersion: ENGINE_VERSION,
            correlationId: snapshotCorrelationId(input.correlationId),
            metadata: {
              idempotencyKey: input.idempotencyKey,
              requestHash,
              currentPlanVersionId: planRow.id,
              financialFactsSnapshotId: factsRow.id,
              requestedFactsSnapshotId,
              asOfDate: factsRow.asOfDate,
              structuredWarnings: envelope.structuredWarnings,
            },
            snapshotTime,
            stateHash: result.resultHash,
            state: null,
            scenarioSetId: null,
          })
          .returning();
        return inserted ?? null;
      },
    });

    if (command.row === undefined) {
      throw new ConstructionReconciliationServiceError(
        500,
        'CONSTRUCTION_RECONCILIATION_SNAPSHOT_WRITE_FAILED',
        'Construction reconciliation snapshot insert did not return a row.'
      );
    }

    return {
      envelope: command.replayed
        ? presentationEnvelopeFromStoredSnapshot(command.row, input.idempotencyKey)
        : envelope,
      replayed: command.replayed,
      persisted: true,
    };
  });
}

export async function getLatestConstructionReconciliation(
  fundId: number,
  options: ConstructionReconciliationServiceOptions = {}
): Promise<ConstructionReconciliationLatestResponse> {
  const database = options.database ?? db;
  const [row] = await database
    .select()
    .from(fundSnapshots)
    .where(
      and(
        eq(fundSnapshots.fundId, fundId),
        eq(fundSnapshots.type, SNAPSHOT_TYPE),
        isNull(fundSnapshots.scenarioSetId)
      )
    )
    .orderBy(
      desc(fundSnapshots.snapshotTime),
      desc(fundSnapshots.createdAt),
      desc(fundSnapshots.id)
    )
    .limit(1);

  if (row === undefined) {
    return { state: 'no_persisted_reconciliation' };
  }

  return persistedEnvelopeFromStoredSnapshotWithLabels(row);
}
