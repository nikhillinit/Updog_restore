import { sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import { parseETag, rowVersionETag } from '../../lib/http-preconditions';
import { runIdempotentCommand } from '../../lib/idempotent-command';
import { dependencyGroupKeyForObservation } from '../../../shared/contracts/financial-observations/reconciliation-api.contract';
import {
  LEDGER_CONTRACT_VERSION,
  USD_FX_RATE_TO_USD,
} from '../../../shared/contracts/investment-ledger/financing-event.contract';
import {
  CorrectPositionRequestSchema,
  PositionCorrectionV1Schema,
  PositionEventV1Schema,
  RecordPositionEventRequestSchema,
  type CorrectPositionRequest,
  type PositionCorrectionV1,
  type PositionEventErrorCode,
  type PositionEventV1,
  type RecordPositionEventRequest,
} from '../../../shared/contracts/investment-ledger/position.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { Decimal } from '../../../shared/lib/decimal-config';
import { normalizeManualObservation } from '../financial-observations/manual-entry-adapter';
import { resolveIdentityHead } from '../financial-observations/identity-resolution-service';
import { invalidateH9Artifacts } from '../h9-artifact-invalidation-service';

type LedgerDatabase = typeof db;

interface PositionCommandContext {
  fundId: number;
  actorId: number | null;
  idempotencyKey: string;
  database?: LedgerDatabase;
}

export interface RecordPositionEventInput extends PositionCommandContext {
  request: unknown;
}

export interface CorrectPositionInput extends PositionCommandContext {
  ifMatch: string;
  request: unknown;
}

export interface LedgerCommandResult<T> {
  value: T;
  replayed: boolean;
}

export class PositionLedgerServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: PositionEventErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'PositionLedgerServiceError';
    this.statusCode = status;
  }
}

interface PositionEventRow {
  id: number;
  fundId: number;
  vehicleId: number;
  companyIdentityId: number;
  eventType: PositionEventV1['eventType'];
  effectiveDate: string;
  recordedAt: Date;
  sharesDelta: string;
  costBasisDelta: string;
  proceeds: string;
  replacesEventId: number | null;
  reversesPositionEventId: number | null;
  vehicleParticipationId: number | null;
  resultingParticipationId: number | null;
  sourceParticipationVersion: number | null;
  resultingParticipationVersion: number | null;
  sourceTrancheVersion: number | null;
  resultingTrancheVersion: number | null;
  sourceObservationId: number | null;
  backfilledFromInvestmentId: number | null;
  createdBy: number | null;
  idempotencyKey: string | null;
  requestHash: string | null;
}

interface LockedPositionEventRow extends PositionEventRow {
  xmin: string;
}

interface LockedLot {
  id: string;
  investmentId: number;
  sharesAcquired: string;
  costBasisCents: bigint;
  activeRelievedShares: string;
  activeRelievedCostBasis: string;
}

interface PositionLotReference {
  investmentId: number;
  investmentLotId: string;
}

interface CanonicalPositionEconomics {
  sharesDelta: string;
  costBasisDelta: string;
  proceeds: string;
  lotReliefs: Array<{
    investmentId: number;
    investmentLotId: string;
    relievedShares: string;
    relievedCostBasis: string;
    allocatedProceeds: string;
  }>;
}

interface PositionCorrectionReceiptRow {
  reversal: PositionEventRow;
  replacement: PositionEventRow;
  reconciliationCaseId: number;
}

interface CorrectionPositionEventContext {
  fundId: number;
  oldParticipation: { id: number };
  successor: { id: number; createdBy: number | null };
  newProjection: {
    investmentAmount: string;
    lot: { sharesAcquired: string } | null;
  };
  change: { moneyRowsChanged: boolean };
  observationId: number;
  requestHash: string;
}

