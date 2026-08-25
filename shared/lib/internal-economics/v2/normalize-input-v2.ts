import { createHash } from 'node:crypto';
import {
  InternalEconomicsInputV2WireSchema,
  INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION,
  V2_ADMISSION_LIMITS,
  type V2CoreRefusal,
  type NormalizedInternalEconomicsInputV2,
  type InternalEconomicsInputV2Wire,
  type WaterfallTierV2,
  type V2Stage,
  type V2RefusalCode,
  type OpeningCashOwnerV2,
  type OpeningPartnerOwnerV2,
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import type { NormalizeInputV2Result } from '../../../contracts/internal-economics/internal-economics-receipt-v2.contract';
import { Decimal } from '../../../lib/decimal-config';

export const INTERNAL_ECONOMICS_NORMALIZER_V2_VERSION = 'internal-economics-normalizer/2.0.1' as const;

function refuse(code: V2RefusalCode, stage: V2Stage, message: string): NormalizeInputV2Result {
  return { ok: false, refusal: { ok: false, code, stage, message } };
}

function validateCalendar(input: InternalEconomicsInputV2Wire): V2CoreRefusal | null {
  const est = Date.parse(input.fundEstablishmentDate);
  const ipEnd = Date.parse(input.investmentPeriodEndDate);
  const term = Date.parse(input.fundTermDate);
  const cutover = Date.parse(input.cutoverInstant);
  const calc = Date.parse(input.calculationDate);

  if (est > ipEnd || ipEnd > term) {
    return {
      ok: false,
      code: 'SCHEMA_VALIDATION_FAILED',
      stage: 'normalization',
      message:
        'Calendar ordering violated: fundEstablishmentDate <= investmentPeriodEndDate <= fundTermDate.',
    };
  }
  if (est > cutover || cutover > calc) {
    return {
      ok: false,
      code: 'SCHEMA_VALIDATION_FAILED',
      stage: 'normalization',
      message:
        'Calendar ordering violated: fundEstablishmentDate <= cutoverInstant <= calculationDate.',
    };
  }
  return null;
}

function validateEventWindow(input: InternalEconomicsInputV2Wire): V2CoreRefusal | null {
  const cutover = Date.parse(input.cutoverInstant);
  const calculation = Date.parse(input.calculationDate);

  for (const event of input.events) {
    const instant = Date.parse(event.instant);
    if (instant <= cutover || instant > calculation) {
      return {
        ok: false,
        code: 'EVENT_OUT_OF_WINDOW',
        stage: 'normalization',
        message: `Event ${event.eventId} at ${event.instant} is outside the window (${input.cutoverInstant}, ${input.calculationDate}].`,
        diagnostics: { eventId: event.eventId },
      };
    }
  }
  return null;
}

function validateDuplicateEvents(input: InternalEconomicsInputV2Wire): V2CoreRefusal | null {
  const seen = new Set<string>();
  for (const event of input.events) {
    if (seen.has(event.eventId)) {
      return {
        ok: false,
        code: 'DUPLICATE_EVENT_IDENTITY',
        stage: 'normalization',
        message: `Duplicate event ID: ${event.eventId}.`,
        diagnostics: { eventId: event.eventId },
      };
    }
    seen.add(event.eventId);
  }
  return null;
}

function validateAdmissionLimits(
  input: InternalEconomicsInputV2Wire,
  serializedBytes: number
): V2CoreRefusal | null {
  const limits = V2_ADMISSION_LIMITS;

  if (input.events.length > limits.MAX_EVENTS) {
    return {
      ok: false,
      code: 'ADMISSION_LIMIT_EXCEEDED',
      stage: 'admission',
      message: `Events count ${input.events.length} exceeds limit ${limits.MAX_EVENTS}.`,
    };
  }
  if (input.partners.length > limits.MAX_PARTNERS) {
    return {
      ok: false,
      code: 'ADMISSION_LIMIT_EXCEEDED',
      stage: 'admission',
      message: `Partners count ${input.partners.length} exceeds limit ${limits.MAX_PARTNERS}.`,
    };
  }
  if (input.lpClasses.length > limits.MAX_LP_CLASSES) {
    return {
      ok: false,
      code: 'ADMISSION_LIMIT_EXCEEDED',
      stage: 'admission',
      message: `LP classes count ${input.lpClasses.length} exceeds limit ${limits.MAX_LP_CLASSES}.`,
    };
  }
  if (serializedBytes > limits.MAX_SERIALIZED_INPUT_BYTES) {
    return {
      ok: false,
      code: 'ADMISSION_LIMIT_EXCEEDED',
      stage: 'admission',
      message: `Serialized input size ${serializedBytes} bytes exceeds limit ${limits.MAX_SERIALIZED_INPUT_BYTES}.`,
    };
  }
  let provenanceRows = 0;
  const openingProvenance = input.openingState.openingProvenance;
  provenanceRows +=
    openingProvenance.cashLots.length +
    openingProvenance.investmentLots.length +
    openingProvenance.entitlementPools.length;
  for (const event of input.events) {
    if ('cashSourceAllocations' in event && event.cashSourceAllocations) {
      provenanceRows += event.cashSourceAllocations.length;
    }
    if ('reliefRows' in event && event.reliefRows) {
      provenanceRows += event.reliefRows.length;
    }
  }
  if (provenanceRows > limits.MAX_PROVENANCE_ALLOCATION_ROWS) {
    return {
      ok: false,
      code: 'ADMISSION_LIMIT_EXCEEDED',
      stage: 'admission',
      message: `Combined provenance/allocation rows ${provenanceRows} exceeds limit ${limits.MAX_PROVENANCE_ALLOCATION_ROWS}.`,
    };
  }

  return null;
}

function validateTierPolicy(tiers: readonly WaterfallTierV2[]): V2CoreRefusal | null {
  if (tiers.length === 0) {
    return {
      ok: false,
      code: 'INVALID_TIER_POLICY',
      stage: 'normalization',
      message: 'Waterfall policy must have at least one tier.',
    };
  }

  const last = tiers[tiers.length - 1]!;
  if (last.kind !== 'carry') {
    return {
      ok: false,
      code: 'INVALID_TIER_POLICY',
      stage: 'normalization',
      message: 'The last tier must be carry.',
    };
  }

  const kindCounts = new Map<string, number>();
  for (const tier of tiers) {
    kindCounts.set(tier.kind, (kindCounts.get(tier.kind) ?? 0) + 1);
  }
  for (const [kind, count] of kindCounts) {
    if (count > 1) {
      return {
        ok: false,
        code: 'INVALID_TIER_POLICY',
        stage: 'normalization',
        message: `Tier kind ${kind} appears ${count} times; each kind may appear at most once.`,
      };
    }
  }

  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i]!.priority !== i + 1) {
      return {
        ok: false,
        code: 'INVALID_TIER_POLICY',
        stage: 'normalization',
        message: `Tier priorities must be 1-indexed, unique, contiguous. Expected ${i + 1}, got ${tiers[i]!.priority}.`,
      };
    }
  }

  for (const tier of tiers) {
    const ratio =
      tier.kind === 'preferred_return'
        ? tier.annualRate
        : tier.kind === 'gp_catch_up'
          ? tier.gpAllocationRate
          : tier.kind === 'carry'
            ? tier.gpShare
            : null;
    if (ratio !== null) {
      const value = new Decimal(ratio);
      if (value.lt(0) || value.gt(1)) {
        return {
          ok: false,
          code: 'INVALID_TIER_POLICY',
          stage: 'normalization',
          message: `Tier ${tier.kind} ratio must be within [0, 1].`,
        };
      }
    }
  }

  const catchUpIndex = tiers.findIndex((t) => t.kind === 'gp_catch_up');
  const prefIndex = tiers.findIndex((t) => t.kind === 'preferred_return');
  const carryIndex = tiers.findIndex((t) => t.kind === 'carry');

  if (catchUpIndex >= 0) {
    if (prefIndex < 0) {
      return {
        ok: false,
        code: 'INVALID_TIER_POLICY',
        stage: 'normalization',
        message: 'gp_catch_up requires preferred_return.',
      };
    }
    if (catchUpIndex !== carryIndex - 1) {
      return {
        ok: false,
        code: 'INVALID_TIER_POLICY',
        stage: 'normalization',
        message: 'gp_catch_up must sit immediately before carry.',
      };
    }
    const catchUp = tiers[catchUpIndex] as { kind: 'gp_catch_up'; gpAllocationRate: string };
    const carry = tiers[carryIndex] as { kind: 'carry'; gpShare: string };
    const gpAllocRate = new Decimal(catchUp.gpAllocationRate);
    const gpShare = new Decimal(carry.gpShare);

    if (gpAllocRate.lte(gpShare)) {
      return {
        ok: false,
        code: 'INVALID_TIER_POLICY',
        stage: 'normalization',
        message: 'gp_catch_up gpAllocationRate must exceed carry gpShare.',
      };
    }
    if (gpAllocRate.gt(1)) {
      return {
        ok: false,
        code: 'INVALID_TIER_POLICY',
        stage: 'normalization',
        message: 'gp_catch_up gpAllocationRate must be at most 1.0.',
      };
    }
  }

  return null;
}

