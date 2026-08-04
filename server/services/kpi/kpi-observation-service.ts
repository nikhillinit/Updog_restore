/**
 * Internal KPI collection service (issue #1300, ruling GR2-4a).
 *
 * Creation is idempotent through the shared idempotent-command primitive, and
 * review is an optimistic-locking update keyed on the row version that backs the
 * ETag. There is deliberately no delete, no approval hierarchy, no recipient, and
 * no export path on this surface.
 *
 * @module server/services/kpi/kpi-observation-service
 */

import { and, asc, eq, gte, lte, type SQL } from 'drizzle-orm';

import {
  KPI_METRIC_VALUE_KIND,
  KPI_OBSERVATION_CONTRACT_VERSION,
  KpiObservationV1Schema,
  metricShapeIssues,
  type KpiBasis,
  type KpiMetric,
  type KpiObservationCreateRequest,
  type KpiObservationListQuery,
  type KpiObservationV1,
  type KpiObservationValue,
  type KpiReviewDecision,
  type KpiSource,
} from '@shared/contracts/kpi/kpi-observation-v1.contract';
import { kpiObservations, type KpiObservationRow } from '@shared/schema/kpi-observations';

import { db } from '../../db';
import {
  FundScopeError,
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import { runIdempotentCommand } from '../../lib/idempotent-command';

type KpiDatabase = typeof db;

/** Money and non-money numerics alike cross the wire at six decimal places. */
const NUMERIC_SCALE = 6;

export class KpiObservationServiceError extends Error {
  readonly status: number;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'KpiObservationServiceError';
    this.status = statusCode;
  }
}

/**
 * Postgres renders numeric(20,6) with its full scale, but a hand-written row or a
 * future scale change must not leak a short string past the contract boundary.
 */
function toFixedScale(raw: string): string {
  const negative = raw.startsWith('-');
  const magnitude = negative ? raw.slice(1) : raw;
  const [whole = '0', fraction = ''] = magnitude.split('.');
  const padded = fraction.padEnd(NUMERIC_SCALE, '0').slice(0, NUMERIC_SCALE);
  return `${negative ? '-' : ''}${whole}.${padded}`;
}

function valueOfRow(row: KpiObservationRow): KpiObservationValue {
  if (row.valueKind === 'money' && row.valueAmount !== null) {
    return { valueKind: 'money', amountUsd: toFixedScale(row.valueAmount) };
  }
  if (row.valueKind === 'number' && row.valueAmount !== null) {
    return { valueKind: 'number', number: toFixedScale(row.valueAmount) };
  }
  if (row.valueKind === 'date' && row.valueDate !== null) {
    return { valueKind: 'date', date: row.valueDate };
  }
  if (row.valueKind === 'text' && row.valueText !== null) {
    return { valueKind: 'text', text: row.valueText };
  }
  throw new KpiObservationServiceError(
    500,
    'KPI_OBSERVATION_CORRUPT',
    'Stored KPI observation value is inconsistent with its value kind.'
  );
}

