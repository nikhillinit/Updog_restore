import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { dependencyGroupKeyForObservation } from '../../../shared/contracts/financial-observations/reconciliation-api.contract';
import {
  LegacyPositionBackfillRequestSchema,
  LegacyPositionBackfillResultSchema,
  type LegacyPositionBackfillBlockerCode,
  type LegacyPositionBackfillCandidate,
  type LegacyPositionBackfillRequest,
  type LegacyPositionBackfillResult,
  type LegacyPositionBackfillWarningCode,
} from '../../../shared/contracts/investment-ledger/legacy-position-backfill.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { Decimal } from '../../../shared/lib/decimal-config';

type LedgerDatabase = typeof db;
type QueryResult = Awaited<ReturnType<LedgerDatabase['execute']>>;

export class LegacyPositionBackfillServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: LegacyPositionBackfillBlockerCode | 'BACKFILL_BLOCKED',
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'LegacyPositionBackfillServiceError';
    this.statusCode = status;
  }
}

export interface BackfillLegacyPositionEventsInput {
  request: unknown;
  actorId: number | null;
  database?: LedgerDatabase;
}

interface MainVehicleRow {
  fundId: number;
  vehicleId: number;
  vehicleSlug: string;
  vehicleType: string;
}

interface LegacyInvestmentRow {
  investmentId: number;
  fundId: number;
  companyId: number;
  companyFundId: number | null;
  investmentDate: Date | string;
  amount: string;
  sharePriceCents: bigint | null;
  sharesAcquired: string | null;
  costBasisCents: bigint | null;
  vehicleParticipationId: number | null;
  companyIdentityId: number | null;
  activeIdentityLinks: number;
  participationFundId: number | null;
  participationVehicleId: number | null;
  participationCompanyIdentityId: number | null;
  participationVersion: number | null;
  supersededByParticipationId: number | null;
  participationCurrency: string | null;
  existingEventId: number | null;
  existingRequestHash: string | null;
}

interface PlannedCandidate extends LegacyPositionBackfillCandidate {
  requestHash: string | null;
  observationPayload: Record<string, unknown> | null;
}

const BACKFILL_COMMAND = 'legacy_position_backfill_v1';
const DETERMINISTIC_MAIN_SLUG = 'legacy-main-fund';

