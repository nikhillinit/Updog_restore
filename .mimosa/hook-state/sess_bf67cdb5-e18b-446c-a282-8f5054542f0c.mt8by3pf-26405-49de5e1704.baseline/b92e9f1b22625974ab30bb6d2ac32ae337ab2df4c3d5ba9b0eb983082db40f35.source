import { sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import { IdempotentCommandError, runIdempotentCommand } from '../../lib/idempotent-command';
import {
  CorrectFinancingTrancheRequestSchema,
  CreateFinancingEventRequestSchema,
  FinancingEventDetailV1Schema,
  FinancingEventV1Schema,
  FinancingTrancheV1Schema,
  LEDGER_CONTRACT_VERSION,
  RecordFinancingTrancheRequestSchema,
  USD_FX_RATE_TO_USD,
  investmentLedgerMoneyProjection,
  type FinancingEventDetailV1,
  type FinancingEventV1,
  type FinancingTrancheV1,
} from '../../../shared/contracts/investment-ledger/financing-event.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { dependencyGroupKeyForObservation } from '../../../shared/contracts/financial-observations/reconciliation-api.contract';
import type { FinancingEvent, FinancingTranche } from '../../../shared/schema/investment-ledger';
import { normalizeManualObservation } from '../financial-observations/manual-entry-adapter';
import { resolveIdentityHead } from '../financial-observations/identity-resolution-service';

type LedgerDatabase = typeof db;

interface LedgerCommandContext {
  fundId: number;
  actorId: number | null;
  idempotencyKey: string;
  database?: LedgerDatabase;
}

export interface CreateFinancingEventInput extends LedgerCommandContext {
  request: unknown;
}

export interface RecordFinancingTrancheInput extends LedgerCommandContext {
  eventId: number;
  request: unknown;
}

export interface CorrectFinancingTrancheInput extends LedgerCommandContext {
  trancheId: number;
  request: unknown;
}

export interface LedgerCommandResult<T> {
  value: T;
  replayed: boolean;
}

export type FinancingLedgerServiceErrorCode =
  | 'FINANCING_EVENT_NATURAL_KEY_CONFLICT'
  | 'FINANCING_EVENT_NOT_FOUND'
  | 'FINANCING_TRANCHE_NOT_CURRENT'
  | 'FINANCING_TRANCHE_CONFLICT'
  | 'PARTICIPATION_CASCADE_REQUIRED'
  | 'NORMALIZATION_REJECTED'
  | 'LEDGER_WRITE_FAILED';

export class FinancingLedgerServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: FinancingLedgerServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'FinancingLedgerServiceError';
    this.statusCode = status;
  }
}

export async function createFinancingEvent(
  input: CreateFinancingEventInput
): Promise<LedgerCommandResult<FinancingEventV1>> {
  const database = input.database ?? db;
  const earlyReplay = await replayExistingFinancingEventBeforeParse(database, input);
  if (earlyReplay) return earlyReplay;

  const request = CreateFinancingEventRequestSchema.parse(input.request);
  const commandRequest = {
    fundId: input.fundId,
    contractVersion: LEDGER_CONTRACT_VERSION,
    ...request,
  };
  const result = await database.transaction(async (transaction) => {
    await lockFundIdentity(transaction, input.fundId);
    const identityHead = await resolveIdentityHead(
      transaction,
      input.fundId,
      request.companyIdentityId
    );

    return runIdempotentCommand<FinancingEvent>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      contractVersion: LEDGER_CONTRACT_VERSION,
      request: commandRequest,
      loadExisting: async () => {
        const byIdempotency = await selectFinancingEventByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        if (byIdempotency) {
          return { row: byIdempotency, requestHash: byIdempotency.requestHash };
        }
        const byNaturalKey = await selectFinancingEventsByEquivalentNaturalKey(
          transaction,
          input.fundId,
          identityHead,
          request.eventKey
        );
        if (byNaturalKey.length > 0) {
          throw naturalKeyConflict();
        }
        return null;
      },
      insert: async (storedRequestHash) => {
        const byIdempotency = await selectFinancingEventByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        if (byIdempotency) return null;
        const byNaturalKey = await selectFinancingEventsByEquivalentNaturalKey(
          transaction,
          input.fundId,
          identityHead,
          request.eventKey
        );
        if (byNaturalKey.length > 0) {
          throw naturalKeyConflict();
        }

        return firstFinancingEvent(
          await transaction.execute(sql`
            INSERT INTO financing_events (
              fund_id, company_identity_id, event_key, round_name, security_type,
              event_date, currency, round_size, pre_money_valuation,
              post_money_valuation, price_per_share, created_by,
              idempotency_key, request_hash
            ) VALUES (
              ${input.fundId}, ${identityHead}, ${request.eventKey}, ${request.roundName},
              ${request.securityType}, ${request.eventDate}, ${request.currency},
              ${request.roundSize ?? null}, ${request.preMoneyValuation ?? null},
              ${request.postMoneyValuation ?? null}, ${request.pricePerShare ?? null},
              ${input.actorId}, ${input.idempotencyKey}, ${storedRequestHash}
            )
            ON CONFLICT DO NOTHING
            RETURNING *
          `)
        );
      },
    });
  });

  return {
    value: financingEventDto(result.row),
    replayed: result.replayed,
  };
}

