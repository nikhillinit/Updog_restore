/**
 * Task 7 (Bearer contract): a typed, fail-closed representation of the
 * authenticated caller, derived from the already-verified `req.user`.
 *
 * Admin/service are keyed on an EXPLICIT role, not the legacy
 * "empty fundIds == unrestricted" convention -- so a non-privileged token with
 * empty fundIds resolves to a `user` principal with no fund access (deny),
 * closing that footgun.
 *
 * Additive: NOT yet wired into route guards. Routes migrate to
 * `resolveFundScope()` in follow-up tranches (PR-7b onward).
 */
export type RequestPrincipal =
  | { readonly kind: 'admin' }
  | { readonly kind: 'service' }
  | { readonly kind: 'user'; readonly userId: string; readonly fundIds: readonly number[] }
  | { readonly kind: 'anonymous' };

export function principalFromUser(user: Express.User | undefined): RequestPrincipal {
  if (!user) {
    return { kind: 'anonymous' };
  }
  if (user.role === 'admin') {
    return { kind: 'admin' };
  }
  if (user.role === 'service') {
    return { kind: 'service' };
  }
  return {
    kind: 'user',
    userId: user.id ?? user.sub,
    fundIds: user.fundIds ?? [],
  };
}

/**
 * Team-member predicate for universal READ. True for any authenticated non-LP
 * caller (admin/service/analyst/partner/viewer). False for anonymous (no user)
 * and for LP principals (role 'lp' or an lpId claim) -- LPs remain fund-scoped
 * via the separate requireLPFundAccess path.
 */
export function isTeamMemberUser(user: Express.User | undefined): boolean {
  return !!user && user.role !== 'lp' && user.lpId == null;
}
