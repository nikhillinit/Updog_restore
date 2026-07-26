import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { IdempotentCommandError } from '../../lib/idempotent-command';
import {
  LEDGER_CONTRACT_VERSION,
  USD_FX_RATE_TO_USD,
} from '../../../shared/contracts/investment-ledger/financing-event.contract';
import {
  ConvertPositionRequestSchema,
  PositionConversionV1Schema,
  PositionEventV1Schema,
  PositionSourceBasisReliefV1Schema,
  type ConvertPositionRequest,
  type PositionConversionLotReliefV1,
  type PositionConversionV1,
  type PositionEventErrorCode,
  type PositionEventV1,
  type PositionSourceBasisReliefV1,
} from '../../../shared/contracts/investment-ledger/position.contract';
import { VehicleFinancingParticipationV1Schema } from '../../../shared/contracts/investment-ledger/participation.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { Decimal } from '../../../shared/lib/decimal-config';
import { dependencyGroupKeyForObservation } from '../../../shared/contracts/financial-observations/reconciliation-api.contract';
import { resolveIdentityHead } from '../financial-observations/identity-resolution-service';
import { normalizeManualObservation } from '../financial-observations/manual-entry-adapter';
import { invalidateH9Artifacts } from '../h9-artifact-invalidation-service';

type LedgerDatabase = typeof db;

export interface ConvertPositionInput {
  fundId: number;
  actorId: number | null;
  idempotencyKey: string;
  request: unknown;
  database?: LedgerDatabase;
}

export interface LedgerCommandResult<T> {
  value: T;
  replayed: boolean;
}

export class PositionConversionServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: PositionEventErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'PositionConversionServiceError';
    this.statusCode = status;
  }
}

interface ParticipationRow {
  id: number;
  fundId: number;
  vehicleId: number;
  financingEventId: number;
  trancheKey: string;
  financingTrancheId: number;
  version: number;
  supersededByParticipationId: number | null;
  economicOrigin: 'cash_investment' | 'conversion_result';
  participationAmount: string;
  originalAmount: string | null;
  currency: string | null;
  fxRateToUsd: string | null;
  fxRateDate: string | null;
  sharesAcquired: string | null;
  closingDate: string | null;
  pricePerShare: string | null;
  postMoneyValuation: string | null;
  valuationCap: string | null;
  conversionDiscountRate: string | null;
  interestRate: string | null;
  liquidationPreferenceMultiple: string | null;
  participatingPreferred: boolean | null;
  participationCapMultiple: string | null;
  proRataRightsPct: string | null;
  maturityDate: string | null;
  descriptiveTerms: Record<string, unknown> | null;
  confirmedDuplicates: string[];
  sourceObservationId: number | null;
  createdBy: number | null;
  idempotencyKey: string;
  requestHash: string;
  createdAt: Date;
}