function validateLpClasses(input: InternalEconomicsInputV2Wire): V2CoreRefusal | null {
  const partnerIds = new Set(input.partners.map((partner) => partner.partnerId));
  if (partnerIds.size !== input.partners.length) {
    return {
      ok: false,
      code: 'LP_CLASS_PROFILE_AMBIGUITY',
      stage: 'normalization',
      message: 'Duplicate partner IDs.',
    };
  }
  const classIds = new Set(input.lpClasses.map((c) => c.lpClassId));
  if (classIds.size !== input.lpClasses.length) {
    return {
      ok: false,
      code: 'LP_CLASS_PROFILE_AMBIGUITY',
      stage: 'normalization',
      message: 'Duplicate LP class IDs.',
    };
  }
  for (const partner of input.partners) {
    if (partner.isGp && partner.lpClassId) {
      return {
        ok: false,
        code: 'LP_CLASS_PROFILE_AMBIGUITY',
        stage: 'normalization',
        message: `GP partner ${partner.partnerId} must not belong to an LP class.`,
        diagnostics: { partnerId: partner.partnerId },
      };
    }
    if (!partner.isGp && partner.lpClassId && !classIds.has(partner.lpClassId)) {
      return {
        ok: false,
        code: 'LP_CLASS_PROFILE_AMBIGUITY',
        stage: 'normalization',
        message: `Partner ${partner.partnerId} references unknown LP class ${partner.lpClassId}.`,
        diagnostics: { partnerId: partner.partnerId },
      };
    }
    if (!partner.isGp && !partner.lpClassId) {
      return {
        ok: false,
        code: 'LP_CLASS_PROFILE_AMBIGUITY',
        stage: 'normalization',
        message: `LP partner ${partner.partnerId} must belong to an LP class.`,
        diagnostics: { partnerId: partner.partnerId },
      };
    }
  }
  return null;
}