export async function recordPositionEvent(
  input: RecordPositionEventInput
): Promise<LedgerCommandResult<PositionEventV1>> {
  const database = input.database ?? db;
  const request = RecordPositionEventRequestSchema.parse(input.request);
  await assertLedgerOwnership(database, input.fundId, request.vehicleId);
  assertUsdOnly(request);

  const commandRequest = {
    fundId: input.fundId,
    contractVersion: LEDGER_CONTRACT_VERSION,
    ...request,
  };
  const result = await database.transaction(async (transaction) => {
    await lockFundIdentity(transaction, input.fundId);
    await assertCurrentIdentityHead(transaction, input.fundId, request.companyIdentityId);
    const companyName = await loadIdentityName(
      transaction,
      input.fundId,
      request.companyIdentityId
    );
    const lockedLots =
      request.lotReliefs === undefined
        ? []
        : await lockLotFamily(transaction, input.fundId, request.lotReliefs);

    return runIdempotentCommand<PositionEventRow>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      contractVersion: LEDGER_CONTRACT_VERSION,
      request: commandRequest,
      loadExisting: async () => {
        const existing = await selectPositionEventByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        return existing ? { row: existing, requestHash: requiredRequestHash(existing) } : null;
      },
      insert: async (requestHash) => {
        const existing = await selectPositionEventByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        if (existing) return null;

        const economics = validateAndCanonicalizeEconomics(request, lockedLots);
        const observationId = await insertManualObservation(transaction, {
          fundId: input.fundId,
          companyIdentityId: request.companyIdentityId,
          companyName,
          idempotencyKey: input.idempotencyKey,
          request,
          economics,
        });
        const insertedId = readInsertedIdOrNull(
          await transaction.execute(sql`
            INSERT INTO position_events (
              fund_id, vehicle_id, company_identity_id, event_type, effective_date,
              shares_delta, cost_basis_delta, proceeds, replaces_event_id,
              reverses_position_event_id, vehicle_participation_id,
              resulting_participation_id, source_participation_version,
              resulting_participation_version, source_tranche_version,
              resulting_tranche_version, source_observation_id,
              backfilled_from_investment_id, created_by, idempotency_key, request_hash
            ) VALUES (
              ${input.fundId}, ${request.vehicleId}, ${request.companyIdentityId},
              ${request.eventType}, ${request.effectiveDate}, ${economics.sharesDelta},
              ${economics.costBasisDelta}, ${economics.proceeds}, NULL, NULL, NULL,
              NULL, NULL, NULL, NULL, NULL, ${observationId}, NULL, ${input.actorId},
              ${input.idempotencyKey}, ${requestHash}
            )
            ON CONFLICT DO NOTHING
            RETURNING id
          `)
        );
        if (insertedId === null) return null;
        for (const relief of economics.lotReliefs) {
          await transaction.execute(sql`
            INSERT INTO position_event_lot_reliefs (
              fund_id, position_event_id, investment_id, investment_lot_id,
              relieved_shares, relieved_cost_basis, allocated_proceeds
            ) VALUES (
              ${input.fundId}, ${insertedId}, ${relief.investmentId},
              ${relief.investmentLotId}, ${relief.relievedShares},
              ${relief.relievedCostBasis}, ${relief.allocatedProceeds}
            )
          `);
        }
        return requirePositionEvent(
          await selectPositionEventById(transaction, input.fundId, insertedId)
        );
      },
    });
  });

  if (!result.replayed) {
    await invalidateH9Artifacts(input.fundId);
  }

  return {
    value: positionEventDto(result.row),
    replayed: result.replayed,
  };
}

