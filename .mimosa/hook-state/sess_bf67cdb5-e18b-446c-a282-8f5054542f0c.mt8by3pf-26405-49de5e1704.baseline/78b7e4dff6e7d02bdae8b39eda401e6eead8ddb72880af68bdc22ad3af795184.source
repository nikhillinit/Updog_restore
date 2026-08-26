import { canonicalSha256 } from '../canonical-hash';
import { Decimal } from '../decimal-config';

const WIRE_FINGERPRINT_SCHEMA = 'vehicle-participation-wire-fingerprint.v1';
const ORIGINAL_SOURCE_HASH_SCHEMA = 'vehicle-participation-cash-flow-event-source.v1';

export interface ParticipationWireFingerprintInput {
  fundId: number;
  vehicleId: number;
  portfolioCompanyId: number;
  financingEventId: number;
  trancheKey: string;
  effectiveClosingDate: string;
  cashFlowAmountUsd: string;
  currency: string;
}

export function createParticipationWireFingerprint(
  input: ParticipationWireFingerprintInput
): string {
  return canonicalSha256({
    schema: WIRE_FINGERPRINT_SCHEMA,
    fundId: input.fundId,
    vehicleId: input.vehicleId,
    portfolioCompanyId: input.portfolioCompanyId,
    financingEventId: input.financingEventId,
    trancheKey: input.trancheKey,
    effectiveClosingDate: input.effectiveClosingDate,
    cashFlowAmountUsd: canonicalUsdAmount(input.cashFlowAmountUsd),
    currency: input.currency.toUpperCase(),
  });
}

export function createOriginalParticipationSourceHash(wireFingerprint: string): string {
  return canonicalSha256({
    schema: ORIGINAL_SOURCE_HASH_SCHEMA,
    wireFingerprint,
    role: 'original',
  });
}

function canonicalUsdAmount(value: string): string {
  return new Decimal(value).toFixed(6);
}