export async function recordFinancingTranche(
  input: RecordFinancingTrancheInput
): Promise<LedgerCommandResult<FinancingTrancheV1>> {
  const database = input.database ?? db;
  const earlyReplay = await replayExistingFinancingTrancheBeforeParse(database, input);
  if (earlyReplay) return earlyReplay;

  const request = RecordFinancingTrancheRequestSchema.parse(input.request);
  await assertLedgerOwnership(database, input.fundId, 'financing_event', input.eventId);

  const result = await database.transaction(async (transaction) => {
    await lockFinancingEvent(transaction, input.fundId, input.eventId);
    return runIdempotentCommand<FinancingTranche>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      contractVersion: LEDGER_CONTRACT_VERSION,
      request: {
        fundId: input.fundId,
        contractVersion: LEDGER_CONTRACT_VERSION,
        eventId: input.eventId,
        ...request,
        money: investmentLedgerMoneyProjection(request),
      },
      loadExisting: async () => {
        const existing = await selectFinancingTrancheByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        return existing ? { row: existing, requestHash: existing.requestHash } : null;
      },
      insert: async (requestHash) => {
        const existing = await selectFinancingTrancheByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        if (existing) return null;

        const inserted = firstFinancingTranche(
          await transaction.execute(sql`
            INSERT INTO financing_tranches (
              fund_id, financing_event_id, tranche_key, version,
              superseded_by_tranche_id, closing_date, security_type,
              investment_amount, original_amount, currency, fx_rate_to_usd,
              fx_rate_date, price_per_share, post_money_valuation, valuation_cap,
              conversion_discount_rate, interest_rate, maturity_date,
              liquidation_preference_multiple, participating_preferred,
              participation_cap_multiple, pro_rata_rights_pct, descriptive_terms,
              calculation_eligible, source_observation_id, created_by,
              idempotency_key, request_hash
            ) VALUES (
              ${input.fundId}, ${input.eventId}, ${request.trancheKey}, 1, NULL,
              ${request.closingDate}, ${request.securityType},
              ${request.investmentAmount}, ${request.originalAmount}, ${request.currency},
              ${request.fxRateToUsd}, ${request.fxRateDate},
              ${request.pricePerShare ?? null}, ${request.postMoneyValuation ?? null},
              ${request.valuationCap ?? null}, ${request.conversionDiscountRate ?? null},
              ${request.interestRate ?? null}, ${request.maturityDate ?? null},
              ${request.liquidationPreferenceMultiple ?? null},
              ${request.participatingPreferred ?? null},
              ${request.participationCapMultiple ?? null}, ${request.proRataRightsPct ?? null},
              ${JSON.stringify(request.descriptiveTerms)}::jsonb,
              ${request.calculationEligible}, NULL, ${input.actorId},
              ${input.idempotencyKey}, ${requestHash}
            )
            ON CONFLICT DO NOTHING
            RETURNING *
          `)
        );
        if (!inserted) return null;

        const context = await loadEventObservationContext(transaction, input.fundId, input.eventId);
        const priorCount = await countOtherTrancheKeys(
          transaction,
          input.fundId,
          input.eventId,
          request.trancheKey
        );
        const observationId = await insertManualObservation(transaction, {
          fundId: input.fundId,
          companyIdentityId: context.companyIdentityId,
          companyName: context.companyName,
          measureKey: priorCount === 0 ? 'initial_investment' : 'follow_on_investment',
          eventId: input.eventId,
          trancheKey: request.trancheKey,
          version: 1,
          closingDate: request.closingDate,
          investmentAmount: request.investmentAmount,
        });

        return updateNewTranche(transaction, input.fundId, inserted.id, {
          supersededByTrancheId: null,
          sourceObservationId: observationId,
        });
      },
    });
  });

  return {
    value: financingTrancheDto(result.row),
    replayed: result.replayed,
  };
}

