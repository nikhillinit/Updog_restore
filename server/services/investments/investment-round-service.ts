import { and, desc, eq, notExists, sql } from 'drizzle-orm';
import { aliasedTable } from 'drizzle-orm/alias';

import { db } from '../../db';
import type { InvestmentRoundCreate } from '@shared/contracts/investments/investment-round.contract';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import { investmentRounds, type InvestmentRound } from '@shared/schema/investment-rounds';

type InvestmentRoundDatabase = typeof db;

interface InvestmentRoundServiceOptions {
  database?: InvestmentRoundDatabase;
}

export interface InvestmentRoundRow {
  row: InvestmentRound;
  /** Postgres xmin system column as text -- opaque per-row concurrency token. */
  xmin: string;
}

export type CreateRoundResult =
  | ({ kind: 'created' } & InvestmentRoundRow)
  | ({ kind: 'replayed' } & InvestmentRoundRow)
  | { kind: 'key_reused' }
  | SupersedeRoundPreflightDenial;

type SupersedeRoundPreflightDenial =
  | { kind: 'already_superseded' }
  | { kind: 'supersede_target_missing' }
  | { kind: 'supersede_target_other_fund' }
  | { kind: 'supersede_target_other_investment' };

interface CreateRoundArgs extends InvestmentRoundCreate {
  investmentId: number;
  idempotencyKey: string;
  /** Best-effort creator id (nullable users.id FK); NULL when identity is not numeric. */
  createdBy: number | null;
}

type SupersedeRoundPreflightResult = { kind: 'ok' } | SupersedeRoundPreflightDenial;

interface SupersedeRoundPreflightArgs {
  investmentId: number;
  fundId: number;
  supersedesRoundId: number;
}

// Explicit column map + xmin::text (mirrors task-service). List the columns
// rather than rely on an unproven getTableColumns import.
const columnsWithXmin = {
  id: investmentRounds.id,
  investmentId: investmentRounds.investmentId,
  fundId: investmentRounds.fundId,
  roundName: investmentRounds.roundName,
  securityType: investmentRounds.securityType,
  roundDate: investmentRounds.roundDate,
  currency: investmentRounds.currency,
  investmentAmount: investmentRounds.investmentAmount,
  roundSize: investmentRounds.roundSize,
  preMoneyValuation: investmentRounds.preMoneyValuation,
  idempotencyKey: investmentRounds.idempotencyKey,
  requestHash: investmentRounds.requestHash,
  supersedesRoundId: investmentRounds.supersedesRoundId,
  createdBy: investmentRounds.createdBy,
  createdAt: investmentRounds.createdAt,
  updatedAt: investmentRounds.updatedAt,
  rowXmin: sql<string>`xmin::text`,
} as const;

const supersedingRounds = aliasedTable(investmentRounds, 'superseding_rounds');

function splitXmin(record: InvestmentRound & { rowXmin: string }): InvestmentRoundRow {
  const { rowXmin, ...row } = record;
  return { row: row as InvestmentRound, xmin: rowXmin };
}

function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
  return (
    candidate.code === '23505' &&
    (candidate.constraint === constraintName ||
      (typeof candidate.message === 'string' && candidate.message.includes(constraintName)))
  );
}

function requestHashFor(input: CreateRoundArgs): string {
  return canonicalSha256({
    investmentId: input.investmentId,
    fundId: input.fundId,
    roundName: input.roundName,
    securityType: input.securityType,
    roundDate: input.roundDate,
    currency: input.currency,
    investmentAmount: input.investmentAmount,
    roundSize: input.roundSize,
    preMoneyValuation: input.preMoneyValuation,
    supersedesRoundId: input.supersedesRoundId,
  });
}

async function loadRoundById(
  roundId: number,
  options: InvestmentRoundServiceOptions = {}
): Promise<InvestmentRoundRow | undefined> {
  const database = options.database ?? db;
  const [record] = await database
    .select(columnsWithXmin)
    .from(investmentRounds)
    .where(eq(investmentRounds.id, roundId))
    .limit(1);
  return record ? splitXmin(record) : undefined;
}

export async function supersedeRoundPreflight(
  input: SupersedeRoundPreflightArgs,
  options: InvestmentRoundServiceOptions = {}
): Promise<SupersedeRoundPreflightResult> {
  const target = await loadRoundById(input.supersedesRoundId, options);
  if (!target) {
    return { kind: 'supersede_target_missing' };
  }
  if (target.row.fundId !== input.fundId) {
    return { kind: 'supersede_target_other_fund' };
  }
  if (target.row.investmentId !== input.investmentId) {
    return { kind: 'supersede_target_other_investment' };
  }
  if (await hasSupersedingRound(input.supersedesRoundId, options)) {
    return { kind: 'already_superseded' };
  }
  return { kind: 'ok' };
}