export async function backfillLegacyPositionEvents(
  input: BackfillLegacyPositionEventsInput
): Promise<LegacyPositionBackfillResult> {
  const database = input.database ?? db;
  const request = LegacyPositionBackfillRequestSchema.parse(input.request);
  const targetFundIds = request.fundIds;

  const preflight = await preflightMainVehicles(database, targetFundIds);
  const rows = await loadLegacyInvestments(database, targetFundIds);
  const mainVehicles = mapMainVehicles(preflight.mainVehicles);
  const slugConflicts = new Set(preflight.slugConflicts.map((row) => row.fundId));
  const multiMainFunds = new Set(preflight.multiMainFunds);

  const planned = rows.map((row) =>
    planCandidate(row, {
      mainVehicle: mainVehicles.get(row.fundId) ?? null,
      hasMainSlugConflict: slugConflicts.has(row.fundId),
      hasMultiMain: multiMainFunds.has(row.fundId),
    })
  );

  if (request.mode === 'dry_run') {
    return LegacyPositionBackfillResultSchema.parse(summarize('dry_run', planned, 0));
  }

  const globallyBlocked = planned.filter((candidate) => candidate.blockers.length > 0);
  if (globallyBlocked.length > 0) {
    return LegacyPositionBackfillResultSchema.parse(summarize('apply', planned, 0));
  }

  const candidatesByFund = groupByFund(planned.filter((candidate) => candidate.status === 'planned'));
  const writtenCandidates: PlannedCandidate[] = [];
  let createdMainVehicles = 0;

  for (const [fundId, fundCandidates] of candidatesByFund) {
    await database.transaction(async (transaction) => {
      await lockGlobalBackfill(transaction);
      await lockFundIdentity(transaction, fundId);
      let mainVehicle = mainVehicles.get(fundId) ?? null;
      if (!mainVehicle) {
        mainVehicle = await ensureDeterministicMainVehicle(transaction, fundId);
        mainVehicles.set(fundId, mainVehicle);
        createdMainVehicles += 1;
      }

      for (const candidate of fundCandidates) {
        const expectedHash = request.expectedSourceHashes?.[String(candidate.investmentId)];
        if (!candidate.sourcePlanHash || expectedHash === undefined) {
          throw backfillBlocked('SOURCE_PLAN_HASH_REQUIRED', candidate);
        }
        if (expectedHash !== candidate.sourcePlanHash) {
          throw backfillBlocked('SOURCE_PLAN_HASH_CHANGED', candidate, { expectedHash });
        }
        const eventId = await insertBackfillEvent(transaction, {
          ...candidate,
          vehicleId: candidate.vehicleId ?? mainVehicle.vehicleId,
          actorId: input.actorId,
        });
        candidate.eventId = eventId;
        candidate.status = 'written';
        if (candidate.vehicleId === null) {
          candidate.vehicleId = mainVehicle.vehicleId;
          candidate.warnings = uniqueWarnings([
            ...candidate.warnings.filter((warning) => warning !== 'MAIN_VEHICLE_WOULD_BE_CREATED'),
            'MAIN_VEHICLE_CREATED',
          ]);
        }
        writtenCandidates.push(candidate);
      }
    });
  }

  const byInvestment = new Map(planned.map((candidate) => [candidate.investmentId, candidate]));
  for (const written of writtenCandidates) {
    byInvestment.set(written.investmentId, written);
  }
  return LegacyPositionBackfillResultSchema.parse(
    summarize(request.mode, [...byInvestment.values()], createdMainVehicles)
  );
}

async function preflightMainVehicles(database: LedgerDatabase, fundIds?: number[]) {
  const filter = fundIds && fundIds.length > 0 ? sql`WHERE fund_id = ANY(${fundIds})` : sql``;
  const result = await database.execute(sql`
    WITH scoped AS (
      SELECT id, fund_id, vehicle_slug, vehicle_type
      FROM vehicles
      ${filter}
    )
    SELECT id, fund_id, vehicle_slug, vehicle_type, COUNT(*) FILTER (
      WHERE vehicle_type = 'main_fund'
    ) OVER (PARTITION BY fund_id) AS main_count
    FROM scoped
    WHERE vehicle_type = 'main_fund'
       OR vehicle_slug = ${DETERMINISTIC_MAIN_SLUG}
    ORDER BY fund_id, id
  `);
  const rows = rowsOf(result);
  const multiMainFunds = [
    ...new Set(
      rows
        .filter((row) => Number(row['main_count']) > 1)
        .map((row) => asPositiveInt(row['fund_id']))
    ),
  ];
  return {
    multiMainFunds,
    mainVehicles: rows
      .filter((row) => row['vehicle_type'] === 'main_fund')
      .map((row) => ({
        fundId: asPositiveInt(row['fund_id']),
        vehicleId: asPositiveInt(row['id']),
        vehicleSlug: asString(row['vehicle_slug']),
        vehicleType: asString(row['vehicle_type']),
      })),
    slugConflicts: rows
      .filter(
        (row) =>
          row['vehicle_slug'] === DETERMINISTIC_MAIN_SLUG && row['vehicle_type'] !== 'main_fund'
      )
      .map((row) => ({
        fundId: asPositiveInt(row['fund_id']),
        vehicleId: asPositiveInt(row['id']),
      })),
  };
}