export async function correctFinancingTranche(
  input: CorrectFinancingTrancheInput
): Promise<LedgerCommandResult<FinancingTrancheV1>> {
  const database = input.database ?? db;
  const earlyReplay = await replayExistingFinancingTrancheBeforeParse(database, input);
  if (earlyReplay) return earlyReplay;

  const request = CorrectFinancingTrancheRequestSchema.parse(input.request);
  await assertLedgerOwnership(database, input.fundId, 'financing_tranche', input.trancheId);

  const result = await database.transaction(async (transaction) => {
    const currentEventId = await selectCurrentTrancheEventId(
      transaction,
      input.fundId,
      input.trancheId
    );
    if (currentEventId !== null) {
      await lockFinancingEvent(transaction, input.fundId, currentEventId);
    }
    return runIdempotentCommand<FinancingTranche>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      contractVersion: LEDGER_CONTRACT_VERSION,
      request: {
        fundId: input.fundId,
        contractVersion: LEDGER_CONTRACT_VERSION,
        trancheId: input.trancheId,
        ...request,
        money: investmentLedgerMoneyProjection(request),
      },
      loadExisting: async () => {
        const existing = await selectFinancingTrancheByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        return existing ? { row: existing, requestHash: existing.requestHash } : null;
      },
      insert: async (requestHash) => {
        const existing = await selectFinancingTrancheByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        if (existing) return null;

        const current = firstFinancingTranche(
          await transaction.execute(sql`
            SELECT * FROM financing_tranches
            WHERE id = ${input.trancheId}
              AND fund_id = ${input.fundId}
              AND superseded_by_tranche_id IS NULL
            FOR UPDATE
          `)
        );
        if (!current) {
          throw new FinancingLedgerServiceError(
            409,
            'FINANCING_TRANCHE_NOT_CURRENT',
            'Only the current tranche version can be corrected.'
          );
        }
        await assertNoCurrentDependentParticipations(transaction, input.fundId, input.trancheId);

        const newId = readInsertedId(
          await transaction.execute(sql`SELECT nextval('financing_tranches_id_seq') AS id`)
        );
        // The temporary backward link avoids violating the one-head partial
        // unique index while both rows exist. It is cleared before commit.
        const inserted = firstFinancingTranche(
          await transaction.execute(sql`
            INSERT INTO financing_tranches (
              id, fund_id, financing_event_id, tranche_key, version,
              superseded_by_tranche_id, closing_date, security_type,
              investment_amount, original_amount, currency, fx_rate_to_usd,
              fx_rate_date, price_per_share, post_money_valuation, valuation_cap,
              conversion_discount_rate, interest_rate, maturity_date,
              liquidation_preference_multiple, participating_preferred,
              participation_cap_multiple, pro_rata_rights_pct, descriptive_terms,
              calculation_eligible, source_observation_id, created_by,
              idempotency_key, request_hash
            ) VALUES (
              ${newId}, ${input.fundId}, ${current.financingEventId},
              ${current.trancheKey}, ${current.version + 1}, ${current.id},
              ${request.closingDate}, ${request.securityType},
              ${request.investmentAmount}, ${request.originalAmount}, ${request.currency},
              ${request.fxRateToUsd}, ${request.fxRateDate},
              ${request.pricePerShare ?? null}, ${request.postMoneyValuation ?? null},
              ${request.valuationCap ?? null}, ${request.conversionDiscountRate ?? null},
              ${request.interestRate ?? null}, ${request.maturityDate ?? null},
              ${request.liquidationPreferenceMultiple ?? null},
              ${request.participatingPreferred ?? null},
              ${request.participationCapMultiple ?? null}, ${request.proRataRightsPct ?? null},
              ${JSON.stringify(request.descriptiveTerms)}::jsonb,
              ${request.calculationEligible}, NULL, ${input.actorId},
              ${input.idempotencyKey}, ${requestHash}
            )
            ON CONFLICT DO NOTHING
            RETURNING *
          `)
        );
        if (!inserted) return null;

        const supersededRows = readRows(
          await transaction.execute(sql`
            UPDATE financing_tranches
            SET superseded_by_tranche_id = ${newId}
            WHERE id = ${current.id}
              AND fund_id = ${input.fundId}
              AND superseded_by_tranche_id IS NULL
            RETURNING id
          `)
        );
        if (supersededRows.length !== 1) {
          throw new FinancingLedgerServiceError(
            409,
            'FINANCING_TRANCHE_CONFLICT',
            'The tranche head changed concurrently; retry the correction.'
          );
        }

        const context = await loadEventObservationContext(
          transaction,
          input.fundId,
          current.financingEventId
        );
        const measureKey = await loadPriorObservationMeasureKey(
          transaction,
          input.fundId,
          current.id
        );
        const observationId = await insertManualObservation(transaction, {
          fundId: input.fundId,
          companyIdentityId: context.companyIdentityId,
          companyName: context.companyName,
          measureKey,
          eventId: current.financingEventId,
          trancheKey: current.trancheKey,
          version: current.version + 1,
          closingDate: request.closingDate,
          investmentAmount: request.investmentAmount,
        });

        return updateNewTranche(transaction, input.fundId, newId, {
          supersededByTrancheId: null,
          sourceObservationId: observationId,
        });
      },
    });
  });

  return {
    value: financingTrancheDto(result.row),
    replayed: result.replayed,
  };
}

