import { createHash } from 'node:crypto';
import { pool } from '../../db';
import { applyRLSContext, getRequestDatabaseScope } from '../../db/request-context';
import type { UserContext } from '../../lib/secure-context';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import type { ActualsDraftRevision } from '@shared/schema/actuals-draft-revisions';
import {
  ACTUALS_DRAFT_HISTORY_PAGE_SIZE,
  ActualsDraftDetailResponseV1Schema,
  ActualsDraftHistoryResponseV1Schema,
  ActualsDraftIdempotencyKeySchema,
  ActualsDraftIfMatchSchema,
  ActualsDraftRevisionV1Schema,
  ActualsDraftSaveRequestV1Schema,
  ActualsDraftSaveResponseV1Schema,
  type ActualsDraftRevisionV1,
  type ActualsDraftSaveRequestV1,
} from '@shared/contracts/lp-reporting/actuals-draft.contract';
import {
  ACTUALS_LEDGER_MAX_BYTES,
  ACTUALS_VALUATION_MAX_BYTES,
} from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import { ARTIFACT_RETENTION_DAYS } from '../financial-observations/source-artifact-service';
import type { PublishConnection } from './actuals-pilot-publish-service';

export class ActualsDraftError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ActualsDraftError';
  }
}
interface DraftAccess {
  fundId: number;
  actorId: number;
  context?: UserContext;
}
export interface ActualsDraftOptions {
  connect?: () => Promise<PublishConnection>;
  now?: () => Date;
}
const MAX_INT = 2_147_483_647;
const RETRYABLE = new Set(['40001', '40P01']);
const SELECT_REVISION = `SELECT
  fund_id AS "fundId", revision, revision_hash AS "revisionHash",
  prior_revision AS "priorRevision", prior_revision_hash AS "priorRevisionHash",
  idempotency_key AS "idempotencyKey", request_hash AS "requestHash",
  classification, as_of_date::text AS "asOfDate", source_note AS "sourceNote",
  correction_reason AS "correctionReason", created_by AS "createdBy", created_at AS "createdAt",
  ledger_source_artifact_id AS "ledgerSourceArtifactId", ledger_template_version AS "ledgerTemplateVersion",
  ledger_file_name AS "ledgerFileName", ledger_payload_sha256 AS "ledgerPayloadSha256",
  ledger_byte_count AS "ledgerByteCount", ledger_purge_after AS "ledgerPurgeAfter",
  valuation_source_artifact_id AS "valuationSourceArtifactId", valuation_template_version AS "valuationTemplateVersion",
  valuation_file_name AS "valuationFileName", valuation_payload_sha256 AS "valuationPayloadSha256",
  valuation_byte_count AS "valuationByteCount", valuation_purge_after AS "valuationPurgeAfter"
  FROM actuals_draft_revisions`;

function fail(status: number, code: string, message: string): never {
  throw new ActualsDraftError(status, code, message);
}
function positiveInt(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_INT)
    fail(400, 'INVALID_BODY', 'Invalid integer.');
}
function iso(value: Date | string): string {
  return new Date(value).toISOString();
}
export function actualsDraftETag(
  fundId: number,
  head: { revision: number; revisionHash: string } | null
): string {
  return `"actuals-draft:${fundId}:${head ? `${head.revision}:${head.revisionHash}` : 'none'}"`;
}
function metadata(row: ActualsDraftRevision): ActualsDraftRevisionV1 {
  return ActualsDraftRevisionV1Schema.parse({
    fundId: row.fundId,
    revision: row.revision,
    revisionHash: row.revisionHash,
    etag: actualsDraftETag(row.fundId, row),
    priorRevision: row.priorRevision,
    priorRevisionHash: row.priorRevisionHash,
    classification: row.classification,
    asOfDate: row.asOfDate,
    sourceNote: row.sourceNote,
    correctionReason: row.correctionReason,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    ledger: {
      sourceArtifactId: row.ledgerSourceArtifactId,
      templateVersion: row.ledgerTemplateVersion,
      fileName: row.ledgerFileName,
      payloadSha256: row.ledgerPayloadSha256,
      byteCount: row.ledgerByteCount,
      purgeAfter: iso(row.ledgerPurgeAfter),
    },
    valuation:
      row.valuationSourceArtifactId === null
        ? null
        : {
            sourceArtifactId: row.valuationSourceArtifactId,
            templateVersion: row.valuationTemplateVersion,
            fileName: row.valuationFileName,
            payloadSha256: row.valuationPayloadSha256,
            byteCount: row.valuationByteCount,
            purgeAfter: iso(row.valuationPurgeAfter!),
          },
  });
}
function defaultConnect(): Promise<PublishConnection> {
  if (typeof (pool as { connect?: unknown } | null)?.connect !== 'function') {
    fail(503, 'TRANSACTION_UNSUPPORTED', 'Database driver does not provide pooled transactions.');
  }
  return (pool as { connect: () => Promise<PublishConnection> }).connect();
}