async function loadLegacyInvestments(
  database: LedgerDatabase,
  fundIds?: number[]
): Promise<LegacyInvestmentRow[]> {
  const fundFilter = fundIds && fundIds.length > 0 ? sql`AND i.fund_id = ANY(${fundIds})` : sql``;
  const result = await database.execute(sql`
    SELECT i.id AS investment_id, i.fund_id, i.company_id, pc.fund_id AS company_fund_id,
           i.investment_date, i.amount::text, i.share_price_cents, i.shares_acquired::text,
           i.cost_basis_cents, i.vehicle_participation_id, identity_scope.company_identity_id,
           identity_scope.active_identity_links, vfp.fund_id AS participation_fund_id,
           vfp.vehicle_id AS participation_vehicle_id,
           fe.company_identity_id AS participation_company_identity_id,
           vfp.version AS participation_version,
           vfp.superseded_by_participation_id,
           vfp.currency AS participation_currency,
           pe.id AS existing_event_id, pe.request_hash AS existing_request_hash
    FROM investments i
    LEFT JOIN portfoliocompanies pc ON pc.id = i.company_id
    LEFT JOIN LATERAL (
      SELECT MIN(link.company_identity_id) AS company_identity_id, COUNT(*)::int AS active_identity_links
      FROM portfolio_company_identity_links link
      WHERE link.fund_id = i.fund_id
        AND link.portfolio_company_id = i.company_id
        AND link.active = true
    ) identity_scope ON true
    LEFT JOIN vehicle_financing_participations vfp
      ON vfp.id = i.vehicle_participation_id
    LEFT JOIN financing_events fe
      ON fe.id = vfp.financing_event_id
     AND fe.fund_id = vfp.fund_id
    LEFT JOIN position_events pe
      ON pe.backfilled_from_investment_id = i.id
    WHERE i.fund_id IS NOT NULL
      ${fundFilter}
    ORDER BY i.fund_id, i.id
  `);
  return rowsOf(result).map((row) => ({
    investmentId: asPositiveInt(row['investment_id']),
    fundId: asPositiveInt(row['fund_id']),
    companyId: asPositiveInt(row['company_id']),
    companyFundId: nullablePositiveInt(row['company_fund_id']),
    investmentDate: row['investment_date'] as Date | string,
    amount: asString(row['amount']),
    sharePriceCents: nullableBigInt(row['share_price_cents']),
    sharesAcquired: nullableString(row['shares_acquired']),
    costBasisCents: nullableBigInt(row['cost_basis_cents']),
    vehicleParticipationId: nullablePositiveInt(row['vehicle_participation_id']),
    companyIdentityId: nullablePositiveInt(row['company_identity_id']),
    activeIdentityLinks: Number(row['active_identity_links'] ?? 0),
    participationFundId: nullablePositiveInt(row['participation_fund_id']),
    participationVehicleId: nullablePositiveInt(row['participation_vehicle_id']),
    participationCompanyIdentityId: nullablePositiveInt(row['participation_company_identity_id']),
    participationVersion: nullablePositiveInt(row['participation_version']),
    supersededByParticipationId: nullablePositiveInt(row['superseded_by_participation_id']),
    participationCurrency: nullableString(row['participation_currency']),
    existingEventId: nullablePositiveInt(row['existing_event_id']),
    existingRequestHash: nullableString(row['existing_request_hash']),
  }));
}

