/**
 * Operating Decisions service.
 *
 * Decision creation and supersession use durable request hashes. Lifecycle
 * changes use the row's Postgres xmin as the optimistic-lock token.
 *
 * @module server/services/operating-objects/decision-service
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import {
  DECISION_CONTRACT_VERSION,
  DecisionCreateSchema,
  DecisionOutcomeSchema,
  DecisionTransitionSchema,
  type DecisionCreate,
  type DecisionCreateCommandPreimage,
  type DecisionOutcome,
  type DecisionStatus,
  type DecisionSupersedeCommandPreimage,
  type DecisionTransition,
} from '@shared/contracts/operating-objects/decision.contract';
import { operatingDecisions, type OperatingDecision } from '@shared/schema/operating-objects';

import { db } from '../../db';
import { runIdempotentCommand } from '../../lib/idempotent-command';

type DecisionDatabase = typeof db;

export interface DecisionServiceOptions {
  database?: DecisionDatabase;
}

export interface DecisionRow {
  row: OperatingDecision;
  /** Postgres xmin system column as text -- opaque per-row concurrency token. */
  xmin: string;
}

export interface CreateDecisionInput extends DecisionCreate {
  /** Best-effort creator id (nullable users.id FK). */
  actorId: number | null;
  idempotencyKey: string;
}

export interface CreateDecisionResult extends DecisionRow {
  replayed: boolean;
}

export type TransitionDecisionInput = {
  fundId: number;
  decisionId: number;
  expectedXmin: string;
  transition: DecisionTransition;
};

export interface RecordDecisionOutcomeInput {
  fundId: number;
  decisionId: number;
  expectedXmin: string;
  outcome: DecisionOutcome['outcome'];
  actorId: number | null;
}

export interface SupersedeDecisionInput extends DecisionCreate {
  supersedesDecisionId: number;
  /** Best-effort creator id (nullable users.id FK). */
  actorId: number | null;
  idempotencyKey: string;
}

export class DecisionServiceError extends Error {
  readonly status: number;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'DecisionServiceError';
    this.status = statusCode;
  }
}

const columnsWithXmin = {
  id: operatingDecisions.id,
  fundId: operatingDecisions.fundId,
  title: operatingDecisions.title,
  recommendation: operatingDecisions.recommendation,
  status: operatingDecisions.status,
  supersedesDecisionId: operatingDecisions.supersedesDecisionId,
  outcome: operatingDecisions.outcome,
  outcomeRecordedAt: operatingDecisions.outcomeRecordedAt,
  outcomeRecordedBy: operatingDecisions.outcomeRecordedBy,
  followUpOwnerId: operatingDecisions.followUpOwnerId,
  followUpDate: operatingDecisions.followUpDate,
  idempotencyKey: operatingDecisions.idempotencyKey,
  requestHash: operatingDecisions.requestHash,
  createdBy: operatingDecisions.createdBy,
  createdAt: operatingDecisions.createdAt,
  updatedAt: operatingDecisions.updatedAt,
  rowXmin: sql<string>`xmin::text`,
} as const;

type DecisionRecordWithXmin = OperatingDecision & { rowXmin: string };

function splitXmin(record: DecisionRecordWithXmin): DecisionRow {
  const { rowXmin, ...row } = record;
  return { row: row as OperatingDecision, xmin: rowXmin };
}

function createFields(input: DecisionCreate): DecisionCreate {
  return DecisionCreateSchema.parse({
    fundId: input.fundId,
    title: input.title,
    recommendation: input.recommendation,
    ...(input.followUpOwnerId !== undefined ? { followUpOwnerId: input.followUpOwnerId } : {}),
    ...(input.followUpDate !== undefined ? { followUpDate: input.followUpDate } : {}),
  });
}

