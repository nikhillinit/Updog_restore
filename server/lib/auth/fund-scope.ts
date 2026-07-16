import type { RequestPrincipal } from './principal';

export type ScopeDecision = 'allow' | 'deny';

/**
 * Pure, fail-closed STRICT fund-scope resolution. `admin`/`service` allow any
 * fund; a `user` principal allows only funds in its explicit fundIds;
 * `anonymous` (or any unresolved principal) DENIES. There is no
 * `undefined -> allow` path and no `empty-fundIds -> unrestricted` path.
 *
 * Universal READ for team members is layered in middleware via
 * isSafeReadMethod + isTeamMemberUser; this strict predicate remains unchanged
 * for writes and exports that mutate.
 */
export function resolveFundScope(principal: RequestPrincipal, fundId: number): ScopeDecision {
  switch (principal.kind) {
    case 'admin':
    case 'service':
      return 'allow';
    case 'user':
      return principal.fundIds.includes(fundId) ? 'allow' : 'deny';
    case 'anonymous':
      return 'deny';
  }
}

/** Safe (non-mutating by HTTP contract) methods. Universal read applies only to these. */
export function isSafeReadMethod(method: string | undefined): boolean {
  return method === 'GET' || method === 'HEAD';
}