function planCandidate(
  row: LegacyInvestmentRow,
  context: {
    mainVehicle: MainVehicleRow | null;
    hasMainSlugConflict: boolean;
    hasMultiMain: boolean;
  }
): PlannedCandidate {
  const blockers: LegacyPositionBackfillBlockerCode[] = [];
  const warnings: LegacyPositionBackfillWarningCode[] = [];

  if (context.hasMultiMain) blockers.push('MULTI_MAIN_FUND_VEHICLE');
  if (context.hasMainSlugConflict) blockers.push('MAIN_VEHICLE_SLUG_CONFLICT');
  if (row.companyFundId !== row.fundId) blockers.push('INVESTMENT_FUND_MISMATCH');
  if (row.activeIdentityLinks === 0 || row.companyIdentityId === null) {
    blockers.push('IDENTITY_LINK_MISSING');
  } else if (row.activeIdentityLinks > 1) {
    blockers.push('IDENTITY_LINK_AMBIGUOUS');
  }

  const vehicleId =
    row.vehicleParticipationId === null ? context.mainVehicle?.vehicleId ?? null : row.participationVehicleId;
  if (row.vehicleParticipationId !== null) {
    if (row.participationFundId === null) blockers.push('PARTICIPATION_NOT_FOUND');
    if (row.supersededByParticipationId !== null) blockers.push('PARTICIPATION_SUPERSEDED');
    if (
      row.participationFundId !== null &&
      (row.participationFundId !== row.fundId ||
        row.participationCompanyIdentityId !== row.companyIdentityId)
    ) {
      blockers.push('PARTICIPATION_SCOPE_MISMATCH');
    }
    if (row.participationCurrency !== null && row.participationCurrency !== 'USD') {
      blockers.push('NON_USD_VALUE_UNSUPPORTED');
    }
  } else if (context.mainVehicle === null && !context.hasMainSlugConflict && !context.hasMultiMain) {
    warnings.push('MAIN_VEHICLE_WOULD_BE_CREATED');
  }

  const costBasis = canonicalCostBasis(row);
  if (costBasis.status === 'missing') blockers.push('COST_BASIS_MISSING');
  if (costBasis.status === 'mismatch') blockers.push('COST_BASIS_MISMATCH');
  const sharesDelta = canonicalShares(row.sharesAcquired);
  if (new Decimal(sharesDelta).eq(0)) warnings.push('ZERO_SHARE_LEGACY_POSITION');

  const effectiveDate = isoDate(row.investmentDate);
  const sourcePlan =
    blockers.length === 0 && row.companyIdentityId !== null && costBasis.value !== null
      ? {
          command: BACKFILL_COMMAND,
          investmentId: row.investmentId,
          fundId: row.fundId,
          vehicleId,
          companyIdentityId: row.companyIdentityId,
          vehicleParticipationId: row.vehicleParticipationId,
          participationVersion: row.participationVersion,
          effectiveDate,
          sharesDelta,
          costBasisDelta: costBasis.value,
          proceeds: '0.000000',
          source: {
            amount: row.amount,
            costBasisCents: row.costBasisCents?.toString() ?? null,
            sharePriceCents: row.sharePriceCents?.toString() ?? null,
            sharesAcquired: row.sharesAcquired,
          },
        }
      : null;
  const sourcePlanHash = sourcePlan ? canonicalSha256(sourcePlan) : null;
  const requestHash = sourcePlanHash
    ? canonicalSha256({ contractVersion: '1.0.0', command: BACKFILL_COMMAND, sourcePlanHash })
    : null;

  if (row.existingEventId !== null) {
    if (row.existingRequestHash === requestHash) {
      warnings.push('EXISTING_BACKFILL_REPLAYED');
      return {
        investmentId: row.investmentId,
        fundId: row.fundId,
        vehicleId,
        companyIdentityId: row.companyIdentityId,
        vehicleParticipationId: row.vehicleParticipationId,
        effectiveDate,
        sharesDelta,
        costBasisDelta: costBasis.value,
        sourcePlanHash,
        requestHash,
        observationPayload: sourcePlan,
        eventId: row.existingEventId,
        status: 'skipped',
        blockers: [],
        warnings: uniqueWarnings(warnings),
      };
    }
    blockers.push('EXISTING_BACKFILL_MISMATCH');
  }

  return {
    investmentId: row.investmentId,
    fundId: row.fundId,
    vehicleId,
    companyIdentityId: row.companyIdentityId,
    vehicleParticipationId: row.vehicleParticipationId,
    effectiveDate,
    sharesDelta: costBasis.value === null ? null : sharesDelta,
    costBasisDelta: costBasis.value,
    sourcePlanHash,
    requestHash,
    observationPayload: sourcePlan,
    eventId: row.existingEventId,
    status: blockers.length === 0 ? 'planned' : 'blocked',
    blockers: uniqueBlockers(blockers),
    warnings: uniqueWarnings(warnings),
  };
}