interface TrancheRow {
  id: number;
  fundId: number;
  financingEventId: number;
  trancheKey: string;
  version: number;
  supersededByTrancheId: number | null;
  closingDate: string;
  securityType: string;
  investmentAmount: string;
  originalAmount: string;
  currency: string;
  fxRateToUsd: string;
  fxRateDate: string;
  pricePerShare: string | null;
  postMoneyValuation: string | null;
  valuationCap: string | null;
  conversionDiscountRate: string | null;
  interestRate: string | null;
  maturityDate: string | null;
  liquidationPreferenceMultiple: string | null;
  participatingPreferred: boolean | null;
  participationCapMultiple: string | null;
  proRataRightsPct: string | null;
  descriptiveTerms: Record<string, unknown>;
  calculationEligible: boolean;
  sourceObservationId: number | null;
  createdBy: number | null;
  idempotencyKey: string;
  requestHash: string;
  createdAt: Date;
  companyIdentityId: number;
  companyName: string;
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

interface SourceContext {
  source: ParticipationRow;
  sourceTranche: TrancheRow;
  acquisition: PositionEventRow;
  investmentId: number;
}

interface LotRow {
  id: string;
  investmentId: number;
  sharesAcquired: string;
  costBasisCents: bigint;
}

interface ReliefReceiptRow {
  conversionPositionEventId: number;
  sourceAcquisitionPositionEventId: number;
  capitalizedAdjustmentPositionEventId: number | null;
  fundId: number;
  vehicleId: number;
  companyIdentityId: number;
  sourceParticipationId: number;
  sourceParticipationVersion: number;
  sourceFinancingEventId: number;
  sourceFinancingTrancheId: number;
  resultingParticipationId: number;
  resultingParticipationVersion: number;
  resultingFinancingEventId: number;
  resultingFinancingTrancheId: number;
  sourceTrancheVersion: number;
  resultingTrancheVersion: number;
  sourceAcquisitionCostBasis: string;
  capitalizedAdjustmentCostBasis: string;
  relievedCostBasis: string;
  sourceEconomicOrigin: 'cash_investment';
  resultingEconomicOrigin: 'conversion_result';
}

interface ConversionInsertResult {
  conversionEventId: number;
  adjustmentEventId: number | null;
  resultParticipationId: number;
  observationId: number;
  resultLotId: string;
}

export async function convertPosition(
  input: ConvertPositionInput
): Promise<LedgerCommandResult<PositionConversionV1>> {
  const database = input.database ?? db;
  const request = ConvertPositionRequestSchema.parse(input.request);
  const canonicalRequest = canonicalizeConversionRequest(request);
  const commandRequest = {
    contractVersion: LEDGER_CONTRACT_VERSION,
    command: 'position_conversion_v1',
    fundId: input.fundId,
    sourceParticipationId: canonicalRequest.sourceParticipationId,
    resultingTrancheId: canonicalRequest.resultingTrancheId,
    request: canonicalRequest,
  };
  const requestHash = canonicalSha256(commandRequest);

  const result = await database.transaction(async (transaction) => {
    await lockFundIdentity(transaction, input.fundId);
    const existing = await selectConversionByIdempotency(
      transaction,
      input.fundId,
      input.idempotencyKey
    );
    if (existing) {
      if (existing.eventType !== 'conversion') {
        throw new IdempotentCommandError(
          409,
          'IDEMPOTENCY_KEY_REUSE',
          'Idempotency-Key was already used for a different ledger event.',
          { idempotencyKey: input.idempotencyKey, eventType: existing.eventType }
        );
      }
      if (existing.requestHash !== requestHash) {
        throw new IdempotentCommandError(
          409,
          'IDEMPOTENCY_KEY_REUSE',
          'Idempotency-Key was already used for a different request.',
          { idempotencyKey: input.idempotencyKey }
        );
      }
      return {
        value: await loadConversionReceipt(transaction, input.fundId, existing.id),
        replayed: true,
      };
    }

    const inserted = await insertNewConversion(transaction, input, canonicalRequest, requestHash);
    return {
      value: await loadConversionReceipt(transaction, input.fundId, inserted.conversionEventId),
      replayed: false,
    };
  });

  if (!result.replayed) {
    await invalidateH9Artifacts(input.fundId);
  }
  return result;
}

function canonicalizeConversionRequest(request: ConvertPositionRequest): ConvertPositionRequest {
  const sortedReliefs = [...(request.sourceLotReliefs ?? [])].sort((left, right) => {
    const investmentOrder = left.investmentId - right.investmentId;
    if (investmentOrder !== 0) return investmentOrder;
    return left.investmentLotId.localeCompare(right.investmentLotId);
  });
  return {
    ...request,
    ...(sortedReliefs.length > 0 ? { sourceLotReliefs: sortedReliefs } : { sourceLotReliefs: undefined }),
  };
}

async function insertNewConversion(
  database: LedgerDatabase,
  input: ConvertPositionInput,
  request: ConvertPositionRequest,
  requestHash: string
): Promise<ConversionInsertResult> {
  let sourceContext = await loadSourceContext(database, input.fundId, request.sourceParticipationId);
  if (!['safe', 'convertible_note'].includes(sourceContext.sourceTranche.securityType)) {
    throw ineligible('Source participation must be a current SAFE or convertible note.');
  }
  await assertCurrentIdentity(database, input.fundId, sourceContext.acquisition.companyIdentityId);
  let targetTranche = await loadTargetTranche(
    database,
    input.fundId,
    request.resultingTrancheId,
    sourceContext.acquisition.companyIdentityId
  );
  if (targetTranche.securityType !== 'equity' || targetTranche.pricePerShare === null) {
    throw ineligible('Target tranche must be current priced equity.');
  }

  await lockFinancingEvents(database, input.fundId, [
    sourceContext.source.financingEventId,
    targetTranche.financingEventId,
  ]);
  await lockSourceParticipation(database, input.fundId, sourceContext.source.id);
  await lockTranches(database, input.fundId, [
    sourceContext.source.financingTrancheId,
    targetTranche.id,
  ]);
  sourceContext = await loadSourceContext(database, input.fundId, request.sourceParticipationId);
  targetTranche = await loadTargetTranche(
    database,
    input.fundId,
    request.resultingTrancheId,
    sourceContext.acquisition.companyIdentityId
  );
  if (!['safe', 'convertible_note'].includes(sourceContext.sourceTranche.securityType)) {
    throw ineligible('Source participation must be a current SAFE or convertible note.');
  }
  if (targetTranche.securityType !== 'equity' || targetTranche.pricePerShare === null) {
    throw ineligible('Target tranche must be current priced equity.');
  }
  sourceContext = {
    ...sourceContext,
    acquisition: await lockSourceAcquisition(database, input.fundId, request.sourceParticipationId),
  };
  await lockInvestment(database, input.fundId, sourceContext.investmentId);
  await assertNoPriorSourceBasisRelief(database, input.fundId, sourceContext.acquisition.id);

  const lots = await lockSourceLots(database, sourceContext.investmentId);
  await assertNoActiveLotRelief(database, input.fundId, sourceContext.investmentId);
  await assertTargetFamilyEmpty(database, input.fundId, sourceContext.source.vehicleId, targetTranche);
  const sourceBasis = q6(sourceContext.acquisition.costBasisDelta);
  const reliefMode =
    request.sourceLotReliefs === undefined || request.sourceLotReliefs.length === 0
      ? 'source_basis'
      : 'specific_lots';
  if (reliefMode === 'source_basis' && lots.length !== 0) {
    throw conflict('No-lot conversion requires zero physical source lots.');
  }
  if (reliefMode === 'specific_lots') {
    assertCompleteLotRelief(
      sourceContext.investmentId,
      lots,
      request,
      sourceBasis
    );
  }

  const interestBasis =
    request.accruedInterest.mode === 'capitalized_with_adjustment'
      ? q6(request.accruedInterest.amount)
      : '0.000000';
  const resultBasis = q6(new Decimal(sourceBasis).plus(interestBasis));
  assertPositive(sourceBasis, 'Source acquisition basis must be positive.');
  assertCentRepresentable(resultBasis, 'Result basis must be exactly representable in cents.');
  const price = q6(targetTranche.pricePerShare);
  assertPositive(price, 'Target price must be positive.');
  assertCentRepresentable(price, 'Target price must be exactly representable in cents.');
  const resultShares = q6(request.resultingSharesAcquired);
  const expectedBasis = q6(new Decimal(price).mul(resultShares));
  if (expectedBasis !== resultBasis) {
    throw precisionLoss('Result shares, price, and basis must exactly conserve at 6dp.');
  }
  const sourceShares =
    reliefMode === 'specific_lots'
      ? q6(Decimal.sum(...lots.map((lot) => lot.sharesAcquired)))
      : '0.000000';
  const sharesDelta = q6(new Decimal(resultShares).minus(sourceShares));

  const digest = createHash('sha256').update(input.idempotencyKey, 'utf8').digest('hex');
  const resultParticipationId = readInsertedId(
    await database.execute(sql`SELECT nextval('vehicle_financing_participations_id_seq') AS id`)
  );
  const resultParticipationKey = `pos:conv:${digest}:p`;
  await database.execute(sql`
    INSERT INTO vehicle_financing_participations (
      id, fund_id, vehicle_id, financing_event_id, tranche_key, financing_tranche_id,
      version, superseded_by_participation_id, economic_origin, participation_amount,
      original_amount, currency, fx_rate_to_usd, fx_rate_date, shares_acquired, closing_date,
      price_per_share, post_money_valuation, valuation_cap, conversion_discount_rate,
      interest_rate, liquidation_preference_multiple, participating_preferred,
      participation_cap_multiple, pro_rata_rights_pct, maturity_date, descriptive_terms,
      confirmed_duplicates, source_observation_id, created_by, idempotency_key, request_hash
    ) VALUES (
      ${resultParticipationId}, ${input.fundId}, ${sourceContext.source.vehicleId},
      ${targetTranche.financingEventId}, ${targetTranche.trancheKey}, ${targetTranche.id},
      1, NULL, 'conversion_result', ${resultBasis}, ${resultBasis}, 'USD',
      ${USD_FX_RATE_TO_USD}, ${request.effectiveDate}, ${toEight(resultShares)}, ${request.effectiveDate},
      ${price}, ${targetTranche.postMoneyValuation}, ${targetTranche.valuationCap},
      ${targetTranche.conversionDiscountRate}, ${targetTranche.interestRate},
      ${targetTranche.liquidationPreferenceMultiple}, ${targetTranche.participatingPreferred},
      ${targetTranche.participationCapMultiple}, ${targetTranche.proRataRightsPct},
      ${targetTranche.maturityDate}, ${JSON.stringify(targetTranche.descriptiveTerms)}::jsonb,
      '[]'::jsonb, NULL, ${input.actorId}, ${resultParticipationKey}, ${requestHash}
    )
  `);

  const adjustmentEventId =
    request.accruedInterest.mode === 'capitalized_with_adjustment'
      ? await insertAdjustmentEvent(database, input, request, sourceContext, interestBasis, requestHash, digest)
      : null;
  const observationId = await insertConversionObservation(database, input, request, {
    sourceContext,
    targetTranche,
    resultParticipationId,
    reliefMode,
    sourceBasis,
    interestBasis,
    resultBasis,
    resultShares,
  });
  const conversionEventId = readInsertedId(
    await database.execute(sql`
      INSERT INTO position_events (
        fund_id, vehicle_id, company_identity_id, event_type, effective_date,
        shares_delta, cost_basis_delta, proceeds, replaces_event_id, reverses_position_event_id,
        vehicle_participation_id, resulting_participation_id, source_participation_version,
        resulting_participation_version, source_tranche_version, resulting_tranche_version,
        source_observation_id, backfilled_from_investment_id, created_by, idempotency_key,
        request_hash
      ) VALUES (
        ${input.fundId}, ${sourceContext.source.vehicleId}, ${sourceContext.acquisition.companyIdentityId},
        'conversion', ${request.effectiveDate}, ${sharesDelta}, '0.000000', '0.000000',
        NULL, NULL, ${sourceContext.source.id}, ${resultParticipationId},
        ${sourceContext.source.version}, 1, ${sourceContext.sourceTranche.version},
        ${targetTranche.version}, ${observationId}, NULL, ${input.actorId},
        ${input.idempotencyKey}, ${requestHash}
      )
      RETURNING id
    `)
  );

  await insertSourceBasisRelief(database, {
    conversionEventId,
    sourceContext,
    targetTranche,
    resultParticipationId,
    adjustmentEventId,
    sourceBasis,
    interestBasis,
    resultBasis,
  });
  for (const relief of request.sourceLotReliefs ?? []) {
    await database.execute(sql`
      INSERT INTO position_event_lot_reliefs (
        fund_id, position_event_id, investment_id, investment_lot_id,
        relieved_shares, relieved_cost_basis, allocated_proceeds
      ) VALUES (
        ${input.fundId}, ${conversionEventId}, ${relief.investmentId},
        ${relief.investmentLotId}, ${q6(relief.relievedShares)},
        ${q6(relief.relievedCostBasis)}, '0.000000'
      )
    `);
  }
  const resultLotId = asString(
    readRows(
      await database.execute(sql`
        INSERT INTO investment_lots (
          investment_id, lot_type, share_price_cents, shares_acquired, cost_basis_cents,
          idempotency_key, imported_from, vehicle_participation_id
        ) VALUES (
          ${sourceContext.investmentId}, 'conversion', ${toCents(price)}, ${toEight(resultShares)},
          ${toCents(resultBasis)}, ${`pos:conv:${conversionEventId}:lot`},
          'position_conversion', ${resultParticipationId}
        )
        RETURNING id
      `)
    )[0]?.['id']
  );
  await database.execute(sql`
    UPDATE vehicle_financing_participations
    SET source_observation_id = ${observationId}
    WHERE fund_id = ${input.fundId} AND id = ${resultParticipationId}
  `);

  return {
    conversionEventId,
    adjustmentEventId,
    resultParticipationId,
    observationId,
    resultLotId,
  };
}

async function insertAdjustmentEvent(
  database: LedgerDatabase,
  input: ConvertPositionInput,
  request: ConvertPositionRequest,
  sourceContext: SourceContext,
  interestBasis: string,
  requestHash: string,
  digest: string
): Promise<number> {
  const observationId = await insertSimpleObservation(database, {
    fundId: input.fundId,
    companyIdentityId: sourceContext.acquisition.companyIdentityId,
    companyName: sourceContext.sourceTranche.companyName,
    sourceLocator: `position-conversion:${input.fundId}:${input.idempotencyKey}:interest`,
    effectiveDate: request.effectiveDate,
    amount: interestBasis,
    payload: {
      source: 'position_conversion',
      role: 'capitalized_interest',
      conversionKeyDigest: digest,
      sourceParticipationId: sourceContext.source.id,
      resultingTrancheId: request.resultingTrancheId,
    },
  });
  return readInsertedId(
    await database.execute(sql`
      INSERT INTO position_events (
        fund_id, vehicle_id, company_identity_id, event_type, effective_date,
        shares_delta, cost_basis_delta, proceeds, replaces_event_id, reverses_position_event_id,
        vehicle_participation_id, resulting_participation_id, source_participation_version,
        resulting_participation_version, source_tranche_version, resulting_tranche_version,
        source_observation_id, backfilled_from_investment_id, created_by, idempotency_key,
        request_hash
      ) VALUES (
        ${input.fundId}, ${sourceContext.source.vehicleId}, ${sourceContext.acquisition.companyIdentityId},
        'adjustment', ${request.effectiveDate}, '0.000000', ${interestBasis}, '0.000000',
        NULL, NULL, ${sourceContext.source.id}, NULL, NULL, NULL, NULL, NULL,
        ${observationId}, NULL, ${input.actorId}, ${`pos:conv:${digest}:i`}, ${requestHash}
      )
      RETURNING id
    `)
  );
}

async function insertConversionObservation(
  database: LedgerDatabase,
  input: ConvertPositionInput,
  request: ConvertPositionRequest,
  context: {
    sourceContext: SourceContext;
    targetTranche: TrancheRow;
    resultParticipationId: number;
    reliefMode: 'specific_lots' | 'source_basis';
    sourceBasis: string;
    interestBasis: string;
    resultBasis: string;
    resultShares: string;
  }
): Promise<number> {
  return insertSimpleObservation(database, {
    fundId: input.fundId,
    companyIdentityId: context.sourceContext.acquisition.companyIdentityId,
    companyName: context.sourceContext.sourceTranche.companyName,
    sourceLocator: `position-conversion:${input.fundId}:${input.idempotencyKey}`,
    effectiveDate: request.effectiveDate,
    amount: context.resultBasis,
    payload: {
      source: 'position_conversion',
      sourceParticipationId: request.sourceParticipationId,
      resultingParticipationId: context.resultParticipationId,
      resultingTrancheId: request.resultingTrancheId,
      reliefMode: context.reliefMode,
      sourceBasis: context.sourceBasis,
      capitalizedAdjustmentBasis: context.interestBasis,
      resultBasis: context.resultBasis,
      resultShares: context.resultShares,
      targetPricePerShare: context.targetTranche.pricePerShare,
    },
  });
}

async function insertSimpleObservation(
  database: LedgerDatabase,
  input: {
    fundId: number;
    companyIdentityId: number;
    companyName: string;
    sourceLocator: string;
    effectiveDate: string;
    amount: string;
    payload: Record<string, unknown>;
  }
): Promise<number> {
  const candidate = normalizeManualObservation({
    domain: 'ledger_event',
    measureKey: 'follow_on_investment',
    companyName: input.companyName,
    effectiveDate: input.effectiveDate,
    amount: input.amount,
    currency: 'USD',
    fxRate: USD_FX_RATE_TO_USD,
    sourceLocator: input.sourceLocator,
    descriptor: { sourceLabel: `${input.sourceLocator}:position_conversion` },
  });
  if (
    candidate.outcome === 'rejected' ||
    !candidate.normalizedPayload ||
    !candidate.candidateFingerprint ||
    !candidate.effectiveDate
  ) {
    throw new PositionConversionServiceError(
      422,
      'NORMALIZATION_REJECTED',
      'The position conversion could not produce a canonical manual observation.'
    );
  }
  const observationId = readInsertedId(
    await database.execute(sql`SELECT nextval('source_observations_id_seq') AS id`)
  );
  const normalizedPayload = {
    ...candidate.normalizedPayload,
    provenance: input.payload,
  };
  await database.execute(sql`
    INSERT INTO source_observations (
      id, fund_id, company_identity_id, domain, source_type, effective_date,
      normalized_payload, observation_hash, candidate_fingerprint, source_locator,
      dependency_group_key, status
    ) VALUES (
      ${observationId}, ${input.fundId}, ${input.companyIdentityId}, 'ledger_event', 'manual',
      ${candidate.effectiveDate}, ${JSON.stringify(normalizedPayload)}::jsonb,
      ${canonicalSha256(normalizedPayload)}, ${candidate.candidateFingerprint},
      ${candidate.sourceLocator ?? input.sourceLocator},
      ${dependencyGroupKeyForObservation(observationId)}, 'accepted'
    )
  `);
  return observationId;
}

async function insertSourceBasisRelief(
  database: LedgerDatabase,
  input: {
    conversionEventId: number;
    sourceContext: SourceContext;
    targetTranche: TrancheRow;
    resultParticipationId: number;
    adjustmentEventId: number | null;
    sourceBasis: string;
    interestBasis: string;
    resultBasis: string;
  }
): Promise<void> {
  await database.execute(sql`
    INSERT INTO position_event_source_basis_reliefs (
      conversion_position_event_id, source_acquisition_position_event_id,
      capitalized_adjustment_position_event_id, fund_id, vehicle_id, company_identity_id,
      source_participation_id, source_participation_version, source_financing_event_id,
      source_financing_tranche_id, resulting_participation_id, resulting_participation_version,
      resulting_financing_event_id, resulting_financing_tranche_id, source_tranche_version,
      resulting_tranche_version, source_acquisition_cost_basis,
      capitalized_adjustment_cost_basis, relieved_cost_basis, source_event_type,
      capitalized_adjustment_event_type, conversion_event_type, source_economic_origin,
      resulting_economic_origin
    ) VALUES (
      ${input.conversionEventId}, ${input.sourceContext.acquisition.id}, ${input.adjustmentEventId},
      ${input.sourceContext.source.fundId}, ${input.sourceContext.source.vehicleId},
      ${input.sourceContext.acquisition.companyIdentityId}, ${input.sourceContext.source.id},
      ${input.sourceContext.source.version}, ${input.sourceContext.source.financingEventId},
      ${input.sourceContext.source.financingTrancheId}, ${input.resultParticipationId}, 1,
      ${input.targetTranche.financingEventId}, ${input.targetTranche.id},
      ${input.sourceContext.sourceTranche.version}, ${input.targetTranche.version},
      ${input.sourceBasis}, ${input.interestBasis}, ${input.resultBasis}, 'acquisition',
      ${input.adjustmentEventId === null ? null : 'adjustment'}, 'conversion',
      'cash_investment', 'conversion_result'
    )
  `);
}

async function loadSourceContext(
  database: LedgerDatabase,
  fundId: number,
  sourceParticipationId: number
): Promise<SourceContext> {
  const participation = firstParticipation(
    await database.execute(sql`
      SELECT *
      FROM vehicle_financing_participations
      WHERE fund_id = ${fundId}
        AND id = ${sourceParticipationId}
        AND superseded_by_participation_id IS NULL
    `)
  );
  if (!participation || participation.economicOrigin !== 'cash_investment') {
    throw notFound('Source participation was not found in this fund.');
  }
  const sourceTranche = firstTranche(
    await database.execute(sql`
      SELECT t.*, e.company_identity_id, ci.canonical_name
      FROM financing_tranches t
      JOIN financing_events e ON e.id = t.financing_event_id AND e.fund_id = t.fund_id
      JOIN company_identities ci ON ci.id = e.company_identity_id AND ci.fund_id = e.fund_id
      WHERE t.id = ${participation.financingTrancheId}
        AND t.fund_id = ${fundId}
        AND t.superseded_by_tranche_id IS NULL
    `)
  );
  if (!sourceTranche) throw ineligible('Source tranche is not current.');
  const acquisition = firstPositionEvent(
    await database.execute(sql`
      SELECT pe.*
      FROM position_events pe
      WHERE pe.fund_id = ${fundId}
        AND pe.vehicle_participation_id = ${sourceParticipationId}
        AND pe.event_type = 'acquisition'
        AND NOT EXISTS (
          SELECT 1
          FROM position_events reversal
          WHERE reversal.reverses_position_event_id = pe.id
            AND reversal.fund_id = pe.fund_id
        )
      LIMIT 1
    `)
  );
  if (!acquisition) throw ineligible('Source acquisition event is missing or reversed.');
  const investmentRow = readRows(
    await database.execute(sql`
      SELECT id
      FROM investments
      WHERE fund_id = ${fundId}
        AND vehicle_participation_id = ${sourceParticipationId}
      LIMIT 1
    `)
  )[0];
  if (!investmentRow) throw ineligible('Source compatibility investment is required.');
  return {
    source: participation,
    sourceTranche,
    acquisition,
    investmentId: asPositiveInt(investmentRow['id']),
  };
}

async function loadTargetTranche(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number,
  companyIdentityId: number
): Promise<TrancheRow> {
  const tranche = firstTranche(
    await database.execute(sql`
      SELECT t.*, e.company_identity_id, ci.canonical_name
      FROM financing_tranches t
      JOIN financing_events e ON e.id = t.financing_event_id AND e.fund_id = t.fund_id
      JOIN company_identities ci ON ci.id = e.company_identity_id AND ci.fund_id = e.fund_id
      WHERE t.id = ${trancheId}
        AND t.fund_id = ${fundId}
        AND t.superseded_by_tranche_id IS NULL
    `)
  );
  if (!tranche) throw notFound('Resulting tranche was not found in this fund.');
  if (tranche.companyIdentityId !== companyIdentityId) {
    throw conflict('Resulting tranche must resolve to the source company identity.');
  }
  return tranche;
}

function assertCompleteLotRelief(
  investmentId: number,
  lots: LotRow[],
  request: ConvertPositionRequest,
  sourceBasis: string
): void {
  const reliefs = request.sourceLotReliefs ?? [];
  if (lots.length === 0) throw conflict('Specific-lot conversion requires physical source lots.');
  const lotsById = new Map(lots.map((lot) => [lot.id, lot]));
  if (reliefs.length !== lots.length) {
    throw conflict('Source-lot path must name every physical source lot exactly once.');
  }
  const seen = new Set<string>();
  for (const relief of reliefs) {
    const lot = lotsById.get(relief.investmentLotId);
    if (!lot || relief.investmentId !== investmentId || seen.has(relief.investmentLotId)) {
      throw conflict('Source-lot path must name every physical source lot exactly once.');
    }
    seen.add(relief.investmentLotId);
    const lotBasis = new Decimal(lot.costBasisCents.toString()).div(100).toFixed(6);
    if (q6(relief.relievedShares) !== q6(lot.sharesAcquired) || q6(relief.relievedCostBasis) !== lotBasis) {
      throw conflict('Source-lot path must fully relieve shares and acquisition basis.');
    }
  }
  const relievedBasis = q6(Decimal.sum(...reliefs.map((relief) => relief.relievedCostBasis)));
  const physicalBasis = q6(
    Decimal.sum(...lots.map((lot) => new Decimal(lot.costBasisCents.toString()).div(100)))
  );
  if (relievedBasis !== physicalBasis) {
    throw conflict('Source-lot relief basis must equal physical source-lot basis.');
  }
  if (relievedBasis !== sourceBasis) {
    throw conflict('Source-lot relief basis must equal source acquisition basis.');
  }
}

async function assertNoActiveLotRelief(
  database: LedgerDatabase,
  fundId: number,
  investmentId: number
): Promise<void> {
  const activeReliefs = readRows(
    await database.execute(sql`
      SELECT 1
      FROM position_event_lot_reliefs r
      JOIN position_events pe ON pe.id = r.position_event_id AND pe.fund_id = r.fund_id
      WHERE r.fund_id = ${fundId}
        AND r.investment_id = ${investmentId}
        AND NOT EXISTS (
          SELECT 1
          FROM position_events reversal
          WHERE reversal.reverses_position_event_id = pe.id
            AND reversal.fund_id = pe.fund_id
        )
      LIMIT 1
    `)
  );
  if (activeReliefs.length > 0) {
    throw conflict('Prior active lot relief makes source ineligible for full conversion v1.');
  }
}

async function assertTargetFamilyEmpty(
  database: LedgerDatabase,
  fundId: number,
  vehicleId: number,
  targetTranche: TrancheRow
): Promise<void> {
  const rows = readRows(
    await database.execute(sql`
      SELECT id
      FROM vehicle_financing_participations
      WHERE fund_id = ${fundId}
        AND vehicle_id = ${vehicleId}
        AND financing_event_id = ${targetTranche.financingEventId}
        AND tranche_key = ${targetTranche.trancheKey}
        AND superseded_by_participation_id IS NULL
      LIMIT 1
      FOR UPDATE
    `)
  );
  if (rows.length > 0) throw conflict('Target participation family is already occupied.');
}

async function assertNoPriorSourceBasisRelief(
  database: LedgerDatabase,
  fundId: number,
  acquisitionEventId: number
): Promise<void> {
  const rows = readRows(
    await database.execute(sql`
      SELECT conversion_position_event_id
      FROM position_event_source_basis_reliefs
      WHERE fund_id = ${fundId}
        AND source_acquisition_position_event_id = ${acquisitionEventId}
      LIMIT 1
    `)
  );
  if (rows.length > 0) throw conflict('Source acquisition has already been converted.');
}

async function lockSourceLots(database: LedgerDatabase, investmentId: number): Promise<LotRow[]> {
  return readRows(
    await database.execute(sql`
      SELECT id, investment_id, shares_acquired, cost_basis_cents
      FROM investment_lots
      WHERE investment_id = ${investmentId}
        AND lot_type <> 'conversion'
      ORDER BY id
      FOR UPDATE
    `)
  ).map((row) => ({
    id: asString(row['id']),
    investmentId: asPositiveInt(row['investment_id']),
    sharesAcquired: asString(row['shares_acquired']),
    costBasisCents: asBigInt(row['cost_basis_cents']),
  }));
}

async function lockFinancingEvents(
  database: LedgerDatabase,
  fundId: number,
  eventIds: number[]
): Promise<void> {
  for (const eventId of [...new Set(eventIds)].sort((a, b) => a - b)) {
    await database.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`financing-event:${fundId}:${eventId}`}))`
    );
  }
}

async function lockTranches(database: LedgerDatabase, fundId: number, trancheIds: number[]): Promise<void> {
  const ids = sql.join(
    [...new Set(trancheIds)].sort((a, b) => a - b).map((id) => sql`${id}`),
    sql`, `
  );
  await database.execute(sql`
    SELECT id FROM financing_tranches
    WHERE fund_id = ${fundId}
      AND id = ANY(ARRAY[${ids}]::int[])
    ORDER BY id
    FOR UPDATE
  `);
}

async function lockSourceParticipation(
  database: LedgerDatabase,
  fundId: number,
  participationId: number
): Promise<void> {
  await database.execute(sql`
    SELECT id
    FROM vehicle_financing_participations
    WHERE fund_id = ${fundId}
      AND id = ${participationId}
      AND superseded_by_participation_id IS NULL
    FOR UPDATE
  `);
}

async function lockSourceAcquisition(
  database: LedgerDatabase,
  fundId: number,
  sourceParticipationId: number
): Promise<PositionEventRow> {
  const row = firstPositionEvent(
    await database.execute(sql`
      SELECT pe.*
      FROM position_events pe
      WHERE pe.fund_id = ${fundId}
        AND pe.vehicle_participation_id = ${sourceParticipationId}
        AND pe.event_type = 'acquisition'
        AND NOT EXISTS (
          SELECT 1
          FROM position_events reversal
          WHERE reversal.reverses_position_event_id = pe.id
            AND reversal.fund_id = pe.fund_id
        )
      LIMIT 1
      FOR UPDATE OF pe
    `)
  );
  if (!row) throw ineligible('Source acquisition event is missing or reversed.');
  return row;
}

async function lockInvestment(
  database: LedgerDatabase,
  fundId: number,
  investmentId: number
): Promise<void> {
  await database.execute(sql`
    SELECT id FROM investments
    WHERE fund_id = ${fundId}
      AND id = ${investmentId}
    FOR UPDATE
  `);
}

async function lockFundIdentity(database: LedgerDatabase, fundId: number): Promise<void> {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`fund-identity:${fundId}`}))`);
}