export async function correctPosition(
  input: CorrectPositionInput
): Promise<LedgerCommandResult<PositionCorrectionV1>> {
  const database = input.database ?? db;
  const request = CorrectPositionRequestSchema.parse(input.request);
  assertUsdOnly(request);
  const normalizedIfMatch = parseETag(input.ifMatch);
  const commandRequest = {
    fundId: input.fundId,
    contractVersion: LEDGER_CONTRACT_VERSION,
    ifMatch: normalizedIfMatch,
    ...request,
  };

  const result = await database.transaction(async (transaction) => {
    await lockFundIdentity(transaction, input.fundId);
    const target = await selectPositionEventForUpdate(
      transaction,
      input.fundId,
      request.positionEventId
    );
    if (!target) {
      throw new PositionLedgerServiceError(
        404,
        'POSITION_EVENT_NOT_FOUND',
        'The position event to correct was not found in this fund.'
      );
    }
    const currentEtag = rowVersionETag(target.xmin);
    if (normalizedIfMatch !== parseETag(currentEtag)) {
      throw new PositionLedgerServiceError(
        412,
        'precondition_failed',
        'The position event has been modified.',
        { current: currentEtag }
      );
    }
    assertCorrectablePositionEvent(target);
    const existingReversal = await selectPositionEventReversal(
      transaction,
      input.fundId,
      target.id,
      true
    );

    const commandResult = await runIdempotentCommand<PositionEventRow>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      contractVersion: LEDGER_CONTRACT_VERSION,
      request: commandRequest,
      loadExisting: async () => {
        const existing = await selectPositionEventByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        return existing ? { row: existing, requestHash: requiredRequestHash(existing) } : null;
      },
      insert: async (requestHash) => {
        const existing = await selectPositionEventByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        if (existing) return null;
        if (existingReversal) {
          throw new PositionLedgerServiceError(
            409,
            'POSITION_EVENT_ALREADY_CORRECTED',
            'The target position event already has a reversal.'
          );
        }

        await assertCurrentIdentityHead(transaction, input.fundId, target.companyIdentityId);
        const companyName = await loadIdentityName(
          transaction,
          input.fundId,
          target.companyIdentityId
        );
        const replacementRequest = correctionReplacementRequest(target, request);
        const targetReliefs = await selectPositionEventLotReferences(
          transaction,
          input.fundId,
          target.id
        );
        const replacementReliefs = replacementRequest.lotReliefs ?? [];
        const lotReferences = uniqueLotReferences([...targetReliefs, ...replacementReliefs]);
        const lockedLots =
          lotReferences.length === 0
            ? []
            : await lockLotFamily(transaction, input.fundId, lotReferences, target.id);
        const economics = validateAndCanonicalizeEconomics(replacementRequest, lockedLots);
        const observationId = await insertManualObservation(transaction, {
          fundId: input.fundId,
          companyIdentityId: target.companyIdentityId,
          companyName,
          idempotencyKey: input.idempotencyKey,
          request: replacementRequest,
          economics,
        });

        const reversalId = readInsertedIdOrNull(
          await transaction.execute(sql`
            INSERT INTO position_events (
              fund_id, vehicle_id, company_identity_id, event_type, effective_date,
              shares_delta, cost_basis_delta, proceeds, replaces_event_id,
              reverses_position_event_id, vehicle_participation_id,
              resulting_participation_id, source_participation_version,
              resulting_participation_version, source_tranche_version,
              resulting_tranche_version, source_observation_id,
              backfilled_from_investment_id, created_by, idempotency_key, request_hash
            ) VALUES (
              ${input.fundId}, ${target.vehicleId}, ${target.companyIdentityId}, 'reversal',
              ${target.effectiveDate}, ${negateStoredDecimal(target.sharesDelta)},
              ${negateStoredDecimal(target.costBasisDelta)},
              ${negateStoredDecimal(target.proceeds)}, NULL, ${target.id},
              ${target.vehicleParticipationId}, NULL, NULL, NULL, NULL, NULL,
              ${observationId}, NULL, ${input.actorId},
              ${`pos:corr:${target.id}:reversal`}, ${requestHash}
            )
            ON CONFLICT DO NOTHING
            RETURNING id
          `)
        );
        if (reversalId === null) {
          throw new PositionLedgerServiceError(
            409,
            'POSITION_EVENT_ALREADY_CORRECTED',
            'The target position event already has a reversal.'
          );
        }

        const replacementId = readInsertedIdOrNull(
          await transaction.execute(sql`
            INSERT INTO position_events (
              fund_id, vehicle_id, company_identity_id, event_type, effective_date,
              shares_delta, cost_basis_delta, proceeds, replaces_event_id,
              reverses_position_event_id, vehicle_participation_id,
              resulting_participation_id, source_participation_version,
              resulting_participation_version, source_tranche_version,
              resulting_tranche_version, source_observation_id,
              backfilled_from_investment_id, created_by, idempotency_key, request_hash
            ) VALUES (
              ${input.fundId}, ${target.vehicleId}, ${target.companyIdentityId},
              ${target.eventType}, ${target.effectiveDate}, ${economics.sharesDelta},
              ${economics.costBasisDelta}, ${economics.proceeds}, ${target.id}, NULL,
              ${target.vehicleParticipationId}, NULL, NULL, NULL, NULL, NULL,
              ${observationId}, NULL, ${input.actorId}, ${input.idempotencyKey}, ${requestHash}
            )
            ON CONFLICT DO NOTHING
            RETURNING id
          `)
        );
        if (replacementId === null) {
          throw new PositionLedgerServiceError(
            409,
            'POSITION_EVENT_NOT_CORRECTABLE',
            'The corrected replacement conflicts with existing position lineage.'
          );
        }

        for (const relief of economics.lotReliefs) {
          await transaction.execute(sql`
            INSERT INTO position_event_lot_reliefs (
              fund_id, position_event_id, investment_id, investment_lot_id,
              relieved_shares, relieved_cost_basis, allocated_proceeds
            ) VALUES (
              ${input.fundId}, ${replacementId}, ${relief.investmentId},
              ${relief.investmentLotId}, ${relief.relievedShares},
              ${relief.relievedCostBasis}, ${relief.allocatedProceeds}
            )
          `);
        }

        await insertObservationMatchCase(transaction, input.fundId, observationId);
        return requirePositionEvent(
          await selectPositionEventById(transaction, input.fundId, replacementId)
        );
      },
    });
    const receipt = await loadPositionCorrectionReceipt(
      transaction,
      input.fundId,
      target.id,
      input.idempotencyKey
    );
    if (!receipt) {
      throw new PositionLedgerServiceError(
        500,
        'LEDGER_WRITE_FAILED',
        'Position correction could not be reloaded.'
      );
    }
    return { row: receipt, replayed: commandResult.replayed };
  });

  if (!result.replayed) {
    await invalidateH9Artifacts(input.fundId);
  }

  return {
    value: positionCorrectionDto(result.row),
    replayed: result.replayed,
  };
}