function validateOpeningReconciliation(input: InternalEconomicsInputV2Wire): V2CoreRefusal | null {
  const opening = input.openingState;
  const partnerById = new Map(input.partners.map((partner) => [partner.partnerId, partner]));
  const partnerIds = new Set(partnerById.keys());
  const ledgerPartnerIds = new Set<string>();

  for (const ledger of opening.investorLedgers) {
    if (ledgerPartnerIds.has(ledger.partnerId)) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: `Duplicate investor ledger entry for partner ${ledger.partnerId}.`,
        diagnostics: { partnerId: ledger.partnerId },
      };
    }
    const partner = partnerById.get(ledger.partnerId);
    if (!partner) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: `Investor ledger references unknown partner ${ledger.partnerId}.`,
        diagnostics: { partnerId: ledger.partnerId },
      };
    }
    ledgerPartnerIds.add(ledger.partnerId);
  }

  for (const partnerId of partnerIds) {
    if (!ledgerPartnerIds.has(partnerId)) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: `Partner "${partnerId}" has no investor ledger entry in openingState.`,
        diagnostics: { partnerId },
      };
    }
  }

  for (const ledger of opening.investorLedgers) {
    const partner = partnerById.get(ledger.partnerId)!;
    const committedCapital = new Decimal(ledger.committedCapital);
    const calledCapital = new Decimal(ledger.calledCapital);
    const settledCapital = new Decimal(ledger.settledCapital);
    const paidInCapital = new Decimal(ledger.paidInCapital);
    const unreturnedCapital = new Decimal(ledger.unreturnedSettledCashCapital);
    const balances = [
      committedCapital,
      calledCapital,
      settledCapital,
      paidInCapital,
      unreturnedCapital,
      new Decimal(ledger.cumulativeDistributions),
      new Decimal(ledger.cumulativeFees),
      new Decimal(ledger.accruedPreference),
    ];
    if (
      balances.some((balance) => balance.lt(0)) ||
      unreturnedCapital.gt(paidInCapital) ||
      !paidInCapital.eq(settledCapital) ||
      settledCapital.gt(calledCapital) ||
      calledCapital.gt(committedCapital)
    ) {
      return {
        ok: false,
        code: 'OPENING_RECONCILIATION_VIOLATION',
        stage: 'normalization',
        message: `Partner ${ledger.partnerId} opening ledger violates supported balance invariants.`,
        diagnostics: { partnerId: ledger.partnerId },
      };
    }

    if (
      partner.gpDeemedContribution !== undefined &&
      !new Decimal(partner.gpDeemedContribution).isZero()
    ) {
      return {
        ok: false,
        code: 'OPENING_RECONCILIATION_VIOLATION',
        stage: 'normalization',
        message: `Partner ${ledger.partnerId} gpDeemedContribution is unsupported in F1.`,
        diagnostics: { partnerId: ledger.partnerId },
      };
    }

    const expectedRemainingCallable = committedCapital.minus(calledCapital);
    if (
      !new Decimal(partner.committedCapital).eq(committedCapital) ||
      !new Decimal(partner.settledCash).eq(settledCapital) ||
      !new Decimal(partner.remainingCallableCommitment).eq(expectedRemainingCallable)
    ) {
      return {
        ok: false,
        code: 'OPENING_RECONCILIATION_VIOLATION',
        stage: 'normalization',
        message: `Partner ${ledger.partnerId} summary does not reconcile to its opening ledger.`,
        diagnostics: { partnerId: ledger.partnerId },
      };
    }
  }

  const ledgerCommitmentSum = opening.investorLedgers.reduce(
    (sum, l) => sum.plus(new Decimal(l.committedCapital)),
    new Decimal(0)
  );
  if (!ledgerCommitmentSum.eq(new Decimal(opening.openingCommitments))) {
    return {
      ok: false,
      code: 'OPENING_RECONCILIATION_VIOLATION',
      stage: 'normalization',
      message: 'openingCommitments does not equal sum of investor ledger committedCapital.',
      diagnostics: {
        expectedCents: opening.openingCommitments,
        actualCents: ledgerCommitmentSum.toFixed(6),
      },
    };
  }

  const ledgerPrefSum = opening.investorLedgers.reduce(
    (sum, l) => sum.plus(new Decimal(l.accruedPreference)),
    new Decimal(0)
  );
  if (!ledgerPrefSum.eq(new Decimal(opening.accruedPreferenceTotal))) {
    return {
      ok: false,
      code: 'OPENING_RECONCILIATION_VIOLATION',
      stage: 'normalization',
      message: 'accruedPreferenceTotal does not equal sum of investor ledger accruedPreference.',
    };
  }

  const ledgerDistSum = opening.investorLedgers.reduce(
    (sum, l) => sum.plus(new Decimal(l.cumulativeDistributions)),
    new Decimal(0)
  );
  if (!ledgerDistSum.eq(new Decimal(opening.cumulativeDistributionsTotal))) {
    return {
      ok: false,
      code: 'OPENING_RECONCILIATION_VIOLATION',
      stage: 'normalization',
      message:
        'cumulativeDistributionsTotal does not equal sum of investor ledger cumulativeDistributions.',
    };
  }

  const ledgerFeeSum = opening.investorLedgers.reduce(
    (sum, l) => sum.plus(new Decimal(l.cumulativeFees)),
    new Decimal(0)
  );
  if (!ledgerFeeSum.eq(new Decimal(opening.cumulativeFeesTotal))) {
    return {
      ok: false,
      code: 'OPENING_RECONCILIATION_VIOLATION',
      stage: 'normalization',
      message: 'cumulativeFeesTotal does not equal sum of investor ledger cumulativeFees.',
    };
  }

  const cashClass = opening.openingCashClassification;
  const classifiedTotal = new Decimal(cashClass.paidIn)
    .plus(new Decimal(cashClass.recycling))
    .plus(new Decimal(cashClass.unclassified));
  if (!classifiedTotal.eq(new Decimal(opening.openingCash))) {
    return {
      ok: false,
      code: 'OPENING_RECONCILIATION_VIOLATION',
      stage: 'normalization',
      message:
        'Opening cash classification (paidIn + recycling + unclassified) does not equal openingCash.',
    };
  }

  return null;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortOpeningProvenance(input: InternalEconomicsInputV2Wire): void {
  const provenance = input.openingState.openingProvenance;
  provenance.cashLots.sort((a, b) => compareText(a.lotId, b.lotId));
  provenance.investmentLots.sort((a, b) => compareText(a.investmentLotId, b.investmentLotId));
  provenance.entitlementPools.sort((a, b) => compareText(a.entitlementPoolId, b.entitlementPoolId));
}

