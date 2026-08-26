/**
 * Capital envelope service (Task 16.3 WP-L3 Phase B).
 *
 * Creates immutable, versioned `internal_capital_envelope_versions` rows
 * (Brief 3's operator-attested legal capital envelope). Every create call is
 * idempotency-key replay-aware (G16 fail-closed lesson: replay check runs
 * before any DB read) and version allocation is serialized per fund via a
 * `pg_advisory_xact_lock` acquired only on the non-replay path, immediately
 * before version-number resolution and INSERT (P-D11). Corrections are
 * modeled as new versions chained via `parent_envelope_version_id`; rows are
 * never updated (DB-enforced by migration 0045's trigger).
 *
 * Governing plan: docs/superpowers/plans/
 * 2026-07-31-task163-wp-l3-service-persistence-plan.md (section 2 G4/G16,
 * section 3 P-D6/P-D11, section 5, section 11 T-B1/T-B5).
 *
 * @module server/services/internal-economics/capital-envelope-service
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  assertOwnedByFund,
  FundScopeError,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import {
  replayIdempotentCommandIfPresent,
  runIdempotentCommand,
} from '../../lib/idempotent-command';
import {
  buildCapitalEnvelopeHashPreimageV1,
  CAPITAL_ENVELOPE_CONTRACT_VERSION,
  CapitalEnvelopeCreateRequestV1Schema,
  type CapitalEnvelopeCreateRequestV1,
} from '../../../shared/contracts/internal-economics/capital-envelope-v1.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import {
  internalCapitalEnvelopeVersions,
  type InternalCapitalEnvelopeVersionRow,
} from '../../../shared/schema/internal-economics';
import { vehicles } from '../../../shared/schema/vehicles';

type CapitalEnvelopeDatabase = typeof db;

export class CapitalEnvelopeServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'CapitalEnvelopeServiceError';
    this.statusCode = status;
  }
}

export interface CreateCapitalEnvelopeVersionOptions {
  readonly fundId: number;
  readonly actorId: number;
  readonly idempotencyKey: string;
  readonly request: CapitalEnvelopeCreateRequestV1;
  /** Test-injection seam; defaults to the shared app database (repo idiom). */
  readonly database?: CapitalEnvelopeDatabase;
}

/** G4 namespace convention, entity-scoped per P-D11 so envelope and policy
 * creation for the same fund never unnecessarily serialize each other. */
function envelopeLockKey(fundId: number): string {
  return `internal-economics:envelope:${fundId}`;
}

/**
 * Re-validates the request against Brief 3's schema (arithmetic invariants
 * live in `enforceCommitmentInvariants`). Pure and side-effect-free, so
 * running it before the idempotent-replay check never risks a premature DB
 * read (G16 concerns mutable-state reads, not input validation).
 */
function parseCapitalEnvelopeCreateRequest(
  request: CapitalEnvelopeCreateRequestV1
): CapitalEnvelopeCreateRequestV1 {
  const parsed = CapitalEnvelopeCreateRequestV1Schema.safeParse(request);
  if (parsed.success) return parsed.data;

  const code = parsed.error.issues[0]?.message ?? 'ENVELOPE_REQUEST_INVALID';
  throw new CapitalEnvelopeServiceError(
    422,
    code,
    `Capital envelope creation request failed Brief 3 invariant validation: ${code}.`,
    { issues: parsed.error.issues }
  );
}

/** Client-authoritative fields hashed for idempotency-key replay detection
 * (distinct from `envelope_hash`, the permanent legal-content identity). */
function buildIdempotencyRequestRecord(
  fundId: number,
  request: CapitalEnvelopeCreateRequestV1
): Record<string, unknown> {
  return {
    fundId,
    contractVersion: CAPITAL_ENVELOPE_CONTRACT_VERSION,
    mainFundVehicleId: request.mainFundVehicleId,
    lpCommitmentUsd: request.lpCommitmentUsd,
    gpCommitmentUsd: request.gpCommitmentUsd,
    totalCommitmentUsd: request.totalCommitmentUsd,
    currency: request.currency,
    effectiveAt: request.effectiveAt,
    sourceArtifactId: request.sourceArtifactId,
    sourceConfigId: request.sourceConfigId,
    sourceConfigVersion: request.sourceConfigVersion,
    sourceConfigHash: request.sourceConfigHash,
    attestedBy: request.attestedBy,
    attestedAt: request.attestedAt,
  };
}

