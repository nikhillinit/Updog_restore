import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import { IdempotentCommandError, runIdempotentCommand } from '../../lib/idempotent-command';
import { dependencyGroupKeyForObservation } from '../../../shared/contracts/financial-observations/reconciliation-api.contract';
import {
  FinancingTrancheV1Schema,
  LEDGER_CONTRACT_VERSION,
  USD_FX_RATE_TO_USD,
  type FinancingTrancheV1,
} from '../../../shared/contracts/investment-ledger/financing-event.contract';
import {
  CreateVehicleFinancingParticipationRequestSchema,
  VehicleFinancingParticipationV1Schema,
  VehicleParticipationErrorCodeSchema,
  type VehicleFinancingParticipationV1,
  type VehicleParticipationErrorCode,
} from '../../../shared/contracts/investment-ledger/participation.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { resolveEffectiveTerms } from '../../../shared/lib/investment-ledger/effective-terms';
import {
  formatRoundHalfUp,
  projectParticipationCompatibility,
} from '../../../shared/lib/investment-ledger/participation-quantization';
import {
  createOriginalParticipationSourceHash,
  createParticipationWireFingerprint,
} from '../../../shared/lib/investment-ledger/participation-wire-fingerprint';
import { normalizeManualObservation } from '../financial-observations/manual-entry-adapter';
import { invalidateH9Artifacts } from '../h9-artifact-invalidation-service';

type LedgerDatabase = typeof db;

interface LedgerCommandContext {
  fundId: number;
  trancheId: number;
  actorId: number | null;
  idempotencyKey: string;
  database?: LedgerDatabase;
}

export interface CreateVehicleFinancingParticipationInput extends LedgerCommandContext {
  request: unknown;
}

export interface VehicleFinancingParticipationReceiptV1 {
  participation: VehicleFinancingParticipationV1;
  warnings: VehicleParticipationErrorCode[];
  lotStatus: 'emitted' | 'omitted_unpriced' | 'omitted_unrepresentable';
  compat: {
    investmentId: number;
    investmentRoundId: number;
    investmentLotId: string | null;
    cashFlowEventId: number;
    sourceObservationId: number;
    sourceHash: string;
  };
}

export interface LedgerCommandResult<T> {
  value: T;
  replayed: boolean;
}

export type ParticipationLedgerServiceErrorCode =
  | 'SUSPECTED_DUPLICATE_POSITION'
  | 'DUPLICATE_CONFIRMATION_STALE'
  | 'IDENTITY_LINK_REQUIRED'
  | 'IDENTITY_LINK_AMBIGUOUS'
  | 'EFFECTIVE_TERMS_MATRIX_VIOLATION'
  | 'NORMALIZATION_REJECTED'
  | 'LEDGER_WRITE_FAILED';

export class ParticipationLedgerServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: ParticipationLedgerServiceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'ParticipationLedgerServiceError';
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

interface TrancheContext {
  tranche: FinancingTrancheV1;
  roundName: string;
  companyIdentityId: number;
  companyName: string;
}

interface IdentityLink {
  portfolioCompanyId: number;
}

interface DuplicateCandidate {
  fingerprint: string;
}

interface CompatRows {
  investmentId: number;
  investmentRoundId: number;
  investmentLotId: string | null;
  cashFlowEventId: number;
  sourceHash: string;
  wireFingerprint: string;
}

