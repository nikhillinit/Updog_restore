import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { LEDGER_CONTRACT_VERSION } from '../../../shared/contracts/investment-ledger/financing-event.contract';
import {
  PositionValuationRequestSchema,
  PositionValuationSelectionV1Schema,
  PositionValuationV1Schema,
  type PositionValuationSelectionV1,
  type PositionValuationV1,
} from '../../../shared/contracts/investment-ledger/current-position.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { Decimal } from '../../../shared/lib/decimal-config';
import { dependencyGroupKeyForObservation } from '../../../shared/contracts/financial-observations/reconciliation-api.contract';
import { listCurrentPositions } from './current-position-service';
import { listOwnershipSnapshots } from './ownership-snapshot-service';

type LedgerDatabase = typeof db;

interface DirectMarkRow {
  id: number;
  fundId: number;
  vehicleId: number;
  companyId: number;
  markDate: string;
  asOfDate: string;
  fairValue: string;
  currency: string;
  costBasis: string | null;
  markPurpose: string;
  markSource: string;
  confidenceLevel: string;
  valuationMethod: string;
  methodologyNotes: string | null;
  status: string;
  sourceObservationId: number;
  sourceHash: string;
}

interface ObservationRow {
  id: number;
  observationHash: string;
}

interface PostMoneyEvidenceRow {
  id: number;
  version: number;
  participationId: number;
  participationVersion: number;
  postMoneyValuation: string;
  evidenceDate: string;
}

export class PositionValuationServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'PositionValuationServiceError';
    this.statusCode = status;
  }
}

export async function recordDirectPositionValuation(input: {
  fundId: number;
  actorId: number | null;
  idempotencyKey: string;
  request: unknown;
  database?: LedgerDatabase;
}): Promise<{ value: PositionValuationV1; replayed: boolean }> {
  const database = input.database ?? db;
  const request = PositionValuationRequestSchema.parse(input.request);
  const command = 'position_valuation_v1';
  const canonicalRequest = {
    contractVersion: LEDGER_CONTRACT_VERSION,
    command,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
    request,
  };
  const requestHash = canonicalSha256(canonicalRequest);
  const sourceHash = canonicalSha256({
    command,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
  });

  const result = await database.transaction(async (transaction) => {
    const existing = await selectDirectMarkBySourceHash(transaction, input.fundId, sourceHash);
    if (existing) {
      await assertDirectMarkReplay(transaction, existing, requestHash, request, sourceHash);
      return { row: existing, replayed: true };
    }

    await assertCompanyIdentityLink(transaction, {
      fundId: input.fundId,
      companyId: request.companyId,
      companyIdentityId: request.companyIdentityId,
    });
    await assertAcceptedValuationObservation(transaction, {
      fundId: input.fundId,
      companyIdentityId: request.companyIdentityId,
      sourceObservationId: request.sourceObservationId,
      effectiveDate: request.asOfDate,
    });

    const observationId = await insertDirectValuationObservation(transaction, {
      fundId: input.fundId,
      companyIdentityId: request.companyIdentityId,
      requestHash,
      sourceHash,
      effectiveDate: request.asOfDate,
      request,
    });
    const markId = readInsertedId(
      await transaction.execute(sql`
        INSERT INTO valuation_marks (
          fund_id, vehicle_id, company_id, mark_date, as_of_date, fair_value,
          currency, cost_basis, mark_purpose, source_observation_id, mark_source,
          confidence_level, valuation_method, methodology_notes, status,
          approved_by, approved_at, imported_from, source_hash, created_by
        ) VALUES (
          ${input.fundId}, ${request.vehicleId}, ${request.companyId}, ${request.asOfDate},
          ${request.asOfDate}, ${request.fairValue}, 'USD', NULL,
          'direct_position_fmv', ${observationId}, ${request.markSource},
          ${request.confidenceLevel}, ${request.valuationMethod},
          ${request.methodologyNotes ?? null}, 'approved', ${input.actorId},
          CURRENT_TIMESTAMP, 'position_valuation', ${sourceHash}, ${input.actorId}
        )
        RETURNING id
      `)
    );
    return {
      row: requireDirectMark(await selectDirectMarkById(transaction, input.fundId, markId)),
      replayed: false,
    };
  });

  return {
    value: PositionValuationV1Schema.parse({
      valuationMarkId: result.row.id,
      sourceObservationId: result.row.sourceObservationId,
      fundId: result.row.fundId,
      vehicleId: result.row.vehicleId,
      companyIdentityId: request.companyIdentityId,
      companyId: result.row.companyId,
      asOfDate: result.row.asOfDate,
      fairValue: result.row.fairValue,
      sourceHash: result.row.sourceHash,
    }),
    replayed: result.replayed,
  };
}

