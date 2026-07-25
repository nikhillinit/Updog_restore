import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import { IdempotentCommandError, runIdempotentCommand } from '../../lib/idempotent-command';
import {
  CorrectFinancingTrancheRequestSchema,
  FinancingTrancheV1Schema,
  LEDGER_CONTRACT_VERSION,
  USD_FX_RATE_TO_USD,
  investmentLedgerMoneyProjection,
  type CorrectFinancingTrancheRequest,
  type FinancingTrancheV1,
} from '../../../shared/contracts/investment-ledger/financing-event.contract';
import {
  VehicleParticipationErrorCodeSchema,
  VehicleFinancingParticipationV1Schema,
  type VehicleFinancingParticipationV1,
  type VehicleParticipationErrorCode,
} from '../../../shared/contracts/investment-ledger/participation.contract';
import { dependencyGroupKeyForObservation } from '../../../shared/contracts/financial-observations/reconciliation-api.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { Decimal } from '../../../shared/lib/decimal-config';
import { resolveEffectiveTerms } from '../../../shared/lib/investment-ledger/effective-terms';
import {
  projectParticipationCompatibility,
  type ParticipationCompatibilityProjection,
} from '../../../shared/lib/investment-ledger/participation-quantization';
import { normalizeManualObservation } from '../financial-observations/manual-entry-adapter';
import { invalidateH9Artifacts } from '../h9-artifact-invalidation-service';

type LedgerDatabase = typeof db;

interface LedgerCorrectionContext {
  fundId: number;
  trancheId: number;
  actorId: number | null;
  idempotencyKey: string;
  request: unknown;
  database?: LedgerDatabase;
}

export interface LedgerCorrectionReceiptV1 {
  correctedTranche: FinancingTrancheV1;
  participationSuccessors: VehicleFinancingParticipationV1[];
  warnings: VehicleParticipationErrorCode[];
  reconciliationCaseIds: number[];
  compat: {
    rewrittenParticipationIds: number[];
    unchangedParticipationIds: number[];
    removedLotParticipationIds: number[];
    emittedLotParticipationIds: number[];
  };
}

const ReceiptPositiveIntSchema = z.number().int().positive();
const LedgerCorrectionReceiptV1Schema = z
  .object({
    correctedTranche: FinancingTrancheV1Schema,
    participationSuccessors: z.array(VehicleFinancingParticipationV1Schema),
    warnings: z.array(VehicleParticipationErrorCodeSchema),
    reconciliationCaseIds: z.array(ReceiptPositiveIntSchema),
    compat: z
      .object({
        rewrittenParticipationIds: z.array(ReceiptPositiveIntSchema),
        unchangedParticipationIds: z.array(ReceiptPositiveIntSchema),
        removedLotParticipationIds: z.array(ReceiptPositiveIntSchema),
        emittedLotParticipationIds: z.array(ReceiptPositiveIntSchema),
      })
      .strict(),
  })
  .strict();

export interface LedgerCommandResult<T> {
  value: T;
  replayed: boolean;
}

export type LedgerCorrectionServiceErrorCode =
  | 'FINANCING_TRANCHE_NOT_CURRENT'
  | 'FINANCING_TRANCHE_CONFLICT'
  | 'PARTICIPATION_SET_MISMATCH'
  | 'PARTICIPATION_VERSION_CONFLICT'
  | 'IDENTITY_LINK_REQUIRED'
  | 'IDENTITY_LINK_AMBIGUOUS'
  | 'LEDGER_WRITE_FAILED'
  | 'NORMALIZATION_REJECTED';

export class LedgerCorrectionServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: LedgerCorrectionServiceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'LedgerCorrectionServiceError';
    this.statusCode = status;
  }
}

const PositiveIntSchema = z.number().int().positive();
const PositiveMoneyOverrideSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.\d{6}$/)
  .refine((value) => new Decimal(value).gt(0), 'Amount must be greater than zero.');
const PositiveFxOverrideSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.\d{10}$/)
  .refine((value) => new Decimal(value).gt(0), 'FX rate must be greater than zero.');
const PositiveSharesOverrideSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.\d{8}$/)
  .refine((value) => new Decimal(value).gt(0), 'Shares must be greater than zero.');
