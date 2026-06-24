#!/usr/bin/env tsx

import { pathToFileURL } from 'node:url';

import { FinancialProvenanceSchema } from '../shared/contracts/financial-provenance.contract';
import type { RoutePolicyEntry } from '../shared/contracts/route-policy.contract';
import {
  ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES,
  API_ROUTE_POLICY_REGISTRY,
  EXPLICIT_API_ROUTE_POLICY_KEYS,
  EXPLICIT_GOVERNANCE_POLICY_KEYS,
  PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_KEYS,
  getFinancialSurfaceForGovernanceEntry,
  routePolicyKey,
} from '../server/route-policy/api-route-policy-registry';
import {
  ROUTE_GOVERNANCE_REGISTRY,
  type RouteGovernanceEntry,
} from '../client/src/app/route-governance-registry';
import {
  buildPrototypeFinancialBlockedError,
  type PortfolioPrototypeRouteId,
} from '../server/lib/portfolio-prototype-block';
import {
  portfolioIntelligenceRouteClassifications,
  type PortfolioIntelligenceRouteClassification,
} from '../tests/fixtures/portfolio-intelligence-route-classification';

type PortfolioIntelligenceRoute = {
  method: string;
  path: string;
  classification: PortfolioIntelligenceRouteClassification;
};

export interface RoutePolicyVerificationInput {
  activeFinancialGovernanceEntries: readonly RouteGovernanceEntry[];
  routeGovernanceRegistry: readonly RouteGovernanceEntry[];
  policyEntries: readonly RoutePolicyEntry[];
  portfolioIntelligenceRouteClassifications: readonly PortfolioIntelligenceRoute[];
  explicitGovernancePolicyKeys: ReadonlySet<string>;
  portfolioIntelligencePolicyKeys: ReadonlySet<string>;
  explicitApiPolicyKeys: ReadonlySet<string>;
}

type PrototypeRouteKey = `${string} ${string}`;

const prototypeRouteIds: Record<PrototypeRouteKey, PortfolioPrototypeRouteId> = {
  'POST /api/portfolio/scenarios/compare': 'portfolio.scenarios.compare',
  'POST /api/portfolio/scenarios/:id/simulate': 'portfolio.scenario.simulate',
  'POST /api/portfolio/reserves/optimize': 'portfolio.reserves.optimize',
  'POST /api/portfolio/reserves/backtest': 'portfolio.reserves.backtest',
  'POST /api/portfolio/forecasts': 'portfolio.forecasts.create',
  'POST /api/portfolio/forecasts/validate': 'portfolio.forecasts.validate',
  'POST /api/portfolio/quick-scenario': 'portfolio.quickScenario.create',
  'GET /api/portfolio/metrics/:scenarioId': 'portfolio.metrics.read',
};

const FUND_SCOPE_MODES = new Set<RoutePolicyEntry['fundScopeMode']>([
  'route_param_fund_id',
  'query_param_fund_id',
  'parent_entity_lookup',
]);

export const defaultRoutePolicyVerificationInput: RoutePolicyVerificationInput = {
  activeFinancialGovernanceEntries: ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES,
  routeGovernanceRegistry: ROUTE_GOVERNANCE_REGISTRY,
  policyEntries: API_ROUTE_POLICY_REGISTRY,
  portfolioIntelligenceRouteClassifications,
  explicitGovernancePolicyKeys: EXPLICIT_GOVERNANCE_POLICY_KEYS,
  portfolioIntelligencePolicyKeys: PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_KEYS,
  explicitApiPolicyKeys: EXPLICIT_API_ROUTE_POLICY_KEYS,
};

