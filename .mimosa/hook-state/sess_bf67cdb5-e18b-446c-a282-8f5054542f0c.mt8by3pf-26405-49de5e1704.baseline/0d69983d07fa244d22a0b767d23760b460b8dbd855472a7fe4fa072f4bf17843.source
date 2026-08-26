import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_GRANTS,
  EFFECTIVE_ROLES,
  EFFECTIVE_ROLE_ALIASES,
  effectiveRoleOf,
  hasCapability,
} from '../../../shared/auth/effective-roles';
import {
  AUTH_IDENTITY_PERSONA_MAPPING,
  AUTH_ROLE_PERSONA_MAPPING,
} from '../../../audit/surface-contract-matrix/matrix-schema.mjs';

type MappingEntry = { persona: string; decided: boolean; evidence: string };
const roleMapping = AUTH_ROLE_PERSONA_MAPPING as Record<string, MappingEntry>;
const identityMapping = AUTH_IDENTITY_PERSONA_MAPPING as Record<string, MappingEntry>;

// Roles the persona table carries that the shared runtime module deliberately
// does not define: `lp` is enforced by requireLPAccess middleware, not by
// effective-role normalization.
const MIDDLEWARE_ONLY_ROLES = new Set(['lp']);

describe('persona table stays in sync with the shared effective-role module', () => {
  it('maps every effective role', () => {
    for (const role of EFFECTIVE_ROLES) {
      expect(roleMapping[role], `missing persona mapping for effective role ${role}`).toBeDefined();
      expect(roleMapping[role].decided).toBe(true);
    }
  });

  it('gives every legacy alias the same persona as its effective role', () => {
    for (const [legacy, effective] of Object.entries(EFFECTIVE_ROLE_ALIASES)) {
      expect(
        roleMapping[legacy],
        `missing persona mapping for legacy role ${legacy}`
      ).toBeDefined();
      expect(roleMapping[legacy].persona).toBe(roleMapping[effective].persona);
      expect(effectiveRoleOf(legacy)).toBe(effective);
    }
  });

  it('gives every capability the persona of a role that actually holds it', () => {
    for (const [capability, grantedRoles] of Object.entries(CAPABILITY_GRANTS)) {
      const entry = roleMapping[capability];
      expect(entry, `missing persona mapping for capability ${capability}`).toBeDefined();
      const grantedPersonas = grantedRoles.map((role) => roleMapping[role].persona);
      expect(grantedPersonas, `capability ${capability} persona ${entry.persona}`).toContain(
        entry.persona
      );
      for (const role of grantedRoles) {
        expect(hasCapability(role, capability as keyof typeof CAPABILITY_GRANTS)).toBe(true);
      }
    }
  });

  it('contains no persona-table roles unknown to the runtime', () => {
    const runtimeKnown = new Set<string>([
      ...EFFECTIVE_ROLES,
      ...Object.keys(EFFECTIVE_ROLE_ALIASES),
      ...Object.keys(CAPABILITY_GRANTS),
    ]);
    for (const role of Object.keys(roleMapping)) {
      if (MIDDLEWARE_ONLY_ROLES.has(role)) continue;
      expect(runtimeKnown.has(role), `persona table role ${role} unknown to runtime module`).toBe(
        true
      );
    }
  });

  it('keeps identity-boundary entries distinct from role entries', () => {
    const identityOnly = Object.keys(identityMapping).filter((key) => !(key in roleMapping));
    expect(identityOnly.sort()).toEqual(['lpId', 'public']);
    for (const key of identityOnly) {
      expect(identityMapping[key].decided).toBe(true);
    }
  });
});
