import { describe, expect, it } from 'vitest';

import {
  API_ROUTE_POLICY_REGISTRY,
  EXPLICIT_GOVERNANCE_POLICY_KEYS,
  getFinancialSurfaceForGovernanceEntry,
} from '../../../server/route-policy/api-route-policy-registry';
import type { RouteGovernanceEntry } from '../../../client/src/app/route-governance-registry';

const CANONICAL = '/fund-model-results/:fundId/moic-analysis';

const entry = (path: string): RouteGovernanceEntry => ({
  path,
  surface: 'app-route',
  exposure: 'internal-live',
  isProtected: false,
});

describe('route-policy: canonical fund-model-results MOIC route', () => {
  it('classifies the canonical MOIC route as moic_reserves, not fund_modeling', () => {
    // Regression guard for Chunk 4b: the path starts with `/fund-model-results`,
    // which would otherwise fall through to the `fund_modeling` branch. The
    // exact-string `moic_reserves` branch is evaluated FIRST and must win.
    expect(getFinancialSurfaceForGovernanceEntry(entry(CANONICAL))).toBe('moic_reserves');
  });

  it('still classifies a plain fund-model-results route as fund_modeling', () => {
    expect(getFinancialSurfaceForGovernanceEntry(entry('/fund-model-results/:fundId'))).toBe(
      'fund_modeling'
    );
  });

  it('registers a governance policy decision for the canonical MOIC route', () => {
    // Without this decisions-map entry, buildGovernancePolicyEntry returns
    // undefined and the route would silently get no policy entry once it lands
    // in ROUTE_GOVERNANCE_REGISTRY (added by Chunk 4).
    expect(EXPLICIT_GOVERNANCE_POLICY_KEYS.has(CANONICAL)).toBe(true);
  });

  it('surfaces the canonical MOIC route in the BUILT policy registry as moic_reserves', () => {
    // End-to-end of the Chunk 4 + Chunk 4b coupling: the client route definition
    // (APP_ROUTE_DEFINITIONS -> ROUTE_GOVERNANCE_REGISTRY), the classifier branch,
    // and the decisions-map entry must all line up for the route to materialize
    // in the built policy registry with the correct surface.
    const entry = API_ROUTE_POLICY_REGISTRY.find((candidate) => candidate.path === CANONICAL);
    expect(entry).toBeDefined();
    expect(entry?.financialSurface).toBe('moic_reserves');
  });
});
