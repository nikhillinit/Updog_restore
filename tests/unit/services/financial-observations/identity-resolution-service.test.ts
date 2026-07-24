import { describe, expect, it } from 'vitest';

import {
  identityDescriptorFromPayload,
  profileAliasSystem,
  profileAliasValue,
} from '../../../../server/services/financial-observations/identity-resolution-service';
import {
  IdentityLabelEmptyError,
  canonicalizeIdentityLabel,
} from '../../../../server/services/financial-observations/normalization-service';

describe('identityDescriptorFromPayload', () => {
  it('reads an external descriptor', () => {
    expect(
      identityDescriptorFromPayload({
        companyIdentity: { kind: 'external', system: 'carta', externalId: 'C-1' },
      })
    ).toEqual({ kind: 'external', system: 'carta', externalId: 'C-1' });
  });

  it('reads a name descriptor', () => {
    expect(
      identityDescriptorFromPayload({ companyIdentity: { kind: 'name', canonicalName: 'acme' } })
    ).toEqual({ kind: 'name', canonicalName: 'acme' });
  });

  it('returns null when identity is absent or malformed', () => {
    expect(identityDescriptorFromPayload({})).toBeNull();
    expect(identityDescriptorFromPayload({ companyIdentity: { kind: 'other' } })).toBeNull();
  });
});

describe('profileAliasSystem', () => {
  it('encodes the versioned namespace with exact profile id and hash', () => {
    expect(profileAliasSystem({ id: 7, identitySemanticsHash: 'a'.repeat(64) })).toBe(
      `profile-alias/v1:7:${'a'.repeat(64)}`
    );
  });
});

describe('profileAliasValue', () => {
  it('prefers the source label over the canonical name', () => {
    expect(profileAliasValue({ descriptor: { sourceLabel: 'Acme  Corp' } }, 'fallback')).toBe(
      'acme corp'
    );
  });

  it('falls back to the canonical name when no source label', () => {
    expect(profileAliasValue({}, 'Acme Corp')).toBe('acme corp');
  });
});

describe('canonicalizeIdentityLabel/v1', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(canonicalizeIdentityLabel('  Acme   Holdings ')).toBe('acme holdings');
  });

  it('applies Unicode NFKC (compatibility) normalization', () => {
    // Full-width "ACME" -> ASCII "acme".
    expect(canonicalizeIdentityLabel('ＡＣＭＥ')).toBe('acme');
  });

  it('rejects an empty result', () => {
    expect(() => canonicalizeIdentityLabel('   ')).toThrowError(IdentityLabelEmptyError);
  });

  it('caps length at the max text field length', () => {
    expect(canonicalizeIdentityLabel('a'.repeat(3000))).toHaveLength(2000);
  });
});
