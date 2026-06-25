import { describe, expect, it } from 'vitest';

import {
  ACTIONABILITY_POLICY_VERSION,
  H9ActionabilityStatusSchema,
  H9SourceFingerprintSchema,
} from '../../../shared/contracts/h9-actionability.contract';
import { FinancialActionabilitySchema } from '../../../shared/contracts/financial-provenance.contract';

const fingerprintFields = [
  'moicSourceInputHash',
  'roundEvidenceInputHash',
  'roundEvidenceAssumptionsHash',
  'fingerprintHash',
  'policyVersion',
] as const;

const completeFingerprint = {
  moicSourceInputHash: 'moic-source-input-hash',
  roundEvidenceInputHash: 'round-evidence-input-hash',
  roundEvidenceAssumptionsHash: 'round-evidence-assumptions-hash',
  fingerprintHash: 'h9-fingerprint-hash',
  policyVersion: 'h9-policy-v1',
};

function omitFingerprintField(field: (typeof fingerprintFields)[number]) {
  return Object.fromEntries(Object.entries(completeFingerprint).filter(([key]) => key !== field));
}

describe('H9 source fingerprint contract', () => {
  it('round-trips a complete source fingerprint', () => {
    expect(H9SourceFingerprintSchema.parse(completeFingerprint)).toEqual(completeFingerprint);
  });

  it('rejects unknown keys', () => {
    expect(
      H9SourceFingerprintSchema.safeParse({
        ...completeFingerprint,
        extraKey: 'not-allowed',
      }).success
    ).toBe(false);
  });

  it.each(fingerprintFields)('requires %s', (field) => {
    expect(H9SourceFingerprintSchema.safeParse(omitFingerprintField(field)).success).toBe(false);
  });

  it.each(fingerprintFields)('rejects an empty %s', (field) => {
    expect(
      H9SourceFingerprintSchema.safeParse({
        ...completeFingerprint,
        [field]: '',
      }).success
    ).toBe(false);
  });

  it('exports a non-empty actionability policy version', () => {
    expect(ACTIONABILITY_POLICY_VERSION).toEqual(expect.any(String));
    expect(ACTIONABILITY_POLICY_VERSION.trim().length).toBeGreaterThan(0);
  });

  it('reuses the existing financial actionability status schema', () => {
    expect(H9ActionabilityStatusSchema).toBe(FinancialActionabilitySchema);
    expect(H9ActionabilityStatusSchema.parse('actionable')).toBe('actionable');
    expect(H9ActionabilityStatusSchema.safeParse('made_up').success).toBe(false);
  });
});