export async function appendCorrectionPositionEvents(
  database: LedgerDatabase,
  context: CorrectionPositionEventContext
): Promise<void> {
  if (!context.change.moneyRowsChanged) return;

  const prior = firstPositionEvent(
    await database.execute(sql`
      SELECT id, fund_id, vehicle_id, company_identity_id, event_type, effective_date,
             recorded_at, shares_delta, cost_basis_delta, proceeds, replaces_event_id,
             reverses_position_event_id, vehicle_participation_id,
             resulting_participation_id, source_participation_version,
             resulting_participation_version, source_tranche_version,
             resulting_tranche_version, source_observation_id,
             backfilled_from_investment_id, created_by, idempotency_key, request_hash
      FROM position_events
      WHERE fund_id = ${context.fundId}
        AND vehicle_participation_id = ${context.oldParticipation.id}
        AND event_type = 'acquisition'
      LIMIT 1
    `)
  );
  if (!prior) {
    throw new PositionLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Participation correction could not find its prior acquisition position event.'
    );
  }

  await database.execute(sql`
    INSERT INTO position_events (
      fund_id, vehicle_id, company_identity_id, event_type, effective_date,
      shares_delta, cost_basis_delta, proceeds, replaces_event_id,
      reverses_position_event_id, vehicle_participation_id,
      resulting_participation_id, source_participation_version,
      resulting_participation_version, source_tranche_version,
      resulting_tranche_version, source_observation_id,
      backfilled_from_investment_id, created_by, idempotency_key, request_hash
    ) VALUES (
      ${context.fundId}, ${prior.vehicleId}, ${prior.companyIdentityId}, 'reversal',
      ${prior.effectiveDate}, ${negateStoredDecimal(prior.sharesDelta)},
      ${negateStoredDecimal(prior.costBasisDelta)}, ${negateStoredDecimal(prior.proceeds)},
      NULL, ${prior.id}, NULL, NULL, NULL, NULL, NULL, NULL,
      ${context.observationId}, NULL, ${context.successor.createdBy},
      ${`pos:corr:${prior.id}:reversal`}, ${context.requestHash}
    )
    ON CONFLICT DO NOTHING
  `);

  const sharesDelta =
    context.newProjection.lot === null
      ? '0.000000'
      : new Decimal(context.newProjection.lot.sharesAcquired).toFixed(6);
  await database.execute(sql`
    INSERT INTO position_events (
      fund_id, vehicle_id, company_identity_id, event_type, effective_date,
      shares_delta, cost_basis_delta, proceeds, replaces_event_id,
      reverses_position_event_id, vehicle_participation_id,
      resulting_participation_id, source_participation_version,
      resulting_participation_version, source_tranche_version,
      resulting_tranche_version, source_observation_id,
      backfilled_from_investment_id, created_by, idempotency_key, request_hash
    ) VALUES (
      ${context.fundId}, ${prior.vehicleId}, ${prior.companyIdentityId}, 'acquisition',
      ${prior.effectiveDate}, ${sharesDelta},
      ${new Decimal(context.newProjection.investmentAmount).toFixed(6)}, '0.000000',
      NULL, NULL, ${context.successor.id}, NULL, NULL, NULL, NULL, NULL,
      ${context.observationId}, NULL, ${context.successor.createdBy},
      ${`pos:corr:${context.successor.id}:acquisition`}, ${context.requestHash}
    )
    ON CONFLICT DO NOTHING
  `);
}

function negateStoredDecimal(value: string): string {
  const decimal = new Decimal(value);
  return decimal.eq(0) ? '0.000000' : decimal.negated().toFixed(6);
}

function assertUsdOnly(request: Pick<RecordPositionEventRequest, 'currency'>): void {
  if (request.currency !== 'USD') {
    throw new PositionLedgerServiceError(
      422,
      'NON_USD_VALUE_UNSUPPORTED',
      'Position-event money values must be quoted in USD.'
    );
  }
}

function assertCorrectablePositionEvent(
  target: PositionEventRow
): asserts target is PositionEventRow & {
  eventType: RecordPositionEventRequest['eventType'];
} {
  if (target.eventType === 'conversion' || target.eventType === 'reversal') {
    throw new PositionLedgerServiceError(
      409,
      'POSITION_EVENT_NOT_CORRECTABLE',
      'Conversion and reversal events cannot be corrected by the Phase 2 position command.'
    );
  }
  if (target.vehicleParticipationId !== null) {
    throw new PositionLedgerServiceError(
      409,
      'POSITION_EVENT_NOT_CORRECTABLE',
      'Participation-backed positions must be corrected through the ledger-corrections command.'
    );
  }
  if (target.backfilledFromInvestmentId !== null) {
    throw new PositionLedgerServiceError(
      409,
      'POSITION_EVENT_NOT_CORRECTABLE',
      'Backfill-backed positions require their compatibility writer to own the correction.'
    );
  }
}

function correctionReplacementRequest(
  target: PositionEventRow & { eventType: RecordPositionEventRequest['eventType'] },
  request: CorrectPositionRequest
): RecordPositionEventRequest {
  return RecordPositionEventRequestSchema.parse({
    vehicleId: target.vehicleId,
    companyIdentityId: target.companyIdentityId,
    eventType: target.eventType,
    effectiveDate: target.effectiveDate,
    currency: request.currency,
    sharesDelta: request.sharesDelta,
    costBasisDelta: request.costBasisDelta,
    proceeds: request.proceeds,
    ...(request.lotReliefs !== undefined && { lotReliefs: request.lotReliefs }),
  });
}