const StoredParticipationReceiptSchema = z
  .object({
    warnings: z.array(VehicleParticipationErrorCodeSchema),
    lotStatus: z.enum(['emitted', 'omitted_unpriced', 'omitted_unrepresentable']),
    compat: z
      .object({
        investmentId: z.number().int().positive(),
        investmentRoundId: z.number().int().positive(),
        investmentLotId: z.string().min(1).nullable(),
        cashFlowEventId: z.number().int().positive(),
        sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();

export async function createVehicleFinancingParticipation(
  input: CreateVehicleFinancingParticipationInput
): Promise<LedgerCommandResult<VehicleFinancingParticipationReceiptV1>> {
  const database = input.database ?? db;
  const earlyReplay = await replayExistingParticipationBeforeParse(database, input);
  if (earlyReplay) return earlyReplay;

  const request = CreateVehicleFinancingParticipationRequestSchema.parse(input.request);
  await assertLedgerOwnership(database, input.fundId, 'vehicle', request.vehicleId);
  await assertLedgerOwnership(database, input.fundId, 'financing_tranche', input.trancheId);

  const commandRequest = {
    fundId: input.fundId,
    contractVersion: LEDGER_CONTRACT_VERSION,
    trancheId: input.trancheId,
    ...request,
  };

  const result = await database.transaction(async (transaction) => {
    await lockParticipationFamily(transaction, input.fundId, input.trancheId, request.vehicleId);
    const context = await loadTrancheContext(transaction, input.fundId, input.trancheId);
    const identityLink = await requireExactlyOneIdentityLink(
      transaction,
      input.fundId,
      context.companyIdentityId
    );

    return runIdempotentCommand<ParticipationRow>({
      db: transaction,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      contractVersion: LEDGER_CONTRACT_VERSION,
      request: commandRequest,
      loadExisting: async () => {
        const existing = await selectParticipationByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        return existing ? { row: existing, requestHash: existing.requestHash } : null;
      },
      insert: async (requestHash) => {
        const existing = await selectParticipationByIdempotency(
          transaction,
          input.fundId,
          input.idempotencyKey
        );
        if (existing) return null;

        const duplicateCandidates = await findDuplicateCandidates(transaction, {
          fundId: input.fundId,
          companyId: identityLink.portfolioCompanyId,
          roundName: context.roundName,
          closingDate: request.closingDate ?? context.tranche.closingDate,
          legacyInvestmentAmount: formatRoundHalfUp(request.participationAmount, 2),
          roundInvestmentAmount: request.participationAmount,
        });
        assertDuplicateConfirmationFresh(request.confirmedDuplicates, duplicateCandidates);

        const participationId = readInsertedId(
          await transaction.execute(
            sql`SELECT nextval('vehicle_financing_participations_id_seq') AS id`
          )
        );
        const effectiveClosingDate = request.closingDate ?? context.tranche.closingDate;
        const retainedOriginalAmount = request.originalAmount ?? request.participationAmount;
        const retainedCurrency = request.currency ?? 'USD';
        const retainedFxRateToUsd = request.fxRateToUsd ?? USD_FX_RATE_TO_USD;
        const retainedFxRateDate = request.fxRateDate ?? effectiveClosingDate;
        const inserted = firstParticipation(
          await transaction.execute(sql`
            INSERT INTO vehicle_financing_participations (
              id, fund_id, vehicle_id, financing_event_id, tranche_key,
              financing_tranche_id, version, superseded_by_participation_id,
              participation_amount, original_amount, currency, fx_rate_to_usd,
              fx_rate_date, shares_acquired, closing_date, price_per_share,
              post_money_valuation, valuation_cap, conversion_discount_rate,
              interest_rate, liquidation_preference_multiple, participating_preferred,
              participation_cap_multiple, pro_rata_rights_pct, maturity_date,
              descriptive_terms, confirmed_duplicates, source_observation_id,
              created_by, idempotency_key, request_hash
            ) VALUES (
              ${participationId}, ${input.fundId}, ${request.vehicleId},
              ${context.tranche.financingEventId}, ${context.tranche.trancheKey},
              ${input.trancheId}, 1, NULL, ${request.participationAmount},
              ${retainedOriginalAmount}, ${retainedCurrency},
              ${retainedFxRateToUsd}, ${retainedFxRateDate},
              ${request.sharesAcquired ?? null}, ${request.closingDate ?? null},
              ${request.pricePerShare ?? null}, ${request.postMoneyValuation ?? null},
              ${request.valuationCap ?? null}, ${request.conversionDiscountRate ?? null},
              ${request.interestRate ?? null}, ${request.liquidationPreferenceMultiple ?? null},
              ${request.participatingPreferred ?? null}, ${request.participationCapMultiple ?? null},
              ${request.proRataRightsPct ?? null}, ${request.maturityDate ?? null},
              ${request.descriptiveTerms === undefined ? null : JSON.stringify(request.descriptiveTerms)}::jsonb,
              ${JSON.stringify(request.confirmedDuplicates)}::jsonb, NULL, ${input.actorId},
              ${input.idempotencyKey}, ${requestHash}
            )
            ON CONFLICT DO NOTHING
            RETURNING *
          `)
        );
        if (!inserted) return null;

        const participationDto = participationDtoFromRow(inserted);
        const effectiveTerms = resolveEffectiveTerms(context.tranche, participationDto);
        const projection = projectParticipationCompatibility(effectiveTerms);
        const compatRows = await insertCompatRows(transaction, {
          fundId: input.fundId,
          actorId: input.actorId,
          vehicleId: request.vehicleId,
          companyId: identityLink.portfolioCompanyId,
          financingEventId: context.tranche.financingEventId,
          trancheKey: context.tranche.trancheKey,
          roundName: truncateRoundLabel(context.roundName),
          closingDate: effectiveTerms.closingDate,
          securityType: effectiveTerms.securityType,
          participation: participationDto,
          investmentAmount: projection.investmentAmount,
          roundInvestmentAmount: projection.roundInvestmentAmount,
          cashFlowAmount: projection.cashFlowAmount,
          postMoneyValuation: effectiveTerms.postMoneyValuation,
          lot: projection.lot,
        });
        const observationId = await insertManualObservation(transaction, {
          fundId: input.fundId,
          companyIdentityId: context.companyIdentityId,
          companyName: context.companyName,
          participationId,
          participationVersion: participationDto.version,
          closingDate: effectiveTerms.closingDate,
          participationAmount: projection.cashFlowAmount,
          warnings: projection.warnings,
          sourceHash: compatRows.sourceHash,
          wireFingerprint: compatRows.wireFingerprint,
          compat: compatRows,
        });

        return updateParticipationObservation(transaction, input.fundId, participationId, {
          sourceObservationId: observationId,
        });
      },
    });
  });

  if (!result.replayed) {
    await invalidateH9Artifacts(input.fundId);
  }

  const value = await loadParticipationReceipt(database, input.fundId, result.row.id);
  return {
    value,
    replayed: result.replayed,
  };
}

async function assertLedgerOwnership(
  database: LedgerDatabase,
  fundId: number,
  kind: 'vehicle' | 'financing_tranche',
  id: number
): Promise<void> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind, id },
  });
}