export async function loadFinancingEventDetail(
  fundId: number,
  eventId: number,
  database: LedgerDatabase = db
): Promise<FinancingEventDetailV1> {
  await assertLedgerOwnership(database, fundId, 'financing_event', eventId);
  const event = firstFinancingEvent(
    await database.execute(sql`
      SELECT * FROM financing_events
      WHERE id = ${eventId} AND fund_id = ${fundId}
      LIMIT 1
    `)
  );
  if (!event) {
    throw new FinancingLedgerServiceError(
      404,
      'FINANCING_EVENT_NOT_FOUND',
      'Financing event not found.'
    );
  }
  const headTranches = readRows(
    await database.execute(sql`
      SELECT * FROM financing_tranches
      WHERE financing_event_id = ${eventId}
        AND fund_id = ${fundId}
        AND superseded_by_tranche_id IS NULL
      ORDER BY closing_date, tranche_key
    `)
  ).map(financingTrancheFromRow);
  const versionHistory = readRows(
    await database.execute(sql`
      SELECT * FROM financing_tranches
      WHERE financing_event_id = ${eventId} AND fund_id = ${fundId}
      ORDER BY tranche_key, version
    `)
  ).map(financingTrancheFromRow);

  return FinancingEventDetailV1Schema.parse({
    event: financingEventDto(event),
    headTranches: headTranches.map(financingTrancheDto),
    versionHistory: versionHistory.map(financingTrancheDto),
  });
}

async function assertLedgerOwnership(
  database: LedgerDatabase,
  fundId: number,
  kind: 'financing_event' | 'financing_tranche',
  id: number
): Promise<void> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind, id },
  });
}