function uniqueLotReferences(references: PositionLotReference[]): PositionLotReference[] {
  const byPair = new Map<string, PositionLotReference>();
  for (const reference of references) {
    byPair.set(`${reference.investmentId}:${reference.investmentLotId}`, reference);
  }
  return [...byPair.values()];
}

async function assertLedgerOwnership(
  database: LedgerDatabase,
  fundId: number,
  vehicleId: number
): Promise<void> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind: 'vehicle', id: vehicleId },
  });
}

async function lockFundIdentity(database: LedgerDatabase, fundId: number): Promise<void> {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`fund-identity:${fundId}`}))`);
}

async function assertCurrentIdentityHead(
  database: LedgerDatabase,
  fundId: number,
  companyIdentityId: number
): Promise<void> {
  const identityHead = await resolveIdentityHead(database, fundId, companyIdentityId);
  if (identityHead !== companyIdentityId) {
    throw new PositionLedgerServiceError(
      409,
      'IDENTITY_NOT_CURRENT',
      'Position events must reference the current company identity head.',
      { companyIdentityId, identityHead }
    );
  }
}

async function loadIdentityName(
  database: LedgerDatabase,
  fundId: number,
  companyIdentityId: number
): Promise<string> {
  const row = readRows(
    await database.execute(sql`
      SELECT canonical_name
      FROM company_identities
      WHERE id = ${companyIdentityId}
        AND fund_id = ${fundId}
        AND merged_into_identity_id IS NULL
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new PositionLedgerServiceError(
      409,
      'IDENTITY_NOT_CURRENT',
      'Position events must reference the current company identity head.'
    );
  }
  return asString(row['canonical_name']);
}

async function lockLotFamily(
  database: LedgerDatabase,
  fundId: number,
  reliefs: readonly PositionLotReference[],
  excludedPositionEventId?: number
): Promise<LockedLot[]> {
  const lotIds = reliefs.map((relief) => relief.investmentLotId);
  const investmentIds = reliefs.map((relief) => relief.investmentId);
  const lotIdParams = sql.join(
    lotIds.map((lotId) => sql`${lotId}`),
    sql`, `
  );
  const investmentIdParams = sql.join(
    investmentIds.map((investmentId) => sql`${investmentId}`),
    sql`, `
  );
  const rows = readRows(
    await database.execute(sql`
      SELECT l.id, l.investment_id, l.shares_acquired, l.cost_basis_cents
      FROM investment_lots l
      JOIN investments i ON i.id = l.investment_id
      WHERE l.id = ANY(ARRAY[${lotIdParams}]::uuid[])
        AND l.investment_id = ANY(ARRAY[${investmentIdParams}]::int[])
        AND i.fund_id = ${fundId}
      ORDER BY l.id
      FOR UPDATE
    `)
  );
  const byPair = new Map(
    rows.map((row) => [`${asPositiveInt(row['investment_id'])}:${asString(row['id'])}`, row])
  );
  for (const relief of reliefs) {
    if (!byPair.has(`${relief.investmentId}:${relief.investmentLotId}`)) {
      throw new PositionLedgerServiceError(
        404,
        'LOT_RELIEF_NOT_FOUND',
        'A specifically identified investment lot was not found in this fund.',
        {
          investmentId: relief.investmentId,
          investmentLotId: relief.investmentLotId,
        }
      );
    }
  }

  const activeRows = readRows(
    await database.execute(sql`
      SELECT r.investment_id, r.investment_lot_id,
             COALESCE(SUM(r.relieved_shares), 0)::text AS relieved_shares,
             COALESCE(SUM(r.relieved_cost_basis), 0)::text AS relieved_cost_basis
      FROM position_event_lot_reliefs r
      JOIN position_events source_event
        ON source_event.id = r.position_event_id
       AND source_event.fund_id = r.fund_id
      LEFT JOIN position_events reversal_event
        ON reversal_event.reverses_position_event_id = source_event.id
       AND reversal_event.fund_id = source_event.fund_id
      WHERE r.fund_id = ${fundId}
        AND r.investment_lot_id = ANY(ARRAY[${lotIdParams}]::uuid[])
        AND reversal_event.id IS NULL
        ${
          excludedPositionEventId === undefined
            ? sql``
            : sql`AND source_event.id <> ${excludedPositionEventId}`
        }
      GROUP BY r.investment_id, r.investment_lot_id
    `)
  );
  const activeByPair = new Map(
    activeRows.map((row) => [
      `${asPositiveInt(row['investment_id'])}:${asString(row['investment_lot_id'])}`,
      row,
    ])
  );

  return reliefs.map((relief) => {
    const row = byPair.get(`${relief.investmentId}:${relief.investmentLotId}`);
    if (!row) {
      throw new PositionLedgerServiceError(
        404,
        'LOT_RELIEF_NOT_FOUND',
        'A specifically identified investment lot was not found in this fund.'
      );
    }
    const active = activeByPair.get(`${relief.investmentId}:${relief.investmentLotId}`);
    return {
      id: relief.investmentLotId,
      investmentId: relief.investmentId,
      sharesAcquired: asString(row['shares_acquired']),
      costBasisCents: asBigInt(row['cost_basis_cents']),
      activeRelievedShares: active === undefined ? '0.000000' : asString(active['relieved_shares']),
      activeRelievedCostBasis:
        active === undefined ? '0.000000' : asString(active['relieved_cost_basis']),
    };
  });
}