const OverrideAdjustmentsSchema = z
  .object({
    participationAmount: PositiveMoneyOverrideSchema.optional(),
    originalAmount: PositiveMoneyOverrideSchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    fxRateToUsd: PositiveFxOverrideSchema.optional(),
    fxRateDate: z.string().date().optional(),
    sharesAcquired: PositiveSharesOverrideSchema.optional(),
    closingDate: z.string().date().optional(),
    pricePerShare: z
      .string()
      .regex(/^(?:0|[1-9]\d*)\.\d{6}$/)
      .optional(),
    postMoneyValuation: z
      .string()
      .regex(/^(?:0|[1-9]\d*)\.\d{6}$/)
      .optional(),
    valuationCap: z
      .string()
      .regex(/^(?:0|[1-9]\d*)\.\d{6}$/)
      .optional(),
    conversionDiscountRate: z
      .string()
      .regex(/^-?(?:0|[1-9]\d*)\.\d{8}$/)
      .optional(),
    interestRate: z
      .string()
      .regex(/^-?(?:0|[1-9]\d*)\.\d{8}$/)
      .optional(),
    liquidationPreferenceMultiple: z
      .string()
      .regex(/^-?(?:0|[1-9]\d*)\.\d{8}$/)
      .optional(),
    participatingPreferred: z.boolean().optional(),
    participationCapMultiple: z
      .string()
      .regex(/^-?(?:0|[1-9]\d*)\.\d{8}$/)
      .optional(),
    proRataRightsPct: z
      .string()
      .regex(/^-?(?:0|[1-9]\d*)\.\d{8}$/)
      .optional(),
    maturityDate: z.string().date().optional(),
    descriptiveTerms: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const DependentAcknowledgementsSchema = z
  .object({
    termsReviewed: z.literal(true),
    compatibilityRewriteAccepted: z.literal(true),
  })
  .strict();

const LedgerCorrectionRequestSchema = z
  .object({
    expectedTrancheVersion: PositiveIntSchema,
    correctedTranche: CorrectFinancingTrancheRequestSchema,
    dependents: z
      .array(
        z
          .object({
            participationId: PositiveIntSchema,
            expectedVersion: PositiveIntSchema,
            acknowledgements: DependentAcknowledgementsSchema,
            overrideAdjustments: OverrideAdjustmentsSchema.optional(),
          })
          .strict()
      )
      .default([]),
  })
  .strict();

type LedgerCorrectionRequest = z.output<typeof LedgerCorrectionRequestSchema>;
type DependentCorrectionRequest = LedgerCorrectionRequest['dependents'][number];

interface FinancingTrancheRow extends FinancingTrancheV1 {
  idempotencyKey: string;
  requestHash: string;
}

interface ParticipationRow extends VehicleFinancingParticipationV1 {
  idempotencyKey: string;
  requestHash: string;
}

interface InvestmentRow {
  id: number;
  version: number;
}

interface RoundRow {
  id: number;
}

interface CashFlowRow {
  id: number;
  status: string;
}

interface ObservationContext {
  companyIdentityId: number;
  companyName: string;
  portfolioCompanyId: number;
  roundName: string;
}

interface CompatibilityChange {
  rewritten: boolean;
  moneyRowsChanged: boolean;
  lotChanged: boolean;
  oldProjection: ParticipationCompatibilityProjection;
  newProjection: ParticipationCompatibilityProjection;
}

export async function correctVehicleParticipationLedger(
  input: LedgerCorrectionContext
): Promise<LedgerCommandResult<LedgerCorrectionReceiptV1>> {
  const database = input.database ?? db;
  const earlyReplay = await replayExistingCorrectionBeforeParse(database, input);
  if (earlyReplay) return earlyReplay;

  const request = LedgerCorrectionRequestSchema.parse(input.request);
  await assertLedgerOwnership(database, input.fundId, 'financing_tranche', input.trancheId);

  const result = await database.transaction(async (transaction) => {
    await lockFundIdentity(transaction, input.fundId);
    const currentEventId = await selectCurrentTrancheEventId(
      transaction,
      input.fundId,
      input.trancheId
    );
    if (currentEventId !== null) {
      await lockFinancingEvent(transaction, input.fundId, currentEventId);
    }

    return runIdempotentCommand<LedgerCorrectionReceiptV1>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      contractVersion: LEDGER_CONTRACT_VERSION,
      request: {
        fundId: input.fundId,
        contractVersion: LEDGER_CONTRACT_VERSION,
        trancheId: input.trancheId,
        expectedTrancheVersion: request.expectedTrancheVersion,
        correctedTranche: request.correctedTranche,
        dependents: request.dependents,
        money: investmentLedgerMoneyProjection(request.correctedTranche),
      },
      loadExisting: async () =>
        selectReceiptByIdempotency(transaction, input.fundId, input.idempotencyKey),
      insert: async (requestHash) => {
        const existing = await selectReceiptByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        if (existing) return null;

        const current = await selectCurrentTrancheForUpdate(
          transaction,
          input.fundId,
          input.trancheId
        );
        if (!current) {
          throw new LedgerCorrectionServiceError(
            409,
            'FINANCING_TRANCHE_NOT_CURRENT',
            'Only the current tranche version can be corrected.'
          );
        }
        if (current.version !== request.expectedTrancheVersion) {
          throw new LedgerCorrectionServiceError(
            409,
            'FINANCING_TRANCHE_CONFLICT',
            'The tranche version changed before the correction could be applied.',
            { expectedVersion: request.expectedTrancheVersion, actualVersion: current.version }
          );
        }

        const dependents = await selectDependentParticipationsForUpdate(
          transaction,
          input.fundId,
          input.trancheId
        );
        assertCompleteDependentSet(dependents, request.dependents);

        const observationContext = await loadObservationContext(
          transaction,
          input.fundId,
          current.financingEventId
        );
        const newTranche = await supersedeTranche(
          transaction,
          input,
          current,
          request,
          requestHash,
          observationContext
        );
        const receipt = await cascadeParticipationSuccessors(transaction, {
          input,
          currentTranche: current,
          newTranche,
          request,
          dependents,
          context: observationContext,
        });
        await persistCorrectionReceipt(
          transaction,
          input.fundId,
          newTranche.sourceObservationId,
          receipt
        );

        return receipt;
      },
    });
  });

  if (!result.replayed) {
    await invalidateH9Artifacts(input.fundId);
  }

  return { value: result.row, replayed: result.replayed };
}

async function replayExistingCorrectionBeforeParse(
  database: LedgerDatabase,
  input: LedgerCorrectionContext
): Promise<LedgerCommandResult<LedgerCorrectionReceiptV1> | null> {
  const existing = await selectReceiptByIdempotency(database, input.fundId, input.idempotencyKey);
  if (!existing) return null;

  const parsed = LedgerCorrectionRequestSchema.safeParse(input.request);
  if (parsed.success) {
    const requestHash = canonicalSha256({
      fundId: input.fundId,
      contractVersion: LEDGER_CONTRACT_VERSION,
      trancheId: input.trancheId,
      expectedTrancheVersion: parsed.data.expectedTrancheVersion,
      correctedTranche: parsed.data.correctedTranche,
      dependents: parsed.data.dependents,
      money: investmentLedgerMoneyProjection(parsed.data.correctedTranche),
    });
    if (requestHash !== existing.requestHash) {
      throw new IdempotentCommandError(
        409,
        'IDEMPOTENCY_KEY_REUSE',
        'Idempotency-Key was already used for a different request.',
        { idempotencyKey: input.idempotencyKey }
      );
    }
  }
  return { value: existing.row, replayed: true };
}

async function selectReceiptByIdempotency(
  database: LedgerDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<{ row: LedgerCorrectionReceiptV1; requestHash: string } | null> {
  const owners = await selectIdempotencyKeyOwners(database, fundId, idempotencyKey);
  if (owners.length === 0) return null;
  if (owners.some((owner) => owner !== 'financing_tranches')) {
    throw new IdempotentCommandError(
      409,
      'IDEMPOTENCY_KEY_REUSE',
      'Idempotency-Key was already used for a different ledger command.',
      { idempotencyKey }
    );
  }

  const tranche = await selectTrancheByIdempotency(database, fundId, idempotencyKey);
  if (!tranche) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Stored correction tranche owner could not be found.'
    );
  }
  if (tranche.sourceObservationId === null) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Stored correction tranche is missing its receipt observation.'
    );
  }
  const observation = readRows(
    await database.execute(sql`
      SELECT normalized_payload
      FROM source_observations
      WHERE id = ${tranche.sourceObservationId}
        AND fund_id = ${fundId}
      LIMIT 1
    `)
  )[0];
  if (!observation) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Stored correction receipt observation could not be found.'
    );
  }
  const payload = asRecord(observation['normalized_payload']);
  const storedReceipt = payload['ledgerCorrectionReceipt'];
  if (storedReceipt === undefined) {
    throw new IdempotentCommandError(
      409,
      'IDEMPOTENCY_KEY_REUSE',
      'Idempotency-Key was already used for a different ledger command.',
      { idempotencyKey }
    );
  }
  const parsedReceipt = LedgerCorrectionReceiptV1Schema.safeParse(storedReceipt);
  if (!parsedReceipt.success) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Stored correction receipt is missing or invalid.'
    );
  }
  return {
    row: parsedReceipt.data,
    requestHash: tranche.requestHash,
  };
}