async function replayExistingParticipationBeforeParse(
  database: LedgerDatabase,
  input: CreateVehicleFinancingParticipationInput
): Promise<LedgerCommandResult<VehicleFinancingParticipationReceiptV1> | null> {
  const existing = await selectParticipationByIdempotency(
    database,
    input.fundId,
    input.idempotencyKey
  );
  if (!existing) return null;

  const parsed = CreateVehicleFinancingParticipationRequestSchema.safeParse(input.request);
  if (parsed.success) {
    assertReplayHash(
      existing.requestHash,
      canonicalSha256({
        fundId: input.fundId,
        contractVersion: LEDGER_CONTRACT_VERSION,
        trancheId: input.trancheId,
        ...parsed.data,
      }),
      input.idempotencyKey
    );
  } else if (existing.financingTrancheId !== input.trancheId) {
    throwIdempotencyKeyReuse(input.idempotencyKey);
  }

  return {
    value: await loadParticipationReceipt(database, input.fundId, existing.id),
    replayed: true,
  };
}

async function selectParticipationByIdempotency(
  database: LedgerDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<ParticipationRow | null> {
  return firstParticipation(
    await database.execute(sql`
      SELECT * FROM vehicle_financing_participations
      WHERE fund_id = ${fundId} AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `)
  );
}

async function loadTrancheContext(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number
): Promise<TrancheContext> {
  const row = readRows(
    await database.execute(sql`
      SELECT t.*, e.round_name, e.company_identity_id, i.canonical_name
      FROM financing_tranches t
      JOIN financing_events e
        ON e.id = t.financing_event_id AND e.fund_id = t.fund_id
      JOIN company_identities i
        ON i.id = e.company_identity_id AND i.fund_id = e.fund_id
      WHERE t.id = ${trancheId}
        AND t.fund_id = ${fundId}
        AND t.superseded_by_tranche_id IS NULL
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new ParticipationLedgerServiceError(
      404,
      'LEDGER_WRITE_FAILED',
      'Financing tranche not found in this fund.'
    );
  }
  return {
    tranche: financingTrancheDto(row),
    roundName: asString(row['round_name']),
    companyIdentityId: asPositiveInt(row['company_identity_id']),
    companyName: asString(row['canonical_name']),
  };
}

async function requireExactlyOneIdentityLink(
  database: LedgerDatabase,
  fundId: number,
  companyIdentityId: number
): Promise<IdentityLink> {
  const rows = readRows(
    await database.execute(sql`
      SELECT portfolio_company_id
      FROM portfolio_company_identity_links
      WHERE fund_id = ${fundId}
        AND company_identity_id = ${companyIdentityId}
        AND active = true
      ORDER BY portfolio_company_id
      LIMIT 2
    `)
  );
  if (rows.length === 0) {
    throw new ParticipationLedgerServiceError(
      409,
      'IDENTITY_LINK_REQUIRED',
      'A participation requires exactly one active company identity link.'
    );
  }
  if (rows.length > 1) {
    throw new ParticipationLedgerServiceError(
      409,
      'IDENTITY_LINK_AMBIGUOUS',
      'A participation requires exactly one active company identity link.'
    );
  }
  return { portfolioCompanyId: asPositiveInt(rows[0]?.['portfolio_company_id']) };
}

async function findDuplicateCandidates(
  database: LedgerDatabase,
  input: {
    fundId: number;
    companyId: number;
    roundName: string;
    closingDate: string;
    legacyInvestmentAmount: string;
    roundInvestmentAmount: string;
  }
): Promise<DuplicateCandidate[]> {
  const rows = readRows(
    await database.execute(sql`
      SELECT i.id AS investment_id, r.id AS round_id, i.amount, i.round, i.investment_date,
             r.round_name, r.round_date, r.investment_amount
      FROM investments i
      LEFT JOIN investment_rounds r
        ON r.investment_id = i.id AND r.fund_id = i.fund_id
      WHERE i.fund_id = ${input.fundId}
        AND i.company_id = ${input.companyId}
        AND (i.imported_from IS NULL OR i.imported_from <> 'vehicle_participation')
        AND i.amount = ${input.legacyInvestmentAmount}
        AND i.round = ${input.roundName}
        AND i.investment_date::date = ${input.closingDate}
        AND (r.id IS NULL OR r.investment_amount = ${input.roundInvestmentAmount})
    `)
  );
  return rows.map((row) => ({
    fingerprint: canonicalSha256({
      source: 'legacy_investment_position',
      fundId: input.fundId,
      companyId: input.companyId,
      investmentId: row['investment_id'],
      roundId: row['round_id'] ?? null,
      amount: asString(row['amount']),
      round: asString(row['round']),
      investmentDate: asDateString(row['investment_date']),
      roundName: row['round_name'] ?? null,
      roundDate:
        row['round_date'] === null || row['round_date'] === undefined
          ? null
          : asDateString(row['round_date']),
      roundInvestmentAmount: row['investment_amount'] ?? null,
    }),
  }));
}

function assertDuplicateConfirmationFresh(
  confirmedDuplicates: string[],
  duplicateCandidates: DuplicateCandidate[]
): void {
  if (duplicateCandidates.length === 0) {
    if (confirmedDuplicates.length > 0) {
      throw new ParticipationLedgerServiceError(
        409,
        'DUPLICATE_CONFIRMATION_STALE',
        'Duplicate confirmation no longer matches the current legacy position set.'
      );
    }
    return;
  }

  const current = duplicateCandidates.map((candidate) => candidate.fingerprint).sort();
  const confirmed = [...confirmedDuplicates].sort();
  if (confirmedDuplicates.length === 0) {
    throw new ParticipationLedgerServiceError(
      409,
      'SUSPECTED_DUPLICATE_POSITION',
      'A legacy investment with the same wire was found; echo the fingerprint to confirm.',
      { duplicateFingerprints: current }
    );
  }
  if (JSON.stringify(current) !== JSON.stringify(confirmed)) {
    throw new ParticipationLedgerServiceError(
      409,
      'DUPLICATE_CONFIRMATION_STALE',
      'Duplicate confirmation no longer matches the current legacy position set.',
      { duplicateFingerprints: current }
    );
  }
}

async function insertCompatRows(
  database: LedgerDatabase,
  input: {
    fundId: number;
    actorId: number | null;
    vehicleId: number;
    companyId: number;
    financingEventId: number;
    trancheKey: string;
    roundName: string;
    closingDate: string;
    securityType: string;
    participation: VehicleFinancingParticipationV1;
    investmentAmount: string;
    roundInvestmentAmount: string;
    cashFlowAmount: string;
    postMoneyValuation: string | null;
    lot: { sharePriceCents: bigint; sharesAcquired: string; costBasisCents: bigint } | null;
  }
): Promise<CompatRows> {
  const investmentId = readInsertedId(
    await database.execute(sql`
      INSERT INTO investments (
        fund_id, company_id, investment_date, amount, round,
        valuation_at_investment, share_price_cents, shares_acquired,
        cost_basis_cents, pricing_confidence, imported_from,
        vehicle_participation_id, version, created_at
      ) VALUES (
        ${input.fundId}, ${input.companyId}, ${asMidnightUtc(input.closingDate)},
        ${input.investmentAmount}, ${input.roundName}, ${input.postMoneyValuation},
        ${input.lot?.sharePriceCents ?? null}, ${input.lot?.sharesAcquired ?? null},
        ${input.lot?.costBasisCents ?? null}, 'verified', 'vehicle_participation',
        ${input.participation.id}, 1, NOW()
      )
      RETURNING id
    `)
  );
  const roundIdempotencyKey = compatIdempotencyKey(input.participation, 'round');
  const roundPayload = {
    source: 'vehicle_participation',
    participationId: input.participation.id,
    participationVersion: input.participation.version,
    investmentId,
    role: 'round',
    amount: input.roundInvestmentAmount,
  };
  const investmentRoundId = readInsertedId(
    await database.execute(sql`
      INSERT INTO investment_rounds (
        investment_id, fund_id, round_name, security_type, round_date, currency,
        investment_amount, idempotency_key, request_hash, imported_from,
        vehicle_participation_id, financing_tranche_id, created_by
      ) VALUES (
        ${investmentId}, ${input.fundId}, ${input.roundName}, ${input.securityType},
        ${input.closingDate}, 'USD', ${input.roundInvestmentAmount}, ${roundIdempotencyKey},
        ${canonicalSha256(roundPayload)}, 'vehicle_participation', ${input.participation.id},
        ${input.participation.financingTrancheId}, ${input.actorId}
      )
      RETURNING id
    `)
  );
  const investmentLotId =
    input.lot === null
      ? null
      : asString(
          readRows(
            await database.execute(sql`
              INSERT INTO investment_lots (
                investment_id, lot_type, share_price_cents, shares_acquired,
                cost_basis_cents, idempotency_key, imported_from, vehicle_participation_id
              ) VALUES (
                ${investmentId}, 'initial', ${input.lot.sharePriceCents},
                ${input.lot.sharesAcquired}, ${input.lot.costBasisCents},
                ${compatIdempotencyKey(input.participation, 'lot:initial')},
                'vehicle_participation', ${input.participation.id}
              )
              RETURNING id
            `)
          )[0]?.['id']
        );
  const wireFingerprint = createParticipationWireFingerprint({
    fundId: input.fundId,
    vehicleId: input.vehicleId,
    portfolioCompanyId: input.companyId,
    financingEventId: input.financingEventId,
    trancheKey: input.trancheKey,
    effectiveClosingDate: input.closingDate,
    cashFlowAmountUsd: input.cashFlowAmount,
    currency: 'USD',
  });
  const sourceHash = createOriginalParticipationSourceHash(wireFingerprint);
  const cashFlowEventId = readInsertedId(
    await database.execute(sql`
      INSERT INTO cash_flow_events (
        fund_id, vehicle_id, company_id, event_type, amount, currency, event_date,
        perspective, description, payload, status, imported_from, source_hash,
        vehicle_participation_id, created_by
      ) VALUES (
        ${input.fundId}, ${input.vehicleId}, ${input.companyId}, 'portfolio_investment',
        ${input.cashFlowAmount}, 'USD', ${asMidnightUtc(input.closingDate)}, 'vehicle',
        ${`Vehicle participation ${input.participation.id}`},
        ${JSON.stringify({
          source: 'vehicle_participation',
          wireFingerprint,
          participationId: input.participation.id,
          participationVersion: input.participation.version,
          financingTrancheId: input.participation.financingTrancheId,
        })}::jsonb,
        'approved', 'vehicle_participation', ${sourceHash},
        ${input.participation.id}, ${input.actorId}
      )
      RETURNING id
    `)
  );
  return {
    investmentId,
    investmentRoundId,
    investmentLotId,
    cashFlowEventId,
    sourceHash,
    wireFingerprint,
  };
}

async function insertManualObservation(
  database: LedgerDatabase,
  input: {
    fundId: number;
    companyIdentityId: number;
    companyName: string;
    participationId: number;
    participationVersion: number;
    closingDate: string;
    participationAmount: string;
    warnings: VehicleParticipationErrorCode[];
    sourceHash: string;
    wireFingerprint: string;
    compat: CompatRows;
  }
): Promise<number> {
  const sourceLocator = `vehicle-participation:${input.participationId}`;
  const candidate = normalizeManualObservation({
    domain: 'ledger_event',
    measureKey: 'initial_investment',
    companyName: input.companyName,
    effectiveDate: input.closingDate,
    amount: input.participationAmount,
    currency: 'USD',
    fxRate: USD_FX_RATE_TO_USD,
    sourceLocator,
    descriptor: {
      sourceLabel: `${sourceLocator}:v${input.participationVersion}`,
    },
  });
  if (
    candidate.outcome === 'rejected' ||
    !candidate.normalizedPayload ||
    !candidate.observationHash ||
    !candidate.candidateFingerprint ||
    !candidate.effectiveDate
  ) {
    throw new ParticipationLedgerServiceError(
      422,
      'NORMALIZATION_REJECTED',
      'The canonical participation write could not produce a manual observation.'
    );
  }

  const receiptCompat: Omit<CompatRows, 'wireFingerprint'> = {
    investmentId: input.compat.investmentId,
    investmentRoundId: input.compat.investmentRoundId,
    investmentLotId: input.compat.investmentLotId,
    cashFlowEventId: input.compat.cashFlowEventId,
    sourceHash: input.compat.sourceHash,
  };
  const observationId = readInsertedId(
    await database.execute(sql`SELECT nextval('source_observations_id_seq') AS id`)
  );
  const normalizedPayload = {
    ...candidate.normalizedPayload,
    provenance: {
      source: 'vehicle_participation',
      participationId: input.participationId,
      participationVersion: input.participationVersion,
      sourceHash: input.sourceHash,
      wireFingerprint: input.wireFingerprint,
      warnings: input.warnings,
      receipt: {
        warnings: input.warnings,
        lotStatus: lotStatusFromWarnings(input.warnings, receiptCompat.investmentLotId),
        compat: receiptCompat,
      },
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
        ${JSON.stringify(normalizedPayload)}::jsonb,
        ${canonicalSha256(normalizedPayload)}, ${candidate.candidateFingerprint},
        ${sourceLocator}, ${dependencyGroupKeyForObservation(observationId)}, 'accepted'
      )
      RETURNING id
    `)
  );
  if (insertedId !== observationId) {
    throw new ParticipationLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Observation insert returned an unexpected id.'
    );
  }
  return observationId;
}

