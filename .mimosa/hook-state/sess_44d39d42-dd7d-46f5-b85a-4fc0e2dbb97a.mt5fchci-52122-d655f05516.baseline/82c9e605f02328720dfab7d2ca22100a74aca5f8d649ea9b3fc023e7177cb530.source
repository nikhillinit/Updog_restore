/**
 * Economics policy service (Task 16.3 WP-L3 Phase B).
 *
 * Creates immutable, versioned `internal_economics_policy_versions` rows
 * (D3/P-D6). Every create call is idempotency-key replay-aware (G16
 * fail-closed lesson: replay check runs before any DB read) and version
 * allocation is serialized per fund via a `pg_advisory_xact_lock` acquired
 * only on the non-replay path, immediately before version-number resolution
 * and INSERT (P-D11) -- mirroring `capital-envelope-service.ts`'s proven
 * structure exactly. Corrections are modeled as new versions chained via
 * `parent_policy_version_id`; rows are never updated (DB-enforced by
 * migration 0045's trigger).
 *
 * Seed-refusal registry (section 5, scoping-design.md:774-797): the create
 * path reads the pinned `fundConfigs.config` row (never the request body)
 * and independently validates that the fund's REAL configured GP economics
 * are representable by policy schema V1, refusing 422 on the first active
 * (non-dormant) unsupported feature. Dormant params that pass normalize
 * into `normalization_warnings`, which participate in `assumptions_hash`
 * (D4) so two policies differing only in dormant params hash differently.
 *
 * Implementation note on check order: the ratified registry documents
 * FUND_LIFE_GRID_UNREPRESENTABLE (position 7) before FUND_TERM_START_ABSENT
 * (position 8), but grid representability can only be evaluated by calling
 * the exported `resolveTerminalPeriodEndV1` helper, which requires a term
 * start date -- and this module never performs raw date arithmetic of its
 * own (section 10b). This module therefore validates term-start presence
 * before invoking that helper. No realistic fixture distinguishes the two
 * orders (grid-unrepresentability without a term start cannot be evaluated
 * at all), so this reordering changes no observable behavior.
 *
 * The terminal pair is written exclusively via `resolveTerminalPeriodEndV1`
 * + `persistedTerminalResolutionFromPolicyV1`, and readback runs
 * `assertPersistedTerminalResolutionMatchesPolicyV1` +
 * `validatePersistedTerminalResolutionV1` before a row is served (G11).
 *
 * Governing plan: docs/superpowers/plans/
 * 2026-07-31-task163-wp-l3-service-persistence-plan.md (section 2 G7/G9/G11/
 * G14/G16, section 3 P-D1/P-D2/P-D6/P-D11, section 5, section 10, section 11
 * T-B2/T-B3/T-B4/T-B5).
 *
 * @module server/services/internal-economics/economics-policy-service
 */

import { and, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

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
  FundDraftWriteV1Schema,
  type FundDraftWriteV1,
} from '../../../shared/contracts/fund-draft-write-v1.contract';
import {
  ECONOMICS_POLICY_CONTRACT_VERSION,
  EconomicsPolicyBodyV1Schema,
  EconomicsPolicyCreateRequestV1Schema,
  type EconomicsPolicyCreateRequestV1,
  type EconomicsPolicyNormalizationWarningV1,
  type EconomicsPolicySeedRefusalCodeV1,
} from '../../../shared/contracts/internal-economics/economics-policy-v1.contract';
import {
  assertPersistedTerminalResolutionMatchesPolicyV1,
  persistedTerminalResolutionFromPolicyV1,
  resolveTerminalPeriodEndV1,
  TerminalPolicyV1Error,
  validatePersistedTerminalResolutionV1,
} from '../../../shared/contracts/internal-economics/terminal-policy-v1.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { fundConfigs } from '../../../shared/schema/fund';
import {
  internalEconomicsPolicyVersions,
  type InternalEconomicsPolicyVersionRow,
} from '../../../shared/schema/internal-economics';

type EconomicsPolicyDatabase = typeof db;

const DEFAULT_POLICY_LIST_LIMIT = 20;
const CalendarDateFormatSchema = z.string().date();

export class EconomicsPolicySeedRefusalError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: EconomicsPolicySeedRefusalCodeV1,
    message: string,
    readonly context?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'EconomicsPolicySeedRefusalError';
    this.statusCode = status;
  }
}