async function selectIdempotencyKeyOwners(
  database: LedgerDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<string[]> {
  return readRows(
    await database.execute(sql`
      SELECT command_table
      FROM (
        SELECT 'financing_events' AS command_table
        FROM financing_events
        WHERE fund_id = ${fundId}
          AND idempotency_key = ${idempotencyKey}
        UNION ALL
        SELECT 'financing_tranches' AS command_table
        FROM financing_tranches
        WHERE fund_id = ${fundId}
          AND idempotency_key = ${idempotencyKey}
        UNION ALL
        SELECT 'vehicle_financing_participations' AS command_table
        FROM vehicle_financing_participations
        WHERE fund_id = ${fundId}
          AND idempotency_key = ${idempotencyKey}
      ) AS ledger_command_idempotency_owners
    `)
  ).map((row) => asString(row['command_table']));
}

async function persistCorrectionReceipt(
  database: LedgerDatabase,
  fundId: number,
  observationId: number | null,
  receipt: LedgerCorrectionReceiptV1
): Promise<void> {
  if (observationId === null) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Correction receipt cannot persist without a tranche observation.'
    );
  }
  const row = readRows(
    await database.execute(sql`
      SELECT normalized_payload
      FROM source_observations
      WHERE id = ${observationId}
        AND fund_id = ${fundId}
      LIMIT 1
      FOR UPDATE
    `)
  )[0];
  if (!row) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Correction receipt observation could not be found.'
    );
  }
  const normalizedPayload = {
    ...asRecord(row['normalized_payload']),
    ledgerCorrectionReceipt: LedgerCorrectionReceiptV1Schema.parse(receipt),
  };
  const updated = readRows(
    await database.execute(sql`
      UPDATE source_observations
      SET normalized_payload = ${JSON.stringify(normalizedPayload)}::jsonb,
          observation_hash = ${canonicalSha256(normalizedPayload)}
      WHERE id = ${observationId}
        AND fund_id = ${fundId}
      RETURNING id
    `)
  );
  if (updated.length !== 1) {
    throw new LedgerCorrectionServiceError(
      409,
      'LEDGER_WRITE_FAILED',
      'Correction receipt observation changed concurrently.'
    );
  }
}

async function assertLedgerOwnership(
  database: LedgerDatabase,
  fundId: number,
  kind: 'financing_tranche',
  id: number
): Promise<void> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind, id },
  });
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