export async function selectPositionValuation(input: {
  fundId: number;
  vehicleId: number;
  companyIdentityId: number;
  companyId: number;
  asOfDate: string;
  knowledgeCutoff?: Date;
  database?: LedgerDatabase;
}): Promise<PositionValuationSelectionV1> {
  const database = input.database ?? db;
  const knowledgeCutoff = input.knowledgeCutoff ?? new Date();
  await assertCompanyIdentityLink(database, {
    fundId: input.fundId,
    companyId: input.companyId,
    companyIdentityId: input.companyIdentityId,
  });
  const positionList = await listCurrentPositions({
    fundId: input.fundId,
    query: {
      vehicleId: input.vehicleId,
      companyIdentityId: input.companyIdentityId,
      asOfDate: input.asOfDate,
    },
    knowledgeCutoff,
    database,
  });
  const position = positionList.positions[0] ?? null;
  const direct = await selectLatestDirectMark(database, {
    fundId: input.fundId,
    vehicleId: input.vehicleId,
    companyIdentityId: input.companyIdentityId,
    companyId: input.companyId,
    asOfDate: input.asOfDate,
    knowledgeCutoff,
  });
  if (direct) {
    return selection({
      fundId: input.fundId,
      vehicleId: input.vehicleId,
      companyIdentityId: input.companyIdentityId,
      companyId: input.companyId,
      asOfDate: input.asOfDate,
      aggregateFairValue: direct.fairValue,
      basis: 'direct',
      directMarkId: direct.id,
      directSourceObservationId: direct.sourceObservationId,
      ownershipSnapshotId: null,
      derivedTrancheId: null,
      derivedTrancheVersion: null,
      derivedParticipationId: null,
      derivedParticipationVersion: null,
      evidenceDate: direct.markDate,
      valuationAgeDays: ageDays(direct.markDate, input.asOfDate),
      pricedComponentFairValue: direct.fairValue,
      warnings: staleWarning(direct.markDate, input.asOfDate),
    });
  }

  const mixed = position?.warnings.some(
    (warning) => warning.code === 'MIXED_PRICED_AND_CONTINGENT_COMPONENTS'
  );
  const ownership = (
    await listOwnershipSnapshots({
      fundId: input.fundId,
      vehicleId: input.vehicleId,
      companyIdentityId: input.companyIdentityId,
      asOfDate: input.asOfDate,
      knowledgeCutoff,
      database,
    })
  ).snapshots[0];
  const postMoney = await selectPostMoneyEvidence(database, {
    fundId: input.fundId,
    vehicleId: input.vehicleId,
    companyIdentityId: input.companyIdentityId,
    asOfDate: input.asOfDate,
    knowledgeCutoff,
  });
  if (ownership && postMoney && ownership.effectiveDate >= postMoney.evidenceDate) {
    const derived = new Decimal(postMoney.postMoneyValuation)
      .mul(ownership.ownershipPct)
      .div(100)
      .toFixed(6);
    return selection({
      fundId: input.fundId,
      vehicleId: input.vehicleId,
      companyIdentityId: input.companyIdentityId,
      companyId: input.companyId,
      asOfDate: input.asOfDate,
      aggregateFairValue: mixed ? null : derived,
      basis: 'derived',
      directMarkId: null,
      directSourceObservationId: null,
      ownershipSnapshotId: ownership.id,
      derivedTrancheId: postMoney.id,
      derivedTrancheVersion: postMoney.version,
      derivedParticipationId: postMoney.participationId,
      derivedParticipationVersion: postMoney.participationVersion,
      evidenceDate: postMoney.evidenceDate,
      valuationAgeDays: ageDays(postMoney.evidenceDate, input.asOfDate),
      pricedComponentFairValue: mixed ? derived : null,
      warnings: mixed
        ? [
            {
              code: 'CONTINGENT_INSTRUMENT_EXCLUDED',
              message:
                'Contingent instruments are excluded from the disclosed priced-component FMV.',
            },
            {
              code: 'POSITION_VALUATION_INCOMPLETE',
              message:
                'Aggregate FMV is unavailable because the position contains unconverted contingent instruments.',
            },
          ]
        : [],
    });
  }

  return selection({
    fundId: input.fundId,
    vehicleId: input.vehicleId,
    companyIdentityId: input.companyIdentityId,
    companyId: input.companyId,
    asOfDate: input.asOfDate,
    aggregateFairValue: null,
    basis: 'unavailable',
    directMarkId: null,
    directSourceObservationId: null,
    ownershipSnapshotId: null,
    derivedTrancheId: null,
    derivedTrancheVersion: null,
    derivedParticipationId: null,
    derivedParticipationVersion: null,
    evidenceDate: null,
    valuationAgeDays: null,
    pricedComponentFairValue: null,
    warnings: [
      {
        code: 'POSITION_VALUATION_UNAVAILABLE',
        message: 'No accepted direct mark or typed post-money ownership evidence is available.',
      },
    ],
  });
}

