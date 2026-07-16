#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

import * as coreSchema from '../shared/schema';
import * as lpReportingSchema from '../shared/schema-lp-reporting';
import * as lpSprint3Schema from '../shared/schema-lp-sprint3';
import { FinancialProvenanceSchema } from '../shared/contracts/financial-provenance.contract';
import type { RoutePolicyEntry } from '../shared/contracts/route-policy.contract';
import {
  ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES,
  API_ROUTE_POLICY_REGISTRY,
  COMMON_API_ROUTE_POLICY_IDS,
  EXPLICIT_API_ROUTE_POLICY_KEYS,
  EXPLICIT_GOVERNANCE_POLICY_KEYS,
  PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_KEYS,
  getFinancialSurfaceForGovernanceEntry,
  routePolicyKey,
} from '../server/route-policy/api-route-policy-registry';
import {
  COMMON_API_ROUTE_MANIFEST,
  type CommonApiRouteManifestEntry,
} from '../shared/routes/api-route-manifest';
import {
  API_RUNTIME_SPECIFIC_MANIFEST,
  type ApiRuntimeSpecificManifestEntry,
} from '../shared/routes/api-runtime-specific-manifest';
import {
  ROUTE_GOVERNANCE_REGISTRY,
  type RouteGovernanceEntry,
} from '../shared/routes/route-governance-registry';
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
  commonApiRoutes: readonly CommonApiRouteManifestEntry[];
  runtimeSpecificRoutes: readonly ApiRuntimeSpecificManifestEntry[];
  commonRoutePolicyIds: Readonly<Record<string, readonly string[]>>;
  productionSchemaTables: ReadonlySet<string>;
  productionReconciliationTables: ReadonlySet<string>;
  productionSchemaTableExemptions: Readonly<Record<string, string>>;
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

interface ProductionSchemaManifest {
  expectedTables?: Array<{ name: string }>;
}

function loadProductionReconciliationTables(): ReadonlySet<string> {
  const manifestDirectory = path.resolve(process.cwd(), 'scripts', 'prod-schema-manifests');
  const tableNames = new Set<string>();

  for (const file of fs.readdirSync(manifestDirectory).filter((name) => name.endsWith('.json'))) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(manifestDirectory, file), 'utf8')
    ) as ProductionSchemaManifest;
    for (const table of manifest.expectedTables ?? []) {
      tableNames.add(table.name);
    }
  }

  return tableNames;
}

function loadProductionSchemaTables(): ReadonlySet<string> {
  const tableNames = new Set<string>();

  for (const schemaModule of [coreSchema, lpReportingSchema, lpSprint3Schema]) {
    for (const exportedValue of Object.values(schemaModule)) {
      if (is(exportedValue, PgTable)) {
        tableNames.add(getTableName(exportedValue));
      }
    }
  }

  return tableNames;
}

export const PRODUCTION_SCHEMA_TABLE_EXEMPTIONS = {
  investment_round_model_overrides:
    'Dormant investment-round modeling remains flag-gated and outside production reconciliation manifests',
  investment_rounds:
    'Dormant investment-round modeling remains flag-gated and outside production reconciliation manifests',
} as const satisfies Readonly<Record<string, string>>;

