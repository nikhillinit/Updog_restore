import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FinancialProvenanceSchema } from '../../../shared/contracts/financial-provenance.contract';
import type { RoutePolicyEntry } from '../../../shared/contracts/route-policy.contract';
import { ROUTE_GOVERNANCE_REGISTRY } from '../../../shared/routes/route-governance-registry';
import {
  ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES,
  API_ROUTE_POLICY_REGISTRY,
  routePolicyKey,
} from '../../../server/route-policy/api-route-policy-registry';
import {
  defaultRoutePolicyVerificationInput,
  verifyRoutePolicy,
} from '../../../scripts/verify-route-policy';
import {
  buildPrototypeFinancialBlockedError,
  type PortfolioPrototypeRouteId,
} from '../../../server/lib/portfolio-prototype-block';
import { portfolioIntelligenceRouteClassifications } from '../../fixtures/portfolio-intelligence-route-classification';

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

function routeKey(route: { method: string; path: string }): string {
  return `${route.method.toUpperCase()} ${route.path}`;
}

function declaredRoutePolicyKeys(relativePath: string): string[] {
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  return [...source.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(
    ([, method, routePath]) => `${method?.toUpperCase()} ${routePath}`
  );
}

const policyByKey = new Map(
  API_ROUTE_POLICY_REGISTRY.map((entry) => [routePolicyKey(entry), entry])
);

const LP_REPORT_PACKAGE_EXPORT_POLICY_KEYS = [
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/export/json',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json/artifact',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv/artifact',
] as const;

// The two stored-export status GETs are readiness metadata: role/grant/workflow
// gated but intentionally H9-independent and non-exportable (in-code Finding 8,
// ADR-040). They share the export perimeter's auth posture, not its export policy.
const LP_REPORT_PACKAGE_STATUS_GET_POLICY_KEYS = [
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv',
] as const;

const LP_REPORT_PACKAGE_AUTHORITATIVE_EXPORT_POLICY_KEYS =
  LP_REPORT_PACKAGE_EXPORT_POLICY_KEYS.filter(
    (key) => !(LP_REPORT_PACKAGE_STATUS_GET_POLICY_KEYS as readonly string[]).includes(key)
  );

const LP_REPORTING_ROUTE_POLICY_KEYS = [
  'POST /api/funds/:fundId/metric-runs/dry-run',
  'POST /api/funds/:fundId/metric-runs/commit',
  'GET /api/funds/:fundId/metric-runs/latest',
  'GET /api/funds/:fundId/metric-runs/:metricRunId',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/approve',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/lock',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package',
  ...LP_REPORT_PACKAGE_EXPORT_POLICY_KEYS,
  'POST /api/funds/:fundId/metric-runs/:metricRunId/report-package',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/evidence-records',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/evidence-records',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs',
  'PATCH /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/review',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/approve',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId',
  'POST /api/funds/:fundId/imports/ledger/dry-run',
  'POST /api/funds/:fundId/imports/valuation-marks/dry-run',
  'POST /api/funds/:fundId/imports/ledger/commit',
  'POST /api/funds/:fundId/imports/valuation-marks/commit',
] as const;

type LpReportingPolicyExpectation = Pick<
  RoutePolicyEntry,
  'workflowRequirement' | 'exportPolicy' | 'provenanceRequired'
>;

const LP_REPORTING_ADDITIONAL_POLICY_GROUPS: ReadonlyArray<{
  keys: readonly string[];
  expected: LpReportingPolicyExpectation;
}> = [
  {
    keys: ['POST /api/funds/:fundId/metric-runs/dry-run'],
    expected: {
      workflowRequirement: 'source_rows_and_preview_hash_generated',
      exportPolicy: 'preview_only',
      provenanceRequired: true,
    },
  },
  {
    keys: [
      'POST /api/funds/:fundId/imports/ledger/dry-run',
      'POST /api/funds/:fundId/imports/valuation-marks/dry-run',
    ],
    expected: {
      workflowRequirement: 'reconciliation_preview_hash_generated',
      exportPolicy: 'preview_only',
      provenanceRequired: true,
    },
  },
  {
    keys: [
      'GET /api/funds/:fundId/metric-runs/latest',
      'GET /api/funds/:fundId/metric-runs/:metricRunId',
      'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package',
      'GET /api/funds/:fundId/metric-runs/:metricRunId/evidence-records',
      'GET /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs',
      'GET /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId',
    ],
    expected: {
      workflowRequirement: 'fund_scope_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: ['POST /api/funds/:fundId/metric-runs/commit'],
    expected: {
      workflowRequirement: 'preview_hash_source_rows_and_idempotency_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: ['POST /api/funds/:fundId/metric-runs/:metricRunId/approve'],
    expected: {
      workflowRequirement: 'draft_metric_run_evidence_and_expected_version_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: ['POST /api/funds/:fundId/metric-runs/:metricRunId/lock'],
    expected: {
      workflowRequirement: 'approved_metric_run_and_expected_version_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: ['POST /api/funds/:fundId/metric-runs/:metricRunId/report-package'],
    expected: {
      workflowRequirement: 'locked_metric_run_and_approved_narrative_versions_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: ['POST /api/funds/:fundId/metric-runs/:metricRunId/evidence-records'],
    expected: {
      // Key-only deduplication: a replayed Idempotency-Key returns the stored
      // record without comparing the request body (request-hash comparison is
      // an ADR-040 follow-up).
      workflowRequirement: 'draft_metric_run_and_idempotency_key_dedup',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: ['POST /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs'],
    expected: {
      workflowRequirement: 'locked_metric_run_source_contract_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: ['PATCH /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId'],
    expected: {
      workflowRequirement: 'locked_metric_run_draft_and_expected_version_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: [
      'POST /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/review',
    ],
    expected: {
      workflowRequirement: 'locked_metric_run_edited_draft_and_expected_version_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: [
      'POST /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/approve',
    ],
    expected: {
      workflowRequirement: 'locked_metric_run_edited_review_and_expected_version_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
  {
    keys: [
      'POST /api/funds/:fundId/imports/ledger/commit',
      'POST /api/funds/:fundId/imports/valuation-marks/commit',
    ],
    expected: {
      workflowRequirement: 'clean_preview_hash_fund_references_and_source_hashes_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
    },
  },
];

function expectPolicy(key: string): RoutePolicyEntry {
  const entry = policyByKey.get(key);
  if (!entry) {
    throw new Error(`Missing route policy entry ${key}`);
  }
  return entry;
}

describe('route policy coverage', () => {
  it('passes the shared route-policy verifier for the checked-in registry', () => {
    expect(verifyRoutePolicy()).toEqual([]);
  });

  it('covers every active financial governance route', () => {
    expect(ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES.length).toBeGreaterThan(0);

    for (const governanceEntry of ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES) {
      const policyEntry = expectPolicy(governanceEntry.path);

      expect(policyEntry.method).toBeUndefined();
      expect(policyEntry.governanceRef).toBe(governanceEntry.path);
      expect(policyEntry.financialSurface).not.toBe('none');
    }
  });

  it('does not treat client route protection as API auth or fund scope', () => {
    const governanceByPath = new Map(ROUTE_GOVERNANCE_REGISTRY.map((entry) => [entry.path, entry]));

    for (const policyEntry of API_ROUTE_POLICY_REGISTRY.filter(
      (entry) => entry.financialSurface !== 'none'
    )) {
      const governanceEntry = governanceByPath.get(policyEntry.governanceRef);
      expect(governanceEntry, policyEntry.governanceRef).toBeDefined();

      if (!governanceEntry?.isProtected) {
        continue;
      }

      expect(policyEntry.apiAuthBoundary, routePolicyKey(policyEntry)).not.toBe('none_public');
      expect(policyEntry.fundScopeMode, routePolicyKey(policyEntry)).not.toBe('none');
    }
  });

  it('covers LP financial routes with the LP auth boundary', () => {
    const lpGovernanceEntries = ROUTE_GOVERNANCE_REGISTRY.filter(
      (entry) => entry.surface === 'lp-route'
    );

    expect(lpGovernanceEntries.length).toBeGreaterThan(0);

    for (const governanceEntry of lpGovernanceEntries) {
      const policyEntry = expectPolicy(governanceEntry.path);

      expect(policyEntry.financialSurface).toBe('lp_reporting');
      expect(policyEntry.apiAuthBoundary).toBe('require_auth_and_lp_access');
      expect(policyEntry.fundScopeMode).toBe('lp_claim_scope');
    }
  });

  it('maps portfolio-intelligence prototype routes to 501 non-actionable provenance', () => {
    const prototypeRoutes = portfolioIntelligenceRouteClassifications.filter(
      (route) => route.classification === 'prototype_501'
    );

    expect(prototypeRoutes.length).toBeGreaterThan(0);

    for (const route of prototypeRoutes) {
      const key = routeKey(route);
      const policyEntry = expectPolicy(key);
      const routeId = prototypeRouteIds[key as PrototypeRouteKey];

      expect(policyEntry.lifecycle).toBe('prototype_501');
      expect(policyEntry.provenanceRequired).toBe(true);
      expect(policyEntry.financialSurface).not.toBe('none');
      if (!routeId) {
        throw new Error(`Missing prototype route id for ${key}`);
      }

      const blockedError = buildPrototypeFinancialBlockedError({
        routeId,
        sourceRoute: key,
      });
      const provenance = FinancialProvenanceSchema.parse(blockedError.provenance);

      expect(blockedError.error).toBe('not_implemented');
      expect(provenance.actionability).toBe('non_actionable');
      expect(provenance.isFinanciallyActionable).toBe(false);
    }
  });

  it('covers the portfolio overview API route with query-scoped fund access', () => {
    const policyEntry = expectPolicy('GET /api/portfolio-overview');

    expect(policyEntry.governanceRef).toBe('/portfolio');
    expect(policyEntry.financialSurface).toBe('portfolio_management');
    expect(policyEntry.apiAuthBoundary).toBe('require_auth_and_fund_access');
    expect(policyEntry.fundScopeMode).toBe('query_param_fund_id');
    expect(policyEntry.workflowRequirement).toBe('fund_scope_verified');
    expect(policyEntry.provenanceRequired).toBe(true);
  });

  it('classifies the Round FMV actuals facts route as non-exportable fund modeling input', () => {
    const policy = expectPolicy('GET /api/funds/:fundId/actuals/facts');

    expect(policy.financialSurface).toBe('fund_modeling');
    expect(policy.apiAuthBoundary).toBe('require_auth_and_fund_access');
    expect(policy.fundScopeMode).toBe('route_param_fund_id');
    expect(policy.exportPolicy).toBe('not_exportable');
    expect(policy.provenanceRequired).toBe(true);
  });

  it('classifies from-seed case creation as a fund-scoped provenance mutation', () => {
    const policy = expectPolicy(
      'POST /api/funds/:fundId/scenario-analysis/scenarios/:scenarioId/cases/from-seed'
    );

    expect(policy.governanceRef).toBe('/fund-model-results/:fundId/scenarios');
    expect(policy.financialSurface).toBe('fund_modeling');
    expect(policy.apiAuthBoundary).toBe('require_auth_and_fund_access');
    expect(policy.fundScopeMode).toBe('route_param_fund_id');
    expect(policy.exportPolicy).toBe('not_exportable');
    expect(policy.provenanceRequired).toBe(true);
  });

  it('covers PRD #996 Surface-A report-package exports with role-gated fund access', () => {
    expect(LP_REPORT_PACKAGE_AUTHORITATIVE_EXPORT_POLICY_KEYS).toHaveLength(6);

    for (const key of LP_REPORT_PACKAGE_AUTHORITATIVE_EXPORT_POLICY_KEYS) {
      const policyEntry = expectPolicy(key);

      expect(policyEntry.apiAuthBoundary, key).toBe('require_auth_fund_access_and_role');
      expect(policyEntry.financialSurface, key).toBe('lp_reporting');
      expect(policyEntry.fundScopeMode, key).toBe('route_param_fund_id');
      expect(policyEntry.exportPolicy, key).toBe('qualified_exportable');
      expect(policyEntry.provenanceRequired, key).toBe(true);
      expect(policyEntry.staleBlocksExport, key).toBe(true);
      expect(policyEntry.workflowRequirement, key).toBe('metric_run_locked_or_exported');
    }
  });

  it('classifies stored-export status GETs as non-exportable readiness metadata', () => {
    for (const key of LP_REPORT_PACKAGE_STATUS_GET_POLICY_KEYS) {
      const policyEntry = expectPolicy(key);

      expect(policyEntry.apiAuthBoundary, key).toBe('require_auth_fund_access_and_role');
      expect(policyEntry.financialSurface, key).toBe('lp_reporting');
      expect(policyEntry.fundScopeMode, key).toBe('route_param_fund_id');
      expect(policyEntry.exportPolicy, key).toBe('not_exportable');
      expect(policyEntry.provenanceRequired, key).toBe(true);
      expect(policyEntry.staleBlocksExport, key).toBe(false);
      expect(policyEntry.workflowRequirement, key).toBe('metric_run_locked_or_exported');
      expect(policyEntry.notes, key).toMatch(/H9-independent/);
    }
  });

  it('keeps stored CSV creation policy exactly aligned with stored JSON creation posture', () => {
    const jsonPolicy = expectPolicy(
      'POST /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json'
    );
    const csvPolicy = expectPolicy(
      'POST /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv'
    );
    const postureFields = [
      'lifecycle',
      'governanceRef',
      'surface',
      'owner',
      'financialSurface',
      'apiAuthBoundary',
      'fundScopeMode',
      'workflowRequirement',
      'exportPolicy',
      'provenanceRequired',
      'staleBlocksExport',
      'humanReviewRequired',
      'performanceBudgetMs',
      'notes',
    ] as const satisfies readonly (keyof RoutePolicyEntry)[];

    for (const field of postureFields) {
      expect(csvPolicy[field], field).toEqual(jsonPolicy[field]);
    }
  });

  it('covers every LP-reporting metric-run and import route', () => {
    expect(LP_REPORTING_ROUTE_POLICY_KEYS).toHaveLength(28);

    const declaredRoutes = [
      ...declaredRoutePolicyKeys('server/routes/lp-reporting/metric-runs.ts'),
      ...declaredRoutePolicyKeys('server/routes/lp-reporting/imports.ts'),
    ];
    expect(declaredRoutes).toEqual(LP_REPORTING_ROUTE_POLICY_KEYS);

    for (const key of declaredRoutes) {
      expectPolicy(key);
    }
  });

  it('pins existing LP-reporting preview, provenance, and lifecycle policy gates', () => {
    const exportKeys = new Set<string>(LP_REPORT_PACKAGE_EXPORT_POLICY_KEYS);
    const expectedAdditionalKeys = LP_REPORTING_ROUTE_POLICY_KEYS.filter(
      (key) => !exportKeys.has(key)
    ).sort();
    const groupedKeys = LP_REPORTING_ADDITIONAL_POLICY_GROUPS.flatMap((group) => group.keys).sort();
    expect(groupedKeys).toEqual(expectedAdditionalKeys);

    for (const group of LP_REPORTING_ADDITIONAL_POLICY_GROUPS) {
      for (const key of group.keys) {
        const policy = expectPolicy(key);

        expect(policy.financialSurface, key).toBe('lp_reporting');
        expect(policy.apiAuthBoundary, key).toBe('require_auth_and_fund_access');
        expect(policy.fundScopeMode, key).toBe('route_param_fund_id');
        expect(policy.workflowRequirement, key).toBe(group.expected.workflowRequirement);
        expect(policy.exportPolicy, key).toBe(group.expected.exportPolicy);
        expect(policy.provenanceRequired, key).toBe(group.expected.provenanceRequired);
        expect(policy.staleBlocksExport, key).toBe(false);
      }
    }
  });

  it('fails verification when an active financial governance route has no explicit policy', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      activeFinancialGovernanceEntries: [
        ...defaultRoutePolicyVerificationInput.activeFinancialGovernanceEntries,
        {
          path: '/synthetic-financial-route',
          surface: 'app-route',
          exposure: 'internal-live',
          isProtected: true,
        },
      ],
    });

    expect(errors).toContain('Missing active financial route policy: /synthetic-financial-route');
  });

  it('fails verification when a scoped financial route downgrades API auth', () => {
    const mutatedPolicyEntries = API_ROUTE_POLICY_REGISTRY.map((entry) =>
      routePolicyKey(entry) === '/portfolio'
        ? { ...entry, apiAuthBoundary: 'require_auth' as const }
        : entry
    );

    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      policyEntries: mutatedPolicyEntries,
    });

    expect(errors).toContain(
      'Policy /portfolio does not declare API-side fund, LP, or share scope'
    );
  });

  it('fails verification when a portfolio-intelligence fixture route lacks an explicit override', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      portfolioIntelligenceRouteClassifications: [
        ...defaultRoutePolicyVerificationInput.portfolioIntelligenceRouteClassifications,
        {
          method: 'GET',
          path: '/api/portfolio/synthetic',
          classification: 'durable_crud',
        },
      ],
    });

    expect(errors).toContain(
      'Missing explicit portfolio-intelligence route policy override: GET /api/portfolio/synthetic'
    );
  });

  it('fails verification when a financial common route loses policy coverage', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      commonRoutePolicyIds: {
        ...defaultRoutePolicyVerificationInput.commonRoutePolicyIds,
        'fund-moic': [],
      },
    });

    expect(errors).toContain('Missing route policy coverage for common financial route: fund-moic');
  });

  it('fails verification when common-route coverage references a missing policy id', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      commonRoutePolicyIds: {
        ...defaultRoutePolicyVerificationInput.commonRoutePolicyIds,
        'fund-moic': ['api:get:/api/funds/:fundId/moic/missing'],
      },
    });

    expect(errors).toContain(
      'Common route fund-moic references missing route policy id: api:get:/api/funds/:fundId/moic/missing'
    );
  });

  it('fails verification when route schema metadata names an uncovered table', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      commonApiRoutes: defaultRoutePolicyVerificationInput.commonApiRoutes.map((entry) =>
        entry.id === 'fund-moic'
          ? {
              ...entry,
              schemaTables: [...entry.schemaTables, 'missing_route_table'],
            }
          : entry
      ),
    });

    expect(errors).toContain(
      'Common route fund-moic references table missing from the production schema registry: missing_route_table'
    );
  });

  it('fails verification when a C1 table is absent from route schema metadata', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      commonApiRoutes: defaultRoutePolicyVerificationInput.commonApiRoutes.map((entry) =>
        entry.id === 'fund-moic'
          ? {
              ...entry,
              migrationParity: {
                kind: 'c1' as const,
                tables: [...entry.migrationParity.tables, 'missing_route_table'],
              },
            }
          : entry
      ),
    });

    expect(errors).toContain(
      'Common route fund-moic C1 table is missing from route schema metadata: missing_route_table'
    );
  });

  it('fails verification when a C1 table loses reconciliation-manifest coverage', () => {
    const productionReconciliationTables = new Set(
      defaultRoutePolicyVerificationInput.productionReconciliationTables
    );
    productionReconciliationTables.delete('reconciliation_runs');

    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      productionReconciliationTables,
    });

    expect(errors).toContain(
      'Common route fund-moic C1 table is missing from production reconciliation manifests: reconciliation_runs'
    );
  });

  it('fails verification when a runtime-specific route loses its reason', () => {
    const [firstRoute, ...remainingRoutes] =
      defaultRoutePolicyVerificationInput.runtimeSpecificRoutes;
    if (!firstRoute) throw new Error('Expected at least one runtime-specific route');

    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      runtimeSpecificRoutes: [{ ...firstRoute, reason: '' }, ...remainingRoutes],
    });

    expect(errors).toContain(`Runtime-specific route ${firstRoute.id} is missing a reason`);
  });
});
