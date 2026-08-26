/**
 * Shared role normalization and capability grants.
 *
 * Keep this module free of platform imports so it is safe for client bundles
 * and audit tooling to consume.
 */

export const EFFECTIVE_ROLES = ['admin', 'partner', 'analyst', 'service'] as const;

export type EffectiveRole = (typeof EFFECTIVE_ROLES)[number];

export const EFFECTIVE_ROLE_ALIASES = {
  operator: 'partner',
  viewer: 'analyst',
} as const satisfies Record<string, EffectiveRole>;

export type LegacyRole = keyof typeof EFFECTIVE_ROLE_ALIASES;

export const TEAM_WRITE_ROLES = ['partner', 'admin', 'analyst'] as const;
export const PARTNER_WRITE_ROLES = ['partner', 'admin'] as const;

export type Capability = 'flag_read' | 'flag_admin' | 'reserve_admin';

export const CAPABILITY_GRANTS = {
  flag_read: ['admin'],
  flag_admin: ['admin'],
  reserve_admin: ['partner'],
} as const satisfies Record<Capability, readonly EffectiveRole[]>;

export type RawRole = string | readonly string[] | null | undefined;

/** Resolve persisted and legacy role labels to their runtime role. */
export function effectiveRoleOf(rawRole: string | null | undefined): EffectiveRole | undefined {
  if (rawRole == null) return undefined;

  if ((EFFECTIVE_ROLES as readonly string[]).includes(rawRole)) {
    return rawRole as EffectiveRole;
  }

  return EFFECTIVE_ROLE_ALIASES[rawRole as LegacyRole];
}

function effectiveRolesOf(rawRole: RawRole): readonly EffectiveRole[] {
  const rawRoles: readonly (string | null | undefined)[] =
    typeof rawRole === 'string' || rawRole == null ? [rawRole] : rawRole;
  return rawRoles.flatMap((role) => {
    const effectiveRole = effectiveRoleOf(role);
    return effectiveRole === undefined ? [] : [effectiveRole];
  });
}

/** Admin is a global superset role. */
export function isEffectiveAdmin(rawRole: RawRole): boolean {
  return effectiveRolesOf(rawRole).includes('admin');
}

/** Team visibility includes human investment-team roles, not service identities. */
export function isTeamRole(rawRole: RawRole): boolean {
  return effectiveRolesOf(rawRole).some(
    (role) => role === 'admin' || role === 'partner' || role === 'analyst'
  );
}

/** Check capability grants after applying aliases and admin inheritance. */
export function hasCapability(rawRole: RawRole, capability: Capability): boolean {
  const effectiveRoles = effectiveRolesOf(rawRole);
  if (effectiveRoles.includes('admin')) return true;

  const grantedRoles: readonly EffectiveRole[] = CAPABILITY_GRANTS[capability];
  return effectiveRoles.some((role) => grantedRoles.includes(role));
}
