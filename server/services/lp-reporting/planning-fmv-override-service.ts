import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import { logger } from '../../lib/logger';
import { generateLockKey } from '../../lib/locks';
import type {
  PlanningFmvOverrideCreateRequest,
  PlanningFmvOverrideCreateResponse,
  PlanningFmvOverrideLatestResponse,
  PlanningFmvOverrideRecord,
} from '@shared/contracts/lp-reporting';
import {
  PlanningFmvOverrideCreateResponseSchema,
  PlanningFmvOverrideRecordSchema,
} from '@shared/contracts/lp-reporting';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import {
  planningFmvOverrideRequests,
  valuationMarks,
  type PlanningFmvOverrideRequest,
  type ValuationMark,
} from '@shared/schema/lp-reporting-evidence';
import { portfolioCompanies } from '@shared/schema/portfolio';
import { invalidateH9Artifacts } from '../h9-artifact-invalidation-service';
import { selectActiveValuationMarks } from './active-valuation-mark-selector';
import type { ConfidenceLevel, MarkStatus, ParsedValuationMark } from './metrics-engine';

type PlanningFmvDatabase = typeof db;

const log = logger.child({ module: 'lp-reporting:planning-fmv-override' });

export class PlanningFmvOverrideError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'PlanningFmvOverrideError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface PlanningFmvActor {
  userId: number | null;
}

export interface CreatePlanningFmvOverrideInput {
  fundId: number;
  idempotencyKey: string;
  actor: PlanningFmvActor;
  body: PlanningFmvOverrideCreateRequest;
}

export interface PlanningFmvOverrideServiceOptions {
  database?: PlanningFmvDatabase;
}

function isoDateTime(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isoDay(value: Date | string): string {
  return isoDateTime(value)?.slice(0, 10) ?? '';
}

function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
  return (
    candidate.code === '23505' &&
    (candidate.constraint === constraintName ||
      (typeof candidate.message === 'string' && candidate.message.includes(constraintName)))
  );
}

function requestHashFor(input: CreatePlanningFmvOverrideInput): string {
  return canonicalSha256({
    fundId: input.fundId,
    body: input.body,
  });
}

function sourceHashFor(input: CreatePlanningFmvOverrideInput): string {
  return canonicalSha256({
    origin: 'planning_fmv_override',
    fundId: input.fundId,
    companyId: input.body.companyId,
    markDate: input.body.markDate,
    asOfDate: input.body.asOfDate ?? input.body.markDate,
    fairValue: input.body.fairValue,
    currency: input.body.currency,
    confidenceLevel: input.body.confidenceLevel,
    source: input.body.source,
  });
}

function toParsedMark(row: ValuationMark): ParsedValuationMark {
  return {
    id: row.id,
    fairValue: row.fairValue,
    markDate: isoDay(row.markDate),
    asOfDate: isoDay(row.asOfDate),
    ...(row.status != null && { status: row.status as MarkStatus }),
    confidenceLevel: row.confidenceLevel as ConfidenceLevel,
    companyId: row.companyId,
  };
}

function toPlanningRecord(row: ValuationMark): PlanningFmvOverrideRecord {
  return PlanningFmvOverrideRecordSchema.parse({
    id: row.id,
    fundId: row.fundId,
    companyId: row.companyId,
    markDate: isoDay(row.markDate),
    asOfDate: isoDay(row.asOfDate),
    fairValue: row.fairValue,
    currency: row.currency,
    confidenceLevel: row.confidenceLevel,
    status: row.status,
    priorMarkId: row.priorMarkId ?? null,
    methodologyNotes: row.methodologyNotes ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: isoDateTime(row.approvedAt),
    createdAt: isoDateTime(row.createdAt),
  });
}

async function withTransaction<T>(
  database: PlanningFmvDatabase,
  operation: (transaction: PlanningFmvDatabase) => Promise<T>
): Promise<T> {
  const candidate = database as PlanningFmvDatabase & {
    transaction?: (operation: (transaction: PlanningFmvDatabase) => Promise<T>) => Promise<T>;
  };
  if (typeof candidate.transaction === 'function') {
    return candidate.transaction((transaction) => operation(transaction));
  }
  return operation(database);
}

async function acquirePlanningFmvLock(
  database: PlanningFmvDatabase,
  fundId: number,
  companyId: number
): Promise<void> {
  const candidate = database as PlanningFmvDatabase & {
    execute?: (query: unknown) => Promise<unknown>;
  };
  if (typeof candidate.execute !== 'function') {
    return;
  }

  const lockKey = generateLockKey('planning-fmv-override', `${fundId}:${companyId}`);
  await candidate.execute(sql`SELECT pg_advisory_xact_lock(${lockKey.toString()}::bigint)`);
}