async function authorize(connection: PublishConnection, input: DraftAccess): Promise<void> {
  const actor = (
    await connection.query<{
      is_active: boolean;
      role: string;
      is_release_canary_principal: boolean;
    }>('SELECT is_active, role, is_release_canary_principal FROM users WHERE id = $1 FOR SHARE', [
      input.actorId,
    ])
  ).rows[0];
  if (!actor || !actor.is_active || actor.is_release_canary_principal || actor.role === 'service') {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  const grant = await connection.query(
    'SELECT user_id FROM user_fund_grants WHERE user_id = $1 AND fund_id = $2 FOR SHARE',
    [input.actorId, input.fundId]
  );
  if (grant.rows.length === 0) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  if (actor.role !== 'admin') fail(403, 'INSUFFICIENT_ROLE', 'Administrator access required.');
}

async function transaction<T>(
  input: DraftAccess,
  options: ActualsDraftOptions,
  mutation: boolean,
  work: (connection: PublishConnection) => Promise<T>
): Promise<T> {
  positiveInt(input.fundId);
  positiveInt(input.actorId);
  const context = input.context ?? getRequestDatabaseScope()?.context;
  if (
    (!context && !options.connect) ||
    (context && Number(context.userId) !== input.actorId) ||
    (context?.fundId && Number(context.fundId) !== input.fundId)
  ) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  const connect = options.connect ?? defaultConnect;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const connection = await connect();
    let destroy = false;
    let committing = false;
    try {
      await connection.query('BEGIN');
      await connection.query("SET LOCAL lock_timeout = '2s'");
      await connection.query("SET LOCAL statement_timeout = '10s'");
      await connection.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
      if (context)
        await applyRLSContext(connection as never, { ...context, fundId: String(input.fundId) });
      await connection.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('actuals-draft:' || $1::text, 0))",
        [input.fundId]
      );
      await authorize(connection, input);
      const result = await work(connection);
      committing = true;
      await connection.query('COMMIT');
      return result;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      // Only an explicit transaction-abort result makes a failed COMMIT safe to retry here.
      // Connection and shutdown errors can carry SQLSTATEs without proving the outcome.
      if (committing && !RETRYABLE.has(code)) {
        destroy = true;
        if (mutation)
          fail(
            503,
            'DRAFT_OUTCOME_UNKNOWN',
            'Save outcome is unknown. Retry the identical command with the same Idempotency-Key and If-Match.'
          );
        throw error;
      }
      try {
        await connection.query('ROLLBACK');
      } catch {
        destroy = true;
        fail(503, 'DRAFT_RETRY_EXHAUSTED', 'Draft transaction could not be rolled back safely.');
      }
      if (RETRYABLE.has(code)) {
        if (attempt < 2) continue;
        fail(503, 'DRAFT_RETRY_EXHAUSTED', 'Draft transaction retry exhausted.');
      }
      throw error;
    } finally {
      connection.release(destroy);
    }
  }
  return fail(503, 'DRAFT_RETRY_EXHAUSTED', 'Draft transaction retry exhausted.');
}

function decode(payload: string, maxBytes: number): Buffer {
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.byteLength > maxBytes || bytes.toString('base64') !== payload) {
    fail(400, 'INVALID_BODY', 'Draft payload must be bounded canonical base64.');
  }
  return bytes;
}

