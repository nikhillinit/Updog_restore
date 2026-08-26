/**
 * LP Reporting -- metric-run evidence metadata service.
 *
 * Evidence records here are scoped to committed metric runs only. The route
 * owns fundId/metricRunId/uploadedBy, and the client supplies only metadata
 * plus an idempotency key for retry-safe creates.
 *
 * @module server/services/lp-reporting/metric-run-evidence-service
 */

import { and, eq, sql } from 'drizzle-orm';

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
type ExecuteCapableDatabase = MetricRunEvidenceDatabase & {
  execute?: (query: unknown) => Promise<unknown>;
};
type SqlResult<T> = { rows: T[] };
type SqlRow = Record<string, unknown> & {
  id?: unknown;
  fund_id?: unknown;
  valuation_mark_id?: unknown;
  company_id?: unknown;
  metric_run_id?: unknown;
  narrative_run_id?: unknown;
  idempotency_key?: unknown;
  evidence_source?: unknown;
  source_date?: unknown;
  received_date?: unknown;
  expiration_date?: unknown;
  confidence_level?: unknown;
  materiality_level?: unknown;
  confidentiality?: unknown;
  redaction_required?: unknown;
  document_hash?: unknown;
  valuation_policy_version?: unknown;
  description?: unknown;
  internal_notes?: unknown;
  lp_objection?: unknown;
  attachments?: unknown;
  uploaded_by?: unknown;
  approved_by?: unknown;
  approved_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

async function executeRows<T>(database: MetricRunEvidenceDatabase, query: unknown): Promise<T[]> {
  const executeCapable = database as ExecuteCapableDatabase;
  if (typeof executeCapable.execute !== 'function') {
    throw new MetricRunCommitError(
      500,
      'METRIC_RUN_DATABASE_UNAVAILABLE',
      'Metric-run database executor is unavailable.'
    );
  }
  return ((await executeCapable.execute(query)) as SqlResult<T>).rows;
}

function evidenceFromJson(value: unknown): EvidenceRecord {
  if (typeof value !== 'object' || value === null) {
    throw new MetricRunCommitError(500, 'EVIDENCE_ROW_INVALID', 'Evidence SQL result was invalid.');
  }
  const row = value as SqlRow;
  return {
    id: Number(row.id),
    fundId: Number(row.fund_id),
    valuationMarkId: row.valuation_mark_id === null ? null : Number(row.valuation_mark_id),
    companyId: row.company_id === null ? null : Number(row.company_id),
    metricRunId: row.metric_run_id === null ? null : Number(row.metric_run_id),
    narrativeRunId: row.narrative_run_id === null ? null : Number(row.narrative_run_id),
    idempotencyKey: row.idempotency_key === null ? null : String(row.idempotency_key),
    evidenceSource: String(row.evidence_source) as EvidenceRecord['evidenceSource'],
    sourceDate: String(row.source_date),
    receivedDate: row.received_date === null ? null : String(row.received_date),
    expirationDate: row.expiration_date === null ? null : String(row.expiration_date),
    confidenceLevel: String(row.confidence_level) as EvidenceRecord['confidenceLevel'],
    materialityLevel: String(row.materiality_level) as EvidenceRecord['materialityLevel'],
    confidentiality: String(row.confidentiality) as EvidenceRecord['confidentiality'],
    redactionRequired: Boolean(row.redaction_required),
    documentHash: row.document_hash === null ? null : String(row.document_hash),
    valuationPolicyVersion:
      row.valuation_policy_version === null ? null : String(row.valuation_policy_version),
    description: row.description === null ? null : String(row.description),
    internalNotes: row.internal_notes === null ? null : String(row.internal_notes),
    lpObjection: row.lp_objection === null ? null : String(row.lp_objection),
    attachments: row.attachments,
    uploadedBy: row.uploaded_by === null ? null : Number(row.uploaded_by),
    approvedBy: row.approved_by === null ? null : Number(row.approved_by),
    approvedAt: row.approved_at === null ? null : new Date(String(row.approved_at)),
    createdAt: row.created_at === null ? null : new Date(String(row.created_at)),
    updatedAt: row.updated_at === null ? null : new Date(String(row.updated_at)),
  };
}

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
  const values = evidenceInsertValues({ ...input, body });
  type EvidenceMutationRow = {
    metric_exists: boolean;
    actual_status: string | null;
    user_exists: boolean;
    existing_evidence_id: number | null;
    inserted_row: unknown;
  };
  const rows = await executeRows<EvidenceMutationRow>(
    database,
    sql`
    WITH metric_run_row AS (
      SELECT id, status
        FROM lp_metric_runs
       WHERE fund_id = ${input.fundId}::integer AND id = ${input.metricRunId}::integer
       FOR UPDATE
    ),
    guard AS (
      SELECT mr.id, mr.status, true::boolean AS metric_exists,
             EXISTS (SELECT 1 FROM users u WHERE u.id = ${input.userId}::integer) AS user_exists,
             (SELECT e.id FROM evidence_records e
               WHERE e.fund_id = ${input.fundId}::integer
                 AND e.metric_run_id = ${input.metricRunId}::integer
                 AND e.idempotency_key = ${body.idempotencyKey}::varchar
               LIMIT 1) AS existing_evidence_id
        FROM metric_run_row mr
      UNION ALL
      SELECT NULL::integer, NULL::varchar, false::boolean, false::boolean, NULL::integer
       WHERE NOT EXISTS (SELECT 1 FROM metric_run_row)
    ),
    inserted AS (
      INSERT INTO evidence_records (
        fund_id, metric_run_id, idempotency_key, evidence_source, source_date,
        received_date, expiration_date, confidence_level, materiality_level,
        confidentiality, redaction_required, document_hash, valuation_policy_version,
        description, internal_notes, lp_objection, attachments, uploaded_by
      )
      SELECT ${values.fundId}::integer, ${values.metricRunId}::integer, ${values.idempotencyKey ?? null}::varchar,
             ${values.evidenceSource}::varchar, ${values.sourceDate}::date,
             ${values.receivedDate ?? null}::date, ${values.expirationDate ?? null}::date,
             ${values.confidenceLevel}::varchar, ${values.materialityLevel}::varchar,
             ${values.confidentiality}::varchar, ${values.redactionRequired}::boolean,
             ${values.documentHash ?? null}::varchar, ${values.valuationPolicyVersion ?? null}::varchar,
             ${values.description ?? null}::text, ${values.internalNotes ?? null}::text,
             ${values.lpObjection ?? null}::text, ${JSON.stringify(values.attachments ?? [])}::jsonb,
             ${values.uploadedBy ?? null}::integer
        FROM guard
       WHERE guard.metric_exists AND guard.status = 'draft'::varchar
         AND guard.user_exists AND guard.existing_evidence_id IS NULL
      ON CONFLICT DO NOTHING
      RETURNING *
    )
    SELECT guard.metric_exists, guard.status AS actual_status, guard.user_exists,
           guard.existing_evidence_id, to_jsonb(inserted) AS inserted_row
      FROM guard LEFT JOIN inserted ON true
  `
  );
  const row = rows[0];
  if (!row)
    throw new MetricRunCommitError(
      500,
      'METRIC_RUN_EVIDENCE_CONFLICT',
      'Evidence create returned no guard row.'
    );
  if (!row.metric_exists) {
    throw new MetricRunCommitError(
      404,
      'METRIC_RUN_NOT_FOUND',
      'Metric run was not found for this fund.'
    );
  }
  if (row.actual_status !== 'draft') {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_NOT_EDITABLE',
      'Evidence records can only be added to draft metric runs.',
      { status: row.actual_status }
    );
  }
  if (!row.user_exists) {
    throw new MetricRunCommitError(
      401,
      'AUTH_USER_ID_UNRESOLVED',
      'Authenticated user could not be resolved to a numeric users.id.'
    );
  }
  if (row.inserted_row)
    return {
      record: toMetricRunEvidenceRecord(evidenceFromJson(row.inserted_row)),
      inserted: true,
    };
  const existing = await findEvidenceByIdempotencyKey(
    database,
    input.fundId,
    input.metricRunId,
    body.idempotencyKey
  );
  if (existing) return { record: toMetricRunEvidenceRecord(existing), inserted: false };
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