async function selectFinancingEventByIdempotency(
  database: LedgerDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<FinancingEvent | null> {
  return firstFinancingEvent(
    await database.execute(sql`
      SELECT * FROM financing_events
      WHERE fund_id = ${fundId} AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `)
  );
}

async function selectFinancingEventsByEquivalentNaturalKey(
  database: LedgerDatabase,
  fundId: number,
  identityHead: number,
  eventKey: string
): Promise<FinancingEvent[]> {
  return readRows(
    await database.execute(sql`
      WITH RECURSIVE equivalent_identities AS (
        SELECT id
        FROM company_identities
        WHERE id = ${identityHead} AND fund_id = ${fundId}
        UNION
        SELECT c.id
        FROM company_identities c
        JOIN equivalent_identities e
          ON c.merged_into_identity_id = e.id AND c.fund_id = ${fundId}
      )
      SELECT fe.*
      FROM financing_events fe
      JOIN equivalent_identities e
        ON e.id = fe.company_identity_id
      WHERE fe.fund_id = ${fundId}
        AND fe.event_key = ${eventKey}
    `)
  ).map(financingEventFromRow);
}

async function selectFinancingTrancheByIdempotency(
  database: LedgerDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<FinancingTranche | null> {
  return firstFinancingTranche(
    await database.execute(sql`
      SELECT * FROM financing_tranches
      WHERE fund_id = ${fundId} AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `)
  );
}

async function selectFinancingTrancheById(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number
): Promise<FinancingTranche | null> {
  return firstFinancingTranche(
    await database.execute(sql`
      SELECT * FROM financing_tranches
      WHERE id = ${trancheId}
        AND fund_id = ${fundId}
      LIMIT 1
    `)
  );
}

async function selectCurrentTrancheEventId(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number
): Promise<number | null> {
  const row = readRows(
    await database.execute(sql`
      SELECT financing_event_id
      FROM financing_tranches
      WHERE id = ${trancheId}
        AND fund_id = ${fundId}
        AND superseded_by_tranche_id IS NULL
      LIMIT 1
    `)
  )[0];
  return row ? asPositiveInt(row['financing_event_id']) : null;
}

async function lockFundIdentity(database: LedgerDatabase, fundId: number): Promise<void> {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`fund-identity:${fundId}`}))`);
}

async function lockFinancingEvent(
  database: LedgerDatabase,
  fundId: number,
  eventId: number
): Promise<void> {
  await database.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`financing-event:${fundId}:${eventId}`}))`
  );
}

function naturalKeyConflict(): FinancingLedgerServiceError {
  return new FinancingLedgerServiceError(
    409,
    'FINANCING_EVENT_NATURAL_KEY_CONFLICT',
    'A financing event with the same canonical natural key already exists.'
  );
}

async function replayExistingFinancingEventBeforeParse(
  database: LedgerDatabase,
  input: CreateFinancingEventInput
): Promise<LedgerCommandResult<FinancingEventV1> | null> {
  const existing = await selectFinancingEventByIdempotency(
    database,
    input.fundId,
    input.idempotencyKey
  );
  if (!existing) return null;

  const parsed = CreateFinancingEventRequestSchema.safeParse(input.request);
  if (parsed.success) {
    const requestHash = canonicalSha256({
      fundId: input.fundId,
      contractVersion: LEDGER_CONTRACT_VERSION,
      ...parsed.data,
    });
    assertReplayHash(existing.requestHash, requestHash, input.idempotencyKey);
  }
  return { value: financingEventDto(existing), replayed: true };
}

async function replayExistingFinancingTrancheBeforeParse(
  database: LedgerDatabase,
  input: RecordFinancingTrancheInput | CorrectFinancingTrancheInput
): Promise<LedgerCommandResult<FinancingTrancheV1> | null> {
  const existing = await selectFinancingTrancheByIdempotency(
    database,
    input.fundId,
    input.idempotencyKey
  );
  if (!existing) return null;

  const requestHash = requestHashForParseableTrancheReplay(input);
  if (requestHash !== null) {
    assertReplayHash(existing.requestHash, requestHash, input.idempotencyKey);
    return { value: financingTrancheDto(existing), replayed: true };
  }

  if ('eventId' in input) {
    assertMalformedRecordReplayMatchesPath(existing, input);
  } else {
    await assertMalformedCorrectionReplayMatchesPath(database, existing, input);
  }
  return { value: financingTrancheDto(existing), replayed: true };
}

function assertMalformedRecordReplayMatchesPath(
  existing: FinancingTranche,
  input: RecordFinancingTrancheInput
): void {
  if (existing.version !== 1 || existing.financingEventId !== input.eventId) {
    throwIdempotencyKeyReuse(input.idempotencyKey);
  }
}

async function assertMalformedCorrectionReplayMatchesPath(
  database: LedgerDatabase,
  existing: FinancingTranche,
  input: CorrectFinancingTrancheInput
): Promise<void> {
  const predecessor = await selectFinancingTrancheById(database, input.fundId, input.trancheId);
  if (!predecessor || predecessor.supersededByTrancheId !== existing.id) {
    throwIdempotencyKeyReuse(input.idempotencyKey);
  }
}

