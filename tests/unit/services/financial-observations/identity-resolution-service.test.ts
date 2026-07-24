import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import {
  classifyStagedObservation,
  identityDescriptorFromPayload,
  profileAliasSystem,
  profileAliasValue,
} from '../../../../server/services/financial-observations/identity-resolution-service';
import {
  IdentityLabelEmptyError,
  canonicalizeIdentityLabel,
} from '../../../../server/services/financial-observations/normalization-service';

function thenableRows(rows: readonly unknown[]): unknown {
  const chain: unknown = new Proxy(() => undefined, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: readonly unknown[]) => void, reject: (reason: unknown) => void) =>
          Promise.resolve(rows).then(resolve, reject);
      }
      return () => chain;
    },
  });
  return chain;
}

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

describe('classifyStagedObservation', () => {
  it('takes the fund-scoped fingerprint advisory lock before duplicate lookup', async () => {
    const events: string[] = [];
    const execute = vi.fn(async () => {
      events.push('fingerprint-lock');
      return [];
    });
    const select = vi.fn(() => {
      events.push('duplicate-query');
      return thenableRows([{ id: 22 }]);
    });
    const candidateFingerprint = 'c'.repeat(64);

    const classification = await classifyStagedObservation({ execute, select } as never, {
      fundId: 7,
      observationId: 21,
      profile: { id: 3, identitySemanticsHash: 'a'.repeat(64) },
      normalizedPayload: {},
      observationHash: 'b'.repeat(64),
      candidateFingerprint,
    });

    expect(events).toEqual(['fingerprint-lock', 'duplicate-query']);
    expect(classification).toEqual({
      companyIdentityId: null,
      needsIdentityCase: true,
      duplicateFingerprintCase: true,
    });

    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0] as SQL);
    expect(query.sql).toContain('pg_advisory_xact_lock(hashtext(');
    expect(query.params).toEqual([`fund-fingerprint:7:${candidateFingerprint}`]);
  });
});