export const defaultRoutePolicyVerificationInput: RoutePolicyVerificationInput = {
  activeFinancialGovernanceEntries: ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES,
  routeGovernanceRegistry: ROUTE_GOVERNANCE_REGISTRY,
  policyEntries: API_ROUTE_POLICY_REGISTRY,
  portfolioIntelligenceRouteClassifications,
  explicitGovernancePolicyKeys: EXPLICIT_GOVERNANCE_POLICY_KEYS,
  portfolioIntelligencePolicyKeys: PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_KEYS,
  explicitApiPolicyKeys: EXPLICIT_API_ROUTE_POLICY_KEYS,
  commonApiRoutes: COMMON_API_ROUTE_MANIFEST,
  runtimeSpecificRoutes: API_RUNTIME_SPECIFIC_MANIFEST,
  commonRoutePolicyIds: COMMON_API_ROUTE_POLICY_IDS,
  productionSchemaTables: loadProductionSchemaTables(),
  productionReconciliationTables: loadProductionReconciliationTables(),
  productionSchemaTableExemptions: PRODUCTION_SCHEMA_TABLE_EXEMPTIONS,
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
    policyEntry.apiAuthBoundary === 'require_auth_fund_access_and_role' &&
    FUND_SCOPE_MODES.has(policyEntry.fundScopeMode)
  ) {
    return true;
  }

  if (
    policyEntry.apiAuthBoundary === 'require_auth_and_role' &&
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
  const policyById = new Map<string, RoutePolicyEntry>();
  const classificationByKey = new Map(
    input.portfolioIntelligenceRouteClassifications.map((route) => [
      routeKey(route.method, route.path),
      route,
    ])
  );
  const referencedC1Tables = new Set<string>();

  for (const policyEntry of input.policyEntries) {
    const key = routePolicyKey(policyEntry);
    if (policyByKey.has(key)) {
      fail(errors, `Duplicate route policy entry: ${key}`);
    }
    policyByKey.set(key, policyEntry);
    if (policyById.has(policyEntry.id)) {
      fail(errors, `Duplicate route policy id: ${policyEntry.id}`);
    }
    policyById.set(policyEntry.id, policyEntry);
  }

  for (const entry of input.commonApiRoutes) {
    if (!entry.owner.trim()) {
      fail(errors, `Common route ${entry.id} is missing an owner`);
    }
    if (!entry.probe.path.startsWith('/') || !Number.isInteger(entry.probe.expectedStatus)) {
      fail(errors, `Common route ${entry.id} is missing a deterministic probe`);
    }
    if (['POST', 'PUT', 'PATCH'].includes(entry.probe.method) && entry.probe.body === undefined) {
      fail(errors, `Common route ${entry.id} mutation probe is missing a JSON body`);
    }

    if (entry.financial) {
      const policyIds = input.commonRoutePolicyIds[entry.id] ?? [];
      if (policyIds.length === 0) {
        fail(errors, `Missing route policy coverage for common financial route: ${entry.id}`);
      }
      for (const policyId of policyIds) {
        const policyEntry = policyById.get(policyId);
        if (!policyEntry) {
          fail(errors, `Common route ${entry.id} references missing route policy id: ${policyId}`);
        } else if (!isFinancial(policyEntry)) {
          fail(
            errors,
            `Common route ${entry.id} references non-financial route policy id: ${policyId}`
          );
        }
      }
    }

    for (const table of entry.schemaTables) {
      if (
        !input.productionSchemaTables.has(table) &&
        input.productionSchemaTableExemptions[table] === undefined
      ) {
        fail(
          errors,
          `Common route ${entry.id} references table missing from the production schema registry: ${table}`
        );
      }
    }

    if (entry.migrationParity.kind === 'c1') {
      for (const table of entry.migrationParity.tables) {
        referencedC1Tables.add(table);
        if (!entry.schemaTables.includes(table)) {
          fail(
            errors,
            `Common route ${entry.id} C1 table is missing from route schema metadata: ${table}`
          );
        }
        if (
          !input.productionReconciliationTables.has(table) &&
          input.productionSchemaTableExemptions[table] === undefined
        ) {
          fail(
            errors,
            `Common route ${entry.id} C1 table is missing from production reconciliation manifests: ${table}`
          );
        }
      }
    }
  }

  for (const [table, reason] of Object.entries(input.productionSchemaTableExemptions)) {
    if (!reason.trim()) {
      fail(errors, `Production schema table exemption is missing a reason: ${table}`);
    }
    if (!referencedC1Tables.has(table)) {
      fail(errors, `Stale production schema table exemption: ${table}`);
    }
    if (input.productionReconciliationTables.has(table)) {
      fail(errors, `Redundant production schema table exemption: ${table}`);
    }
  }

  for (const entry of input.runtimeSpecificRoutes) {
    if (!entry.reason.trim()) {
      fail(errors, `Runtime-specific route ${entry.id} is missing a reason`);
    }
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
      fail(errors, `Policy ${key} does not declare API-side fund, LP, share, or role scope`);
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