async function lockFundIdentity(database: LedgerDatabase, fundId: number): Promise<void> {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`fund-identity:${fundId}`}))`);
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

async function selectCurrentTrancheForUpdate(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number
): Promise<FinancingTrancheRow | null> {
  return firstTranche(
    await database.execute(sql`
      SELECT *
      FROM financing_tranches
      WHERE id = ${trancheId}
        AND fund_id = ${fundId}
        AND superseded_by_tranche_id IS NULL
      FOR UPDATE
    `)
  );
}

async function selectTrancheByIdempotency(
  database: LedgerDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<FinancingTrancheRow | null> {
  return firstTranche(
    await database.execute(sql`
      SELECT *
      FROM financing_tranches
      WHERE fund_id = ${fundId}
        AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `)
  );
}

async function selectDependentParticipationsForUpdate(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number
): Promise<ParticipationRow[]> {
  return readRows(
    await database.execute(sql`
      SELECT *
      FROM vehicle_financing_participations
      WHERE fund_id = ${fundId}
        AND financing_tranche_id = ${trancheId}
        AND superseded_by_participation_id IS NULL
      ORDER BY id
      FOR UPDATE
    `)
  ).map(participationFromRow);
}

function assertCompleteDependentSet(
  currentDependents: ParticipationRow[],
  requestedDependents: DependentCorrectionRequest[]
): void {
  const seen = new Set<number>();
  const duplicates = requestedDependents
    .map((dependent) => dependent.participationId)
    .filter((id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
  if (duplicates.length > 0) {
    throw participationSetMismatch('Duplicate dependent participations are not allowed.', {
      duplicateIds: [...new Set(duplicates)],
    });
  }

  const currentById = new Map(currentDependents.map((dependent) => [dependent.id, dependent]));
  const requestedById = new Map(
    requestedDependents.map((dependent) => [dependent.participationId, dependent])
  );
  const omitted = currentDependents
    .filter((dependent) => !requestedById.has(dependent.id))
    .map((dependent) => dependent.id);
  const extra = requestedDependents
    .filter((dependent) => !currentById.has(dependent.participationId))
    .map((dependent) => dependent.participationId);
  if (omitted.length > 0 || extra.length > 0) {
    throw participationSetMismatch('Dependent participation set must be complete and exact.', {
      omittedIds: omitted,
      extraIds: extra,
    });
  }

  const stale = requestedDependents
    .filter((dependent) => {
      const current = currentById.get(dependent.participationId);
      return current !== undefined && current.version !== dependent.expectedVersion;
    })
    .map((dependent) => ({
      participationId: dependent.participationId,
      expectedVersion: dependent.expectedVersion,
      actualVersion: currentById.get(dependent.participationId)?.version,
    }));
  if (stale.length > 0) {
    throw new LedgerCorrectionServiceError(
      409,
      'PARTICIPATION_VERSION_CONFLICT',
      'One or more dependent participation versions are stale.',
      { stale }
    );
  }
}

function participationSetMismatch(
  message: string,
  details: Readonly<Record<string, unknown>>
): LedgerCorrectionServiceError {
  return new LedgerCorrectionServiceError(409, 'PARTICIPATION_SET_MISMATCH', message, details);
}

async function supersedeTranche(
  database: LedgerDatabase,
  input: LedgerCorrectionContext,
  current: FinancingTrancheRow,
  request: LedgerCorrectionRequest,
  requestHash: string,
  observationContext: ObservationContext
): Promise<FinancingTrancheRow> {
  const newId = readInsertedId(
    await database.execute(sql`SELECT nextval('financing_tranches_id_seq') AS id`)
  );
  const inserted = firstTranche(
    await database.execute(sql`
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
        ${request.correctedTranche.closingDate}, ${request.correctedTranche.securityType},
        ${request.correctedTranche.investmentAmount}, ${request.correctedTranche.originalAmount},
        ${request.correctedTranche.currency}, ${request.correctedTranche.fxRateToUsd},
        ${request.correctedTranche.fxRateDate}, ${request.correctedTranche.pricePerShare ?? null},
        ${request.correctedTranche.postMoneyValuation ?? null},
        ${request.correctedTranche.valuationCap ?? null},
        ${request.correctedTranche.conversionDiscountRate ?? null},
        ${request.correctedTranche.interestRate ?? null},
        ${request.correctedTranche.maturityDate ?? null},
        ${request.correctedTranche.liquidationPreferenceMultiple ?? null},
        ${request.correctedTranche.participatingPreferred ?? null},
        ${request.correctedTranche.participationCapMultiple ?? null},
        ${request.correctedTranche.proRataRightsPct ?? null},
        ${JSON.stringify(request.correctedTranche.descriptiveTerms)}::jsonb,
        ${request.correctedTranche.calculationEligible}, NULL, ${input.actorId},
        ${input.idempotencyKey}, ${requestHash}
      )
      RETURNING *
    `)
  );
  if (!inserted) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Corrected tranche insert returned no row.'
    );
  }

  const superseded = readRows(
    await database.execute(sql`
      UPDATE financing_tranches
      SET superseded_by_tranche_id = ${newId}
      WHERE id = ${current.id}
        AND fund_id = ${input.fundId}
        AND version = ${request.expectedTrancheVersion}
        AND superseded_by_tranche_id IS NULL
      RETURNING id
    `)
  );
  if (superseded.length !== 1) {
    throw new LedgerCorrectionServiceError(
      409,
      'FINANCING_TRANCHE_CONFLICT',
      'The tranche head changed concurrently; retry the correction.'
    );
  }

  const observationId = await insertManualObservation(database, {
    fundId: input.fundId,
    companyIdentityId: observationContext.companyIdentityId,
    companyName: observationContext.companyName,
    sourceLocator: `financing-event:${current.financingEventId}:tranche:${current.trancheKey}`,
    measureKey: await loadPriorObservationMeasureKey(
      database,
      input.fundId,
      current.sourceObservationId
    ),
    effectiveDate: request.correctedTranche.closingDate,
    amount: request.correctedTranche.investmentAmount,
    version: current.version + 1,
  });

  return updateTrancheObservation(database, input.fundId, newId, observationId);
}

async function cascadeParticipationSuccessors(
  database: LedgerDatabase,
  context: {
    input: LedgerCorrectionContext;
    currentTranche: FinancingTrancheRow;
    newTranche: FinancingTrancheRow;
    request: LedgerCorrectionRequest;
    dependents: ParticipationRow[];
    context: ObservationContext;
  }
): Promise<LedgerCorrectionReceiptV1> {
  const successors: ParticipationRow[] = [];
  const warnings: VehicleParticipationErrorCode[] = [];
  const reconciliationCaseIds: number[] = [];
  const rewrittenParticipationIds: number[] = [];
  const unchangedParticipationIds: number[] = [];
  const removedLotParticipationIds: number[] = [];
  const emittedLotParticipationIds: number[] = [];
  const dependentRequests = new Map(
    context.request.dependents.map((dependent) => [dependent.participationId, dependent])
  );

  for (const dependent of context.dependents) {
    const dependentRequest = dependentRequests.get(dependent.id);
    if (!dependentRequest) {
      throw new LedgerCorrectionServiceError(
        500,
        'LEDGER_WRITE_FAILED',
        'Validated dependent request was missing during cascade.'
      );
    }

    const oldTerms = resolveEffectiveTerms(
      financingTrancheDto(context.currentTranche),
      participationDto(dependent)
    );
    const successor = await supersedeParticipation(database, {
      input: context.input,
      current: dependent,
      newTranche: context.newTranche,
      dependentRequest,
    });
    const newTerms = resolveEffectiveTerms(
      financingTrancheDto(context.newTranche),
      participationDto(successor)
    );
    const oldProjection = projectParticipationCompatibility(oldTerms);
    const newProjection = projectParticipationCompatibility(newTerms);
    for (const warning of newProjection.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }

    const visibleRowsChanged =
      compatibilityVisibleProjectionHash(oldProjection, oldTerms, context.context.roundName) !==
      compatibilityVisibleProjectionHash(newProjection, newTerms, context.context.roundName);
    const cashFlowChanged =
      cashFlowProjectionHash(oldProjection, oldTerms) !==
      cashFlowProjectionHash(newProjection, newTerms);
    const lotChanged = lotProjectionHash(oldProjection) !== lotProjectionHash(newProjection);
    const change = {
      rewritten: visibleRowsChanged || lotChanged,
      moneyRowsChanged: visibleRowsChanged,
      lotChanged,
      oldProjection,
      newProjection,
    };
    if (change.rewritten) {
      rewrittenParticipationIds.push(successor.id);
    } else {
      unchangedParticipationIds.push(successor.id);
    }
    const lotStatus = await rewriteCompatibilityRows(database, {
      input: context.input,
      observationContext: context.context,
      oldParticipation: dependent,
      successor,
      tranche: context.newTranche,
      priorProjection: oldProjection,
      projection: newProjection,
      priorTerms: oldTerms,
      terms: newTerms,
      rewriteCashFlow: cashFlowChanged,
      rewriteLot: lotChanged,
    });
    if (lotStatus.removed) removedLotParticipationIds.push(successor.id);
    if (lotStatus.emitted) emittedLotParticipationIds.push(successor.id);

    const observationId = await insertParticipationObservation(database, {
      input: context.input,
      observationContext: context.context,
      participation: successor,
      tranche: context.newTranche,
      projection: newProjection,
      compatibilityChange: change,
      measureKey: await loadPriorObservationMeasureKey(
        database,
        context.input.fundId,
        dependent.sourceObservationId
      ),
    });
    await updateParticipationObservation(
      database,
      context.input.fundId,
      successor.id,
      observationId
    );
    reconciliationCaseIds.push(
      await insertObservationMatchCase(database, context.input.fundId, observationId)
    );
    successors.push(successor);
  }

  return {
    correctedTranche: financingTrancheDto(context.newTranche),
    participationSuccessors: successors.map(participationDto),
    warnings,
    reconciliationCaseIds,
    compat: {
      rewrittenParticipationIds,
      unchangedParticipationIds,
      removedLotParticipationIds,
      emittedLotParticipationIds,
    },
  };
}

async function supersedeParticipation(
  database: LedgerDatabase,
  context: {
    input: LedgerCorrectionContext;
    current: ParticipationRow;
    newTranche: FinancingTrancheRow;
    dependentRequest: DependentCorrectionRequest;
  }
): Promise<ParticipationRow> {
  const overrides = context.dependentRequest.overrideAdjustments ?? {};
  const newId = readInsertedId(
    await database.execute(sql`SELECT nextval('vehicle_financing_participations_id_seq') AS id`)
  );
  const inserted = firstParticipation(
    await database.execute(sql`
      INSERT INTO vehicle_financing_participations (
        id, fund_id, vehicle_id, financing_event_id, tranche_key, financing_tranche_id,
        version, superseded_by_participation_id, participation_amount, original_amount,
        currency, fx_rate_to_usd, fx_rate_date, shares_acquired, closing_date,
        price_per_share, post_money_valuation, valuation_cap, conversion_discount_rate,
        interest_rate, liquidation_preference_multiple, participating_preferred,
        participation_cap_multiple, pro_rata_rights_pct, maturity_date, descriptive_terms,
        confirmed_duplicates, source_observation_id, created_by, idempotency_key, request_hash
      ) VALUES (
        ${newId}, ${context.input.fundId}, ${context.current.vehicleId},
        ${context.current.financingEventId}, ${context.current.trancheKey}, ${context.newTranche.id},
        ${context.current.version + 1}, ${context.current.id},
        ${overrides.participationAmount ?? context.current.participationAmount},
        ${overrides.originalAmount ?? context.current.originalAmount},
        ${overrides.currency ?? context.current.currency},
        ${overrides.fxRateToUsd ?? context.current.fxRateToUsd},
        ${overrides.fxRateDate ?? context.current.fxRateDate},
        ${overrides.sharesAcquired ?? context.current.sharesAcquired},
        ${overrides.closingDate ?? context.current.closingDate},
        ${overrides.pricePerShare ?? context.current.pricePerShare},
        ${overrides.postMoneyValuation ?? context.current.postMoneyValuation},
        ${overrides.valuationCap ?? context.current.valuationCap},
        ${overrides.conversionDiscountRate ?? context.current.conversionDiscountRate},
        ${overrides.interestRate ?? context.current.interestRate},
        ${overrides.liquidationPreferenceMultiple ?? context.current.liquidationPreferenceMultiple},
        ${overrides.participatingPreferred ?? context.current.participatingPreferred},
        ${overrides.participationCapMultiple ?? context.current.participationCapMultiple},
        ${overrides.proRataRightsPct ?? context.current.proRataRightsPct},
        ${overrides.maturityDate ?? context.current.maturityDate},
        ${JSON.stringify(overrides.descriptiveTerms ?? context.current.descriptiveTerms)}::jsonb,
        ${JSON.stringify(context.current.confirmedDuplicates)}::jsonb, NULL, ${context.input.actorId},
        ${`vfp:${newId}:v${context.current.version + 1}:correction`},
        ${canonicalSha256({
          source: 'vehicle_participation_correction',
          fundId: context.input.fundId,
          participationId: newId,
          version: context.current.version + 1,
          correctedTrancheId: context.newTranche.id,
        })}
      )
      RETURNING *
    `)
  );
  if (!inserted) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Participation successor insert returned no row.'
    );
  }

  const updated = readRows(
    await database.execute(sql`
      UPDATE vehicle_financing_participations
      SET superseded_by_participation_id = ${newId}
      WHERE id = ${context.current.id}
        AND fund_id = ${context.input.fundId}
        AND version = ${context.dependentRequest.expectedVersion}
        AND superseded_by_participation_id IS NULL
      RETURNING id
    `)
  );
  if (updated.length !== 1) {
    throw new LedgerCorrectionServiceError(
      409,
      'PARTICIPATION_VERSION_CONFLICT',
      'A participation head changed concurrently; retry the correction.'
    );
  }
  await database.execute(sql`
    UPDATE vehicle_financing_participations
    SET superseded_by_participation_id = NULL
    WHERE id = ${newId}
      AND fund_id = ${context.input.fundId}
  `);
  return { ...inserted, supersededByParticipationId: null };
}

async function rewriteCompatibilityRows(
  database: LedgerDatabase,
  context: {
    input: LedgerCorrectionContext;
    observationContext: ObservationContext;
    oldParticipation: ParticipationRow;
    successor: ParticipationRow;
    tranche: FinancingTrancheRow;
    priorProjection: ParticipationCompatibilityProjection;
    projection: ParticipationCompatibilityProjection;
    priorTerms: ReturnType<typeof resolveEffectiveTerms>;
    terms: ReturnType<typeof resolveEffectiveTerms>;
    rewriteCashFlow: boolean;
    rewriteLot: boolean;
  }
): Promise<{ removed: boolean; emitted: boolean }> {
  const investment = await selectInvestmentForParticipation(
    database,
    context.input.fundId,
    context.oldParticipation.id
  );
  if (!investment) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Participation correction could not find its compat investment.'
    );
  }
  const updatedInvestments = readRows(
    await database.execute(sql`
      UPDATE investments
      SET amount = ${context.projection.investmentAmount},
          round = ${truncateRoundLabel(context.observationContext.roundName)},
          investment_date = ${midnightUtc(context.terms.closingDate)},
          valuation_at_investment = ${formatNullableMoney(context.terms.postMoneyValuation)},
          share_price_cents = ${context.projection.lot?.sharePriceCents ?? null},
          shares_acquired = ${context.projection.lot?.sharesAcquired ?? null},
          cost_basis_cents = ${context.projection.lot?.costBasisCents ?? null},
          vehicle_participation_id = ${context.successor.id},
          version = version + 1
      WHERE id = ${investment.id}
        AND fund_id = ${context.input.fundId}
        AND version = ${investment.version}
      RETURNING id
    `)
  );
  if (updatedInvestments.length !== 1) {
    throw new LedgerCorrectionServiceError(
      409,
      'PARTICIPATION_VERSION_CONFLICT',
      'The participation compat investment changed concurrently; retry the correction.'
    );
  }

  const priorRound = await selectActiveRoundForParticipation(
    database,
    context.input.fundId,
    context.oldParticipation.id
  );
  if (!priorRound) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Participation correction could not find its active compat investment round.'
    );
  }
  await database.execute(sql`
    INSERT INTO investment_rounds (
      investment_id, fund_id, round_name, security_type, round_date, currency,
      investment_amount, idempotency_key, request_hash, supersedes_round_id,
      financing_tranche_id, imported_from, vehicle_participation_id, created_by
    ) VALUES (
      ${investment.id}, ${context.input.fundId}, ${truncateRoundLabel(context.observationContext.roundName)},
      ${context.terms.securityType}, ${context.terms.closingDate}, 'USD',
      ${context.projection.roundInvestmentAmount}, ${`vfp:${context.successor.id}:v${context.successor.version}:round`},
      ${canonicalSha256({
        source: 'vehicle_participation',
        role: 'round',
        participationId: context.successor.id,
        participationVersion: context.successor.version,
      })},
      ${priorRound.id}, ${context.tranche.id}, 'vehicle_participation',
      ${context.successor.id}, ${context.input.actorId}
    )
  `);

  const priorCashFlow = await selectOriginalCashFlowForParticipation(
    database,
    context.input.fundId,
    context.oldParticipation.id
  );
  if (!priorCashFlow) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Participation correction could not find its active compat cash-flow event.'
    );
  }
  if (context.rewriteCashFlow) {
    await reverseAndReplaceCashFlow(database, context, priorCashFlow);
  } else {
    await relinkCashFlow(database, {
      input: context.input,
      oldParticipation: context.oldParticipation,
      successor: context.successor,
      priorCashFlow,
    });
  }

  let deletedLots: Array<Record<string, unknown>> = [];
  if (context.rewriteLot) {
    if (context.priorProjection.lot) {
      deletedLots = readRows(
        await database.execute(sql`
          DELETE FROM investment_lots
          WHERE investment_id = ${investment.id}
            AND vehicle_participation_id = ${context.oldParticipation.id}
          RETURNING id
        `)
      );
      assertExactlyOneLotRow(deletedLots.length);
    }
    if (context.projection.lot) {
      await database.execute(sql`
        INSERT INTO investment_lots (
          investment_id, lot_type, share_price_cents, shares_acquired, cost_basis_cents,
          idempotency_key, imported_from, vehicle_participation_id
        ) VALUES (
          ${investment.id}, 'initial', ${context.projection.lot.sharePriceCents},
          ${context.projection.lot.sharesAcquired}, ${context.projection.lot.costBasisCents},
          ${`vfp:${context.successor.id}:v${context.successor.version}:lot:initial`},
          'vehicle_participation', ${context.successor.id}
        )
      `);
    }
  } else if (context.priorProjection.lot) {
    const updatedLots = readRows(
      await database.execute(sql`
        UPDATE investment_lots
        SET vehicle_participation_id = ${context.successor.id}
        WHERE investment_id = ${investment.id}
          AND vehicle_participation_id = ${context.oldParticipation.id}
        RETURNING id
      `)
    );
    assertExactlyOneLotRow(updatedLots.length);
  }

  return {
    removed: context.rewriteLot && deletedLots.length > 0 && !context.projection.lot,
    emitted: context.rewriteLot && !!context.projection.lot,
  };
}

function assertExactlyOneLotRow(rowCount: number): void {
  if (rowCount !== 1) {
    throw new LedgerCorrectionServiceError(
      409,
      'PARTICIPATION_VERSION_CONFLICT',
      'The participation compat lot changed concurrently; retry the correction.'
    );
  }
}

async function reverseAndReplaceCashFlow(
  database: LedgerDatabase,
  context: {
    input: LedgerCorrectionContext;
    observationContext: ObservationContext;
    oldParticipation: ParticipationRow;
    successor: ParticipationRow;
    tranche: FinancingTrancheRow;
    priorProjection: ParticipationCompatibilityProjection;
    projection: ParticipationCompatibilityProjection;
    priorTerms: ReturnType<typeof resolveEffectiveTerms>;
    terms: ReturnType<typeof resolveEffectiveTerms>;
  },
  priorCashFlow: CashFlowRow
): Promise<void> {
  if (priorCashFlow.status === 'locked') {
    throw new LedgerCorrectionServiceError(
      409,
      'LEDGER_WRITE_FAILED',
      'Locked cash-flow events cannot be corrected by participation cascade.'
    );
  }
  const reversed = readRows(
    await database.execute(sql`
      UPDATE cash_flow_events
      SET status = 'reversed'
      WHERE id = ${priorCashFlow.id}
        AND fund_id = ${context.input.fundId}
        AND status = 'approved'
      RETURNING id
    `)
  );
  if (reversed.length !== 1) {
    throw new LedgerCorrectionServiceError(
      409,
      'PARTICIPATION_VERSION_CONFLICT',
      'The participation cash-flow head changed concurrently; retry the correction.'
    );
  }
  await database.execute(sql`
    INSERT INTO cash_flow_events (
      fund_id, vehicle_id, company_id, event_type, amount, currency, event_date,
      perspective, description, payload, status, reversal_of_event_id,
      imported_from, vehicle_participation_id, source_hash, created_by
    ) VALUES (
      ${context.input.fundId}, ${context.successor.vehicleId},
      ${context.observationContext.portfolioCompanyId}, 'reversal',
      ${context.priorProjection.cashFlowAmount}, 'USD', ${midnightUtc(context.priorTerms.closingDate)},
      'vehicle', ${`Reversal for vehicle participation ${context.oldParticipation.id}`},
      ${JSON.stringify({
        source: 'vehicle_participation',
        role: 'reversal',
        replacedEventId: priorCashFlow.id,
        oldParticipationId: context.oldParticipation.id,
        participationId: context.successor.id,
      })}::jsonb,
      'approved', ${priorCashFlow.id}, 'vehicle_participation', ${context.successor.id},
      ${cashFlowSourceHash(context.input.fundId, context.successor, 'reversal', priorCashFlow.id)},
      ${context.input.actorId}
    )
  `);
  await database.execute(sql`
    INSERT INTO cash_flow_events (
      fund_id, vehicle_id, company_id, event_type, amount, currency, event_date,
      perspective, description, payload, status, vehicle_participation_id,
      imported_from, source_hash, created_by
    ) VALUES (
      ${context.input.fundId}, ${context.successor.vehicleId},
      ${context.observationContext.portfolioCompanyId}, 'portfolio_investment',
      ${context.projection.cashFlowAmount}, 'USD', ${midnightUtc(context.terms.closingDate)},
      'vehicle', ${`Vehicle participation ${context.successor.id}`},
      ${JSON.stringify({
        source: 'vehicle_participation',
        role: 'replacement',
        replacedEventId: priorCashFlow.id,
        oldParticipationId: context.oldParticipation.id,
        participationId: context.successor.id,
      })}::jsonb,
      'approved', ${context.successor.id}, 'vehicle_participation',
      ${cashFlowSourceHash(context.input.fundId, context.successor, 'replacement')},
      ${context.input.actorId}
    )
  `);
}

async function relinkCashFlow(
  database: LedgerDatabase,
  context: {
    input: LedgerCorrectionContext;
    oldParticipation: ParticipationRow;
    successor: ParticipationRow;
    priorCashFlow: CashFlowRow;
  }
): Promise<void> {
  if (context.priorCashFlow.status === 'locked') {
    throw new LedgerCorrectionServiceError(
      409,
      'LEDGER_WRITE_FAILED',
      'Locked cash-flow events cannot be relinked by participation cascade.'
    );
  }
  if (context.priorCashFlow.status !== 'approved') {
    throw new LedgerCorrectionServiceError(
      409,
      'PARTICIPATION_VERSION_CONFLICT',
      'The participation cash-flow head changed concurrently; retry the correction.'
    );
  }
  const updated = readRows(
    await database.execute(sql`
      UPDATE cash_flow_events
      SET vehicle_participation_id = ${context.successor.id}
      WHERE id = ${context.priorCashFlow.id}
        AND vehicle_participation_id = ${context.oldParticipation.id}
        AND fund_id = ${context.input.fundId}
        AND status = 'approved'
      RETURNING id
    `)
  );
  if (updated.length !== 1) {
    throw new LedgerCorrectionServiceError(
      409,
      'PARTICIPATION_VERSION_CONFLICT',
      'The participation cash-flow head changed concurrently; retry the correction.'
    );
  }
}

async function selectInvestmentForParticipation(
  database: LedgerDatabase,
  fundId: number,
  participationId: number
): Promise<InvestmentRow | null> {
  const row = readRows(
    await database.execute(sql`
      SELECT id, version
      FROM investments
      WHERE fund_id = ${fundId}
        AND vehicle_participation_id = ${participationId}
      LIMIT 1
      FOR UPDATE
    `)
  )[0];
  return row ? { id: asPositiveInt(row['id']), version: asPositiveInt(row['version']) } : null;
}

async function selectActiveRoundForParticipation(
  database: LedgerDatabase,
  fundId: number,
  participationId: number
): Promise<RoundRow | null> {
  const row = readRows(
    await database.execute(sql`
      SELECT id
      FROM investment_rounds r
      WHERE r.fund_id = ${fundId}
        AND r.vehicle_participation_id = ${participationId}
        AND NOT EXISTS (
          SELECT 1 FROM investment_rounds successor
          WHERE successor.supersedes_round_id = r.id
        )
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `)
  )[0];
  return row ? { id: asPositiveInt(row['id']) } : null;
}

async function selectOriginalCashFlowForParticipation(
  database: LedgerDatabase,
  fundId: number,
  participationId: number
): Promise<CashFlowRow | null> {
  const row = readRows(
    await database.execute(sql`
      SELECT id, status
      FROM cash_flow_events
      WHERE fund_id = ${fundId}
        AND vehicle_participation_id = ${participationId}
        AND event_type = 'portfolio_investment'
        AND reversal_of_event_id IS NULL
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `)
  )[0];
  return row ? { id: asPositiveInt(row['id']), status: asString(row['status']) } : null;
}

async function loadObservationContext(
  database: LedgerDatabase,
  fundId: number,
  eventId: number
): Promise<ObservationContext> {
  const rows = readRows(
    await database.execute(sql`
      SELECT e.company_identity_id, e.round_name, i.canonical_name, l.portfolio_company_id
      FROM financing_events e
      JOIN company_identities i
        ON i.id = e.company_identity_id AND i.fund_id = e.fund_id
      JOIN portfolio_company_identity_links l
        ON l.company_identity_id = e.company_identity_id
       AND l.fund_id = e.fund_id
       AND l.active = true
      WHERE e.id = ${eventId}
        AND e.fund_id = ${fundId}
      ORDER BY l.portfolio_company_id
      LIMIT 2
    `)
  );
  if (rows.length === 0) {
    throw new LedgerCorrectionServiceError(
      409,
      'IDENTITY_LINK_REQUIRED',
      'A participation correction requires exactly one active company identity link.'
    );
  }
  if (rows.length > 1) {
    throw new LedgerCorrectionServiceError(
      409,
      'IDENTITY_LINK_AMBIGUOUS',
      'A participation correction requires exactly one active company identity link.'
    );
  }
  const row = rows[0]!;
  return {
    companyIdentityId: asPositiveInt(row['company_identity_id']),
    companyName: asString(row['canonical_name']),
    portfolioCompanyId: asPositiveInt(row['portfolio_company_id']),
    roundName: asString(row['round_name']),
  };
}

async function loadPriorObservationMeasureKey(
  database: LedgerDatabase,
  fundId: number,
  observationId: number | null
): Promise<'initial_investment' | 'follow_on_investment'> {
  if (observationId === null) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Correction could not load the prior source observation.'
    );
  }
  const row = readRows(
    await database.execute(sql`
      SELECT normalized_payload
      FROM source_observations
      WHERE id = ${observationId}
        AND fund_id = ${fundId}
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Correction could not load the prior source observation.'
    );
  }

  const payload = asRecord(row['normalized_payload']);
  const measureKey = payload['measureKey'];
  if (measureKey === 'initial_investment' || measureKey === 'follow_on_investment') {
    return measureKey;
  }
  throw new LedgerCorrectionServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Correction could not reuse the prior source observation measure key.'
  );
}