export class EconomicsPolicyServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'EconomicsPolicyServiceError';
    this.statusCode = status;
  }
}

export interface CreateEconomicsPolicyVersionOptions {
  readonly fundId: number;
  readonly actorId: number;
  readonly idempotencyKey: string;
  readonly request: EconomicsPolicyCreateRequestV1;
  /** Test-injection seam; defaults to the shared app database (repo idiom). */
  readonly database?: EconomicsPolicyDatabase;
}

export interface PolicyVersionListCursor {
  readonly createdAt: string | Date;
  readonly id: number;
}

/** G4 namespace convention, entity-scoped per P-D11 so envelope and policy
 * creation for the same fund never unnecessarily serialize each other. */
function policyLockKey(fundId: number): string {
  return `internal-economics:policy:${fundId}`;
}

function isCalendarDateString(value: string | undefined): value is string {
  return value !== undefined && CalendarDateFormatSchema.safeParse(value).success;
}

interface EconomicsPolicySeedResolution {
  readonly warnings: EconomicsPolicyNormalizationWarningV1[];
}

function normalizationWarning(
  parameter: string,
  provenance: 'explicit' | 'defaulted',
  resolvedValue: string,
  detail: string
): EconomicsPolicyNormalizationWarningV1 {
  return { parameter, provenance, resolvedValue, detail };
}

function refuseSeed(
  code: EconomicsPolicySeedRefusalCodeV1,
  detail: string,
  context?: Readonly<Record<string, unknown>>
): never {
  throw new EconomicsPolicySeedRefusalError(422, code, detail, context);
}

/**
 * Registry-order seed-refusal check against the fund's REAL configured GP
 * economics (never the request body -- see module docstring). Throws
 * `EconomicsPolicySeedRefusalError` on the first active/unsupported feature;
 * returns the dormant-parameter normalization warnings otherwise.
 */