function validateOpeningProvenance(input: InternalEconomicsInputV2Wire): V2CoreRefusal | null {
  const opening = input.openingState;
  const provenance = opening.openingProvenance;
  const hasUnprovenOpeningHistory = [
    opening.accruedPreferenceTotal,
    opening.cumulativeDistributionsTotal,
    opening.cumulativeFeesTotal,
    opening.consumedFeeRecyclingCapacity,
    opening.consumedExitRecyclingCapacity,
    opening.profitDecomposition.openingCumulativePreferredPaid,
    opening.profitDecomposition.openingCumulativeGpProfitDistributions,
    opening.profitDecomposition.openingCumulativeLpProfitDistributions,
  ].some((amount) => !new Decimal(amount).isZero());

  if (hasUnprovenOpeningHistory) {
    return {
      ok: false,
      code: 'OPENING_PROVENANCE_REQUIRED',
      stage: 'normalization',
      message: 'Nonzero opening history requires provenance not present in the strict wire.',
    };
  }

  const partnerById = new Map(input.partners.map((partner) => [partner.partnerId, partner]));
  const classIds = new Set(input.lpClasses.map((lpClass) => lpClass.lpClassId));
  const poolById = new Map(
    provenance.entitlementPools.map((pool) => [pool.entitlementPoolId, pool])
  );

  function validatePartnerOwner(owner: OpeningPartnerOwnerV2): string | null {
    const partner = partnerById.get(owner.partnerId);
    if (!partner) return `Unknown partner ${owner.partnerId}.`;
    if (owner.kind === 'gp') return partner.isGp ? null : `Partner ${owner.partnerId} is not GP.`;
    if (partner.isGp) return `Partner ${owner.partnerId} is not LP.`;
    if (!classIds.has(owner.lpClassId) || partner.lpClassId !== owner.lpClassId) {
      return `LP owner ${owner.partnerId} has invalid class ${owner.lpClassId}.`;
    }
    return null;
  }

  function validateCashOwner(owner: OpeningCashOwnerV2): string | null {
    if (owner.kind === 'fund') return null;
    if (owner.kind === 'entitlement_pool') {
      return poolById.has(owner.entitlementPoolId)
        ? null
        : `Unknown entitlement pool ${owner.entitlementPoolId}.`;
    }
    return validatePartnerOwner(owner);
  }

  const cashIds = new Set<string>();
  const referencedPoolIds = new Set<string>();
  const sourceRefs = new Map<string, string>();
  function validateSourceRef(sourceRef: string, identity: string): string | null {
    const existing = sourceRefs.get(sourceRef);
    if (existing && existing !== identity) return `Source reference ${sourceRef} is ambiguous.`;
    sourceRefs.set(sourceRef, identity);
    return null;
  }
  const cashTotals = {
    paid_in: new Decimal(0),
    recycling: new Decimal(0),
    unclassified: new Decimal(0),
  };
  const capitalByPartner = new Map(
    input.partners.map((partner) => [partner.partnerId, new Decimal(0)])
  );
  for (const lot of provenance.cashLots) {
    if (cashIds.has(lot.lotId)) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: `Duplicate opening cash lot ID ${lot.lotId}.`,
      };
    }
    cashIds.add(lot.lotId);
    const ownerError =
      validateCashOwner(lot.owner) ?? validateSourceRef(lot.sourceRef, `cash:${lot.lotId}`);
    const ownerMatchesClassification =
      (lot.classification === 'paid_in' && (lot.owner.kind === 'lp' || lot.owner.kind === 'gp')) ||
      (lot.classification === 'recycling' && lot.owner.kind === 'entitlement_pool') ||
      (lot.classification === 'unclassified' && lot.owner.kind === 'fund');
    if (ownerError || !ownerMatchesClassification) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: ownerError ?? `Cash lot ${lot.lotId} owner conflicts with classification.`,
      };
    }
    const original = new Decimal(lot.originalAmount);
    const remaining = new Decimal(lot.remainingBalance);
    if (original.isNegative() || remaining.isNegative() || remaining.gt(original)) {
      return {
        ok: false,
        code: 'OPENING_RECONCILIATION_VIOLATION',
        stage: 'normalization',
        message: `Opening cash lot ${lot.lotId} violates amount bounds.`,
      };
    }
    if (lot.owner.kind === 'entitlement_pool') {
      referencedPoolIds.add(lot.owner.entitlementPoolId);
    }
    cashTotals[lot.classification] = cashTotals[lot.classification].plus(remaining);
    if (lot.classification === 'paid_in' && (lot.owner.kind === 'lp' || lot.owner.kind === 'gp')) {
      capitalByPartner.set(
        lot.owner.partnerId,
        capitalByPartner.get(lot.owner.partnerId)!.plus(remaining)
      );
    }
  }

  const expectedCash = {
    paid_in: opening.openingCashClassification.paidIn,
    recycling: opening.openingCashClassification.recycling,
    unclassified: opening.openingCashClassification.unclassified,
  };
  for (const classification of ['paid_in', 'recycling', 'unclassified'] as const) {
    if (!cashTotals[classification].eq(new Decimal(expectedCash[classification]))) {
      return {
        ok: false,
        code: 'OPENING_RECONCILIATION_VIOLATION',
        stage: 'normalization',
        message: `Opening ${classification} cash lots do not reconcile to cash classification.`,
      };
    }
  }

  const investmentIds = new Set<string>();
  for (const lot of provenance.investmentLots) {
    if (investmentIds.has(lot.investmentLotId)) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: `Duplicate opening investment lot ID ${lot.investmentLotId}.`,
      };
    }
    investmentIds.add(lot.investmentLotId);
    const ownerError = validatePartnerOwner(lot.owner);
    const sourceRefError = validateSourceRef(lot.sourceRef, `investment:${lot.investmentLotId}`);
    const pool = poolById.get(lot.entitlementPoolId);
    if (
      ownerError ||
      sourceRefError ||
      !pool ||
      pool.dealId !== lot.dealId ||
      pool.securityId !== lot.securityId
    ) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message:
          ownerError ??
          sourceRefError ??
          `Investment lot ${lot.investmentLotId} has inconsistent entitlement pool identity.`,
      };
    }
    const costBasis = new Decimal(lot.costBasis);
    const relieved = new Decimal(lot.relievedAmount);
    const entitlement = new Decimal(lot.entitlementAmount);
    if (
      costBasis.isNegative() ||
      relieved.isNegative() ||
      relieved.gt(costBasis) ||
      entitlement.lte(0)
    ) {
      return {
        ok: false,
        code: 'OPENING_RECONCILIATION_VIOLATION',
        stage: 'normalization',
        message: `Opening investment lot ${lot.investmentLotId} violates numeric bounds.`,
      };
    }
    if (!relieved.isZero()) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: `Opening investment lot ${lot.investmentLotId} has unsupported relief provenance.`,
      };
    }
    referencedPoolIds.add(lot.entitlementPoolId);
    capitalByPartner.set(
      lot.owner.partnerId,
      capitalByPartner.get(lot.owner.partnerId)!.plus(costBasis)
    );
  }

  const poolIds = new Set<string>();
  for (const pool of provenance.entitlementPools) {
    if (poolIds.has(pool.entitlementPoolId)) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: `Duplicate entitlement pool ID ${pool.entitlementPoolId}.`,
      };
    }
    poolIds.add(pool.entitlementPoolId);
    const sourceRefError = validateSourceRef(pool.sourceRef, `pool:${pool.entitlementPoolId}`);
    if (sourceRefError) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: sourceRefError,
      };
    }
    if (!referencedPoolIds.has(pool.entitlementPoolId)) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: `Entitlement pool ${pool.entitlementPoolId} is not referenced by opening provenance.`,
      };
    }
  }

  const paidInCapital = opening.investorLedgers.reduce(
    (sum, ledger) => sum.plus(new Decimal(ledger.paidInCapital)),
    new Decimal(0)
  );
  const activePaidInProvenance = [...capitalByPartner.values()].reduce(
    (sum, capital) => sum.plus(capital),
    cashTotals.recycling
  );
  if (!activePaidInProvenance.eq(paidInCapital)) {
    return {
      ok: false,
      code: 'OPENING_PROVENANCE_REQUIRED',
      stage: 'normalization',
      message: 'Opening paid-in capital does not reconcile to active provenance.',
    };
  }

  for (const ledger of opening.investorLedgers) {
    const capital = capitalByPartner.get(ledger.partnerId) ?? new Decimal(0);
    const hasLedgerCapital = [
      ledger.calledCapital,
      ledger.settledCapital,
      ledger.paidInCapital,
      ledger.unreturnedSettledCashCapital,
    ].some((amount) => !new Decimal(amount).isZero());
    if (
      (hasLedgerCapital && capital.isZero()) ||
      !capital.eq(new Decimal(ledger.unreturnedSettledCashCapital))
    ) {
      return {
        ok: false,
        code: 'OPENING_PROVENANCE_REQUIRED',
        stage: 'normalization',
        message: `Partner ${ledger.partnerId} opening capital does not reconcile to owned provenance.`,
        diagnostics: { partnerId: ledger.partnerId },
      };
    }
  }

  return null;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) {
      result[key] = canonicalize(child);
    }
  }
  return result;
}