async function updateParticipationObservation(
  database: LedgerDatabase,
  fundId: number,
  participationId: number,
  values: { sourceObservationId: number }
): Promise<ParticipationRow> {
  const updated = firstParticipation(
    await database.execute(sql`
      UPDATE vehicle_financing_participations
      SET source_observation_id = ${values.sourceObservationId}
      WHERE id = ${participationId} AND fund_id = ${fundId}
      RETURNING *
    `)
  );
  if (!updated) {
    throw new ParticipationLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Participation observation linkage returned no row.'
    );
  }
  return updated;
}

async function loadParticipationReceipt(
  database: LedgerDatabase,
  fundId: number,
  participationId: number
): Promise<VehicleFinancingParticipationReceiptV1> {
  const row = readRows(
    await database.execute(sql`
      SELECT p.*, i.id AS investment_id, r.id AS investment_round_id,
             l.id AS investment_lot_id, c.id AS cash_flow_event_id, c.source_hash,
             so.normalized_payload
      FROM vehicle_financing_participations p
      LEFT JOIN investments i
        ON i.vehicle_participation_id = p.id AND i.fund_id = p.fund_id
      LEFT JOIN investment_rounds r
        ON r.vehicle_participation_id = p.id AND r.fund_id = p.fund_id
      LEFT JOIN investment_lots l
        ON l.vehicle_participation_id = p.id AND l.investment_id = i.id
      LEFT JOIN cash_flow_events c
        ON c.vehicle_participation_id = p.id AND c.fund_id = p.fund_id
      LEFT JOIN source_observations so
        ON so.id = p.source_observation_id AND so.fund_id = p.fund_id
      WHERE p.fund_id = ${fundId}
        AND p.id = ${participationId}
      LIMIT 1
    `)
  )[0];
  if (!row) {
    throw new ParticipationLedgerServiceError(
      500,
      'LEDGER_WRITE_FAILED',
      'Participation receipt could not be reloaded.'
    );
  }
  const warnings = warningsFromObservation(row['normalized_payload']);
  const storedReceipt = storedReceiptFromObservation(row['normalized_payload']);
  if (storedReceipt) {
    return {
      participation: participationDtoFromRow(participationFromRow(row)),
      warnings: storedReceipt.warnings,
      lotStatus: storedReceipt.lotStatus,
      compat: {
        ...storedReceipt.compat,
        sourceObservationId: asPositiveInt(row['source_observation_id']),
      },
    };
  }
  return {
    participation: participationDtoFromRow(participationFromRow(row)),
    warnings,
    lotStatus: lotStatusFromWarnings(warnings, row['investment_lot_id']),
    compat: {
      investmentId: asPositiveInt(row['investment_id']),
      investmentRoundId: asPositiveInt(row['investment_round_id']),
      investmentLotId:
        row['investment_lot_id'] === null || row['investment_lot_id'] === undefined
          ? null
          : asString(row['investment_lot_id']),
      cashFlowEventId: asPositiveInt(row['cash_flow_event_id']),
      sourceObservationId: asPositiveInt(row['source_observation_id']),
      sourceHash: asString(row['source_hash']),
    },
  };
}