async function assertCurrentIdentity(
  database: LedgerDatabase,
  fundId: number,
  companyIdentityId: number
): Promise<void> {
  const head = await resolveIdentityHead(database, fundId, companyIdentityId);
  if (head !== companyIdentityId) {
    throw conflict('Source company identity must be current.', { companyIdentityId, identityHead: head });
  }
}

async function selectConversionByIdempotency(
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

async function loadConversionReceipt(
  database: LedgerDatabase,
  fundId: number,
  conversionEventId: number
): Promise<PositionConversionV1> {
  const event = requireRow(
    firstPositionEvent(
      await database.execute(sql`
        SELECT * FROM position_events
        WHERE fund_id = ${fundId}
          AND id = ${conversionEventId}
          AND event_type = 'conversion'
        LIMIT 1
      `)
    ),
    'Stored conversion event could not be reloaded.'
  );
  const resultParticipationId = requiredPositiveInt(event.resultingParticipationId);
  const participation = requireRow(
    firstParticipation(
      await database.execute(sql`
        SELECT *
        FROM vehicle_financing_participations
        WHERE fund_id = ${fundId}
          AND id = ${resultParticipationId}
        LIMIT 1
      `)
    ),
    'Stored conversion participation could not be reloaded.'
  );
  const adjustment =
    firstPositionEvent(
      await database.execute(sql`
        SELECT pe.*
        FROM position_event_source_basis_reliefs r
        JOIN position_events pe
          ON pe.id = r.capitalized_adjustment_position_event_id
         AND pe.fund_id = r.fund_id
        WHERE r.fund_id = ${fundId}
          AND r.conversion_position_event_id = ${conversionEventId}
        LIMIT 1
      `)
    ) ?? null;
  const relief = requireRow(
    firstRelief(
      await database.execute(sql`
        SELECT *
        FROM position_event_source_basis_reliefs
        WHERE fund_id = ${fundId}
          AND conversion_position_event_id = ${conversionEventId}
        LIMIT 1
      `)
    ),
    'Stored conversion source-basis relief could not be reloaded.'
  );
  const lotReliefs = readRows(
    await database.execute(sql`
      SELECT investment_id, investment_lot_id, relieved_shares, relieved_cost_basis,
             allocated_proceeds
      FROM position_event_lot_reliefs
      WHERE fund_id = ${fundId}
        AND position_event_id = ${conversionEventId}
      ORDER BY investment_id, investment_lot_id
    `)
  ).map(lotReliefDto);
  const resultLot = readRows(
    await database.execute(sql`
      SELECT id
      FROM investment_lots
      WHERE vehicle_participation_id = ${resultParticipationId}
        AND lot_type = 'conversion'
        AND imported_from = 'position_conversion'
      LIMIT 1
    `)
  )[0];
  const value = PositionConversionV1Schema.parse({
    sourceParticipationId: requiredPositiveInt(event.vehicleParticipationId),
    sourceParticipationVersion: requiredPositiveInt(event.sourceParticipationVersion),
    resultingParticipation: participationDto(participation),
    conversionEvent: positionEventDto(event),
    capitalizedAdjustmentEvent: adjustment ? positionEventDto(adjustment) : null,
    reliefMode: lotReliefs.length > 0 ? 'specific_lots' : 'source_basis',
    lotReliefs,
    sourceBasisRelief: reliefDto(relief),
    resultConversionLotId: asString(resultLot?.['id']),
    conversionObservationId: requiredPositiveInt(event.sourceObservationId),
  });
  return value;
}

function notFound(message: string): PositionConversionServiceError {
  return new PositionConversionServiceError(404, 'POSITION_CONVERSION_NOT_FOUND', message);
}

function ineligible(message: string): PositionConversionServiceError {
  return new PositionConversionServiceError(422, 'POSITION_CONVERSION_INELIGIBLE', message);
}

function conflict(message: string, details?: Readonly<Record<string, unknown>>): PositionConversionServiceError {
  return new PositionConversionServiceError(409, 'POSITION_CONVERSION_CONFLICT', message, details);
}

function precisionLoss(message: string): PositionConversionServiceError {
  return new PositionConversionServiceError(422, 'POSITION_CONVERSION_PRECISION_LOSS', message);
}

function assertPositive(value: string, message: string): void {
  if (!new Decimal(value).gt(0)) throw ineligible(message);
}

function assertCentRepresentable(value: string, message: string): void {
  if (!new Decimal(value).mul(100).isInteger()) throw precisionLoss(message);
}

function toCents(value: string): bigint {
  return BigInt(new Decimal(value).mul(100).toFixed(0));
}

function toEight(value: string): string {
  return new Decimal(value).toFixed(8);
}

function q6(value: Decimal.Value): string {
  const decimal = new Decimal(value);
  const fixed = decimal.toFixed(6);
  if (!decimal.eq(fixed)) {
    throw precisionLoss('Value cannot be represented exactly at six decimals.');
  }
  return fixed;
}

function requireRow<T>(row: T | null, message: string): T {
  if (row === null) {
    throw new PositionConversionServiceError(500, 'LEDGER_WRITE_FAILED', message);
  }
  return row;
}

function requiredPositiveInt(value: number | null): number {
  if (value === null) {
    throw new PositionConversionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Stored conversion receipt is missing required lineage.'
    );
  }
  return value;
}