async function insertParticipationObservation(
  database: LedgerDatabase,
  context: {
    input: LedgerCorrectionContext;
    observationContext: ObservationContext;
    participation: ParticipationRow;
    tranche: FinancingTrancheRow;
    projection: ParticipationCompatibilityProjection;
    compatibilityChange: CompatibilityChange;
    measureKey: 'initial_investment' | 'follow_on_investment';
  }
): Promise<number> {
  return insertManualObservation(database, {
    fundId: context.input.fundId,
    companyIdentityId: context.observationContext.companyIdentityId,
    companyName: context.observationContext.companyName,
    sourceLocator: `vehicle-participation:${context.participation.id}:v${context.participation.version}`,
    measureKey: context.measureKey,
    effectiveDate: context.tranche.closingDate,
    amount: context.projection.cashFlowAmount,
    version: context.participation.version,
    provenance: {
      compatibilityChanged: context.compatibilityChange.rewritten,
      warnings: context.projection.warnings,
    },
  });
}

async function insertManualObservation(
  database: LedgerDatabase,
  input: {
    fundId: number;
    companyIdentityId: number;
    companyName: string;
    sourceLocator: string;
    measureKey: 'initial_investment' | 'follow_on_investment';
    effectiveDate: string;
    amount: string;
    version: number;
    provenance?: Record<string, unknown>;
  }
): Promise<number> {
  const candidate = normalizeManualObservation({
    domain: 'ledger_event',
    measureKey: input.measureKey,
    companyName: input.companyName,
    effectiveDate: input.effectiveDate,
    amount: input.amount,
    currency: 'USD',
    fxRate: USD_FX_RATE_TO_USD,
    sourceLocator: input.sourceLocator,
    descriptor: {
      sourceLabel: `${input.sourceLocator}:v${input.version}`,
      ...(input.provenance && { note: JSON.stringify(input.provenance) }),
    },
  });
  if (
    candidate.outcome === 'rejected' ||
    !candidate.normalizedPayload ||
    !candidate.observationHash ||
    !candidate.candidateFingerprint ||
    !candidate.effectiveDate
  ) {
    throw new LedgerCorrectionServiceError(
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
        ${input.sourceLocator}, ${dependencyGroupKeyForObservation(observationId)}, 'accepted'
      )
      RETURNING id
    `)
  );
  if (insertedId !== observationId) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Observation insert returned an unexpected id.'
    );
  }
  return observationId;
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
        ${JSON.stringify({ action: 'confirm_match', reason: 'ledger_correction' })}::jsonb,
        NULL, now(), ${JSON.stringify([{ action: 'auto_resolved_ledger_correction' }])}::jsonb
      )
      RETURNING id
    `)
  );
}

