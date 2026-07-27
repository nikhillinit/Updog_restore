import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { runIdempotentCommand } from '../../lib/idempotent-command';
import { LEDGER_CONTRACT_VERSION } from '../../../shared/contracts/investment-ledger/financing-event.contract';
import {
  OwnershipSnapshotListV1Schema,
  OwnershipSnapshotRequestSchema,
  OwnershipSnapshotV1Schema,
  type OwnershipSnapshotListV1,
  type OwnershipSnapshotV1,
} from '../../../shared/contracts/investment-ledger/current-position.contract';

type LedgerDatabase = typeof db;

interface OwnershipSnapshotRow {
  id: number;
  fundId: number;
  vehicleId: number;
  companyIdentityId: number;
  effectiveDate: string;
  recordedAt: Date;
  ownershipPct: string;
  fdNumerator: string | null;
  fdDenominator: string | null;
  currency: string;
  supersedesSnapshotId: number | null;
  sourceObservationId: number;
  createdBy: number | null;
  idempotencyKey: string;
  requestHash: string;
}

export class OwnershipSnapshotServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'OwnershipSnapshotServiceError';
    this.statusCode = status;
  }
}

export async function createOwnershipSnapshot(input: {
  fundId: number;
  actorId: number | null;
  idempotencyKey: string;
  request: unknown;
  database?: LedgerDatabase;
}): Promise<{ value: OwnershipSnapshotV1; replayed: boolean }> {
  const database = input.database ?? db;
  const request = OwnershipSnapshotRequestSchema.parse(input.request);
  const commandRequest = {
    fundId: input.fundId,
    contractVersion: LEDGER_CONTRACT_VERSION,
    command: 'ownership_snapshot_v1',
    ...request,
  };

  const result = await database.transaction(async (transaction) =>
    runIdempotentCommand<OwnershipSnapshotRow>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      contractVersion: LEDGER_CONTRACT_VERSION,
      request: commandRequest,
      loadExisting: async () => {
        const existing = await selectOwnershipByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        return existing ? { row: existing, requestHash: existing.requestHash } : null;
      },
      insert: async (requestHash) => {
        await assertAcceptedOwnershipObservation(transaction, {
          fundId: input.fundId,
          companyIdentityId: request.companyIdentityId,
          sourceObservationId: request.sourceObservationId,
          effectiveDate: request.effectiveDate,
        });
        if (request.supersedesSnapshotId !== undefined) {
          await assertSupersededSnapshotMatches(transaction, {
            fundId: input.fundId,
            vehicleId: request.vehicleId,
            companyIdentityId: request.companyIdentityId,
            supersedesSnapshotId: request.supersedesSnapshotId,
          });
        }
        const insertedId = readInsertedIdOrNull(
          await transaction.execute(sql`
            INSERT INTO ownership_snapshots (
              fund_id, vehicle_id, company_identity_id, effective_date, ownership_pct,
              fd_numerator, fd_denominator, currency, supersedes_snapshot_id,
              source_observation_id, created_by, idempotency_key, request_hash
            ) VALUES (
              ${input.fundId}, ${request.vehicleId}, ${request.companyIdentityId},
              ${request.effectiveDate}, ${request.ownershipPct},
              ${request.fdNumerator ?? null}, ${request.fdDenominator ?? null},
              'USD', ${request.supersedesSnapshotId ?? null}, ${request.sourceObservationId},
              ${input.actorId}, ${input.idempotencyKey}, ${requestHash}
            )
            ON CONFLICT DO NOTHING
            RETURNING id
          `)
        );
        return insertedId === null
          ? null
          : await requireOwnershipSnapshot(transaction, input.fundId, insertedId);
      },
    })
  );

  return { value: ownershipDto(result.row), replayed: result.replayed };
}

export async function listOwnershipSnapshots(input: {
  fundId: number;
  vehicleId?: number;
  companyIdentityId?: number;
  asOfDate?: string;
  knowledgeCutoff?: Date;
  database?: LedgerDatabase;
}): Promise<OwnershipSnapshotListV1> {
  const database = input.database ?? db;
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const knowledgeCutoff = input.knowledgeCutoff ?? new Date();
  const snapshots = readRows(
    await database.execute(sql`
      WITH terminal_ownership AS (
        SELECT snapshot.*
        FROM ownership_snapshots snapshot
        LEFT JOIN ownership_snapshots successor
          ON successor.supersedes_snapshot_id = snapshot.id
         AND successor.fund_id = snapshot.fund_id
         AND successor.effective_date <= ${asOfDate}
         AND successor.recorded_at <= ${knowledgeCutoff}
        WHERE snapshot.fund_id = ${input.fundId}
          AND snapshot.effective_date <= ${asOfDate}
          AND snapshot.recorded_at <= ${knowledgeCutoff}
          AND successor.id IS NULL
          ${input.vehicleId === undefined ? sql`` : sql`AND snapshot.vehicle_id = ${input.vehicleId}`}
          ${
            input.companyIdentityId === undefined
              ? sql``
              : sql`AND snapshot.company_identity_id = ${input.companyIdentityId}`
          }
      ),
      ranked_ownership AS (
        SELECT *,
               ROW_NUMBER() OVER (
                 PARTITION BY fund_id, vehicle_id, company_identity_id
                 ORDER BY effective_date DESC, recorded_at DESC, id DESC
               ) AS rank
        FROM terminal_ownership
      )
      SELECT *
      FROM ranked_ownership
      WHERE rank = 1
      ORDER BY vehicle_id, company_identity_id, id
    `)
  ).map(ownershipFromRow);

  return OwnershipSnapshotListV1Schema.parse({
    fundId: input.fundId,
    asOfDate,
    knowledgeCutoff: knowledgeCutoff.toISOString(),
    snapshots: snapshots.map(ownershipDto),
  });
}