function requestHashForParseableTrancheReplay(
  input: RecordFinancingTrancheInput | CorrectFinancingTrancheInput
): string | null {
  if ('eventId' in input) {
    const parsed = RecordFinancingTrancheRequestSchema.safeParse(input.request);
    return parsed.success
      ? canonicalSha256({
          fundId: input.fundId,
          contractVersion: LEDGER_CONTRACT_VERSION,
          eventId: input.eventId,
          ...parsed.data,
          money: investmentLedgerMoneyProjection(parsed.data),
        })
      : null;
  }

  const parsed = CorrectFinancingTrancheRequestSchema.safeParse(input.request);
  return parsed.success
    ? canonicalSha256({
        fundId: input.fundId,
        contractVersion: LEDGER_CONTRACT_VERSION,
        trancheId: input.trancheId,
        ...parsed.data,
        money: investmentLedgerMoneyProjection(parsed.data),
      })
    : null;
}

function assertReplayHash(
  storedRequestHash: string,
  requestHash: string,
  idempotencyKey: string
): void {
  if (storedRequestHash !== requestHash) {
    throwIdempotencyKeyReuse(idempotencyKey);
  }
}

function throwIdempotencyKeyReuse(idempotencyKey: string): never {
  throw new IdempotentCommandError(
    409,
    'IDEMPOTENCY_KEY_REUSE',
    'Idempotency-Key was already used for a different request.',
    { idempotencyKey }
  );
}

async function loadEventObservationContext(
  database: LedgerDatabase,
  fundId: number,
  eventId: number
): Promise<{ companyIdentityId: number; companyName: string }> {
  const row = readRows(
    await database.execute(sql`
      SELECT e.company_identity_id, i.canonical_name
      FROM financing_events e
      JOIN company_identities i
        ON i.id = e.company_identity_id AND i.fund_id = e.fund_id
      WHERE e.id = ${eventId} AND e.fund_id = ${fundId}
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new FinancingLedgerServiceError(
      404,
      'FINANCING_EVENT_NOT_FOUND',
      'Financing event not found.'
    );
  }
  return {
    companyIdentityId: asPositiveInt(row['company_identity_id']),
    companyName: asString(row['canonical_name']),
  };
}

async function countOtherTrancheKeys(
  database: LedgerDatabase,
  fundId: number,
  eventId: number,
  trancheKey: string
): Promise<number> {
  const row = readRows(
    await database.execute(sql`
      SELECT count(DISTINCT tranche_key)::integer AS count
      FROM financing_tranches
      WHERE fund_id = ${fundId}
        AND financing_event_id = ${eventId}
        AND tranche_key <> ${trancheKey}
    `)
  )[0];
  return row ? asNonnegativeInt(row['count']) : 0;
}

async function loadPriorObservationMeasureKey(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number
): Promise<'initial_investment' | 'follow_on_investment'> {
  const row = readRows(
    await database.execute(sql`
      SELECT so.normalized_payload
      FROM financing_tranches t
      JOIN source_observations so
        ON so.id = t.source_observation_id AND so.fund_id = t.fund_id
      WHERE t.id = ${trancheId}
        AND t.fund_id = ${fundId}
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new FinancingLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Correction could not load the prior tranche observation.'
    );
  }

  const payload = asRecord(row['normalized_payload']);
  const measureKey = payload['measureKey'];
  if (measureKey === 'initial_investment' || measureKey === 'follow_on_investment') {
    return measureKey;
  }
  throw new FinancingLedgerServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Correction could not reuse the prior tranche observation measure key.'
  );
}

async function assertNoCurrentDependentParticipations(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number
): Promise<void> {
  const dependents = readRows(
    await database.execute(sql`
      SELECT id, version
      FROM vehicle_financing_participations
      WHERE fund_id = ${fundId}
        AND financing_tranche_id = ${trancheId}
        AND superseded_by_participation_id IS NULL
      ORDER BY id
      FOR UPDATE
    `)
  );
  if (dependents.length > 0) {
    throw new FinancingLedgerServiceError(
      409,
      'PARTICIPATION_CASCADE_REQUIRED',
      'Current vehicle participations depend on this tranche; use the ledger correction cascade.'
    );
  }
}

