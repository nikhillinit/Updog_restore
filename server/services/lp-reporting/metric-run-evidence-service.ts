/**
 * LP Reporting -- metric-run evidence metadata service.
 *
 * Evidence records here are scoped to committed metric runs only. The route
 * owns fundId/metricRunId/uploadedBy, and the client supplies only metadata
 * plus an idempotency key for retry-safe creates.
 *
 * @module server/services/lp-reporting/metric-run-evidence-service
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import {
  EvidenceRecordCreateSchema,
  MetricRunEvidenceCreateRequestSchema,
  MetricRunEvidenceRecordSchema,
  type MetricRunEvidenceCreateRequest,
  type MetricRunEvidenceCreateResponse,
  type MetricRunEvidenceListResponse,
  type MetricRunEvidenceRecord,
} from '@shared/contracts/lp-reporting';
import {
  evidenceRecords,
  lpMetricRuns,
  type EvidenceRecord,
  type InsertEvidenceRecord,
  type LpMetricRun,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';
import { MetricRunCommitError } from './metric-run-commit-service';

type MetricRunEvidenceDatabase = typeof db;

export interface MetricRunEvidenceCreateInput {
  fundId: number;
  metricRunId: number;
  userId: number;
  body: MetricRunEvidenceCreateRequest;
}

export interface MetricRunEvidenceListInput {
  fundId: number;
  metricRunId: number;
}

interface MetricRunEvidenceServiceOptions {
  database?: MetricRunEvidenceDatabase;
}

type MetricRunLookupRow = Pick<LpMetricRun, 'id' | 'fundId' | 'status'>;

const EDITABLE_METRIC_RUN_STATUSES = new Set(['draft']);

function isoDateTime(value: Date | string | null | undefined, field: string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new MetricRunCommitError(
    500,
    'EVIDENCE_ROW_INVALID',
    `${field} is required on evidence_records responses.`
  );
}

function isoDay(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return null;
}

async function assertUserExists(
  database: MetricRunEvidenceDatabase,
  userId: number
): Promise<void> {
  const rows = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) {
    throw new MetricRunCommitError(
      401,
      'AUTH_USER_ID_UNRESOLVED',
      'Authenticated user could not be resolved to a numeric users.id.'
    );
  }
}

async function loadMetricRun(
  database: MetricRunEvidenceDatabase,
  fundId: number,
  metricRunId: number
): Promise<MetricRunLookupRow> {
  const rows = await database
    .select({
      id: lpMetricRuns.id,
      fundId: lpMetricRuns.fundId,
      status: lpMetricRuns.status,
    })
    .from(lpMetricRuns)
    .where(and(eq(lpMetricRuns.fundId, fundId), eq(lpMetricRuns.id, metricRunId)))
    .limit(1);
  const row = rows.find((candidate) => candidate.id === metricRunId && candidate.fundId === fundId);
  if (!row) {
    throw new MetricRunCommitError(
      404,
      'METRIC_RUN_NOT_FOUND',
      'Metric run was not found for this fund.'
    );
  }
  return row as MetricRunLookupRow;
}

function assertMetricRunEditable(metricRun: MetricRunLookupRow): void {
  if (!EDITABLE_METRIC_RUN_STATUSES.has(metricRun.status)) {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_NOT_EDITABLE',
      'Evidence records can only be added to draft metric runs.',
      { status: metricRun.status }
    );
  }
}

function toMetricRunEvidenceRecord(row: EvidenceRecord): MetricRunEvidenceRecord {
  return MetricRunEvidenceRecordSchema.parse({
    id: row.id,
    fundId: row.fundId,
    metricRunId: row.metricRunId,
    idempotencyKey: row.idempotencyKey,
    evidenceSource: row.evidenceSource,
    sourceDate: isoDay(row.sourceDate),
    receivedDate: isoDay(row.receivedDate),
    expirationDate: isoDay(row.expirationDate),
    confidenceLevel: row.confidenceLevel,
    materialityLevel: row.materialityLevel,
    confidentiality: row.confidentiality,
    redactionRequired: row.redactionRequired,
    documentHash: row.documentHash ?? null,
    valuationPolicyVersion: row.valuationPolicyVersion ?? null,
    description: row.description ?? null,
    internalNotes: row.internalNotes ?? null,
    lpObjection: row.lpObjection ?? null,
    uploadedBy: row.uploadedBy ?? null,
    createdAt: isoDateTime(row.createdAt, 'createdAt'),
    updatedAt: isoDateTime(row.updatedAt, 'updatedAt'),
  });
}

async function findEvidenceByIdempotencyKey(
  database: MetricRunEvidenceDatabase,
  fundId: number,
  metricRunId: number,
  idempotencyKey: string
): Promise<EvidenceRecord | null> {
  const rows = await database
    .select()
    .from(evidenceRecords)
    .where(
      and(
        eq(evidenceRecords.fundId, fundId),
        eq(evidenceRecords.metricRunId, metricRunId),
        eq(evidenceRecords.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return (
    (rows as EvidenceRecord[]).find(
      (row) =>
        row.fundId === fundId &&
        row.metricRunId === metricRunId &&
        row.idempotencyKey === idempotencyKey
    ) ?? null
  );
}

function evidenceInsertValues(input: MetricRunEvidenceCreateInput): InsertEvidenceRecord {
  const body = MetricRunEvidenceCreateRequestSchema.parse(input.body);
  const create = EvidenceRecordCreateSchema.parse({
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    evidenceSource: body.evidenceSource,
    sourceDate: body.sourceDate,
    receivedDate: body.receivedDate,
    expirationDate: body.expirationDate,
    confidenceLevel: body.confidenceLevel,
    materialityLevel: body.materialityLevel,
    confidentiality: body.confidentiality,
    redactionRequired: body.redactionRequired,
    documentHash: body.documentHash,
    valuationPolicyVersion: body.valuationPolicyVersion,
    description: body.description,
    internalNotes: body.internalNotes,
    lpObjection: body.lpObjection,
    attachments: [],
  });

  return {
    fundId: create.fundId,
    metricRunId: create.metricRunId,
    idempotencyKey: body.idempotencyKey,
    evidenceSource: create.evidenceSource,
    sourceDate: create.sourceDate,
    confidenceLevel: create.confidenceLevel,
    materialityLevel: create.materialityLevel,
    confidentiality: create.confidentiality,
    redactionRequired: create.redactionRequired,
    attachments: [],
    uploadedBy: input.userId,
    ...(create.receivedDate !== undefined && { receivedDate: create.receivedDate }),
    ...(create.expirationDate !== undefined && { expirationDate: create.expirationDate }),
    ...(create.documentHash !== undefined && { documentHash: create.documentHash }),
    ...(create.valuationPolicyVersion !== undefined && {
      valuationPolicyVersion: create.valuationPolicyVersion,
    }),
    ...(create.description !== undefined && { description: create.description }),
    ...(create.internalNotes !== undefined && { internalNotes: create.internalNotes }),
    ...(create.lpObjection !== undefined && { lpObjection: create.lpObjection }),
  };
}

export async function createMetricRunEvidence(
  input: MetricRunEvidenceCreateInput,
  options: MetricRunEvidenceServiceOptions = {}
): Promise<MetricRunEvidenceCreateResponse> {
  const database = options.database ?? db;
  const body = MetricRunEvidenceCreateRequestSchema.parse(input.body);
  const metricRun = await loadMetricRun(database, input.fundId, input.metricRunId);
  assertMetricRunEditable(metricRun);
  await assertUserExists(database, input.userId);

  const existing = await findEvidenceByIdempotencyKey(
    database,
    input.fundId,
    input.metricRunId,
    body.idempotencyKey
  );
  if (existing) {
    return { record: toMetricRunEvidenceRecord(existing), inserted: false };
  }

  const inserted = await database
    .insert(evidenceRecords)
    .values(evidenceInsertValues({ ...input, body }))
    .onConflictDoNothing()
    .returning();
  const insertedRow = (inserted as EvidenceRecord[])[0];
  if (insertedRow) {
    return { record: toMetricRunEvidenceRecord(insertedRow), inserted: true };
  }

  const racedExisting = await findEvidenceByIdempotencyKey(
    database,
    input.fundId,
    input.metricRunId,
    body.idempotencyKey
  );
  if (racedExisting) {
    return { record: toMetricRunEvidenceRecord(racedExisting), inserted: false };
  }

  throw new MetricRunCommitError(
    409,
    'METRIC_RUN_EVIDENCE_CONFLICT',
    'Evidence create conflicted but no existing row could be loaded.'
  );
}

export async function listMetricRunEvidence(
  input: MetricRunEvidenceListInput,
  options: MetricRunEvidenceServiceOptions = {}
): Promise<MetricRunEvidenceListResponse> {
  const database = options.database ?? db;
  await loadMetricRun(database, input.fundId, input.metricRunId);

  const rows = await database
    .select()
    .from(evidenceRecords)
    .where(
      and(
        eq(evidenceRecords.fundId, input.fundId),
        eq(evidenceRecords.metricRunId, input.metricRunId)
      )
    );
  return {
    records: (rows as EvidenceRecord[])
      .filter((row) => row.fundId === input.fundId && row.metricRunId === input.metricRunId)
      .map(toMetricRunEvidenceRecord),
  };
}