async function assertAcceptedOwnershipObservation(
  database: LedgerDatabase,
  input: {
    fundId: number;
    companyIdentityId: number;
    sourceObservationId: number;
    effectiveDate: string;
  }
): Promise<void> {
  const row = readRows(
    await database.execute(sql`
      SELECT id
      FROM source_observations
      WHERE id = ${input.sourceObservationId}
        AND fund_id = ${input.fundId}
        AND company_identity_id = ${input.companyIdentityId}
        AND domain = 'ownership'
        AND status = 'accepted'
        AND effective_date <= ${input.effectiveDate}
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new OwnershipSnapshotServiceError(
      422,
      'OWNERSHIP_OBSERVATION_NOT_ACCEPTED',
      'Ownership snapshots require an accepted same-fund ownership source observation.'
    );
  }
}

async function assertSupersededSnapshotMatches(
  database: LedgerDatabase,
  input: {
    fundId: number;
    vehicleId: number;
    companyIdentityId: number;
    supersedesSnapshotId: number;
  }
): Promise<void> {
  const row = readRows(
    await database.execute(sql`
      SELECT id
      FROM ownership_snapshots
      WHERE id = ${input.supersedesSnapshotId}
        AND fund_id = ${input.fundId}
        AND vehicle_id = ${input.vehicleId}
        AND company_identity_id = ${input.companyIdentityId}
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new OwnershipSnapshotServiceError(
      409,
      'OWNERSHIP_SUPERSEDE_SCOPE_MISMATCH',
      'Superseded ownership snapshot must match fund, vehicle, and company identity.'
    );
  }
}

async function selectOwnershipByIdempotency(
  database: LedgerDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<OwnershipSnapshotRow | null> {
  return firstOwnership(
    await database.execute(sql`
      SELECT *
      FROM ownership_snapshots
      WHERE fund_id = ${fundId}
        AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `)
  );
}

async function requireOwnershipSnapshot(
  database: LedgerDatabase,
  fundId: number,
  id: number
): Promise<OwnershipSnapshotRow> {
  const row = firstOwnership(
    await database.execute(sql`
      SELECT *
      FROM ownership_snapshots
      WHERE fund_id = ${fundId}
        AND id = ${id}
      LIMIT 1
    `)
  );
  if (!row) {
    throw new OwnershipSnapshotServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Ownership snapshot insert could not be reloaded.'
    );
  }
  return row;
}

function firstOwnership(result: unknown): OwnershipSnapshotRow | null {
  const row = readRows(result)[0];
  return row ? ownershipFromRow(row) : null;
}

function ownershipFromRow(row: Record<string, unknown>): OwnershipSnapshotRow {
  return {
    id: asPositiveInt(row['id']),
    fundId: asPositiveInt(row['fund_id'] ?? row['fundId']),
    vehicleId: asPositiveInt(row['vehicle_id'] ?? row['vehicleId']),
    companyIdentityId: asPositiveInt(row['company_identity_id'] ?? row['companyIdentityId']),
    effectiveDate: asDateString(row['effective_date'] ?? row['effectiveDate']),
    recordedAt: asDate(row['recorded_at'] ?? row['recordedAt']),
    ownershipPct: asString(row['ownership_pct'] ?? row['ownershipPct']),
    fdNumerator: asNullableString(row['fd_numerator'] ?? row['fdNumerator']),
    fdDenominator: asNullableString(row['fd_denominator'] ?? row['fdDenominator']),
    currency: asString(row['currency']),
    supersedesSnapshotId: asNullablePositiveInt(
      row['supersedes_snapshot_id'] ?? row['supersedesSnapshotId']
    ),
    sourceObservationId: asPositiveInt(row['source_observation_id'] ?? row['sourceObservationId']),
    createdBy: asNullablePositiveInt(row['created_by'] ?? row['createdBy']),
    idempotencyKey: asString(row['idempotency_key'] ?? row['idempotencyKey']),
    requestHash: asString(row['request_hash'] ?? row['requestHash']),
  };
}

function ownershipDto(row: OwnershipSnapshotRow): OwnershipSnapshotV1 {
  return OwnershipSnapshotV1Schema.parse({
    ...row,
    recordedAt: row.recordedAt.toISOString(),
  });
}

function readRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  }
  return [];
}

function readInsertedIdOrNull(result: unknown): number | null {
  const row = readRows(result)[0];
  return row ? asPositiveInt(row['id']) : null;
}

function asPositiveInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new OwnershipSnapshotServiceError(500, 'LEDGER_READ_FAILED', 'Database returned invalid id.');
  }
  return parsed;
}

function asNullablePositiveInt(value: unknown): number | null {
  return value === null || value === undefined ? null : asPositiveInt(value);
}

function asString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new OwnershipSnapshotServiceError(
      500,
      'LEDGER_READ_FAILED',
      'Database returned invalid string.'
    );
  }
  return value;
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return asString(value);
}

function asDate(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(asString(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new OwnershipSnapshotServiceError(
      500,
      'LEDGER_READ_FAILED',
      'Database returned invalid timestamp.'
    );
  }
  return parsed;
}