async function insertBackfillEvent(
  database: LedgerDatabase,
  candidate: PlannedCandidate & { vehicleId: number; actorId: number | null }
): Promise<number> {
  if (
    candidate.companyIdentityId === null ||
    candidate.sharesDelta === null ||
    candidate.costBasisDelta === null ||
    candidate.requestHash === null ||
    candidate.sourcePlanHash === null ||
    candidate.observationPayload === null
  ) {
    throw backfillBlocked('SOURCE_PLAN_HASH_REQUIRED', candidate);
  }
  const existing = first(rowsOf(await database.execute(sql`
    SELECT id, request_hash
    FROM position_events
    WHERE fund_id = ${candidate.fundId}
      AND backfilled_from_investment_id = ${candidate.investmentId}
    FOR UPDATE
  `)));
  if (existing) {
    if (existing['request_hash'] !== candidate.requestHash) {
      throw backfillBlocked('EXISTING_BACKFILL_MISMATCH', candidate);
    }
    return asPositiveInt(existing['id']);
  }

  const observationId = await insertBackfillObservation(database, candidate);
  const inserted = first(rowsOf(await database.execute(sql`
    INSERT INTO position_events (
      fund_id, vehicle_id, company_identity_id, event_type, effective_date,
      shares_delta, cost_basis_delta, proceeds, replaces_event_id,
      reverses_position_event_id, vehicle_participation_id, resulting_participation_id,
      source_participation_version, resulting_participation_version, source_tranche_version,
      resulting_tranche_version, source_observation_id, backfilled_from_investment_id,
      created_by, idempotency_key, request_hash
    ) VALUES (
      ${candidate.fundId}, ${candidate.vehicleId}, ${candidate.companyIdentityId}, 'acquisition',
      ${candidate.effectiveDate}, ${candidate.sharesDelta}, ${candidate.costBasisDelta},
      '0.000000', NULL, NULL, ${candidate.vehicleParticipationId}, NULL, NULL, NULL, NULL, NULL,
      ${observationId}, ${candidate.investmentId}, ${candidate.actorId},
      ${`pos:legacy-backfill:v1:inv:${candidate.investmentId}`}, ${candidate.requestHash}
    )
    ON CONFLICT (backfilled_from_investment_id) DO NOTHING
    RETURNING id
  `)));
  if (!inserted) {
    const replay = first(rowsOf(await database.execute(sql`
      SELECT id, request_hash
      FROM position_events
      WHERE fund_id = ${candidate.fundId}
        AND backfilled_from_investment_id = ${candidate.investmentId}
    `)));
    if (replay && replay['request_hash'] === candidate.requestHash) {
      return asPositiveInt(replay['id']);
    }
    throw backfillBlocked('EXISTING_BACKFILL_MISMATCH', candidate);
  }
  return asPositiveInt(inserted['id']);
}