function resolveEconomicsPolicySeed(config: FundDraftWriteV1): EconomicsPolicySeedResolution {
  const warnings: EconomicsPolicyNormalizationWarningV1[] = [];
  const waterfallModel = config.economicsAssumptions?.waterfallModel;
  const tiers = config.waterfallTiers ?? [];
  const primaryTier = tiers.find((tier) => (tier.gpSplit ?? 0) > 0) ?? tiers[0];

  // 1. CATCH_UP_UNSUPPORTED -- checked independently of hurdle basis (strict
  // ruling: an active catch-up refuses even when the hurdle itself is dormant).
  const catchUpExplicit = waterfallModel !== undefined;
  const prefCatchUp = catchUpExplicit
    ? waterfallModel.prefCatchUp
    : (primaryTier?.catchUp ?? 0) > 0;
  if (prefCatchUp) {
    refuseSeed('CATCH_UP_UNSUPPORTED', 'Source config resolves an active GP catch-up.');
  }
  warnings.push(
    normalizationWarning(
      'prefCatchUp',
      catchUpExplicit || primaryTier?.catchUp !== undefined ? 'explicit' : 'defaulted',
      'false',
      'GP catch-up is dormant (off).'
    )
  );

  // 2. CLAWBACK_UNSUPPORTED (G14: the legacy-derivation branch always
  // resolves clawbackEnabled: true unconditionally, so it can only ever
  // refuse here -- dormant clawback is reachable only via an explicit
  // waterfallModel with clawbackEnabled: false).
  const clawbackEnabled = waterfallModel !== undefined ? waterfallModel.clawbackEnabled : true;
  if (clawbackEnabled) {
    refuseSeed(
      'CLAWBACK_UNSUPPORTED',
      'Source config resolves active clawback (explicit or defaulted default).'
    );
  }
  warnings.push(
    normalizationWarning('clawbackEnabled', 'explicit', 'false', 'Clawback is dormant (off).')
  );

  // 3. ESCROW_UNSUPPORTED
  const escrowPct = waterfallModel !== undefined ? waterfallModel.escrowPct : 0;
  if (escrowPct > 0) {
    refuseSeed('ESCROW_UNSUPPORTED', 'Source config resolves an active escrow percentage.');
  }
  warnings.push(
    normalizationWarning(
      'escrowPct',
      waterfallModel !== undefined ? 'explicit' : 'defaulted',
      '0',
      'Escrow is dormant (zero).'
    )
  );

  // 4. RECYCLING_UNSUPPORTED
  const recyclingModel = config.economicsAssumptions?.recyclingModel;
  const recyclingExplicit = recyclingModel !== undefined;
  const recyclingEnabled = recyclingExplicit
    ? recyclingModel.enabled
    : (config.recyclingEnabled ?? false);
  if (recyclingEnabled) {
    refuseSeed('RECYCLING_UNSUPPORTED', 'Source config resolves active recycling.');
  }
  warnings.push(
    normalizationWarning(
      'recyclingEnabled',
      recyclingExplicit || config.recyclingEnabled !== undefined ? 'explicit' : 'defaulted',
      'false',
      'Recycling is dormant (off).'
    )
  );

  // 5. HURDLE_BASIS_UNSUPPORTED -- policy schema V1 admits basis 'none' only.
  const hurdleExplicit = waterfallModel !== undefined;
  const prefType = hurdleExplicit
    ? waterfallModel.prefType
    : primaryTier?.preferredReturn === 0
      ? 'none'
      : 'compounded';
  if (prefType !== 'none') {
    refuseSeed(
      'HURDLE_BASIS_UNSUPPORTED',
      'Source config resolves a pref-bearing hurdle; policy schema V1 supports basis "none" only.'
    );
  }
  warnings.push(
    normalizationWarning(
      'hurdleBasis',
      hurdleExplicit || primaryTier?.preferredReturn !== undefined ? 'explicit' : 'defaulted',
      'none',
      'Hurdle basis resolves to none (dormant).'
    )
  );

  // 6. FUND_LIFE_ABSENT -- no silent engine-style default (DEFAULT_FUND_LIFE_YEARS
  // is deliberately not reused here; seed refusal requires a real, resolvable value).
  const fundLifeYears = config.economicsAssumptions?.timeline?.fundLifeYears ?? config.fundLife;
  if (fundLifeYears === undefined) {
    refuseSeed('FUND_LIFE_ABSENT', 'No fund life is resolvable from the source config.');
  }

  // 8 (checked ahead of 7 -- see module docstring). FUND_TERM_START_ABSENT
  const termStartDate = config.establishmentDate;
  if (!isCalendarDateString(termStartDate)) {
    refuseSeed(
      'FUND_TERM_START_ABSENT',
      'No term start date is resolvable from the source config.'
    );
  }

  // 7. FUND_LIFE_GRID_UNREPRESENTABLE -- exclusively via the exported helper.
  try {
    resolveTerminalPeriodEndV1({ termStartDate, fundLifeYears: String(fundLifeYears) });
  } catch (error) {
    if (error instanceof TerminalPolicyV1Error && error.code === 'FUND_LIFE_GRID_UNREPRESENTABLE') {
      refuseSeed('FUND_LIFE_GRID_UNREPRESENTABLE', error.message);
    }
    throw error;
  }

  // 9. EVERGREEN_STATUS_ABSENT -- missing is never silently treated as false.
  if (config.isEvergreen === undefined) {
    refuseSeed('EVERGREEN_STATUS_ABSENT', 'Evergreen status is missing from the source config.');
  }
  // 10. EVERGREEN_UNSUPPORTED
  if (config.isEvergreen) {
    refuseSeed('EVERGREEN_UNSUPPORTED', 'Source config is evergreen.');
  }
  warnings.push(
    normalizationWarning('isEvergreen', 'explicit', 'false', 'Fund is not evergreen (dormant).')
  );

  // 11. CREDIT_FACILITY_UNSUPPORTED -- issue-mandated, reserved. No field in
  // FundDraftWriteV1Schema carries a credit-facility/line-of-credit concept,
  // so this check is structurally unreachable against any schema-valid
  // config; it exists so the registry's full code list is wired end to end.
  const creditFacilityIdentifier = (config as Record<string, unknown>)['creditFacility'];
  if (creditFacilityIdentifier !== undefined) {
    refuseSeed(
      'CREDIT_FACILITY_UNSUPPORTED',
      'Source config specifies a credit-facility identifier.'
    );
  }

  return { warnings };
}

async function loadFundConfigRow(
  database: EconomicsPolicyDatabase,
  fundId: number,
  sourceConfigId: number
): Promise<typeof fundConfigs.$inferSelect | undefined> {
  const [row] = await database
    .select()
    .from(fundConfigs)
    .where(and(eq(fundConfigs.id, sourceConfigId), eq(fundConfigs.fundId, fundId)))
    .limit(1);
  return row;
}