async function loadRequestByIdempotencyKey(
  database: PlanningFmvDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<PlanningFmvOverrideRequest | undefined> {
  const rows = await database
    .select()
    .from(planningFmvOverrideRequests)
    .where(
      and(
        eq(planningFmvOverrideRequests.fundId, fundId),
        eq(planningFmvOverrideRequests.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return rows[0];
}

async function loadPlanningMarksForCompany(
  database: PlanningFmvDatabase,
  fundId: number,
  companyId: number
): Promise<ValuationMark[]> {
  const rows = await database
    .select()
    .from(valuationMarks)
    .where(and(eq(valuationMarks.fundId, fundId), eq(valuationMarks.companyId, companyId)))
    .orderBy(desc(valuationMarks.markDate), desc(valuationMarks.id));
  return rows.filter(
    (row) =>
      row.fundId === fundId &&
      row.companyId === companyId &&
      row.importedFrom === 'planning_fmv_override' &&
      (row.status === 'approved' || row.status === 'locked')
  );
}

async function assertCompanyBelongsToFund(
  database: PlanningFmvDatabase,
  fundId: number,
  companyId: number
): Promise<void> {
  const rows = await database
    .select({ id: portfolioCompanies.id, fundId: portfolioCompanies.fundId })
    .from(portfolioCompanies)
    .where(and(eq(portfolioCompanies.id, companyId), eq(portfolioCompanies.fundId, fundId)))
    .limit(1);

  const matched = rows.some((row) => row.id === companyId && row.fundId === fundId);
  if (!matched) {
    throw new PlanningFmvOverrideError(
      404,
      'planning_fmv_company_not_found',
      `Portfolio company ${companyId} was not found in fund ${fundId}.`
    );
  }
}

async function insertPendingRequest(
  database: PlanningFmvDatabase,
  input: CreatePlanningFmvOverrideInput,
  requestHash: string,
  sourceHash: string
): Promise<PlanningFmvOverrideRequest | null> {
  const inserted = await database
    .insert(planningFmvOverrideRequests)
    .values({
      fundId: input.fundId,
      companyId: input.body.companyId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      sourceHash,
      status: 'pending',
      createdBy: input.actor.userId,
    })
    .onConflictDoNothing({
      target: [planningFmvOverrideRequests.fundId, planningFmvOverrideRequests.idempotencyKey],
    })
    .returning();
  return inserted[0] ?? null;
}

function replayCompletedRequest(
  row: PlanningFmvOverrideRequest,
  idempotencyKey: string
): PlanningFmvOverrideCreateResponse {
  if (row.responseBody === null) {
    throw new PlanningFmvOverrideError(
      409,
      'planning_fmv_request_failed',
      'The completed Planning FMV override request has no stored response body.'
    );
  }

  const parsed = PlanningFmvOverrideCreateResponseSchema.parse(row.responseBody);
  return {
    ...parsed,
    idempotencyKey,
    replayed: true,
  };
}

function handleExistingRequest(
  existing: PlanningFmvOverrideRequest,
  requestHash: string,
  idempotencyKey: string
): PlanningFmvOverrideCreateResponse {
  if (existing.requestHash !== requestHash) {
    log.info(
      {
        fundId: existing.fundId,
        companyId: existing.companyId,
        requestId: existing.id,
      },
      'lp_reporting.planning_fmv_override.idempotency_conflict'
    );
    throw new PlanningFmvOverrideError(
      409,
      'planning_fmv_idempotency_key_reused',
      'Idempotency-Key was already used for a different Planning FMV override request.'
    );
  }

  if (existing.status === 'completed') {
    log.info(
      {
        fundId: existing.fundId,
        companyId: existing.companyId,
        requestId: existing.id,
      },
      'lp_reporting.planning_fmv_override.replay'
    );
    return replayCompletedRequest(existing, idempotencyKey);
  }

  if (existing.status === 'pending') {
    throw new PlanningFmvOverrideError(
      409,
      'planning_fmv_request_pending',
      'A Planning FMV override request with this Idempotency-Key is still pending.'
    );
  }

  throw new PlanningFmvOverrideError(
    409,
    'planning_fmv_request_failed',
    'A Planning FMV override request with this Idempotency-Key previously failed.'
  );
}

async function markRequestFailed(
  database: PlanningFmvDatabase,
  requestId: number,
  error: PlanningFmvOverrideError
): Promise<void> {
  await database
    .update(planningFmvOverrideRequests)
    .set({
      status: 'failed',
      failureCode: error.code,
      failureMessage: error.message,
      updatedAt: new Date(),
    })
    .where(eq(planningFmvOverrideRequests.id, requestId));
}

async function writePlanningFmvMark(
  database: PlanningFmvDatabase,
  input: CreatePlanningFmvOverrideInput,
  requestRow: PlanningFmvOverrideRequest,
  sourceHash: string
): Promise<PlanningFmvOverrideCreateResponse> {
  return withTransaction(database, async (transaction) => {
    await acquirePlanningFmvLock(transaction, input.fundId, input.body.companyId);
    await assertCompanyBelongsToFund(transaction, input.fundId, input.body.companyId);

    const priorCandidates = await loadPlanningMarksForCompany(
      transaction,
      input.fundId,
      input.body.companyId
    );
    const priorSelection = selectActiveValuationMarks(
      priorCandidates.map(toParsedMark),
      input.body.markDate
    );
    const priorMarkId = priorSelection.active[0]?.id ?? null;
    const now = new Date();
    const asOfDate = input.body.asOfDate ?? input.body.markDate;
    const [insertedMark] = await transaction
      .insert(valuationMarks)
      .values({
        fundId: input.fundId,
        companyId: input.body.companyId,
        markDate: input.body.markDate,
        asOfDate,
        fairValue: input.body.fairValue,
        currency: input.body.currency,
        markSource: 'gp_estimate',
        confidenceLevel: input.body.confidenceLevel,
        valuationMethod: 'planning_fmv_override',
        methodologyNotes: input.body.methodologyNotes ?? input.body.reason,
        status: 'approved',
        priorMarkId,
        approvedBy: input.actor.userId,
        approvedAt: now,
        importedFrom: 'planning_fmv_override',
        sourceHash,
        createdBy: input.actor.userId,
      })
      .returning();

    if (!insertedMark) {
      throw new PlanningFmvOverrideError(
        500,
        'planning_fmv_invalid_request',
        'Planning FMV override did not return an inserted valuation mark.'
      );
    }

    const response = PlanningFmvOverrideCreateResponseSchema.parse({
      requestId: requestRow.id,
      idempotencyKey: input.idempotencyKey,
      replayed: false,
      valuationMark: toPlanningRecord(insertedMark),
    });

    await transaction
      .update(planningFmvOverrideRequests)
      .set({
        valuationMarkId: insertedMark.id,
        status: 'completed',
        responseBody: response,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(planningFmvOverrideRequests.id, requestRow.id));

    log.info(
      {
        fundId: input.fundId,
        companyId: input.body.companyId,
        requestId: requestRow.id,
        valuationMarkId: insertedMark.id,
        priorMarkId,
      },
      'lp_reporting.planning_fmv_override.write'
    );

    return response;
  });
}

export async function createPlanningFmvOverride(
  input: CreatePlanningFmvOverrideInput,
  options: PlanningFmvOverrideServiceOptions = {}
): Promise<PlanningFmvOverrideCreateResponse> {
  const database = options.database ?? db;
  const requestHash = requestHashFor(input);
  const sourceHash = sourceHashFor(input);
  const pending = await insertPendingRequest(database, input, requestHash, sourceHash);

  if (!pending) {
    const existing = await loadRequestByIdempotencyKey(
      database,
      input.fundId,
      input.idempotencyKey
    );
    if (!existing) {
      throw new PlanningFmvOverrideError(
        409,
        'planning_fmv_request_pending',
        'Planning FMV override idempotency conflict could not be resolved.'
      );
    }
    return handleExistingRequest(existing, requestHash, input.idempotencyKey);
  }

  try {
    const response = await writePlanningFmvMark(database, input, pending, sourceHash);
    await invalidateH9Artifacts(input.fundId);
    return response;
  } catch (error) {
    const mappedError =
      error instanceof PlanningFmvOverrideError
        ? error
        : isUniqueConstraintViolation(error, 'valuation_marks_fund_source_hash_unique')
          ? new PlanningFmvOverrideError(
              409,
              'planning_fmv_source_conflict',
              'A Planning FMV valuation mark with the same source evidence already exists.'
            )
          : error;

    if (mappedError instanceof PlanningFmvOverrideError) {
      await markRequestFailed(database, pending.id, mappedError);
      log.info(
        {
          fundId: input.fundId,
          companyId: input.body.companyId,
          requestId: pending.id,
          code: mappedError.code,
        },
        'lp_reporting.planning_fmv_override.failed'
      );
    }
    throw mappedError;
  }
}

export async function listLatestPlanningFmvOverrides(
  fundId: number,
  asOfDate: string,
  options: PlanningFmvOverrideServiceOptions = {}
): Promise<PlanningFmvOverrideLatestResponse> {
  const database = options.database ?? db;
  const rows = await database
    .select()
    .from(valuationMarks)
    .where(eq(valuationMarks.fundId, fundId))
    .orderBy(desc(valuationMarks.markDate), desc(valuationMarks.id));
  const planningRows = rows.filter(
    (row) =>
      row.fundId === fundId &&
      row.importedFrom === 'planning_fmv_override' &&
      (row.status === 'approved' || row.status === 'locked')
  );
  const selection = selectActiveValuationMarks(planningRows.map(toParsedMark), asOfDate);
  const activeIds = new Set(selection.active.map((mark) => mark.id));
  const marks = planningRows
    .filter((row) => activeIds.has(row.id))
    .sort((a, b) => a.companyId - b.companyId)
    .map(toPlanningRecord);

  return {
    asOfDate,
    marks,
  };
}