async function selectPositionEventLotReferences(
  database: LedgerDatabase,
  fundId: number,
  positionEventId: number
): Promise<PositionLotReference[]> {
  return readRows(
    await database.execute(sql`
      SELECT investment_id, investment_lot_id
      FROM position_event_lot_reliefs
      WHERE fund_id = ${fundId}
        AND position_event_id = ${positionEventId}
      ORDER BY investment_id, investment_lot_id
    `)
  ).map((row) => ({
    investmentId: asPositiveInt(row['investment_id']),
    investmentLotId: asString(row['investment_lot_id']),
  }));
}

function validateAndCanonicalizeEconomics(
  request: RecordPositionEventRequest,
  lockedLots: LockedLot[]
): CanonicalPositionEconomics {
  const eventEconomics = {
    sharesDelta: new Decimal(request.sharesDelta).toFixed(6),
    costBasisDelta: new Decimal(request.costBasisDelta).toFixed(6),
    proceeds: new Decimal(request.proceeds).toFixed(6),
  };
  const lotReliefs = (request.lotReliefs ?? []).map((relief) => ({
    investmentId: relief.investmentId,
    investmentLotId: relief.investmentLotId,
    relievedShares: new Decimal(relief.relievedShares).toFixed(6),
    relievedCostBasis: new Decimal(relief.relievedCostBasis).toFixed(6),
    allocatedProceeds: new Decimal(relief.allocatedProceeds).toFixed(6),
  }));

  if (request.eventType === 'realization' || request.eventType === 'write_off') {
    const totalShares = Decimal.sum(...lotReliefs.map((relief) => relief.relievedShares));
    const totalCostBasis = Decimal.sum(...lotReliefs.map((relief) => relief.relievedCostBasis));
    const totalProceeds = Decimal.sum(...lotReliefs.map((relief) => relief.allocatedProceeds));
    if (
      !new Decimal(eventEconomics.sharesDelta).eq(totalShares.negated()) ||
      !new Decimal(eventEconomics.costBasisDelta).eq(totalCostBasis.negated()) ||
      !new Decimal(eventEconomics.proceeds).eq(totalProceeds)
    ) {
      throw new PositionLedgerServiceError(
        422,
        'POSITION_EVENT_CONSERVATION_VIOLATION',
        'Position-event economics must exactly conserve the specifically identified lot reliefs.'
      );
    }

    const lotsByPair = new Map(lockedLots.map((lot) => [`${lot.investmentId}:${lot.id}`, lot]));
    for (const relief of lotReliefs) {
      const lot = lotsByPair.get(`${relief.investmentId}:${relief.investmentLotId}`);
      if (!lot) {
        throw new PositionLedgerServiceError(
          404,
          'LOT_RELIEF_NOT_FOUND',
          'A specifically identified investment lot was not found in this fund.'
        );
      }
      const lotCostBasis = new Decimal(lot.costBasisCents.toString()).div(100);
      const sharesAfterRelief = new Decimal(lot.activeRelievedShares).plus(relief.relievedShares);
      const costAfterRelief = new Decimal(lot.activeRelievedCostBasis).plus(
        relief.relievedCostBasis
      );
      if (sharesAfterRelief.gt(lot.sharesAcquired) || costAfterRelief.gt(lotCostBasis)) {
        throw new PositionLedgerServiceError(
          422,
          'LOT_RELIEF_EXCEEDED',
          'Cumulative lot relief cannot exceed the lot shares or cost basis.',
          {
            investmentId: relief.investmentId,
            investmentLotId: relief.investmentLotId,
          }
        );
      }
    }
  }

  return { ...eventEconomics, lotReliefs };
}