function lotReliefDto(row: Record<string, unknown>): PositionConversionLotReliefV1 {
  return {
    investmentId: asPositiveInt(row['investment_id']),
    investmentLotId: asString(row['investment_lot_id']),
    relievedShares: asString(row['relieved_shares']),
    relievedCostBasis: asString(row['relieved_cost_basis']),
    allocatedProceeds: asString(row['allocated_proceeds']),
  };
}

function reliefDto(row: ReliefReceiptRow): PositionSourceBasisReliefV1 {
  return PositionSourceBasisReliefV1Schema.parse(row);
}

function positionEventDto(row: PositionEventRow): PositionEventV1 {
  return PositionEventV1Schema.parse({
    ...row,
    recordedAt: row.recordedAt.toISOString(),
  });
}

function participationDto(row: ParticipationRow) {
  return VehicleFinancingParticipationV1Schema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
}

function firstParticipation(result: unknown): ParticipationRow | null {
  const row = readRows(result)[0];
  return row ? participationFromRow(row) : null;
}

function firstTranche(result: unknown): TrancheRow | null {
  const row = readRows(result)[0];
  return row ? trancheFromRow(row) : null;
}

function firstPositionEvent(result: unknown): PositionEventRow | null {
  const row = readRows(result)[0];
  return row ? positionEventFromRow(row) : null;
}