export async function saveActualsDraftRevision(
  input: DraftAccess & {
    idempotencyKey: string;
    ifMatch: string;
    request: ActualsDraftSaveRequestV1;
  },
  options: ActualsDraftOptions = {}
) {
  const parsed = ActualsDraftSaveRequestV1Schema.safeParse(input.request);
  if (!parsed.success) fail(400, 'INVALID_BODY', 'Invalid draft save request.');
  if (!ActualsDraftIdempotencyKeySchema.safeParse(input.idempotencyKey).success) {
    fail(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a lowercase UUID.');
  }
  if (
    !ActualsDraftIfMatchSchema.safeParse(input.ifMatch).success ||
    !input.ifMatch.startsWith(`"actuals-draft:${input.fundId}:`)
  ) {
    fail(400, 'INVALID_IF_MATCH', 'If-Match must identify this fund draft.');
  }
  const request = parsed.data;
  input = { ...input, request };
  const ledgerBytes = decode(request.ledger.payload, ACTUALS_LEDGER_MAX_BYTES);
  const valuationBytes =
    request.valuation === null
      ? null
      : decode(request.valuation.payload, ACTUALS_VALUATION_MAX_BYTES);
  const requestHash = canonicalSha256({
    fundId: input.fundId,
    actorId: input.actorId,
    ifMatch: input.ifMatch,
    request,
  });
  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const purgeAfter = new Date(
    new Date(createdAt).getTime() + ARTIFACT_RETENTION_DAYS * 86_400_000
  ).toISOString();
  return transaction(input, options, true, async (connection) => {
    const existing = (
      await connection.query<ActualsDraftRevision>(
        `${SELECT_REVISION} WHERE fund_id = $1 AND idempotency_key = $2::uuid`,
        [input.fundId, input.idempotencyKey]
      )
    ).rows[0];
    if (existing) {
      if (existing.requestHash !== requestHash || existing.createdBy !== input.actorId) {
        fail(
          409,
          'DRAFT_IDEMPOTENCY_CONFLICT',
          'Idempotency-Key is bound to another draft command.'
        );
      }
      return ActualsDraftSaveResponseV1Schema.parse({
        contractVersion: 'actuals-draft-save-result/1.0.0',
        idempotencyKey: input.idempotencyKey,
        requestHash,
        revision: metadata(existing),
        replayed: true,
      });
    }
    const head =
      (
        await connection.query<ActualsDraftRevision>(
          `${SELECT_REVISION} WHERE fund_id = $1 ORDER BY revision DESC LIMIT 1`,
          [input.fundId]
        )
      ).rows[0] ?? null;
    if (input.ifMatch !== actualsDraftETag(input.fundId, head)) {
      fail(
        412,
        'DRAFT_PRECONDITION_FAILED',
        'Draft head changed. Reload history before saving a new revision.'
      );
    }
    const revision = (head?.revision ?? 0) + 1;
    positiveInt(revision);
    const saveArtifact = async (
      kind: 'ledger' | 'valuation',
      file:
        ActualsDraftSaveRequestV1['ledger'] | NonNullable<ActualsDraftSaveRequestV1['valuation']>,
      bytes: Buffer
    ) => {
      const payloadSha256 = createHash('sha256').update(bytes).digest('hex');
      const artifact = (
        await connection.query<{ id: number }>(
          `INSERT INTO source_artifacts (fund_id, source_type, file_name, media_type, byte_count,
          payload_sha256, payload, purge_after, created_by, idempotency_key, request_hash)
          VALUES ($1, 'csv', $2, 'text/csv', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            input.fundId,
            file.fileName,
            bytes.byteLength,
            payloadSha256,
            bytes,
            purgeAfter,
            input.actorId,
            `ad1:${input.idempotencyKey}:${kind}`,
            canonicalSha256({ requestHash, kind, payloadSha256 }),
          ]
        )
      ).rows[0]!;
      return {
        sourceArtifactId: artifact.id,
        templateVersion: file.templateVersion,
        fileName: file.fileName,
        payloadSha256,
        byteCount: bytes.byteLength,
        purgeAfter,
      };
    };
    const ledger = await saveArtifact('ledger', request.ledger, ledgerBytes);
    const valuation =
      request.valuation && valuationBytes
        ? await saveArtifact('valuation', request.valuation, valuationBytes)
        : null;
    const content = {
      fundId: input.fundId,
      revision,
      priorRevision: head?.revision ?? null,
      priorRevisionHash: head?.revisionHash ?? null,
      classification: request.classification,
      asOfDate: request.asOfDate,
      sourceNote: request.sourceNote,
      correctionReason: request.correctionReason,
      createdBy: input.actorId,
      createdAt,
      ledger,
      valuation,
    };
    const revisionHash = canonicalSha256({
      contractVersion: 'actuals-draft-revision/1.0.0',
      ...content,
    });
    await connection.query(
      `INSERT INTO actuals_draft_revisions (fund_id, revision, revision_hash, prior_revision, prior_revision_hash,
        idempotency_key, request_hash, classification, as_of_date, source_note, correction_reason, created_by, created_at,
        ledger_source_artifact_id, ledger_template_version, ledger_file_name, ledger_payload_sha256, ledger_byte_count, ledger_purge_after,
        valuation_source_artifact_id, valuation_template_version, valuation_file_name, valuation_payload_sha256, valuation_byte_count, valuation_purge_after)
       VALUES (${Array.from({ length: 25 }, (_, index) => `$${index + 1}`).join(', ')})`,
      [
        input.fundId,
        revision,
        revisionHash,
        content.priorRevision,
        content.priorRevisionHash,
        input.idempotencyKey,
        requestHash,
        request.classification,
        request.asOfDate,
        request.sourceNote,
        request.correctionReason,
        input.actorId,
        createdAt,
        ledger.sourceArtifactId,
        ledger.templateVersion,
        ledger.fileName,
        ledger.payloadSha256,
        ledger.byteCount,
        ledger.purgeAfter,
        valuation?.sourceArtifactId ?? null,
        valuation?.templateVersion ?? null,
        valuation?.fileName ?? null,
        valuation?.payloadSha256 ?? null,
        valuation?.byteCount ?? null,
        valuation?.purgeAfter ?? null,
      ]
    );
    return ActualsDraftSaveResponseV1Schema.parse({
      contractVersion: 'actuals-draft-save-result/1.0.0',
      idempotencyKey: input.idempotencyKey,
      requestHash,
      revision: {
        ...content,
        revisionHash,
        etag: actualsDraftETag(input.fundId, { revision, revisionHash }),
      },
      replayed: false,
    });
  });
}

export async function listActualsDraftRevisions(
  input: DraftAccess & { beforeRevision?: number },
  options: ActualsDraftOptions = {}
) {
  if (input.beforeRevision !== undefined) positiveInt(input.beforeRevision);
  return transaction(input, options, false, async (connection) => {
    const head = (
      await connection.query<ActualsDraftRevision>(
        `${SELECT_REVISION} WHERE fund_id = $1 ORDER BY revision DESC LIMIT 1`,
        [input.fundId]
      )
    ).rows[0];
    const rows = (
      await connection.query<ActualsDraftRevision>(
        `${SELECT_REVISION} WHERE fund_id = $1 AND ($2::integer IS NULL OR revision < $2)
        ORDER BY revision DESC LIMIT 21`,
        [input.fundId, input.beforeRevision ?? null]
      )
    ).rows;
    const revisions = rows.slice(0, ACTUALS_DRAFT_HISTORY_PAGE_SIZE).map(metadata);
    return ActualsDraftHistoryResponseV1Schema.parse({
      contractVersion: 'actuals-draft-history/1.0.0',
      fundId: input.fundId,
      head: head
        ? {
            revision: head.revision,
            revisionHash: head.revisionHash,
            etag: actualsDraftETag(input.fundId, head),
          }
        : null,
      revisions,
      nextBeforeRevision:
        rows.length > ACTUALS_DRAFT_HISTORY_PAGE_SIZE ? revisions.at(-1)!.revision : null,
    });
  });
}

export async function getActualsDraftRevision(
  input: DraftAccess & { revision: number },
  options: ActualsDraftOptions = {}
) {
  positiveInt(input.revision);
  const now = options.now?.() ?? new Date();
  return transaction(input, options, false, async (connection) => {
    const row = (
      await connection.query<ActualsDraftRevision>(
        `${SELECT_REVISION} WHERE fund_id = $1 AND revision = $2`,
        [input.fundId, input.revision]
      )
    ).rows[0];
    if (!row) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
    const revision = metadata(row);
    const readArtifact = async (
      file: Pick<
        ActualsDraftRevisionV1['ledger'],
        'sourceArtifactId' | 'payloadSha256' | 'byteCount' | 'purgeAfter'
      >
    ) => {
      const artifact = (
        await connection.query<{
          payload: Buffer | null;
          payload_sha256: string;
          byte_count: number;
          purged_at: Date | null;
          purge_after: Date;
        }>(
          'SELECT payload, payload_sha256, byte_count, purged_at, purge_after FROM source_artifacts WHERE id = $1 AND fund_id = $2',
          [file.sourceArtifactId, input.fundId]
        )
      ).rows[0];
      if (
        !artifact ||
        artifact.payload_sha256 !== file.payloadSha256 ||
        artifact.byte_count !== file.byteCount
      ) {
        fail(500, 'DRAFT_SOURCE_CORRUPT', 'Draft source provenance is inconsistent.');
      }
      if (
        artifact.purged_at ||
        artifact.payload === null ||
        new Date(file.purgeAfter) <= now ||
        new Date(artifact.purge_after) <= now
      ) {
        return { payload: null, payloadAvailable: false };
      }
      if (
        artifact.payload.byteLength !== file.byteCount ||
        createHash('sha256').update(artifact.payload).digest('hex') !== file.payloadSha256
      ) {
        fail(500, 'DRAFT_SOURCE_CORRUPT', 'Draft source provenance is inconsistent.');
      }
      return { payload: artifact.payload.toString('base64'), payloadAvailable: true };
    };
    return ActualsDraftDetailResponseV1Schema.parse({
      contractVersion: 'actuals-draft-detail/1.0.0',
      revision,
      ledger: await readArtifact(revision.ledger),
      valuation: revision.valuation ? await readArtifact(revision.valuation) : null,
    });
  });
}