async function insertManualObservation(
  database: LedgerDatabase,
  input: {
    fundId: number;
    companyIdentityId: number;
    companyName: string;
    measureKey: 'initial_investment' | 'follow_on_investment';
    eventId: number;
    trancheKey: string;
    version: number;
    closingDate: string;
    investmentAmount: string;
  }
): Promise<number> {
  const sourceLocator = `financing-event:${input.eventId}:tranche:${input.trancheKey}`;
  const candidate = normalizeManualObservation({
    domain: 'ledger_event',
    measureKey: input.measureKey,
    companyName: input.companyName,
    effectiveDate: input.closingDate,
    amount: input.investmentAmount,
    currency: 'USD',
    fxRate: USD_FX_RATE_TO_USD,
    sourceLocator,
    descriptor: { sourceLabel: `${sourceLocator}:v${input.version}` },
  });
  if (
    candidate.outcome === 'rejected' ||
    !candidate.normalizedPayload ||
    !candidate.observationHash ||
    !candidate.candidateFingerprint ||
    !candidate.effectiveDate
  ) {
    throw new FinancingLedgerServiceError(
      422,
      'NORMALIZATION_REJECTED',
      'The canonical ledger write could not produce a manual observation.'
    );
  }

  const observationId = readInsertedId(
    await database.execute(sql`SELECT nextval('source_observations_id_seq') AS id`)
  );
  const insertedId = readInsertedId(
    await database.execute(sql`
      INSERT INTO source_observations (
        id, fund_id, company_identity_id, domain, source_type, effective_date,
        normalized_payload, observation_hash, candidate_fingerprint,
        source_locator, dependency_group_key, status
      ) VALUES (
        ${observationId}, ${input.fundId}, ${input.companyIdentityId},
        'ledger_event', 'manual', ${candidate.effectiveDate},
        ${JSON.stringify(candidate.normalizedPayload)}::jsonb,
        ${candidate.observationHash}, ${candidate.candidateFingerprint},
        ${sourceLocator}, ${dependencyGroupKeyForObservation(observationId)}, 'accepted'
      )
      RETURNING id
    `)
  );
  if (insertedId !== observationId) {
    throw new FinancingLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Observation insert returned an unexpected id.'
    );
  }
  return observationId;
}

async function updateNewTranche(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number,
  values: {
    supersededByTrancheId: number | null;
    sourceObservationId: number;
  }
): Promise<FinancingTranche> {
  const updated = firstFinancingTranche(
    await database.execute(sql`
      UPDATE financing_tranches
      SET superseded_by_tranche_id = ${values.supersededByTrancheId},
          source_observation_id = ${values.sourceObservationId}
      WHERE id = ${trancheId} AND fund_id = ${fundId}
      RETURNING *
    `)
  );
  if (!updated) {
    throw new FinancingLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Tranche observation linkage returned no row.'
    );
  }
  return updated;
}

function financingEventDto(row: FinancingEvent): FinancingEventV1 {
  return FinancingEventV1Schema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
}

function financingTrancheDto(row: FinancingTranche): FinancingTrancheV1 {
  return FinancingTrancheV1Schema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
}

function firstFinancingEvent(result: unknown): FinancingEvent | null {
  const row = readRows(result)[0];
  return row ? financingEventFromRow(row) : null;
}

function firstFinancingTranche(result: unknown): FinancingTranche | null {
  const row = readRows(result)[0];
  return row ? financingTrancheFromRow(row) : null;
}

function financingEventFromRow(row: Record<string, unknown>): FinancingEvent {
  return {
    id: asPositiveInt(row['id']),
    fundId: asPositiveInt(row['fund_id'] ?? row['fundId']),
    companyIdentityId: asPositiveInt(row['company_identity_id'] ?? row['companyIdentityId']),
    eventKey: asString(row['event_key'] ?? row['eventKey']),
    roundName: asString(row['round_name'] ?? row['roundName']),
    securityType: asString(row['security_type'] ?? row['securityType']),
    eventDate: asDateString(row['event_date'] ?? row['eventDate']),
    currency: asString(row['currency']),
    roundSize: asNullableString(row['round_size'] ?? row['roundSize']),
    preMoneyValuation: asNullableString(row['pre_money_valuation'] ?? row['preMoneyValuation']),
    postMoneyValuation: asNullableString(row['post_money_valuation'] ?? row['postMoneyValuation']),
    pricePerShare: asNullableString(row['price_per_share'] ?? row['pricePerShare']),
    createdBy: asNullablePositiveInt(row['created_by'] ?? row['createdBy']),
    idempotencyKey: asString(row['idempotency_key'] ?? row['idempotencyKey']),
    requestHash: asString(row['request_hash'] ?? row['requestHash']),
    createdAt: asDate(row['created_at'] ?? row['createdAt']),
  };
}