function firstRelief(result: unknown): ReliefReceiptRow | null {
  const row = readRows(result)[0];
  return row ? reliefFromRow(row) : null;
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
    supersededByParticipationId: asNullablePositiveInt(row['superseded_by_participation_id']),
    economicOrigin: asEconomicOrigin(row['economic_origin'] ?? row['economicOrigin']),
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
    conversionDiscountRate: asNullableString(row['conversion_discount_rate'] ?? row['conversionDiscountRate']),
    interestRate: asNullableString(row['interest_rate'] ?? row['interestRate']),
    liquidationPreferenceMultiple: asNullableString(row['liquidation_preference_multiple'] ?? row['liquidationPreferenceMultiple']),
    participatingPreferred: asNullableBoolean(row['participating_preferred'] ?? row['participatingPreferred']),
    participationCapMultiple: asNullableString(row['participation_cap_multiple'] ?? row['participationCapMultiple']),
    proRataRightsPct: asNullableString(row['pro_rata_rights_pct'] ?? row['proRataRightsPct']),
    maturityDate: asNullableDateString(row['maturity_date'] ?? row['maturityDate']),
    descriptiveTerms: asNullableRecord(row['descriptive_terms'] ?? row['descriptiveTerms']),
    confirmedDuplicates: asStringArray(row['confirmed_duplicates'] ?? row['confirmedDuplicates'] ?? []),
    sourceObservationId: asNullablePositiveInt(row['source_observation_id'] ?? row['sourceObservationId']),
    createdBy: asNullablePositiveInt(row['created_by'] ?? row['createdBy']),
    idempotencyKey: asString(row['idempotency_key'] ?? row['idempotencyKey']),
    requestHash: asString(row['request_hash'] ?? row['requestHash']),
    createdAt: asDate(row['created_at'] ?? row['createdAt']),
  };
}