function selection(
  input: PositionValuationSelectionV1
): PositionValuationSelectionV1 {
  return PositionValuationSelectionV1Schema.parse(input);
}

async function assertDirectMarkReplay(
  database: LedgerDatabase,
  mark: DirectMarkRow,
  requestHash: string,
  request: ReturnType<typeof PositionValuationRequestSchema.parse>,
  sourceHash: string
): Promise<void> {
  const observation = await selectObservation(database, mark.fundId, mark.sourceObservationId);
  const immutableMatches =
    observation?.observationHash === requestHash &&
    mark.sourceHash === sourceHash &&
    mark.vehicleId === request.vehicleId &&
    mark.companyId === request.companyId &&
    mark.asOfDate === request.asOfDate &&
    mark.markDate === request.asOfDate &&
    mark.fairValue === request.fairValue &&
    mark.currency === 'USD' &&
    mark.costBasis === null &&
    mark.markPurpose === 'direct_position_fmv' &&
    mark.markSource === request.markSource &&
    mark.confidenceLevel === request.confidenceLevel &&
    mark.valuationMethod === request.valuationMethod &&
    (mark.methodologyNotes ?? undefined) === request.methodologyNotes;
  if (!immutableMatches) {
    throw new PositionValuationServiceError(
      409,
      'IDEMPOTENCY_KEY_REUSE',
      'Idempotency-Key was already used for a different direct-position valuation request.'
    );
  }
}

