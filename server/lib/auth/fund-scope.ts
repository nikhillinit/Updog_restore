import type { RequestPrincipal } from './principal';

export type ScopeDecision = 'allow' | 'deny';

/**
 * Pure, fail-closed fund-scope resolution. `admin`/`service` allow any fund; a
 * `user` principal allows only funds in its explicit fundIds; `anonymous` (or
 * any unresolved principal) DENIES. There is no `undefined -> allow` path and no
 * `empty-fundIds -> unrestricted` path.
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