async function updateTrancheObservation(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number,
  observationId: number
): Promise<FinancingTrancheRow> {
  const row = firstTranche(
    await database.execute(sql`
      UPDATE financing_tranches
      SET superseded_by_tranche_id = NULL,
          source_observation_id = ${observationId}
      WHERE id = ${trancheId}
        AND fund_id = ${fundId}
      RETURNING *
    `)
  );
  if (!row) {
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Corrected tranche observation linkage returned no row.'
    );
  }
  return row;
}

async function updateParticipationObservation(
  database: LedgerDatabase,
  fundId: number,
  participationId: number,
  observationId: number
): Promise<void> {
  await database.execute(sql`
    UPDATE vehicle_financing_participations
    SET source_observation_id = ${observationId}
    WHERE id = ${participationId}
      AND fund_id = ${fundId}
    RETURNING id
  `);
}

function cashFlowSourceHash(
  fundId: number,
  participation: ParticipationRow,
  role: 'reversal' | 'replacement',
  reversalOfEventId?: number
): string {
  return canonicalSha256({
    source: 'vehicle_participation',
    fundId,
    participationId: participation.id,
    participationVersion: participation.version,
    role,
    ...(reversalOfEventId !== undefined && { reversalOfEventId }),
  });
}

function compatibilityVisibleProjectionHash(
  projection: ParticipationCompatibilityProjection,
  terms: ReturnType<typeof resolveEffectiveTerms>,
  roundName: string
): string {
  return canonicalSha256({
    investmentAmount: projection.investmentAmount,
    investmentDate: terms.closingDate,
    roundName: truncateRoundLabel(roundName),
    valuationAtInvestment: formatNullableMoney(terms.postMoneyValuation),
    roundSecurityType: terms.securityType,
    roundDate: terms.closingDate,
    roundInvestmentAmount: projection.roundInvestmentAmount,
  });
}