function storedReceiptFromObservation(
  value: unknown
): z.infer<typeof StoredParticipationReceiptSchema> | null {
  const payload = asRecord(value);
  const provenance = asRecord(payload['provenance'] ?? {});
  const parsed = StoredParticipationReceiptSchema.safeParse(provenance['receipt']);
  return parsed.success ? parsed.data : null;
}

function warningsFromObservation(value: unknown): VehicleParticipationErrorCode[] {
  const payload = asRecord(value);
  const provenance = asRecord(payload['provenance'] ?? {});
  const warnings = provenance['warnings'];
  return Array.isArray(warnings) ? (warnings as VehicleParticipationErrorCode[]) : [];
}

function lotStatusFromWarnings(
  warnings: VehicleParticipationErrorCode[],
  investmentLotId: unknown
): VehicleFinancingParticipationReceiptV1['lotStatus'] {
  if (warnings.includes('LOT_OMITTED_UNPRICED')) return 'omitted_unpriced';
  if (warnings.includes('LOT_OMITTED_UNREPRESENTABLE')) return 'omitted_unrepresentable';
  return investmentLotId === null || investmentLotId === undefined
    ? 'omitted_unrepresentable'
    : 'emitted';
}

async function lockParticipationFamily(
  database: LedgerDatabase,
  fundId: number,
  trancheId: number,
  vehicleId: number
): Promise<void> {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`fund-identity:${fundId}`}))`);
  await database.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`participation:${fundId}:${trancheId}:${vehicleId}`}))`
  );
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