function trancheFromRow(row: Record<string, unknown>): TrancheRow {
  return {
    id: asPositiveInt(row['id']),
    fundId: asPositiveInt(row['fund_id'] ?? row['fundId']),
    financingEventId: asPositiveInt(row['financing_event_id'] ?? row['financingEventId']),
    trancheKey: asString(row['tranche_key'] ?? row['trancheKey']),
    version: asPositiveInt(row['version']),
    supersededByTrancheId: asNullablePositiveInt(row['superseded_by_tranche_id'] ?? row['supersededByTrancheId']),
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
    conversionDiscountRate: asNullableString(row['conversion_discount_rate'] ?? row['conversionDiscountRate']),
    interestRate: asNullableString(row['interest_rate'] ?? row['interestRate']),
    maturityDate: asNullableDateString(row['maturity_date'] ?? row['maturityDate']),
    liquidationPreferenceMultiple: asNullableString(row['liquidation_preference_multiple'] ?? row['liquidationPreferenceMultiple']),
    participatingPreferred: asNullableBoolean(row['participating_preferred'] ?? row['participatingPreferred']),
    participationCapMultiple: asNullableString(row['participation_cap_multiple'] ?? row['participationCapMultiple']),
    proRataRightsPct: asNullableString(row['pro_rata_rights_pct'] ?? row['proRataRightsPct']),
    descriptiveTerms: asRecord(row['descriptive_terms'] ?? row['descriptiveTerms'] ?? {}),
    calculationEligible: asBoolean(row['calculation_eligible'] ?? row['calculationEligible'] ?? true),
    sourceObservationId: asNullablePositiveInt(row['source_observation_id'] ?? row['sourceObservationId']),
    createdBy: asNullablePositiveInt(row['created_by'] ?? row['createdBy']),
    idempotencyKey: asString(row['idempotency_key'] ?? row['idempotencyKey']),
    requestHash: asString(row['request_hash'] ?? row['requestHash']),
    createdAt: asDate(row['created_at'] ?? row['createdAt']),
    companyIdentityId: asPositiveInt(row['company_identity_id'] ?? row['companyIdentityId']),
    companyName: asString(row['canonical_name'] ?? row['companyName']),
  };
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
    reversesPositionEventId: asNullablePositiveInt(row['reverses_position_event_id'] ?? row['reversesPositionEventId']),
    vehicleParticipationId: asNullablePositiveInt(row['vehicle_participation_id'] ?? row['vehicleParticipationId']),
    resultingParticipationId: asNullablePositiveInt(row['resulting_participation_id'] ?? row['resultingParticipationId']),
    sourceParticipationVersion: asNullablePositiveInt(row['source_participation_version'] ?? row['sourceParticipationVersion']),
    resultingParticipationVersion: asNullablePositiveInt(row['resulting_participation_version'] ?? row['resultingParticipationVersion']),
    sourceTrancheVersion: asNullablePositiveInt(row['source_tranche_version'] ?? row['sourceTrancheVersion']),
    resultingTrancheVersion: asNullablePositiveInt(row['resulting_tranche_version'] ?? row['resultingTrancheVersion']),
    sourceObservationId: asNullablePositiveInt(row['source_observation_id'] ?? row['sourceObservationId']),
    backfilledFromInvestmentId: asNullablePositiveInt(row['backfilled_from_investment_id'] ?? row['backfilledFromInvestmentId']),
    createdBy: asNullablePositiveInt(row['created_by'] ?? row['createdBy']),
    idempotencyKey: asNullableString(row['idempotency_key'] ?? row['idempotencyKey']),
    requestHash: asNullableString(row['request_hash'] ?? row['requestHash']),
  };
}