function cashFlowProjectionHash(
  projection: ParticipationCompatibilityProjection,
  terms: ReturnType<typeof resolveEffectiveTerms>
): string {
  return canonicalSha256({
    cashFlowAmount: projection.cashFlowAmount,
    cashFlowDate: terms.closingDate,
  });
}

function formatNullableMoney(value: string | null): string | null {
  return value === null
    ? null
    : new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function lotProjectionHash(projection: ParticipationCompatibilityProjection): string {
  return canonicalSha256({
    lot: projection.lot
      ? {
          sharePriceCents: projection.lot.sharePriceCents.toString(),
          sharesAcquired: projection.lot.sharesAcquired,
          costBasisCents: projection.lot.costBasisCents.toString(),
        }
      : null,
  });
}

function truncateRoundLabel(roundName: string): string {
  if (roundName.length <= 120) return roundName;
  return `${roundName.slice(0, 111)}-${canonicalSha256({ roundName }).slice(0, 8)}`;
}

function midnightUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function firstTranche(result: unknown): FinancingTrancheRow | null {
  const row = readRows(result)[0];
  return row ? financingTrancheFromRow(row) : null;
}

function firstParticipation(result: unknown): ParticipationRow | null {
  const row = readRows(result)[0];
  return row ? participationFromRow(row) : null;
}

function financingTrancheDto(row: FinancingTrancheRow): FinancingTrancheV1 {
  return FinancingTrancheV1Schema.parse({
    ...row,
    createdAt: row.createdAt,
  });
}

function participationDto(row: ParticipationRow): VehicleFinancingParticipationV1 {
  return VehicleFinancingParticipationV1Schema.parse({
    ...row,
    createdAt: row.createdAt,
  });
}

function financingTrancheFromRow(row: Record<string, unknown>): FinancingTrancheRow {
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
    securityType: asString(
      row['security_type'] ?? row['securityType']
    ) as FinancingTrancheV1['securityType'],
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
    createdAt: asDate(row['created_at'] ?? row['createdAt']).toISOString(),
  };
}