function compatIdempotencyKey(
  participation: Pick<VehicleFinancingParticipationV1, 'id' | 'version'>,
  role: string
): string {
  return `vfp:${participation.id}:v${participation.version}:${role}`;
}

function truncateRoundLabel(roundName: string): string {
  if (roundName.length <= 120) return roundName;
  const suffix = canonicalSha256({ roundName }).slice(0, 8);
  return `${roundName.slice(0, 111)}-${suffix}`;
}

function asMidnightUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function participationDtoFromRow(row: ParticipationRow): VehicleFinancingParticipationV1 {
  return VehicleFinancingParticipationV1Schema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
}

function financingTrancheDto(row: Record<string, unknown>): FinancingTrancheV1 {
  return FinancingTrancheV1Schema.parse({
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
    createdAt: asDate(row['created_at'] ?? row['createdAt']).toISOString(),
  });
}

function firstParticipation(result: unknown): ParticipationRow | null {
  const row = readRows(result)[0];
  return row ? participationFromRow(row) : null;
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
    descriptiveTerms:
      row['descriptive_terms'] === null || row['descriptive_terms'] === undefined
        ? null
        : asRecord(row['descriptive_terms']),
    confirmedDuplicates: asStringArray(row['confirmed_duplicates'] ?? row['confirmedDuplicates']),
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
  return asPositiveInt(readRows(result)[0]?.['id']);
}

function asPositiveInt(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ParticipationLedgerServiceError(
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
    throw new ParticipationLedgerServiceError(
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

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return asStringArray(JSON.parse(value) as unknown);
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  throw new ParticipationLedgerServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned an invalid string array.'
  );
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
  throw new ParticipationLedgerServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned an invalid timestamp.'
  );
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  throw new ParticipationLedgerServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned an invalid boolean.'
  );
}

function asNullableBoolean(value: unknown): boolean | null {
  return value === null || value === undefined ? null : asBoolean(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return asRecord(JSON.parse(value) as unknown);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new ParticipationLedgerServiceError(
    500,
    'LEDGER_WRITE_FAILED',
    'Database returned an invalid JSON object.'
  );
}

export { IdempotentCommandError };