function computeInputHash(input: InternalEconomicsInputV2Wire): string {
  const canonical = canonicalize(input);
  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json, 'utf-8').digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export function verifyAndNormalizeInternalEconomicsInputV2(input: unknown): NormalizeInputV2Result {
  try {
    if (typeof input === 'object' && input !== null) {
      const rec = input as Record<string, unknown>;
      const cv = rec['contractVersion'];
      if (typeof cv === 'string' && cv !== INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION) {
        return refuse(
          'UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION',
          'normalization',
          `Contract version "${cv}" is not supported; expected "${INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION}".`
        );
      }
    }
  } catch {
    return refuse(
      'SCHEMA_VALIDATION_FAILED',
      'normalization',
      'Schema validation failed: input contract version could not be inspected.'
    );
  }

  let parseResult: ReturnType<typeof InternalEconomicsInputV2WireSchema.safeParse>;
  try {
    parseResult = InternalEconomicsInputV2WireSchema.safeParse(input);
  } catch {
    return refuse(
      'SCHEMA_VALIDATION_FAILED',
      'normalization',
      'Schema validation failed: input could not be inspected.'
    );
  }
  if (!parseResult.success) {
    return refuse(
      'SCHEMA_VALIDATION_FAILED',
      'normalization',
      `Schema validation failed: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }

  const parsed = parseResult.data;
  const serializedBytes = Buffer.byteLength(JSON.stringify(parsed), 'utf-8');

  const admissionRefusal = validateAdmissionLimits(parsed, serializedBytes);
  if (admissionRefusal) return { ok: false, refusal: admissionRefusal };

  const calendarRefusal = validateCalendar(parsed);
  if (calendarRefusal) return { ok: false, refusal: calendarRefusal };

  const windowRefusal = validateEventWindow(parsed);
  if (windowRefusal) return { ok: false, refusal: windowRefusal };

  const dupeRefusal = validateDuplicateEvents(parsed);
  if (dupeRefusal) return { ok: false, refusal: dupeRefusal };

  const tierRefusal = validateTierPolicy(parsed.waterfallPolicy);
  if (tierRefusal) return { ok: false, refusal: tierRefusal };

  const classRefusal = validateLpClasses(parsed);
  if (classRefusal) return { ok: false, refusal: classRefusal };

  const reconRefusal = validateOpeningReconciliation(parsed);
  if (reconRefusal) return { ok: false, refusal: reconRefusal };

  const provenanceRefusal = validateOpeningProvenance(parsed);
  if (provenanceRefusal) return { ok: false, refusal: provenanceRefusal };

  for (const event of parsed.events) {
    if (event.kind === 'equalization_principal' || event.kind === 'equalization_interest') {
      return refuse(
        'UNSUPPORTED_V2_EQUALIZATION',
        'equalization',
        `Equalization event ${event.eventId} is not supported.`
      );
    }
  }

  sortOpeningProvenance(parsed);
  const inputHash = computeInputHash(parsed);

  const normalized = {
    ...parsed,
    _normalizedInputHash: inputHash,
    _hashAlgorithm: 'canonical-json-sha256/1' as const,
  } as NormalizedInternalEconomicsInputV2;
  deepFreeze(parsed);
  Object.freeze(normalized);

  return { ok: true, input: normalized };
}