async function assertCompanyIdentityLink(
  database: LedgerDatabase,
  input: { fundId: number; companyId: number; companyIdentityId: number }
): Promise<void> {
  const row = readRows(
    await database.execute(sql`
      SELECT id
      FROM portfolio_company_identity_links
      WHERE fund_id = ${input.fundId}
        AND portfolio_company_id = ${input.companyId}
        AND company_identity_id = ${input.companyIdentityId}
        AND active = true
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new PositionValuationServiceError(
      422,
      'POSITION_VALUATION_SCOPE_MISMATCH',
      'Direct valuation requires an exact active company identity link.'
    );
  }
}

async function assertAcceptedValuationObservation(
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
        AND domain = 'valuation'
        AND status = 'accepted'
        AND effective_date <= ${input.effectiveDate}
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new PositionValuationServiceError(
      422,
      'VALUATION_OBSERVATION_NOT_ACCEPTED',
      'Direct valuation requires an accepted same-fund valuation source observation.'
    );
  }
}

async function insertDirectValuationObservation(
  database: LedgerDatabase,
  input: {
    fundId: number;
    companyIdentityId: number;
    requestHash: string;
    sourceHash: string;
    effectiveDate: string;
    request: ReturnType<typeof PositionValuationRequestSchema.parse>;
  }
): Promise<number> {
  const observationId = readInsertedId(
    await database.execute(sql`SELECT nextval('source_observations_id_seq') AS id`)
  );
  const normalizedPayload = {
    domain: 'valuation',
    measureKey: 'fair_value',
    source: 'direct_position_valuation',
    sourceObservationId: input.request.sourceObservationId,
    vehicleId: input.request.vehicleId,
    companyId: input.request.companyId,
    fairValue: input.request.fairValue,
    currency: 'USD',
  };
  const insertedId = readInsertedId(
    await database.execute(sql`
      INSERT INTO source_observations (
        id, fund_id, company_identity_id, domain, source_type, effective_date,
        normalized_payload, observation_hash, candidate_fingerprint,
        source_locator, dependency_group_key, status
      ) VALUES (
        ${observationId}, ${input.fundId}, ${input.companyIdentityId},
        'valuation', 'manual', ${input.effectiveDate},
        ${JSON.stringify(normalizedPayload)}::jsonb, ${input.requestHash},
        ${input.sourceHash}, ${`position-valuation:${input.fundId}:${input.sourceHash}`},
        ${dependencyGroupKeyForObservation(observationId)}, 'accepted'
      )
      RETURNING id
    `)
  );
  return insertedId;
}

async function selectDirectMarkBySourceHash(
  database: LedgerDatabase,
  fundId: number,
  sourceHash: string
): Promise<DirectMarkRow | null> {
  return firstDirectMark(
    await database.execute(sql`
      SELECT *
      FROM valuation_marks
      WHERE fund_id = ${fundId}
        AND source_hash = ${sourceHash}
        AND mark_purpose = 'direct_position_fmv'
      LIMIT 1
    `)
  );
}

async function selectDirectMarkById(
  database: LedgerDatabase,
  fundId: number,
  markId: number
): Promise<DirectMarkRow | null> {
  return firstDirectMark(
    await database.execute(sql`
      SELECT *
      FROM valuation_marks
      WHERE fund_id = ${fundId}
        AND id = ${markId}
      LIMIT 1
    `)
  );
}

async function selectLatestDirectMark(
  database: LedgerDatabase,
  input: {
    fundId: number;
    vehicleId: number;
    companyIdentityId: number;
    companyId: number;
    asOfDate: string;
    knowledgeCutoff: Date;
  }
): Promise<DirectMarkRow | null> {
  return firstDirectMark(
    await database.execute(sql`
      SELECT mark.*
      FROM valuation_marks mark
      JOIN source_observations observation
        ON observation.id = mark.source_observation_id
       AND observation.fund_id = mark.fund_id
       AND observation.company_identity_id = ${input.companyIdentityId}
       AND observation.domain = 'valuation'
       AND observation.status = 'accepted'
       AND observation.effective_date <= ${input.asOfDate}
       AND observation.created_at <= ${input.knowledgeCutoff}
      WHERE mark.fund_id = ${input.fundId}
        AND mark.vehicle_id = ${input.vehicleId}
        AND mark.company_id = ${input.companyId}
        AND mark.mark_purpose = 'direct_position_fmv'
        AND mark.status IN ('approved', 'locked')
        AND mark.mark_date <= ${input.asOfDate}
        AND mark.as_of_date <= ${input.asOfDate}
        AND mark.created_at <= ${input.knowledgeCutoff}
        AND COALESCE(mark.approved_at, mark.locked_at, mark.created_at) <= ${input.knowledgeCutoff}
      ORDER BY mark.mark_date DESC, mark.id DESC
      LIMIT 1
    `)
  );
}

async function selectPostMoneyEvidence(
  database: LedgerDatabase,
  input: {
    fundId: number;
    vehicleId: number;
    companyIdentityId: number;
    asOfDate: string;
    knowledgeCutoff: Date;
  }
): Promise<PostMoneyEvidenceRow | null> {
  const row = readRows(
    await database.execute(sql`
      SELECT tranche.id, tranche.version,
             participation.id AS participation_id,
             participation.version AS participation_version,
             COALESCE(participation.post_money_valuation, tranche.post_money_valuation)
               AS post_money_valuation,
             COALESCE(participation.closing_date, tranche.closing_date) AS evidence_date
      FROM financing_tranches tranche
      JOIN financing_events event
        ON event.id = tranche.financing_event_id
       AND event.fund_id = tranche.fund_id
       AND event.company_identity_id = ${input.companyIdentityId}
      JOIN vehicle_financing_participations participation
        ON participation.financing_tranche_id = tranche.id
       AND participation.fund_id = tranche.fund_id
       AND participation.vehicle_id = ${input.vehicleId}
       AND participation.created_at <= ${input.knowledgeCutoff}
      JOIN source_observations observation
        ON observation.id = tranche.source_observation_id
       AND observation.fund_id = tranche.fund_id
       AND observation.company_identity_id = ${input.companyIdentityId}
       AND observation.domain = 'ledger_event'
       AND observation.status = 'accepted'
       AND observation.effective_date <= ${input.asOfDate}
       AND observation.created_at <= ${input.knowledgeCutoff}
      WHERE tranche.fund_id = ${input.fundId}
        AND tranche.security_type = 'equity'
        AND COALESCE(participation.post_money_valuation, tranche.post_money_valuation) IS NOT NULL
        AND COALESCE(participation.closing_date, tranche.closing_date) <= ${input.asOfDate}
        AND tranche.created_at <= ${input.knowledgeCutoff}
        AND event.created_at <= ${input.knowledgeCutoff}
        AND NOT EXISTS (
          SELECT 1
          FROM vehicle_financing_participations participation_successor
          JOIN financing_tranches participation_successor_tranche
            ON participation_successor_tranche.id =
               participation_successor.financing_tranche_id
           AND participation_successor_tranche.fund_id = participation_successor.fund_id
          WHERE participation_successor.id =
                participation.superseded_by_participation_id
            AND participation_successor.fund_id = participation.fund_id
            AND participation_successor.vehicle_id = participation.vehicle_id
            AND participation_successor.created_at <= ${input.knowledgeCutoff}
            AND COALESCE(
                  participation_successor.closing_date,
                  participation_successor_tranche.closing_date
                ) <= ${input.asOfDate}
        )
        AND NOT EXISTS (
          SELECT 1
          FROM financing_tranches tranche_successor
          WHERE tranche_successor.id = tranche.superseded_by_tranche_id
            AND tranche_successor.fund_id = tranche.fund_id
            AND tranche_successor.closing_date <= ${input.asOfDate}
            AND tranche_successor.created_at <= ${input.knowledgeCutoff}
        )
      ORDER BY COALESCE(participation.closing_date, tranche.closing_date) DESC,
               tranche.id DESC, participation.id DESC
      LIMIT 1
    `)
  )[0];
  return row
    ? {
        id: asPositiveInt(row['id']),
        version: asPositiveInt(row['version']),
        participationId: asPositiveInt(row['participation_id']),
        participationVersion: asPositiveInt(row['participation_version']),
        postMoneyValuation: asString(row['post_money_valuation']),
        evidenceDate: asDateString(row['evidence_date']),
      }
    : null;
}

async function selectObservation(
  database: LedgerDatabase,
  fundId: number,
  observationId: number
): Promise<ObservationRow | null> {
  const row = readRows(
    await database.execute(sql`
      SELECT id, observation_hash
      FROM source_observations
      WHERE id = ${observationId}
        AND fund_id = ${fundId}
      LIMIT 1
    `)
  )[0];
  return row
    ? { id: asPositiveInt(row['id']), observationHash: asString(row['observation_hash']) }
    : null;
}

function staleWarning(markDate: string, asOfDate: string): PositionValuationSelectionV1['warnings'] {
  return ageDays(markDate, asOfDate) > 120
    ? [
        {
          code: 'DIRECT_POSITION_MARK_STALE',
          message: 'Direct position valuation mark is older than 120 days and remains selected.',
        },
      ]
    : [];
}

function ageDays(evidenceDate: string, asOfDate: string): number {
  return Math.floor(
    (Date.parse(`${asOfDate}T00:00:00.000Z`) -
      Date.parse(`${evidenceDate}T00:00:00.000Z`)) /
      86_400_000
  );
}

function requireDirectMark(row: DirectMarkRow | null): DirectMarkRow {
  if (!row) {
    throw new PositionValuationServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Direct valuation mark could not be reloaded.'
    );
  }
  return row;
}

function firstDirectMark(result: unknown): DirectMarkRow | null {
  const row = readRows(result)[0];
  return row ? directMarkFromRow(row) : null;
}

function directMarkFromRow(row: Record<string, unknown>): DirectMarkRow {
  return {
    id: asPositiveInt(row['id']),
    fundId: asPositiveInt(row['fund_id'] ?? row['fundId']),
    vehicleId: asPositiveInt(row['vehicle_id'] ?? row['vehicleId']),
    companyId: asPositiveInt(row['company_id'] ?? row['companyId']),
    markDate: asDateString(row['mark_date'] ?? row['markDate']),
    asOfDate: asDateString(row['as_of_date'] ?? row['asOfDate']),
    fairValue: asString(row['fair_value'] ?? row['fairValue']),
    currency: asString(row['currency']),
    costBasis: asNullableString(row['cost_basis'] ?? row['costBasis']),
    markPurpose: asString(row['mark_purpose'] ?? row['markPurpose']),
    markSource: asString(row['mark_source'] ?? row['markSource']),
    confidenceLevel: asString(row['confidence_level'] ?? row['confidenceLevel']),
    valuationMethod: asString(row['valuation_method'] ?? row['valuationMethod']),
    methodologyNotes: asNullableString(row['methodology_notes'] ?? row['methodologyNotes']),
    status: asString(row['status']),
    sourceObservationId: asPositiveInt(row['source_observation_id'] ?? row['sourceObservationId']),
    sourceHash: asString(row['source_hash'] ?? row['sourceHash']),
  };
}

function readRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  }
  return [];
}

function readInsertedId(result: unknown): number {
  const row = readRows(result)[0];
  return asPositiveInt(row?.['id']);
}

function asPositiveInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new PositionValuationServiceError(500, 'LEDGER_READ_FAILED', 'Database returned invalid id.');
  }
  return parsed;
}

function asString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new PositionValuationServiceError(
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