function financingTrancheFromRow(row: Record<string, unknown>): FinancingTranche {
  return {
    id: asPositiveInt(row['id']),
    fundId: asPositiveInt(row['fund_id'] ?? row['fundId']),
    financingEventId: asPositiveInt(row['financing_event_id'] ?? row['financingEventId']),
    trancheKey: asString(row['tranche_key'] ?? row['trancheKey']),
    version: asPositiveInt(row['version']),
    supersededByTrancheId: asNullablePositiveInt(
      row['superseded_by_tranche_id'] ?? row['supersededByTrancheId']
    ),
    closingDate: asDateString(row['closing_date'] ?? row['closingDate']),
    securityType: asString(row['security_type'] ?? row['securityType']),
    investmentAmount: asString(row['investment_amount'] ?? row['investmentAmount']),
    originalAmount: asString(row['original_amount'] ?? row['originalAmount']),
    currency: asString(row['currency']),
    fxRateToUsd: asString(row['fx_rate_to_usd'] ?? row['fxRateToUsd']),
    fxRateDate: asDateString(row['fx_rate_date'] ?? row['fxRateDate']),
    pricePerShare: asNullableString(row['price_per_share'] ?? row['pricePerShare']),
    postMoneyValuation: asNullableString(row['post_money_valuation'] ?? row['postMoneyValuation']),
    valuationCap: asNullableString(row['valuation_cap'] ?? row['valuationCap']),
    conversionDiscountRate: asNullableString(
      row['conversion_discount_rate'] ?? row['conversionDiscountRate']
    ),
    interestRate: asNullableString(row['interest_rate'] ?? row['interestRate']),
    maturityDate: asNullableDateString(row['maturity_date'] ?? row['maturityDate']),
    liquidationPreferenceMultiple: asNullableString(
      row['liquidation_preference_multiple'] ?? row['liquidationPreferenceMultiple']
    ),
    participatingPreferred: asNullableBoolean(
      row['participating_preferred'] ?? row['participatingPreferred']
    ),
    participationCapMultiple: asNullableString(
      row['participation_cap_multiple'] ?? row['participationCapMultiple']
    ),
    proRataRightsPct: asNullableString(row['pro_rata_rights_pct'] ?? row['proRataRightsPct']),
    descriptiveTerms: asRecord(row['descriptive_terms'] ?? row['descriptiveTerms'] ?? {}),
    calculationEligible: asBoolean(row['calculation_eligible'] ?? row['calculationEligible']),
    sourceObservationId: asNullablePositiveInt(
      row['source_observation_id'] ?? row['sourceObservationId']
    ),
    createdBy: asNullablePositiveInt(row['created_by'] ?? row['createdBy']),
    idempotencyKey: asString(row['idempotency_key'] ?? row['idempotencyKey']),
    requestHash: asString(row['request_hash'] ?? row['requestHash']),
    createdAt: asDate(row['created_at'] ?? row['createdAt']),
  };
}

function readRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result === null || typeof result !== 'object') return [];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function readInsertedId(result: unknown): number {
  const id = readRows(result)[0]?.['id'];
  return asPositiveInt(id);
}

function asPositiveInt(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new FinancingLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Database returned an invalid positive integer.'
    );
  }
  return parsed;
}

function asNonnegativeInt(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new FinancingLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Database returned an invalid count.'
    );
  }
  return parsed;
}

function asNullablePositiveInt(value: unknown): number | null {
  return value === null || value === undefined ? null : asPositiveInt(value);
}

function asString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new FinancingLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Database returned an invalid string.'
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

function asNullableDateString(value: unknown): string | null {
  return value === null || value === undefined ? null : asDateString(value);
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  throw new FinancingLedgerServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned an invalid timestamp.'
  );
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  throw new FinancingLedgerServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned an invalid boolean.'
  );
}

function asNullableBoolean(value: unknown): boolean | null {
  return value === null || value === undefined ? null : asBoolean(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return asRecord(JSON.parse(value) as unknown);
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new FinancingLedgerServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned invalid descriptive terms.'
  );
}

export { IdempotentCommandError };