async function insertManualObservation(
  database: LedgerDatabase,
  input: {
    fundId: number;
    companyIdentityId: number;
    companyName: string;
    idempotencyKey: string;
    request: RecordPositionEventRequest;
    economics: CanonicalPositionEconomics;
  }
): Promise<number> {
  const sourceLocator = `position-event:${input.fundId}:${input.idempotencyKey}`;
  const candidate = normalizeManualObservation({
    domain: 'ledger_event',
    measureKey:
      input.request.eventType === 'acquisition' ? 'initial_investment' : 'follow_on_investment',
    companyName: input.companyName,
    effectiveDate: input.request.effectiveDate,
    amount: input.economics.costBasisDelta,
    currency: 'USD',
    fxRate: USD_FX_RATE_TO_USD,
    sourceLocator,
    descriptor: { sourceLabel: `${sourceLocator}:${input.request.eventType}` },
  });
  if (
    candidate.outcome === 'rejected' ||
    !candidate.normalizedPayload ||
    !candidate.candidateFingerprint ||
    !candidate.effectiveDate
  ) {
    throw new PositionLedgerServiceError(
      422,
      'NORMALIZATION_REJECTED',
      'The position event could not produce a canonical manual observation.'
    );
  }

  const observationId = readInsertedId(
    await database.execute(sql`SELECT nextval('source_observations_id_seq') AS id`)
  );
  const normalizedPayload = {
    ...candidate.normalizedPayload,
    provenance: {
      source: 'position_event',
      eventType: input.request.eventType,
      vehicleId: input.request.vehicleId,
      ...input.economics,
    },
  };
  const insertedId = readInsertedId(
    await database.execute(sql`
      INSERT INTO source_observations (
        id, fund_id, company_identity_id, domain, source_type, effective_date,
        normalized_payload, observation_hash, candidate_fingerprint,
        source_locator, dependency_group_key, status
      ) VALUES (
        ${observationId}, ${input.fundId}, ${input.companyIdentityId},
        'ledger_event', 'manual', ${candidate.effectiveDate},
        ${JSON.stringify(normalizedPayload)}::jsonb, ${canonicalSha256(normalizedPayload)},
        ${candidate.candidateFingerprint}, ${sourceLocator},
        ${dependencyGroupKeyForObservation(observationId)}, 'accepted'
      )
      RETURNING id
    `)
  );
  if (insertedId !== observationId) {
    throw new PositionLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Observation insert returned an unexpected id.'
    );
  }
  return observationId;
}

async function selectPositionEventByIdempotency(
  database: LedgerDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<PositionEventRow | null> {
  return firstPositionEvent(
    await database.execute(sql`
      SELECT *
      FROM position_events
      WHERE fund_id = ${fundId}
        AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `)
  );
}

async function selectPositionEventById(
  database: LedgerDatabase,
  fundId: number,
  eventId: number
): Promise<PositionEventRow | null> {
  return firstPositionEvent(
    await database.execute(sql`
      SELECT *
      FROM position_events
      WHERE id = ${eventId}
        AND fund_id = ${fundId}
      LIMIT 1
    `)
  );
}

async function selectPositionEventForUpdate(
  database: LedgerDatabase,
  fundId: number,
  eventId: number
): Promise<LockedPositionEventRow | null> {
  const row = readRows(
    await database.execute(sql`
      SELECT *, xmin::text AS xmin
      FROM position_events
      WHERE id = ${eventId}
        AND fund_id = ${fundId}
      FOR UPDATE
    `)
  )[0];
  return row
    ? {
        ...positionEventFromRow(row),
        xmin: asString(row['xmin']),
      }
    : null;
}

async function selectPositionEventReversal(
  database: LedgerDatabase,
  fundId: number,
  targetEventId: number,
  forUpdate = false
): Promise<PositionEventRow | null> {
  const result = forUpdate
    ? await database.execute(sql`
        SELECT *
        FROM position_events
        WHERE fund_id = ${fundId}
          AND reverses_position_event_id = ${targetEventId}
        LIMIT 1
        FOR UPDATE
      `)
    : await database.execute(sql`
        SELECT *
        FROM position_events
        WHERE fund_id = ${fundId}
          AND reverses_position_event_id = ${targetEventId}
        LIMIT 1
      `);
  return firstPositionEvent(result);
}

async function loadPositionCorrectionReceipt(
  database: LedgerDatabase,
  fundId: number,
  targetEventId: number,
  idempotencyKey: string
): Promise<PositionCorrectionReceiptRow | null> {
  const replacement = await selectPositionEventByIdempotency(database, fundId, idempotencyKey);
  if (!replacement) return null;
  const reversal = await selectPositionEventReversal(database, fundId, targetEventId);
  if (!reversal || replacement.sourceObservationId === null) {
    throw new PositionLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Stored position correction is missing reversal or observation lineage.'
    );
  }
  const caseRow = readRows(
    await database.execute(sql`
      SELECT id
      FROM reconciliation_cases
      WHERE fund_id = ${fundId}
        AND source_observation_id = ${replacement.sourceObservationId}
        AND case_type = 'observation_match'
      ORDER BY id DESC
      LIMIT 1
    `)
  )[0];
  if (!caseRow) {
    throw new PositionLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Stored position correction is missing its reconciliation case.'
    );
  }
  return {
    reversal,
    replacement,
    reconciliationCaseId: asPositiveInt(caseRow['id']),
  };
}

async function insertObservationMatchCase(
  database: LedgerDatabase,
  fundId: number,
  observationId: number
): Promise<number> {
  return readInsertedId(
    await database.execute(sql`
      INSERT INTO reconciliation_cases (
        fund_id, source_observation_id, case_type, status, resolution,
        resolved_by, resolved_at, history
      ) VALUES (
        ${fundId}, ${observationId}, 'observation_match', 'resolved',
        ${JSON.stringify({ action: 'confirm_match', reason: 'position_correction' })}::jsonb,
        NULL, now(),
        ${JSON.stringify([{ action: 'auto_resolved_position_correction' }])}::jsonb
      )
      RETURNING id
    `)
  );
}