async function loadExistingByIdempotencyKey(
  database: CapitalEnvelopeDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<{ row: InternalCapitalEnvelopeVersionRow; requestHash: string } | null> {
  const [existingRow] = await database
    .select()
    .from(internalCapitalEnvelopeVersions)
    .where(
      and(
        eq(internalCapitalEnvelopeVersions.fundId, fundId),
        eq(internalCapitalEnvelopeVersions.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return existingRow ? { row: existingRow, requestHash: existingRow.requestHash } : null;
}

/** DB-side Brief 3 checks (the contract schema already enforces the
 * arithmetic invariants): the pinned vehicle must exist, be fund-scoped, and
 * be the fund's `main_fund`-typed vehicle. Refuses 422, nothing persisted. */
async function assertMainFundVehicle(params: {
  readonly database: CapitalEnvelopeDatabase;
  readonly fundId: number;
  readonly mainFundVehicleId: number;
}): Promise<void> {
  try {
    await assertOwnedByFund({
      db: params.database as unknown as FundScopedOwnershipDatabase,
      fundId: params.fundId,
      ref: { kind: 'vehicle', id: params.mainFundVehicleId },
    });
  } catch (error) {
    if (error instanceof FundScopeError) {
      throw new CapitalEnvelopeServiceError(
        422,
        'ENVELOPE_VEHICLE_NOT_IN_FUND',
        `Vehicle ${params.mainFundVehicleId} is not owned by fund ${params.fundId}.`,
        { mainFundVehicleId: params.mainFundVehicleId, fundId: params.fundId }
      );
    }
    throw error;
  }

  const [vehicleRow] = await params.database
    .select({ vehicleType: vehicles.vehicleType })
    .from(vehicles)
    .where(and(eq(vehicles.id, params.mainFundVehicleId), eq(vehicles.fundId, params.fundId)))
    .limit(1);

  if (vehicleRow === undefined || vehicleRow.vehicleType !== 'main_fund') {
    throw new CapitalEnvelopeServiceError(
      422,
      'ENVELOPE_VEHICLE_NOT_MAIN_FUND',
      `Vehicle ${params.mainFundVehicleId} is not the fund's main_fund vehicle.`,
      { mainFundVehicleId: params.mainFundVehicleId, fundId: params.fundId }
    );
  }
}

/** MAX(version) for this fund, read under the P-D11 advisory lock. */
async function loadLatestEnvelopeVersion(
  database: CapitalEnvelopeDatabase,
  fundId: number
): Promise<{ readonly id: number; readonly version: number } | null> {
  const rows = await database
    .select({
      id: internalCapitalEnvelopeVersions.id,
      version: internalCapitalEnvelopeVersions.version,
    })
    .from(internalCapitalEnvelopeVersions)
    .where(eq(internalCapitalEnvelopeVersions.fundId, fundId))
    .orderBy(desc(internalCapitalEnvelopeVersions.version))
    .limit(1);
  const [latest] = rows;
  return latest ?? null;
}

/**
 * Creates a new immutable capital envelope version for a fund (Brief 3).
 *
 * Sequencing (P-D11, G16): (1) idempotent replay check first, before any
 * lock or other read; (2) on the non-replay path, DB-side Brief 3 checks
 * (vehicle exists, fund-scoped, main_fund typed); (3) advisory lock,
 * immediately before version-number resolution and INSERT; (4) version =
 * MAX(version for this fund) + 1 (or 1 if none), with the prior latest
 * version's id as `parentEnvelopeVersionId` (null for the first version) —
 * corrections are always chained to the fund's current latest version.
 */
export async function createCapitalEnvelopeVersion(
  opts: CreateCapitalEnvelopeVersionOptions
): Promise<InternalCapitalEnvelopeVersionRow> {
  const parsedRequest = parseCapitalEnvelopeCreateRequest(opts.request);
  const database = opts.database ?? db;
  const idempotencyRequest = buildIdempotencyRequestRecord(opts.fundId, parsedRequest);

  const replay = await replayIdempotentCommandIfPresent<InternalCapitalEnvelopeVersionRow>({
    db: database,
    fundId: opts.fundId,
    idempotencyKey: opts.idempotencyKey,
    contractVersion: CAPITAL_ENVELOPE_CONTRACT_VERSION,
    request: idempotencyRequest,
    loadExisting: () => loadExistingByIdempotencyKey(database, opts.fundId, opts.idempotencyKey),
  });
  if (replay !== null) return replay.row;

  return database.transaction(async (tx) => {
    const transactionDb = tx as unknown as CapitalEnvelopeDatabase;

    await assertMainFundVehicle({
      database: transactionDb,
      fundId: opts.fundId,
      mainFundVehicleId: parsedRequest.mainFundVehicleId,
    });

    await transactionDb.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${envelopeLockKey(opts.fundId)}))`
    );

    const latest = await loadLatestEnvelopeVersion(transactionDb, opts.fundId);
    const version = latest === null ? 1 : latest.version + 1;
    const parentEnvelopeVersionId = latest === null ? null : latest.id;
    const envelopeHash = canonicalSha256(
      buildCapitalEnvelopeHashPreimageV1({ fundId: opts.fundId, request: parsedRequest })
    );

    const result = await runIdempotentCommand<InternalCapitalEnvelopeVersionRow>({
      db: transactionDb,
      fundId: opts.fundId,
      idempotencyKey: opts.idempotencyKey,
      contractVersion: CAPITAL_ENVELOPE_CONTRACT_VERSION,
      request: idempotencyRequest,
      loadExisting: () =>
        loadExistingByIdempotencyKey(transactionDb, opts.fundId, opts.idempotencyKey),
      insert: async (requestHash) => {
        const [inserted] = await transactionDb
          .insert(internalCapitalEnvelopeVersions)
          .values({
            fundId: opts.fundId,
            version,
            mainFundVehicleId: parsedRequest.mainFundVehicleId,
            lpCommitmentUsd: parsedRequest.lpCommitmentUsd,
            gpCommitmentUsd: parsedRequest.gpCommitmentUsd,
            totalCommitmentUsd: parsedRequest.totalCommitmentUsd,
            currency: parsedRequest.currency,
            effectiveAt: new Date(parsedRequest.effectiveAt),
            sourceArtifactId: parsedRequest.sourceArtifactId,
            sourceConfigId: parsedRequest.sourceConfigId,
            sourceConfigVersion: parsedRequest.sourceConfigVersion,
            sourceConfigHash: parsedRequest.sourceConfigHash,
            attestedBy: parsedRequest.attestedBy,
            attestedAt: new Date(parsedRequest.attestedAt),
            envelopeHash,
            parentEnvelopeVersionId,
            idempotencyKey: opts.idempotencyKey,
            requestHash,
          })
          .onConflictDoNothing({
            target: [
              internalCapitalEnvelopeVersions.fundId,
              internalCapitalEnvelopeVersions.idempotencyKey,
            ],
          })
          .returning();
        return inserted ?? null;
      },
    });

    return result.row;
  });
}
