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
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import type { NormalizeInputV2Result } from '../../../contracts/internal-economics/internal-economics-receipt-v2.contract';
import { Decimal } from '../../../lib/decimal-config';

function refuse(code: V2RefusalCode, stage: V2Stage, message: string): NormalizeInputV2Result {
  return { ok: false, refusal: { ok: false, code, stage, message } };
}

function validateCalendar(input: InternalEconomicsInputV2Wire): V2CoreRefusal | null {
  const est = input.fundEstablishmentDate;
  const ipEnd = input.investmentPeriodEndDate;
  const term = input.fundTermDate;
  const cutover = input.cutoverInstant;
  const calc = input.calculationDate;

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
  for (const event of input.events) {
    if (event.instant <= input.cutoverInstant || event.instant > input.calculationDate) {
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

  for (const ledger of opening.investorLedgers) {
    if (new Decimal(ledger.committedCapital).lt(new Decimal(ledger.calledCapital))) {
      return {
        ok: false,
        code: 'OPENING_RECONCILIATION_VIOLATION',
        stage: 'normalization',
        message: `Partner ${ledger.partnerId}: committedCapital < calledCapital.`,
        diagnostics: { partnerId: ledger.partnerId },
      };
    }
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

export function verifyAndNormalizeInternalEconomicsInputV2(input: unknown): NormalizeInputV2Result {
  const serialized = JSON.stringify(input);
  const serializedBytes = Buffer.byteLength(serialized, 'utf-8');

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

  const parseResult = InternalEconomicsInputV2WireSchema.safeParse(input);
  if (!parseResult.success) {
    return refuse(
      'SCHEMA_VALIDATION_FAILED',
      'normalization',
      `Schema validation failed: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }

  const parsed = parseResult.data;

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

  const partnerIds = new Set(parsed.partners.map((p) => p.partnerId));
  const ledgerPartnerIds = new Set(parsed.openingState.investorLedgers.map((l) => l.partnerId));
  for (const pid of partnerIds) {
    if (!ledgerPartnerIds.has(pid)) {
      return refuse(
        'OPENING_PROVENANCE_REQUIRED',
        'normalization',
        `Partner "${pid}" has no investor ledger entry in openingState.`
      );
    }
  }

  for (const event of parsed.events) {
    if (event.kind === 'equalization_principal' || event.kind === 'equalization_interest') {
      return refuse(
        'UNSUPPORTED_V2_EQUALIZATION',
        'equalization',
        `Equalization event ${event.eventId} is not supported.`
      );
    }
  }

  const inputHash = computeInputHash(parsed);

  const normalized = Object.freeze({
    ...parsed,
    _normalizedInputHash: inputHash,
    _hashAlgorithm: 'canonical-json-sha256/1' as const,
  }) as NormalizedInternalEconomicsInputV2;

  return { ok: true, input: normalized };
}