async function hasSupersedingRound(
  roundId: number,
  options: InvestmentRoundServiceOptions = {}
): Promise<boolean> {
  const database = options.database ?? db;
  const [record] = await database
    .select({ id: investmentRounds.id })
    .from(investmentRounds)
    .where(eq(investmentRounds.supersedesRoundId, roundId))
    .limit(1);
  return record !== undefined;
}

async function loadRoundByIdempotencyKey(
  fundId: number,
  idempotencyKey: string,
  options: InvestmentRoundServiceOptions = {}
): Promise<InvestmentRoundRow | undefined> {
  const database = options.database ?? db;
  const [record] = await database
    .select(columnsWithXmin)
    .from(investmentRounds)
    .where(
      and(eq(investmentRounds.fundId, fundId), eq(investmentRounds.idempotencyKey, idempotencyKey))
    )
    .limit(1);
  return record ? splitXmin(record) : undefined;
}

export async function createRound(
  input: CreateRoundArgs,
  options: InvestmentRoundServiceOptions = {}
): Promise<CreateRoundResult> {
  const database = options.database ?? db;
  const requestHash = requestHashFor(input);

  if (input.supersedesRoundId !== undefined) {
    const preflight = await supersedeRoundPreflight(
      {
        investmentId: input.investmentId,
        fundId: input.fundId,
        supersedesRoundId: input.supersedesRoundId,
      },
      options
    );
    if (preflight.kind !== 'ok') {
      return preflight;
    }
  }

  try {
    const [record] = await database
      .insert(investmentRounds)
      .values({
        investmentId: input.investmentId,
        fundId: input.fundId,
        roundName: input.roundName,
        securityType: input.securityType,
        roundDate: input.roundDate,
        currency: input.currency,
        investmentAmount: input.investmentAmount,
        roundSize: input.roundSize ?? null,
        preMoneyValuation: input.preMoneyValuation ?? null,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        supersedesRoundId: input.supersedesRoundId ?? null,
        createdBy: input.createdBy,
      })
      .onConflictDoNothing({
        target: [investmentRounds.fundId, investmentRounds.idempotencyKey],
      })
      .returning(columnsWithXmin);

    if (record) {
      return { kind: 'created', ...splitXmin(record) };
    }
  } catch (error) {
    if (isUniqueConstraintViolation(error, 'investment_rounds_supersedes_uq')) {
      return { kind: 'already_superseded' };
    }
    throw error;
  }

  const existing = await loadRoundByIdempotencyKey(input.fundId, input.idempotencyKey, options);
  if (!existing) {
    throw new Error('Idempotency conflict did not return an existing investment round');
  }
  if (existing.row.requestHash === requestHash) {
    return { kind: 'replayed', ...existing };
  }
  return { kind: 'key_reused' };
}

export async function listRoundsForInvestment(
  investmentId: number,
  options: InvestmentRoundServiceOptions = {}
): Promise<InvestmentRoundRow[]> {
  const database = options.database ?? db;
  const records = await database
    .select(columnsWithXmin)
    .from(investmentRounds)
    .where(
      and(
        eq(investmentRounds.investmentId, investmentId),
        notExists(
          database
            .select({ id: supersedingRounds.id })
            .from(supersedingRounds)
            .where(eq(supersedingRounds.supersedesRoundId, investmentRounds.id))
        )
      )
    )
    .orderBy(desc(investmentRounds.createdAt));
  return records.map(splitXmin);
}

export async function loadRound(
  fundId: number,
  investmentId: number,
  roundId: number,
  options: InvestmentRoundServiceOptions = {}
): Promise<InvestmentRoundRow | undefined> {
  const database = options.database ?? db;
  const [record] = await database
    .select(columnsWithXmin)
    .from(investmentRounds)
    .where(
      and(
        eq(investmentRounds.fundId, fundId),
        eq(investmentRounds.investmentId, investmentId),
        eq(investmentRounds.id, roundId)
      )
    )
    .limit(1);
  if (!record || record.fundId !== fundId || record.investmentId !== investmentId) {
    return undefined;
  }
  return splitXmin(record);
}
