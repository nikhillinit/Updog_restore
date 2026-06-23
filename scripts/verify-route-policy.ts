#!/usr/bin/env tsx

import { FinancialProvenanceSchema } from '../shared/contracts/financial-provenance.contract';
import type { RoutePolicyEntry } from '../shared/contracts/route-policy.contract';
import {
  ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES,
  API_ROUTE_POLICY_REGISTRY,
  routePolicyKey,
} from '../server/route-policy/api-route-policy-registry';
import { ROUTE_GOVERNANCE_REGISTRY } from '../client/src/app/route-governance-registry';
import {
  buildPrototypeFinancialBlockedError,
  type PortfolioPrototypeRouteId,
} from '../server/lib/portfolio-prototype-block';
import { portfolioIntelligenceRouteClassifications } from '../tests/fixtures/portfolio-intelligence-route-classification';

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

function isFinancial(entry: RoutePolicyEntry): boolean {
  return entry.financialSurface !== 'none';
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function fail(errors: string[], message: string): void {
  errors.push(message);
}

const errors: string[] = [];

const governanceByPath = new Map(ROUTE_GOVERNANCE_REGISTRY.map((entry) => [entry.path, entry]));
const policyByKey = new Map<string, RoutePolicyEntry>();
const classificationByKey = new Map(
  portfolioIntelligenceRouteClassifications.map((route) => [
    routeKey(route.method, route.path),
    route,
  ])
);

for (const policyEntry of API_ROUTE_POLICY_REGISTRY) {
  const key = routePolicyKey(policyEntry);
  if (policyByKey.has(key)) {
    fail(errors, `Duplicate route policy entry: ${key}`);
  }
  policyByKey.set(key, policyEntry);
}

for (const governanceEntry of ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES) {
  if (!policyByKey.has(governanceEntry.path)) {
    fail(errors, `Missing active financial route policy: ${governanceEntry.path}`);
  }
}

for (const policyEntry of API_ROUTE_POLICY_REGISTRY.filter(isFinancial)) {
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
    if (!classificationByKey.has(key)) {
      fail(errors, `Policy ${key} is not present in the portfolio-intelligence route fixture`);
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

  if (
    governanceEntry.isProtected &&
    (policyEntry.apiAuthBoundary === 'none_public' || policyEntry.fundScopeMode === 'none')
  ) {
    fail(errors, `Policy ${key} relies on client isProtected without declaring API auth and scope`);
  }
}

for (const route of portfolioIntelligenceRouteClassifications) {
  const key = routeKey(route.method, route.path);
  if (!policyByKey.has(key)) {
    fail(errors, `Missing portfolio-intelligence route policy: ${key}`);
  }
}

for (const policyEntry of API_ROUTE_POLICY_REGISTRY) {
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

if (errors.length > 0) {
  console.error('FAIL: route policy verification failed');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`PASS: verified ${API_ROUTE_POLICY_REGISTRY.length} route policy entries`);