function decisionCreatePreimage(fields: DecisionCreate): DecisionCreateCommandPreimage {
  return {
    commandKind: 'create_decision',
    contractVersion: DECISION_CONTRACT_VERSION,
    fundId: fields.fundId,
    title: fields.title,
    recommendation: fields.recommendation,
    ...(fields.followUpOwnerId !== undefined ? { followUpOwnerId: fields.followUpOwnerId } : {}),
    ...(fields.followUpDate !== undefined ? { followUpDate: fields.followUpDate } : {}),
  };
}

function decisionSupersedePreimage(
  fields: DecisionCreate,
  supersedesDecisionId: number
): DecisionSupersedeCommandPreimage {
  return {
    ...decisionCreatePreimage(fields),
    commandKind: 'supersede_decision',
    supersedesDecisionId,
  };
}

function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  if (
    candidate.code === '23505' &&
    (candidate.constraint === constraintName ||
      (typeof candidate.message === 'string' && candidate.message.includes(constraintName)))
  ) {
    return true;
  }
  // Drizzle wraps driver errors in DrizzleQueryError with the pg error as cause.
  return (
    candidate.cause !== undefined && isUniqueConstraintViolation(candidate.cause, constraintName)
  );
}

async function loadDecisionByIdempotencyKey(
  database: DecisionDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<DecisionRow | undefined> {
  const [record] = await database
    .select(columnsWithXmin)
    .from(operatingDecisions)
    .where(
      and(
        eq(operatingDecisions.fundId, fundId),
        eq(operatingDecisions.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return record ? splitXmin(record) : undefined;
}

async function createDecisionCommand(
  database: DecisionDatabase,
  fields: DecisionCreate,
  actorId: number | null,
  idempotencyKey: string,
  supersedesDecisionId: number | null
): Promise<CreateDecisionResult> {
  const preimage =
    supersedesDecisionId === null
      ? decisionCreatePreimage(fields)
      : decisionSupersedePreimage(fields, supersedesDecisionId);

  const result = await runIdempotentCommand<DecisionRow>({
    db: database,
    fundId: fields.fundId,
    idempotencyKey,
    contractVersion: DECISION_CONTRACT_VERSION,
    request: preimage,
    loadExisting: async () => {
      const existing = await loadDecisionByIdempotencyKey(database, fields.fundId, idempotencyKey);
      if (!existing) return null;
      if (existing.row.requestHash === null) {
        throw new DecisionServiceError(
          500,
          'DECISION_IDEMPOTENCY_CORRUPT',
          'Decision idempotency row is missing its request hash.'
        );
      }
      return { row: existing, requestHash: existing.row.requestHash };
    },
    insert: async (requestHash) => {
      const [record] = await database
        .insert(operatingDecisions)
        .values({
          fundId: fields.fundId,
          title: fields.title,
          recommendation: fields.recommendation,
          status: 'proposed',
          supersedesDecisionId,
          followUpOwnerId: fields.followUpOwnerId ?? null,
          followUpDate: fields.followUpDate ?? null,
          idempotencyKey,
          requestHash,
          createdBy: actorId,
        })
        .onConflictDoNothing({
          target: [operatingDecisions.fundId, operatingDecisions.idempotencyKey],
        })
        .returning(columnsWithXmin);
      return record ? splitXmin(record) : null;
    },
  });

  return { ...result.row, replayed: result.replayed };
}

export async function createDecision(
  input: CreateDecisionInput,
  options: DecisionServiceOptions = {}
): Promise<CreateDecisionResult> {
  const database = options.database ?? db;
  const fields = createFields(input);
  return createDecisionCommand(database, fields, input.actorId, input.idempotencyKey, null);
}

export async function loadDecision(
  fundId: number,
  decisionId: number,
  options: DecisionServiceOptions = {}
): Promise<DecisionRow | undefined> {
  const database = options.database ?? db;
  const [record] = await database
    .select(columnsWithXmin)
    .from(operatingDecisions)
    .where(and(eq(operatingDecisions.fundId, fundId), eq(operatingDecisions.id, decisionId)))
    .limit(1);
  return record ? splitXmin(record) : undefined;
}

export async function listDecisionsForFund(
  fundId: number,
  options: DecisionServiceOptions = {}
): Promise<DecisionRow[]> {
  const database = options.database ?? db;
  const records = await database
    .select(columnsWithXmin)
    .from(operatingDecisions)
    .where(eq(operatingDecisions.fundId, fundId))
    .orderBy(desc(operatingDecisions.createdAt), asc(operatingDecisions.id));
  return records.map(splitXmin);
}

function transitionValues(transition: DecisionTransition) {
  const values: Partial<typeof operatingDecisions.$inferInsert> = {
    status: transition.status,
    updatedAt: new Date(),
  };
  if ('followUpOwnerId' in transition) {
    values.followUpOwnerId = transition.followUpOwnerId ?? null;
  }
  if ('followUpDate' in transition) {
    values.followUpDate = transition.followUpDate ?? null;
  }
  return values;
}

function assertTransitionAllowed(
  current: DecisionStatus,
  next: DecisionTransition['status']
): void {
  if (current === 'accepted' || current === 'rejected') {
    throw new DecisionServiceError(
      409,
      'DECISION_LIFECYCLE_CONFLICT',
      'Terminal decisions cannot transition; supersede the decision instead.'
    );
  }
  if (current === 'proposed' || current === 'deferred') return;
  throw new DecisionServiceError(
    409,
    'DECISION_LIFECYCLE_CONFLICT',
    `Decision cannot transition from ${current} to ${next}.`
  );
}

async function requireDecision(
  database: DecisionDatabase,
  fundId: number,
  decisionId: number
): Promise<DecisionRow> {
  const current = await loadDecision(fundId, decisionId, { database });
  if (!current) {
    throw new DecisionServiceError(404, 'DECISION_NOT_FOUND', 'Decision not found.');
  }
  return current;
}

function staleDecisionError(current: DecisionRow, expectedXmin: string): DecisionServiceError {
  return new DecisionServiceError(412, 'PRECONDITION_FAILED', 'Decision ETag is stale.', {
    currentXmin: current.xmin,
    expectedXmin,
  });
}

function classifyOutcomeReplay(
  row: OperatingDecision,
  outcome: DecisionOutcome['outcome'],
  actorId: number
): 'none' | 'match' | 'conflict' {
  const recorded =
    row.outcome !== null || row.outcomeRecordedAt !== null || row.outcomeRecordedBy !== null;
  if (!recorded) return 'none';

  return row.outcome === outcome &&
    row.outcomeRecordedAt !== null &&
    row.outcomeRecordedBy === actorId
    ? 'match'
    : 'conflict';
}

export async function transitionDecision(
  input: TransitionDecisionInput,
  options: DecisionServiceOptions = {}
): Promise<DecisionRow> {
  const database = options.database ?? db;
  const transition = DecisionTransitionSchema.parse(input.transition);
  const current = await requireDecision(database, input.fundId, input.decisionId);
  if (current.xmin !== input.expectedXmin) {
    throw staleDecisionError(current, input.expectedXmin);
  }
  assertTransitionAllowed(current.row.status, transition.status);

  const updated = await database
    .update(operatingDecisions)
    .set(transitionValues(transition))
    .where(
      and(
        eq(operatingDecisions.fundId, input.fundId),
        eq(operatingDecisions.id, input.decisionId),
        sql`xmin = ${input.expectedXmin}::xid`
      )
    )
    .returning({ id: operatingDecisions.id });
  if (updated.length === 0) {
    const recheck = await requireDecision(database, input.fundId, input.decisionId);
    throw staleDecisionError(recheck, input.expectedXmin);
  }

  const result = await loadDecision(input.fundId, input.decisionId, { database });
  if (!result) {
    throw new DecisionServiceError(
      500,
      'DECISION_UPDATE_LOST',
      'Updated decision could not be loaded.'
    );
  }
  return result;
}

export async function recordOutcome(
  input: RecordDecisionOutcomeInput,
  options: DecisionServiceOptions = {}
): Promise<DecisionRow> {
  const database = options.database ?? db;
  const parsed = DecisionOutcomeSchema.parse({ outcome: input.outcome });
  const actorId = input.actorId;
  if (actorId === null || !Number.isInteger(actorId) || actorId <= 0) {
    throw new DecisionServiceError(
      403,
      'ACTOR_REQUIRED',
      'Numeric actor required to record outcome.'
    );
  }

  const current = await requireDecision(database, input.fundId, input.decisionId);
  const replayState = classifyOutcomeReplay(current.row, parsed.outcome, actorId);
  if (replayState === 'match') return current;
  if (replayState === 'conflict') {
    throw new DecisionServiceError(
      409,
      'DECISION_OUTCOME_ALREADY_RECORDED',
      'Decision outcome is immutable once recorded.'
    );
  }
  if (current.xmin !== input.expectedXmin) {
    throw staleDecisionError(current, input.expectedXmin);
  }
  if (current.row.status !== 'accepted' && current.row.status !== 'rejected') {
    throw new DecisionServiceError(
      409,
      'DECISION_OUTCOME_NOT_ALLOWED',
      'Only accepted or rejected decisions can record an outcome.'
    );
  }
  const now = new Date();
  const updated = await database
    .update(operatingDecisions)
    .set({
      outcome: parsed.outcome,
      outcomeRecordedAt: now,
      outcomeRecordedBy: actorId,
      updatedAt: now,
    })
    .where(
      and(
        eq(operatingDecisions.fundId, input.fundId),
        eq(operatingDecisions.id, input.decisionId),
        eq(operatingDecisions.status, current.row.status),
        sql`${operatingDecisions.outcome} IS NULL`,
        sql`${operatingDecisions.outcomeRecordedAt} IS NULL`,
        sql`${operatingDecisions.outcomeRecordedBy} IS NULL`,
        sql`xmin = ${input.expectedXmin}::xid`
      )
    )
    .returning({ id: operatingDecisions.id });
  if (updated.length === 0) {
    const recheck = await requireDecision(database, input.fundId, input.decisionId);
    const recheckReplayState = classifyOutcomeReplay(recheck.row, parsed.outcome, actorId);
    if (recheckReplayState === 'match') return recheck;
    if (recheckReplayState === 'conflict') {
      throw new DecisionServiceError(
        409,
        'DECISION_OUTCOME_ALREADY_RECORDED',
        'Decision outcome is immutable once recorded.'
      );
    }
    if (recheck.xmin !== input.expectedXmin) {
      throw staleDecisionError(recheck, input.expectedXmin);
    }
    throw new DecisionServiceError(
      409,
      'DECISION_OUTCOME_ALREADY_RECORDED',
      'Decision outcome is immutable once recorded.'
    );
  }

  const result = await loadDecision(input.fundId, input.decisionId, { database });
  if (!result) {
    throw new DecisionServiceError(
      500,
      'DECISION_UPDATE_LOST',
      'Updated decision could not be loaded.'
    );
  }
  return result;
}

export async function supersedeDecision(
  input: SupersedeDecisionInput,
  options: DecisionServiceOptions = {}
): Promise<CreateDecisionResult> {
  const database = options.database ?? db;
  const fields = createFields(input);

  return database.transaction(async (transaction) => {
    const transactionDatabase = transaction as unknown as DecisionDatabase;
    const source = await requireDecision(
      transactionDatabase,
      fields.fundId,
      input.supersedesDecisionId
    );
    if (source.row.status === 'proposed') {
      throw new DecisionServiceError(
        409,
        'DECISION_PROPOSED_CANNOT_BE_SUPERSEDED',
        'Proposed decisions must transition in place before supersession.'
      );
    }

    try {
      return await createDecisionCommand(
        transactionDatabase,
        fields,
        input.actorId,
        input.idempotencyKey,
        input.supersedesDecisionId
      );
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'operating_decisions_supersedes_decision_unique')) {
        throw new DecisionServiceError(
          409,
          'DECISION_ALREADY_SUPERSEDED',
          'Decision already has a superseding decision.'
        );
      }
      throw error;
    }
  });
}