function parseEconomicsPolicyCreateRequest(
  request: EconomicsPolicyCreateRequestV1
): EconomicsPolicyCreateRequestV1 {
  const parsed = EconomicsPolicyCreateRequestV1Schema.safeParse(request);
  if (parsed.success) return parsed.data;

  throw new EconomicsPolicyServiceError(
    422,
    'POLICY_REQUEST_INVALID',
    'Economics policy creation request failed contract validation.',
    { issues: parsed.error.issues }
  );
}

/** Client-authoritative fields hashed for idempotency-key replay detection. */
function buildIdempotencyRequestRecord(
  fundId: number,
  request: EconomicsPolicyCreateRequestV1
): Record<string, unknown> {
  return {
    fundId,
    contractVersion: ECONOMICS_POLICY_CONTRACT_VERSION,
    capitalEnvelopeVersionId: request.capitalEnvelopeVersionId,
    sourceConfigId: request.sourceConfigId,
    sourceConfigVersion: request.sourceConfigVersion,
    body: request.body,
  };
}

async function loadExistingPolicyByIdempotencyKey(
  database: EconomicsPolicyDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<{ row: InternalEconomicsPolicyVersionRow; requestHash: string } | null> {
  const [existingRow] = await database
    .select()
    .from(internalEconomicsPolicyVersions)
    .where(
      and(
        eq(internalEconomicsPolicyVersions.fundId, fundId),
        eq(internalEconomicsPolicyVersions.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return existingRow ? { row: existingRow, requestHash: existingRow.requestHash } : null;
}

/** MAX(version) for this fund, read under the P-D11 advisory lock. */
async function loadLatestPolicyVersion(
  database: EconomicsPolicyDatabase,
  fundId: number
): Promise<{ readonly id: number; readonly version: number } | null> {
  const rows = await database
    .select({
      id: internalEconomicsPolicyVersions.id,
      version: internalEconomicsPolicyVersions.version,
    })
    .from(internalEconomicsPolicyVersions)
    .where(eq(internalEconomicsPolicyVersions.fundId, fundId))
    .orderBy(desc(internalEconomicsPolicyVersions.version))
    .limit(1);
  const [latest] = rows;
  return latest ?? null;
}

/** Loads the pinned `fundConfigs` row (id + fund + version all pinned),
 * parses it as `FundDraftWriteV1` (the sanctioned shape for reading
 * `config`, matching `lp-economics-run-service.ts`'s own convention). */
async function loadSourceConfigForSeed(params: {
  readonly database: EconomicsPolicyDatabase;
  readonly fundId: number;
  readonly sourceConfigId: number;
  readonly sourceConfigVersion: number;
}): Promise<FundDraftWriteV1> {
  const row = await loadFundConfigRow(params.database, params.fundId, params.sourceConfigId);
  if (row === undefined) {
    throw new EconomicsPolicyServiceError(
      404,
      'SOURCE_CONFIG_NOT_FOUND',
      `fundConfigs row ${params.sourceConfigId} was not found for fund ${params.fundId}.`,
      { sourceConfigId: params.sourceConfigId, fundId: params.fundId }
    );
  }
  if (row.version !== params.sourceConfigVersion) {
    throw new EconomicsPolicyServiceError(
      409,
      'SOURCE_CONFIG_VERSION_MISMATCH',
      `fundConfigs row ${params.sourceConfigId} is at version ${row.version}, not the requested ${params.sourceConfigVersion}.`,
      {
        sourceConfigId: params.sourceConfigId,
        actualVersion: row.version,
        requestedVersion: params.sourceConfigVersion,
      }
    );
  }
  const parsedConfig = FundDraftWriteV1Schema.safeParse(row.config);
  if (!parsedConfig.success) {
    throw new EconomicsPolicyServiceError(
      422,
      'SOURCE_CONFIG_MALFORMED',
      'The source fund config does not parse as a valid draft-write shape.',
      { sourceConfigId: params.sourceConfigId, issues: parsedConfig.error.issues }
    );
  }
  return parsedConfig.data;
}

/** Catches the envelope-ownership 404 and rewraps as a 422 create-request
 * validation failure (mirrors capital-envelope-service.ts's own vehicle
 * ownership rewrap convention). */
async function assertEnvelopeOwnedByFund(params: {
  readonly database: EconomicsPolicyDatabase;
  readonly fundId: number;
  readonly capitalEnvelopeVersionId: number;
}): Promise<void> {
  try {
    await assertOwnedByFund({
      db: params.database as unknown as FundScopedOwnershipDatabase,
      fundId: params.fundId,
      ref: { kind: 'capital_envelope_version', id: params.capitalEnvelopeVersionId },
    });
  } catch (error) {
    if (error instanceof FundScopeError) {
      throw new EconomicsPolicyServiceError(
        422,
        'POLICY_CAPITAL_ENVELOPE_NOT_IN_FUND',
        `Capital envelope version ${params.capitalEnvelopeVersionId} is not owned by fund ${params.fundId}.`,
        { capitalEnvelopeVersionId: params.capitalEnvelopeVersionId, fundId: params.fundId }
      );
    }
    throw error;
  }
}

/**
 * Creates a new immutable economics policy version for a fund (D3/P-D6).
 *
 * Sequencing (P-D11, G16): (1) idempotent replay check first, before any
 * lock or other read; (2) on the non-replay path, the seed-refusal registry
 * check against the pinned `fundConfigs.config` row, capital-envelope
 * ownership, and terminal-pair resolution; (3) advisory lock, immediately
 * before version-number resolution and INSERT; (4) version = MAX(version for
 * this fund) + 1 (or 1 if none), with the prior latest version's id as
 * `parentPolicyVersionId` (null for the first version) -- corrections are
 * always chained to the fund's current latest version.
 */
export async function createEconomicsPolicyVersion(
  opts: CreateEconomicsPolicyVersionOptions
): Promise<InternalEconomicsPolicyVersionRow> {
  const parsedRequest = parseEconomicsPolicyCreateRequest(opts.request);
  const database = opts.database ?? db;
  const idempotencyRequest = buildIdempotencyRequestRecord(opts.fundId, parsedRequest);

  const replay = await replayIdempotentCommandIfPresent<InternalEconomicsPolicyVersionRow>({
    db: database,
    fundId: opts.fundId,
    idempotencyKey: opts.idempotencyKey,
    contractVersion: ECONOMICS_POLICY_CONTRACT_VERSION,
    request: idempotencyRequest,
    loadExisting: () =>
      loadExistingPolicyByIdempotencyKey(database, opts.fundId, opts.idempotencyKey),
  });
  if (replay !== null) return replay.row;

  return database.transaction(async (tx) => {
    const transactionDb = tx as unknown as EconomicsPolicyDatabase;

    const sourceConfig = await loadSourceConfigForSeed({
      database: transactionDb,
      fundId: opts.fundId,
      sourceConfigId: parsedRequest.sourceConfigId,
      sourceConfigVersion: parsedRequest.sourceConfigVersion,
    });
    const seed = resolveEconomicsPolicySeed(sourceConfig);

    await assertEnvelopeOwnedByFund({
      database: transactionDb,
      fundId: opts.fundId,
      capitalEnvelopeVersionId: parsedRequest.capitalEnvelopeVersionId,
    });

    const resolution = resolveTerminalPeriodEndV1({
      termStartDate: parsedRequest.body.termStartDate,
      fundLifeYears: parsedRequest.body.fundLifeYears,
    });
    const persistedTerminal = persistedTerminalResolutionFromPolicyV1(resolution);
    const assumptionsHash = canonicalSha256({
      policySchemaVersion: ECONOMICS_POLICY_CONTRACT_VERSION,
      body: parsedRequest.body,
      normalizationWarnings: seed.warnings,
    });

    await transactionDb.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${policyLockKey(opts.fundId)}))`
    );

    const latest = await loadLatestPolicyVersion(transactionDb, opts.fundId);
    const version = latest === null ? 1 : latest.version + 1;
    const parentPolicyVersionId = latest === null ? null : latest.id;

    const result = await runIdempotentCommand<InternalEconomicsPolicyVersionRow>({
      db: transactionDb,
      fundId: opts.fundId,
      idempotencyKey: opts.idempotencyKey,
      contractVersion: ECONOMICS_POLICY_CONTRACT_VERSION,
      request: idempotencyRequest,
      loadExisting: () =>
        loadExistingPolicyByIdempotencyKey(transactionDb, opts.fundId, opts.idempotencyKey),
      insert: async (requestHash) => {
        const [inserted] = await transactionDb
          .insert(internalEconomicsPolicyVersions)
          .values({
            fundId: opts.fundId,
            version,
            policySchemaVersion: ECONOMICS_POLICY_CONTRACT_VERSION,
            policyBody: parsedRequest.body,
            normalizationWarnings: seed.warnings,
            terminalPeriodEnd: persistedTerminal.terminalPeriodEnd,
            terminalResolutionMethodologyVersion:
              persistedTerminal.terminalResolutionMethodologyVersion,
            capitalEnvelopeVersionId: parsedRequest.capitalEnvelopeVersionId,
            assumptionsHash,
            sourceConfigId: parsedRequest.sourceConfigId,
            sourceConfigVersion: parsedRequest.sourceConfigVersion,
            parentPolicyVersionId,
            createdBy: opts.actorId,
            idempotencyKey: opts.idempotencyKey,
            requestHash,
          })
          .onConflictDoNothing({
            target: [
              internalEconomicsPolicyVersions.fundId,
              internalEconomicsPolicyVersions.idempotencyKey,
            ],
          })
          .returning();
        return inserted ?? null;
      },
    });

    return result.row;
  });
}

/**
 * Readback terminal-pair validation (G11): re-validates the persisted body
 * shape, then runs `assertPersistedTerminalResolutionMatchesPolicyV1`
 * (rejects a row whose dedicated terminal columns were tampered with
 * relative to its own policy body) and `validatePersistedTerminalResolutionV1`
 * (methodology-version check; the degenerate single-point
 * `forecastPeriodEnds: [row.terminalPeriodEnd]` trivially satisfies the
 * horizon/representability checks, which need a real forecast grid this
 * policy-only readback path does not have).
 */
function validatePolicyReadback(row: InternalEconomicsPolicyVersionRow): void {
  const body = EconomicsPolicyBodyV1Schema.parse(row.policyBody);
  const persisted = {
    terminalPeriodEnd: row.terminalPeriodEnd,
    terminalResolutionMethodologyVersion: row.terminalResolutionMethodologyVersion,
  };
  assertPersistedTerminalResolutionMatchesPolicyV1({
    termStartDate: body.termStartDate,
    fundLifeYears: body.fundLifeYears,
    persisted,
  });
  validatePersistedTerminalResolutionV1({
    persisted,
    forecastPeriodEnds: [row.terminalPeriodEnd],
  });
}

/** Fund-scoped fetch by id (G11 readback validators run before the row is
 * served). Returns null if no row matches the (fundId, id) pair. */
export async function getPolicyVersion(
  fundId: number,
  id: number,
  database?: EconomicsPolicyDatabase
): Promise<InternalEconomicsPolicyVersionRow | null> {
  const activeDb = database ?? db;
  const [row] = await activeDb
    .select()
    .from(internalEconomicsPolicyVersions)
    .where(
      and(
        eq(internalEconomicsPolicyVersions.fundId, fundId),
        eq(internalEconomicsPolicyVersions.id, id)
      )
    )
    .limit(1);
  if (row === undefined) return null;
  validatePolicyReadback(row);
  return row;
}

/**
 * Bounded, fund-scoped history, ordered by createdAt DESC, id DESC, with a
 * keyset `{createdAt, id}` cursor (`sensitivity-run-service.ts`'s own
 * idiom). G11 readback validators run on every row before it is served.
 */
export async function listPolicyVersions(
  fundId: number,
  cursor?: PolicyVersionListCursor,
  database?: EconomicsPolicyDatabase
): Promise<InternalEconomicsPolicyVersionRow[]> {
  const activeDb = database ?? db;
  const baseWhere = eq(internalEconomicsPolicyVersions.fundId, fundId);

  let whereClause: SQL<unknown> = baseWhere;
  if (cursor) {
    const cursorDate =
      cursor.createdAt instanceof Date ? cursor.createdAt : new Date(cursor.createdAt);
    const cursorClause = or(
      lt(internalEconomicsPolicyVersions.createdAt, cursorDate),
      and(
        eq(internalEconomicsPolicyVersions.createdAt, cursorDate),
        lt(internalEconomicsPolicyVersions.id, cursor.id)
      )
    ) as SQL<unknown>;
    whereClause = and(baseWhere, cursorClause) as SQL<unknown>;
  }

  const rows = await activeDb
    .select()
    .from(internalEconomicsPolicyVersions)
    .where(whereClause)
    .orderBy(
      desc(internalEconomicsPolicyVersions.createdAt),
      desc(internalEconomicsPolicyVersions.id)
    )
    .limit(DEFAULT_POLICY_LIST_LIMIT);

  for (const row of rows) validatePolicyReadback(row);
  return rows;
}