async function insertBackfillObservation(
  database: LedgerDatabase,
  candidate: PlannedCandidate & { vehicleId: number }
): Promise<number> {
  if (
    candidate.companyIdentityId === null ||
    candidate.sourcePlanHash === null ||
    candidate.observationPayload === null
  ) {
    throw backfillBlocked('SOURCE_PLAN_HASH_REQUIRED', candidate);
  }
  const existing = first(rowsOf(await database.execute(sql`
    SELECT id
    FROM source_observations
    WHERE fund_id = ${candidate.fundId}
      AND observation_hash = ${candidate.sourcePlanHash}
      AND status = 'accepted'
    LIMIT 1
  `)));
  if (existing) return asPositiveInt(existing['id']);

  const observationId = asPositiveInt(
    first(rowsOf(await database.execute(sql`SELECT nextval('source_observations_id_seq') AS id`)))?.[
      'id'
    ]
  );
  const normalizedPayload = {
    source: BACKFILL_COMMAND,
    ...candidate.observationPayload,
    warnings: candidate.warnings,
  };
  await database.execute(sql`
    INSERT INTO source_observations (
      id, fund_id, company_identity_id, domain, source_type, effective_date,
      normalized_payload, observation_hash, candidate_fingerprint, source_locator,
      dependency_group_key, status
    ) VALUES (
      ${observationId}, ${candidate.fundId}, ${candidate.companyIdentityId}, 'ledger_event',
      'manual', ${candidate.effectiveDate}, ${JSON.stringify(normalizedPayload)}::jsonb,
      ${candidate.sourcePlanHash}, ${canonicalSha256({
        fundId: candidate.fundId,
        investmentId: candidate.investmentId,
        companyIdentityId: candidate.companyIdentityId,
      })}, ${`legacy-investment:${candidate.investmentId}`},
      ${dependencyGroupKeyForObservation(observationId)}, 'accepted'
    )
  `);
  return observationId;
}

async function ensureDeterministicMainVehicle(
  database: LedgerDatabase,
  fundId: number
): Promise<MainVehicleRow> {
  const existing = first(rowsOf(await database.execute(sql`
    SELECT id, fund_id, vehicle_slug, vehicle_type
    FROM vehicles
    WHERE fund_id = ${fundId}
      AND vehicle_slug = ${DETERMINISTIC_MAIN_SLUG}
    FOR UPDATE
  `)));
  if (existing) {
    if (existing['vehicle_type'] !== 'main_fund') {
      throw new LegacyPositionBackfillServiceError(
        409,
        'MAIN_VEHICLE_SLUG_CONFLICT',
        'The deterministic legacy main-fund vehicle slug is already occupied.',
        { fundId, vehicleSlug: DETERMINISTIC_MAIN_SLUG }
      );
    }
    return {
      fundId,
      vehicleId: asPositiveInt(existing['id']),
      vehicleSlug: asString(existing['vehicle_slug']),
      vehicleType: asString(existing['vehicle_type']),
    };
  }
  const inserted = first(rowsOf(await database.execute(sql`
    INSERT INTO vehicles (
      fund_id, vehicle_slug, vehicle_type, name, description, currency, status
    ) VALUES (
      ${fundId}, ${DETERMINISTIC_MAIN_SLUG}, 'main_fund', 'Legacy Main Fund',
      'Deterministic main-fund vehicle for Task 11 legacy position backfill.',
      'USD', 'active'
    )
    RETURNING id, fund_id, vehicle_slug, vehicle_type
  `)));
  if (!inserted) {
    throw new LegacyPositionBackfillServiceError(
      500,
      'BACKFILL_BLOCKED',
      'Legacy main-fund vehicle insert did not return a row.',
      { fundId }
    );
  }
  return {
    fundId,
    vehicleId: asPositiveInt(inserted['id']),
    vehicleSlug: asString(inserted['vehicle_slug']),
    vehicleType: asString(inserted['vehicle_type']),
  };
}

function canonicalCostBasis(row: LegacyInvestmentRow):
  | { status: 'ok'; value: string }
  | { status: 'missing' | 'mismatch'; value: null } {
  if (!row.amount && row.costBasisCents === null) return { status: 'missing', value: null };
  const amount = new Decimal(row.amount);
  if (row.costBasisCents === null) return { status: 'ok', value: amount.toFixed(6) };
  const fromCents = new Decimal(row.costBasisCents.toString()).div(100);
  if (!fromCents.eq(amount)) return { status: 'mismatch', value: null };
  return { status: 'ok', value: fromCents.toFixed(6) };
}