/** Whitelist map then strict-schema validate, so no internal column can leak. */
export function toKpiObservationContract(row: KpiObservationRow): KpiObservationV1 {
  return KpiObservationV1Schema.parse({
    contractVersion: KPI_OBSERVATION_CONTRACT_VERSION,
    observationId: row.id,
    fundId: row.fundId,
    portfolioCompanyId: row.portfolioCompanyId,
    metric: row.metric,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    basis: row.basis,
    value: valueOfRow(row),
    companyKpiLabel: row.companyKpiLabel,
    source: row.source,
    sourceLabel: row.sourceLabel,
    comment: row.comment,
    submittedAt: row.submittedAt.toISOString(),
    reviewStatus: row.reviewStatus,
    reviewComment: row.reviewComment,
    reviewedAt: row.reviewedAt === null ? null : row.reviewedAt.toISOString(),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export interface KpiObservationCommandPreimage extends Record<string, unknown> {
  commandKind: 'create_kpi_observation';
  contractVersion: typeof KPI_OBSERVATION_CONTRACT_VERSION;
  fundId: number;
  portfolioCompanyId: number;
  metric: KpiMetric;
  periodStart: string;
  periodEnd: string;
  basis: KpiBasis;
  value: KpiObservationValue;
  companyKpiLabel: string | null;
  source: KpiSource;
  sourceLabel: string | null;
  comment: string | null;
  submittedAt: string;
}

export interface CreateKpiObservationInput {
  fundId: number;
  request: KpiObservationCreateRequest;
  source: KpiSource;
  actorId: number | null;
  idempotencyKey: string;
}

export interface CreateKpiObservationResult {
  observation: KpiObservationV1;
  replayed: boolean;
}

export interface ReviewKpiObservationInput {
  fundId: number;
  observationId: number;
  expectedVersion: number;
  reviewStatus: KpiReviewDecision;
  reviewComment: string | null;
  actorId: number | null;
}

export interface KpiObservationPorts {
  assertCompanyOwned(fundId: number, portfolioCompanyId: number): Promise<void>;
  createIdempotent(input: {
    fundId: number;
    request: KpiObservationCreateRequest;
    source: KpiSource;
    actorId: number | null;
    idempotencyKey: string;
    preimage: KpiObservationCommandPreimage;
  }): Promise<{ row: KpiObservationRow; replayed: boolean }>;
}

function preimageOf(input: CreateKpiObservationInput): KpiObservationCommandPreimage {
  return {
    commandKind: 'create_kpi_observation',
    contractVersion: KPI_OBSERVATION_CONTRACT_VERSION,
    fundId: input.fundId,
    portfolioCompanyId: input.request.portfolioCompanyId,
    metric: input.request.metric,
    periodStart: input.request.periodStart,
    periodEnd: input.request.periodEnd,
    basis: input.request.basis,
    value: input.request.value,
    companyKpiLabel: input.request.companyKpiLabel ?? null,
    source: input.source,
    sourceLabel: input.request.sourceLabel ?? null,
    comment: input.request.comment ?? null,
    submittedAt: input.request.submittedAt,
  };
}

/**
 * The Zod request schema already enforces these three rules, but CSV rows and
 * future callers reach the service through more than one path, so the invariant
 * is re-asserted here rather than assumed.
 */
function assertRequestShape(request: KpiObservationCreateRequest): void {
  const issues = metricShapeIssues({
    metric: request.metric,
    value: request.value,
    companyKpiLabel: request.companyKpiLabel,
  });
  if (issues.length > 0) {
    throw new KpiObservationServiceError(400, 'INVALID_KPI_OBSERVATION_SHAPE', issues.join(' '), {
      issues,
    });
  }
}

export async function createKpiObservationWithPorts(
  ports: KpiObservationPorts,
  input: CreateKpiObservationInput
): Promise<CreateKpiObservationResult> {
  assertRequestShape(input.request);
  await ports.assertCompanyOwned(input.fundId, input.request.portfolioCompanyId);

  const result = await ports.createIdempotent({ ...input, preimage: preimageOf(input) });
  return { observation: toKpiObservationContract(result.row), replayed: result.replayed };
}

function insertValuesFor(input: CreateKpiObservationInput) {
  const { request } = input;
  const value = request.value;
  return {
    fundId: input.fundId,
    portfolioCompanyId: request.portfolioCompanyId,
    metric: request.metric,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd,
    basis: request.basis,
    valueKind: KPI_METRIC_VALUE_KIND[request.metric],
    valueAmount:
      value.valueKind === 'money'
        ? value.amountUsd
        : value.valueKind === 'number'
          ? value.number
          : null,
    valueDate: value.valueKind === 'date' ? value.date : null,
    valueText: value.valueKind === 'text' ? value.text : null,
    companyKpiLabel: request.companyKpiLabel ?? null,
    source: input.source,
    sourceLabel: request.sourceLabel ?? null,
    comment: request.comment ?? null,
    submittedAt: new Date(request.submittedAt),
    createdBy: input.actorId,
  };
}

export function createKpiObservationPorts(database: KpiDatabase): KpiObservationPorts {
  return {
    async assertCompanyOwned(fundId, portfolioCompanyId) {
      try {
        await assertOwnedByFund({
          db: database as unknown as FundScopedOwnershipDatabase,
          fundId,
          ref: { kind: 'portfolio_company', id: portfolioCompanyId },
        });
      } catch (error) {
        if (error instanceof FundScopeError) {
          throw new KpiObservationServiceError(
            404,
            'PORTFOLIO_COMPANY_NOT_FOUND',
            'Portfolio company not found in this fund.'
          );
        }
        throw error;
      }
    },

    async createIdempotent(input) {
      const loadExisting = async () => {
        const [existing] = await database
          .select()
          .from(kpiObservations)
          .where(
            and(
              eq(kpiObservations.fundId, input.fundId),
              eq(kpiObservations.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        return existing ? { row: existing, requestHash: existing.requestHash } : null;
      };

      return runIdempotentCommand<KpiObservationRow>({
        db: database,
        fundId: input.fundId,
        idempotencyKey: input.idempotencyKey,
        contractVersion: KPI_OBSERVATION_CONTRACT_VERSION,
        request: input.preimage,
        loadExisting,
        insert: async (requestHash) => {
          const [inserted] = await database
            .insert(kpiObservations)
            .values({
              ...insertValuesFor(input),
              idempotencyKey: input.idempotencyKey,
              requestHash,
            })
            .onConflictDoNothing({
              target: [kpiObservations.fundId, kpiObservations.idempotencyKey],
            })
            .returning();
          return inserted ?? null;
        },
      });
    },
  };
}

export async function createKpiObservation(
  input: CreateKpiObservationInput,
  options: { database?: KpiDatabase } = {}
): Promise<CreateKpiObservationResult> {
  const database = options.database ?? db;
  return database.transaction(async (transaction) =>
    createKpiObservationWithPorts(
      createKpiObservationPorts(transaction as unknown as KpiDatabase),
      input
    )
  );
}

export async function listKpiObservations(
  fundId: number,
  query: KpiObservationListQuery,
  options: { database?: KpiDatabase } = {}
): Promise<KpiObservationV1[]> {
  const database = options.database ?? db;
  const filters: SQL[] = [eq(kpiObservations.fundId, fundId)];
  if (query.portfolioCompanyId !== undefined) {
    filters.push(eq(kpiObservations.portfolioCompanyId, query.portfolioCompanyId));
  }
  if (query.metric !== undefined) filters.push(eq(kpiObservations.metric, query.metric));
  if (query.basis !== undefined) filters.push(eq(kpiObservations.basis, query.basis));
  if (query.reviewStatus !== undefined) {
    filters.push(eq(kpiObservations.reviewStatus, query.reviewStatus));
  }
  if (query.periodFrom !== undefined) {
    filters.push(gte(kpiObservations.periodStart, query.periodFrom));
  }
  if (query.periodTo !== undefined) filters.push(lte(kpiObservations.periodEnd, query.periodTo));

  const rows = await database
    .select()
    .from(kpiObservations)
    .where(and(...filters))
    .orderBy(asc(kpiObservations.periodStart), asc(kpiObservations.id))
    .limit(500);
  return rows.map(toKpiObservationContract);
}

export async function loadKpiObservation(
  fundId: number,
  observationId: number,
  options: { database?: KpiDatabase } = {}
): Promise<KpiObservationRow | null> {
  const database = options.database ?? db;
  const [row] = await database
    .select()
    .from(kpiObservations)
    .where(and(eq(kpiObservations.fundId, fundId), eq(kpiObservations.id, observationId)))
    .limit(1);
  return row ?? null;
}

/**
 * Compare-and-set on the row version. A zero-row result means another reviewer
 * moved first; the route re-reads to tell 412 (modified) from 404 (gone).
 */
export async function reviewKpiObservation(
  input: ReviewKpiObservationInput,
  options: { database?: KpiDatabase } = {}
): Promise<KpiObservationRow | null> {
  const database = options.database ?? db;
  const now = new Date();
  const [updated] = await database
    .update(kpiObservations)
    .set({
      reviewStatus: input.reviewStatus,
      reviewComment: input.reviewComment,
      reviewedBy: input.actorId,
      reviewedAt: now,
      version: input.expectedVersion + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(kpiObservations.fundId, input.fundId),
        eq(kpiObservations.id, input.observationId),
        eq(kpiObservations.version, input.expectedVersion)
      )
    )
    .returning();
  return updated ?? null;
}
