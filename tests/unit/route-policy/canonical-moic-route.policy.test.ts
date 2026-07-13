import { describe, expect, it } from 'vitest';

import {
  API_ROUTE_POLICY_REGISTRY,
  EXPLICIT_API_ROUTE_POLICY_KEYS,
  EXPLICIT_GOVERNANCE_POLICY_KEYS,
  getFinancialSurfaceForGovernanceEntry,
  routePolicyKey,
} from '../../../server/route-policy/api-route-policy-registry';
import {
  getRouteGovernanceEntry,
  type RouteGovernanceEntry,
} from '../../../shared/routes/route-governance-registry';
import { verifyRoutePolicy } from '../../../scripts/verify-route-policy';

const CANONICAL = '/fund-model-results/:fundId/moic-analysis';
const ADMIN_INPUT_ROUTE = '/api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId';
const ADMIN_MODE_ROUTE = '/api/admin/funds/:fundId/calculation-modes/fund-moic-rankings';
const MARGINAL_SHADOW_ROUTE = '/api/funds/:fundId/moic/marginal-rankings';

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

  it('keeps the retired V1 MOIC route archived outside financial policy', () => {
    const retiredEntry = getRouteGovernanceEntry('/moic-analysis');

    if (!retiredEntry) {
      throw new Error('Expected /moic-analysis to be governed as an archived placeholder');
    }

    expect(retiredEntry).toMatchObject({
      exposure: 'archived-placeholder',
      surface: 'archived-placeholder',
      isProtected: false,
      redirectTarget: '/overview',
    });
    expect(getFinancialSurfaceForGovernanceEntry(retiredEntry)).toBe('none');
    expect(EXPLICIT_GOVERNANCE_POLICY_KEYS.has('/moic-analysis')).toBe(false);
    expect(API_ROUTE_POLICY_REGISTRY.some((candidate) => candidate.path === '/moic-analysis')).toBe(
      false
    );
  });

  it('registers explicit scoped admin API policy for MOIC input and mode writes', () => {
    const inputEntry = API_ROUTE_POLICY_REGISTRY.find(
      (candidate) => candidate.path === ADMIN_INPUT_ROUTE
    );
    const modeEntry = API_ROUTE_POLICY_REGISTRY.find(
      (candidate) => candidate.path === ADMIN_MODE_ROUTE
    );

    expect(inputEntry).toMatchObject({
      id: 'api:put:/api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId',
      method: 'PUT',
      lifecycle: 'durable_crud',
      governanceRef: CANONICAL,
      surface: 'fund-moic-input-admin-api',
      owner: 'analytics',
      telemetryKey: 'api.route.api.admin.funds.fundId.moic.inputs.portfolio.companies.companyId',
      financialSurface: 'moic_reserves',
      apiAuthBoundary: 'admin_only',
      fundScopeMode: 'route_param_fund_id',
      workflowRequirement: 'admin_moic_input_update_verified',
    });
    expect(modeEntry).toMatchObject({
      id: 'api:put:/api/admin/funds/:fundId/calculation-modes/fund-moic-rankings',
      method: 'PUT',
      lifecycle: 'durable_crud',
      governanceRef: CANONICAL,
      surface: 'fund-moic-mode-admin-api',
      owner: 'analytics',
      telemetryKey: 'api.route.api.admin.funds.fundId.calculation.modes.fund.moic.rankings',
      financialSurface: 'moic_reserves',
      apiAuthBoundary: 'admin_only',
      fundScopeMode: 'route_param_fund_id',
      workflowRequirement: 'admin_mode_update_verified',
    });

    expect(
      inputEntry ? EXPLICIT_API_ROUTE_POLICY_KEYS.has(routePolicyKey(inputEntry)) : false
    ).toBe(true);
    expect(modeEntry ? EXPLICIT_API_ROUTE_POLICY_KEYS.has(routePolicyKey(modeEntry)) : false).toBe(
      true
    );
  });

  it('registers the marginal shadow route as a fund-scoped financial surface', () => {
    const entry = API_ROUTE_POLICY_REGISTRY.find(
      (candidate) => candidate.path === MARGINAL_SHADOW_ROUTE
    );

    expect(entry).toMatchObject({
      id: 'api:get:/api/funds/:fundId/moic/marginal-rankings',
      method: 'GET',
      lifecycle: 'durable_crud',
      governanceRef: CANONICAL,
      surface: 'marginal-reserve-moic-shadow-api',
      owner: 'analytics',
      financialSurface: 'moic_reserves',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'route_param_fund_id',
      workflowRequirement: 'shadow_review_required',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      humanReviewRequired: true,
    });
    expect(entry ? EXPLICIT_API_ROUTE_POLICY_KEYS.has(routePolicyKey(entry)) : false).toBe(true);
  });

  it('allows scoped admin-only MOIC financial-control API entries in policy verification', () => {
    expect(verifyRoutePolicy()).not.toContain(
      `Policy PUT ${ADMIN_INPUT_ROUTE} does not declare API-side fund, LP, or share scope`
    );
    expect(verifyRoutePolicy()).not.toContain(
      `Policy PUT ${ADMIN_MODE_ROUTE} does not declare API-side fund, LP, or share scope`
    );
  });
});