function requirePositionEvent(row: PositionEventRow | null): PositionEventRow {
  if (!row) {
    throw new PositionLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Position-event insert could not be reloaded.'
    );
  }
  return row;
}

function requiredRequestHash(row: PositionEventRow): string {
  if (row.requestHash === null) {
    throw new PositionLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Idempotent position event is missing its request hash.'
    );
  }
  return row.requestHash;
}

function firstPositionEvent(result: unknown): PositionEventRow | null {
  const row = readRows(result)[0];
  return row ? positionEventFromRow(row) : null;
}

function positionEventFromRow(row: Record<string, unknown>): PositionEventRow {
  return {
    id: asPositiveInt(row['id']),
    fundId: asPositiveInt(row['fund_id'] ?? row['fundId']),
    vehicleId: asPositiveInt(row['vehicle_id'] ?? row['vehicleId']),
    companyIdentityId: asPositiveInt(row['company_identity_id'] ?? row['companyIdentityId']),
    eventType: asEventType(row['event_type'] ?? row['eventType']),
    effectiveDate: asDateString(row['effective_date'] ?? row['effectiveDate']),
    recordedAt: asDate(row['recorded_at'] ?? row['recordedAt']),
    sharesDelta: asString(row['shares_delta'] ?? row['sharesDelta']),
    costBasisDelta: asString(row['cost_basis_delta'] ?? row['costBasisDelta']),
    proceeds: asString(row['proceeds']),
    replacesEventId: asNullablePositiveInt(row['replaces_event_id'] ?? row['replacesEventId']),
    reversesPositionEventId: asNullablePositiveInt(
      row['reverses_position_event_id'] ?? row['reversesPositionEventId']
    ),
    vehicleParticipationId: asNullablePositiveInt(
      row['vehicle_participation_id'] ?? row['vehicleParticipationId']
    ),
    resultingParticipationId: asNullablePositiveInt(
      row['resulting_participation_id'] ?? row['resultingParticipationId']
    ),
    sourceParticipationVersion: asNullablePositiveInt(
      row['source_participation_version'] ?? row['sourceParticipationVersion']
    ),
    resultingParticipationVersion: asNullablePositiveInt(
      row['resulting_participation_version'] ?? row['resultingParticipationVersion']
    ),
    sourceTrancheVersion: asNullablePositiveInt(
      row['source_tranche_version'] ?? row['sourceTrancheVersion']
    ),
    resultingTrancheVersion: asNullablePositiveInt(
      row['resulting_tranche_version'] ?? row['resultingTrancheVersion']
    ),
    sourceObservationId: asNullablePositiveInt(
      row['source_observation_id'] ?? row['sourceObservationId']
    ),
    backfilledFromInvestmentId: asNullablePositiveInt(
      row['backfilled_from_investment_id'] ?? row['backfilledFromInvestmentId']
    ),
    createdBy: asNullablePositiveInt(row['created_by'] ?? row['createdBy']),
    idempotencyKey: asNullableString(row['idempotency_key'] ?? row['idempotencyKey']),
    requestHash: asNullableString(row['request_hash'] ?? row['requestHash']),
  };
}

function positionEventDto(row: PositionEventRow): PositionEventV1 {
  return PositionEventV1Schema.parse({
    ...row,
    recordedAt: row.recordedAt.toISOString(),
  });
}

function positionCorrectionDto(row: PositionCorrectionReceiptRow): PositionCorrectionV1 {
  return PositionCorrectionV1Schema.parse({
    reversal: positionEventDto(row.reversal),
    replacement: positionEventDto(row.replacement),
    reconciliationCaseId: row.reconciliationCaseId,
  });
}

function asEventType(value: unknown): PositionEventV1['eventType'] {
  if (
    value === 'acquisition' ||
    value === 'conversion' ||
    value === 'realization' ||
    value === 'write_off' ||
    value === 'adjustment' ||
    value === 'reversal'
  ) {
    return value;
  }
  throw new Error('Expected a position event type.');
}

function readInsertedId(result: unknown): number {
  const id = readInsertedIdOrNull(result);
  if (id === null) throw new Error('Expected an inserted id.');
  return id;
}

function readInsertedIdOrNull(result: unknown): number | null {
  const row = readRows(result)[0];
  return row ? asPositiveInt(row['id']) : null;
}

function readRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  }
  return [];
}

function asPositiveInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Expected a positive integer.');
  }
  return parsed;
}

function asNullablePositiveInt(value: unknown): number | null {
  return value === null || value === undefined ? null : asPositiveInt(value);
}

function asString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
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
  if (Number.isNaN(parsed.getTime())) throw new Error('Expected a date.');
  return parsed;
}

function asBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error('Expected an integer value.');
}