function reliefFromRow(row: Record<string, unknown>): ReliefReceiptRow {
  return {
    conversionPositionEventId: asPositiveInt(row['conversion_position_event_id'] ?? row['conversionPositionEventId']),
    sourceAcquisitionPositionEventId: asPositiveInt(row['source_acquisition_position_event_id'] ?? row['sourceAcquisitionPositionEventId']),
    capitalizedAdjustmentPositionEventId: asNullablePositiveInt(row['capitalized_adjustment_position_event_id'] ?? row['capitalizedAdjustmentPositionEventId']),
    fundId: asPositiveInt(row['fund_id'] ?? row['fundId']),
    vehicleId: asPositiveInt(row['vehicle_id'] ?? row['vehicleId']),
    companyIdentityId: asPositiveInt(row['company_identity_id'] ?? row['companyIdentityId']),
    sourceParticipationId: asPositiveInt(row['source_participation_id'] ?? row['sourceParticipationId']),
    sourceParticipationVersion: asPositiveInt(row['source_participation_version'] ?? row['sourceParticipationVersion']),
    sourceFinancingEventId: asPositiveInt(row['source_financing_event_id'] ?? row['sourceFinancingEventId']),
    sourceFinancingTrancheId: asPositiveInt(row['source_financing_tranche_id'] ?? row['sourceFinancingTrancheId']),
    resultingParticipationId: asPositiveInt(row['resulting_participation_id'] ?? row['resultingParticipationId']),
    resultingParticipationVersion: asPositiveInt(row['resulting_participation_version'] ?? row['resultingParticipationVersion']),
    resultingFinancingEventId: asPositiveInt(row['resulting_financing_event_id'] ?? row['resultingFinancingEventId']),
    resultingFinancingTrancheId: asPositiveInt(row['resulting_financing_tranche_id'] ?? row['resultingFinancingTrancheId']),
    sourceTrancheVersion: asPositiveInt(row['source_tranche_version'] ?? row['sourceTrancheVersion']),
    resultingTrancheVersion: asPositiveInt(row['resulting_tranche_version'] ?? row['resultingTrancheVersion']),
    sourceAcquisitionCostBasis: asString(row['source_acquisition_cost_basis'] ?? row['sourceAcquisitionCostBasis']),
    capitalizedAdjustmentCostBasis: asString(row['capitalized_adjustment_cost_basis'] ?? row['capitalizedAdjustmentCostBasis']),
    relievedCostBasis: asString(row['relieved_cost_basis'] ?? row['relievedCostBasis']),
    sourceEconomicOrigin: 'cash_investment',
    resultingEconomicOrigin: 'conversion_result',
  };
}

function readRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result === null || typeof result !== 'object') return [];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function readInsertedId(result: unknown): number {
  return asPositiveInt(readRows(result)[0]?.['id']);
}

function asPositiveInt(value: unknown): number {
  let parsed = Number.NaN;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    parsed = Number.parseInt(value, 10);
  }
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new PositionConversionServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Database returned invalid positive integer.'
    );
  }
  return parsed;
}

function asNullablePositiveInt(value: unknown): number | null {
  return value === null || value === undefined ? null : asPositiveInt(value);
}

function asString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new PositionConversionServiceError(500, 'LEDGER_WRITE_FAILED', 'Database returned invalid string.');
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
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new PositionConversionServiceError(500, 'LEDGER_WRITE_FAILED', 'Database returned invalid timestamp.');
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  throw new PositionConversionServiceError(500, 'LEDGER_WRITE_FAILED', 'Database returned invalid boolean.');
}

function asNullableBoolean(value: unknown): boolean | null {
  return value === null || value === undefined ? null : asBoolean(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new PositionConversionServiceError(500, 'LEDGER_WRITE_FAILED', 'Database returned invalid JSON object.');
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  return value === null || value === undefined ? null : asRecord(value);
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return asStringArray(JSON.parse(value) as unknown);
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  throw new PositionConversionServiceError(500, 'LEDGER_WRITE_FAILED', 'Database returned invalid string array.');
}

function asBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  throw new PositionConversionServiceError(500, 'LEDGER_WRITE_FAILED', 'Database returned invalid integer.');
}

function asEconomicOrigin(value: unknown): 'cash_investment' | 'conversion_result' {
  if (value === 'cash_investment' || value === 'conversion_result') return value;
  throw new PositionConversionServiceError(500, 'LEDGER_WRITE_FAILED', 'Database returned invalid economic origin.');
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
  throw new PositionConversionServiceError(500, 'LEDGER_WRITE_FAILED', 'Database returned invalid event type.');
}