function isFinancial(entry: RoutePolicyEntry): boolean {
  return entry.financialSurface !== 'none';
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function fail(errors: string[], message: string): void {
  if (!errors.includes(message)) {
    errors.push(message);
  }
}

function hasAllowedAuthScopePair(
  policyEntry: RoutePolicyEntry,
  governanceEntry: RouteGovernanceEntry | undefined
): boolean {
  if (
    policyEntry.apiAuthBoundary === 'signed_public_share' &&
    policyEntry.fundScopeMode === 'share_token_scope'
  ) {
    return true;
  }

  if (
    policyEntry.apiAuthBoundary === 'require_auth_and_lp_access' &&
    policyEntry.fundScopeMode === 'lp_claim_scope'
  ) {
    return true;
  }

  if (
    policyEntry.apiAuthBoundary === 'require_auth_and_fund_access' &&
    FUND_SCOPE_MODES.has(policyEntry.fundScopeMode)
  ) {
    return true;
  }

  if (
    policyEntry.apiAuthBoundary === 'admin_only' &&
    policyEntry.financialSurface !== 'none' &&
    FUND_SCOPE_MODES.has(policyEntry.fundScopeMode)
  ) {
    return true;
  }

  if (
    policyEntry.apiAuthBoundary === 'require_auth' &&
    policyEntry.fundScopeMode === 'not_applicable'
  ) {
    return policyEntry.lifecycle === 'static_template' || governanceEntry?.isProtected === false;
  }

  return false;
}

function isCliInvocation(): boolean {
  const scriptPath = process.argv[1];
  return scriptPath !== undefined && import.meta.url === pathToFileURL(scriptPath).href;
}

export function verifyRoutePolicy(
  input: RoutePolicyVerificationInput = defaultRoutePolicyVerificationInput
): string[] {
  const errors: string[] = [];
  const governanceByPath = new Map(
    input.routeGovernanceRegistry.map((entry) => [entry.path, entry])
  );
  const activeFinancialGovernancePaths = new Set(
    input.activeFinancialGovernanceEntries.map((entry) => entry.path)
  );
  const policyByKey = new Map<string, RoutePolicyEntry>();
  const classificationByKey = new Map(
    input.portfolioIntelligenceRouteClassifications.map((route) => [
      routeKey(route.method, route.path),
      route,
    ])
  );

  for (const policyEntry of input.policyEntries) {
    const key = routePolicyKey(policyEntry);
    if (policyByKey.has(key)) {
      fail(errors, `Duplicate route policy entry: ${key}`);
    }
    policyByKey.set(key, policyEntry);
  }

  for (const governanceEntry of input.activeFinancialGovernanceEntries) {
    if (!input.explicitGovernancePolicyKeys.has(governanceEntry.path)) {
      fail(errors, `Missing active financial route policy: ${governanceEntry.path}`);
    }

    if (!policyByKey.has(governanceEntry.path)) {
      fail(errors, `Missing active financial route policy: ${governanceEntry.path}`);
    }
  }

  for (const key of input.explicitGovernancePolicyKeys) {
    if (!activeFinancialGovernancePaths.has(key)) {
      fail(errors, `Stale explicit financial governance route policy: ${key}`);
    }
  }

  for (const route of input.portfolioIntelligenceRouteClassifications) {
    const key = routeKey(route.method, route.path);

    if (!input.portfolioIntelligencePolicyKeys.has(key)) {
      fail(errors, `Missing explicit portfolio-intelligence route policy override: ${key}`);
    }

    if (!policyByKey.has(key)) {
      fail(errors, `Missing portfolio-intelligence route policy: ${key}`);
    }
  }

  for (const key of input.portfolioIntelligencePolicyKeys) {
    if (!classificationByKey.has(key)) {
      fail(errors, `Stale explicit portfolio-intelligence route policy override: ${key}`);
    }
  }

  for (const key of input.explicitApiPolicyKeys) {
    if (!policyByKey.has(key)) {
      fail(errors, `Missing explicit API route policy entry: ${key}`);
    }
  }

  for (const policyEntry of input.policyEntries.filter(isFinancial)) {
    const key = routePolicyKey(policyEntry);
    const governanceEntry = governanceByPath.get(policyEntry.governanceRef);

    if (!governanceEntry) {
      fail(
        errors,
        `Policy ${key} references unmounted governance route ${policyEntry.governanceRef}`
      );
      continue;
    }

    if (policyEntry.method) {
      if (!classificationByKey.has(key) && !input.explicitApiPolicyKeys.has(key)) {
        fail(
          errors,
          `Policy ${key} is not present in an explicit API route policy lane or the portfolio-intelligence route fixture`
        );
      }
    } else if (policyEntry.path !== governanceEntry.path) {
      fail(
        errors,
        `Policy ${key} path does not match governance reference ${policyEntry.governanceRef}`
      );
    }

    if (!policyEntry.method && policyEntry.surface !== governanceEntry.surface) {
      fail(
        errors,
        `Policy ${key} surface ${policyEntry.surface} drifts from governance surface ${governanceEntry.surface}`
      );
    }

    if (!hasAllowedAuthScopePair(policyEntry, governanceEntry)) {
      fail(errors, `Policy ${key} does not declare API-side fund, LP, or share scope`);
    }

    const expectedGovernanceSurface = getFinancialSurfaceForGovernanceEntry(governanceEntry);
    if (!policyEntry.method && policyEntry.financialSurface !== expectedGovernanceSurface) {
      fail(
        errors,
        `Policy ${key} financial surface ${policyEntry.financialSurface} drifts from governance surface ${expectedGovernanceSurface}`
      );
    }
  }

  for (const policyEntry of input.policyEntries) {
    if (policyEntry.lifecycle !== 'prototype_501') {
      continue;
    }

    const key = routePolicyKey(policyEntry);
    const routeId = prototypeRouteIds[key as PrototypeRouteKey];
    const classifiedRoute = classificationByKey.get(key);

    if (!classifiedRoute || classifiedRoute.classification !== 'prototype_501') {
      fail(errors, `Prototype policy ${key} is not backed by the #910 prototype fixture`);
      continue;
    }

    if (!policyEntry.provenanceRequired) {
      fail(errors, `Prototype policy ${key} must require provenance`);
    }

    if (!routeId) {
      fail(errors, `Prototype policy ${key} is missing prototype-block route id mapping`);
      continue;
    }

    const blockedError = buildPrototypeFinancialBlockedError({
      routeId,
      sourceRoute: key,
    });
    const provenance = FinancialProvenanceSchema.parse(blockedError.provenance);

    if (blockedError.error !== 'not_implemented' || provenance.actionability !== 'non_actionable') {
      fail(errors, `Prototype policy ${key} does not assert 501 + non_actionable provenance`);
    }
  }

  return errors;
}

if (isCliInvocation()) {
  const errors = verifyRoutePolicy();

  if (errors.length > 0) {
    console.error('FAIL: route policy verification failed');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`PASS: verified ${API_ROUTE_POLICY_REGISTRY.length} route policy entries`);
}