function participationFromRow(row: Record<string, unknown>): ParticipationRow {
  return {
    id: asPositiveInt(row['id']),
    fundId: asPositiveInt(row['fund_id'] ?? row['fundId']),
    vehicleId: asPositiveInt(row['vehicle_id'] ?? row['vehicleId']),
    financingEventId: asPositiveInt(row['financing_event_id'] ?? row['financingEventId']),
    trancheKey: asString(row['tranche_key'] ?? row['trancheKey']),
    financingTrancheId: asPositiveInt(row['financing_tranche_id'] ?? row['financingTrancheId']),
    version: asPositiveInt(row['version']),
    supersededByParticipationId: asNullablePositiveInt(
      row['superseded_by_participation_id'] ?? row['supersededByParticipationId']
    ),
    participationAmount: asString(row['participation_amount'] ?? row['participationAmount']),
    originalAmount: asNullableString(row['original_amount'] ?? row['originalAmount']),
    currency: asNullableString(row['currency']),
    fxRateToUsd: asNullableString(row['fx_rate_to_usd'] ?? row['fxRateToUsd']),
    fxRateDate: asNullableDateString(row['fx_rate_date'] ?? row['fxRateDate']),
    sharesAcquired: asNullableString(row['shares_acquired'] ?? row['sharesAcquired']),
    closingDate: asNullableDateString(row['closing_date'] ?? row['closingDate']),
    pricePerShare: asNullableString(row['price_per_share'] ?? row['pricePerShare']),
    postMoneyValuation: asNullableString(row['post_money_valuation'] ?? row['postMoneyValuation']),
    valuationCap: asNullableString(row['valuation_cap'] ?? row['valuationCap']),
    conversionDiscountRate: asNullableString(
      row['conversion_discount_rate'] ?? row['conversionDiscountRate']
    ),
    interestRate: asNullableString(row['interest_rate'] ?? row['interestRate']),
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
    maturityDate: asNullableDateString(row['maturity_date'] ?? row['maturityDate']),
    descriptiveTerms: asNullableRecord(row['descriptive_terms'] ?? row['descriptiveTerms']),
    confirmedDuplicates: asStringArray(
      row['confirmed_duplicates'] ?? row['confirmedDuplicates'] ?? []
    ),
    sourceObservationId: asNullablePositiveInt(
      row['source_observation_id'] ?? row['sourceObservationId']
    ),
    createdBy: asNullablePositiveInt(row['created_by'] ?? row['createdBy']),
    idempotencyKey: asString(row['idempotency_key'] ?? row['idempotencyKey']),
    requestHash: asString(row['request_hash'] ?? row['requestHash']),
    createdAt: asDate(row['created_at'] ?? row['createdAt']).toISOString(),
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
    throw new LedgerCorrectionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Database returned an invalid positive integer.'
    );
  }
  return parsed;
}

function asNullablePositiveInt(value: unknown): number | null {
  return value === null || value === undefined ? null : asPositiveInt(value);
}

function asString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new LedgerCorrectionServiceError(
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
  throw new LedgerCorrectionServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned an invalid timestamp.'
  );
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  throw new LedgerCorrectionServiceError(
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
  throw new LedgerCorrectionServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned invalid JSON object.'
  );
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  return value === null || value === undefined ? null : asRecord(value);
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return asStringArray(JSON.parse(value) as unknown);
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  throw new LedgerCorrectionServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned invalid string array.'
  );
}

export type { CorrectFinancingTrancheRequest };