function canonicalShares(value: string | null): string {
  if (value === null) return '0.000000';
  return new Decimal(value).toFixed(6);
}

function summarize(
  mode: LegacyPositionBackfillRequest['mode'],
  candidates: PlannedCandidate[],
  createdMainVehicles: number
): LegacyPositionBackfillResult {
  return {
    mode,
    fundsScanned: new Set(candidates.map((candidate) => candidate.fundId)).size,
    investmentsScanned: candidates.length,
    planned: candidates.filter((candidate) => candidate.status === 'planned').length,
    written: candidates.filter((candidate) => candidate.status === 'written').length,
    skipped: candidates.filter((candidate) => candidate.status === 'skipped').length,
    blocked: candidates.filter((candidate) => candidate.status === 'blocked').length,
    createdMainVehicles,
    candidates: candidates.map((candidate) => ({
      investmentId: candidate.investmentId,
      fundId: candidate.fundId,
      vehicleId: candidate.vehicleId,
      companyIdentityId: candidate.companyIdentityId,
      vehicleParticipationId: candidate.vehicleParticipationId,
      effectiveDate: candidate.effectiveDate,
      sharesDelta: candidate.sharesDelta,
      costBasisDelta: candidate.costBasisDelta,
      sourcePlanHash: candidate.sourcePlanHash,
      eventId: candidate.eventId,
      status: candidate.status,
      blockers: candidate.blockers,
      warnings: candidate.warnings,
    })),
  };
}

function mapMainVehicles(rows: MainVehicleRow[]): Map<number, MainVehicleRow> {
  const vehicles = new Map<number, MainVehicleRow>();
  for (const row of rows) {
    if (!vehicles.has(row.fundId)) vehicles.set(row.fundId, row);
  }
  return vehicles;
}

function groupByFund(candidates: PlannedCandidate[]): Map<number, PlannedCandidate[]> {
  const grouped = new Map<number, PlannedCandidate[]>();
  for (const candidate of candidates) {
    const entries = grouped.get(candidate.fundId) ?? [];
    entries.push(candidate);
    grouped.set(candidate.fundId, entries);
  }
  return grouped;
}

async function lockGlobalBackfill(database: LedgerDatabase): Promise<void> {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext('legacy-position-backfill:v1'))`);
}

async function lockFundIdentity(database: LedgerDatabase, fundId: number): Promise<void> {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`fund-identity:${fundId}`}))`);
}

function backfillBlocked(
  code: LegacyPositionBackfillBlockerCode,
  candidate: Pick<LegacyPositionBackfillCandidate, 'fundId' | 'investmentId'>,
  details?: Readonly<Record<string, unknown>>
): LegacyPositionBackfillServiceError {
  return new LegacyPositionBackfillServiceError(
    409,
    code,
    `Legacy position backfill blocked for investment ${candidate.investmentId}.`,
    { fundId: candidate.fundId, investmentId: candidate.investmentId, ...details }
  );
}

function uniqueBlockers(
  blockers: LegacyPositionBackfillBlockerCode[]
): LegacyPositionBackfillBlockerCode[] {
  return [...new Set(blockers)];
}

function uniqueWarnings(
  warnings: LegacyPositionBackfillWarningCode[]
): LegacyPositionBackfillWarningCode[] {
  return [...new Set(warnings)];
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function rowsOf(result: QueryResult): Array<Record<string, unknown>> {
  const maybeRows = (result as { rows?: unknown }).rows;
  return Array.isArray(maybeRows) ? (maybeRows as Array<Record<string, unknown>>) : [];
}

function first<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function asPositiveInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer, got ${String(value)}`);
  }
  return parsed;
}

function nullablePositiveInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return asPositiveInt(value);
}

function asString(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  throw new Error(`Expected string-like value, got ${String(value)}`);
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function nullableBigInt(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'bigint' ? value : BigInt(asString(value));
}
