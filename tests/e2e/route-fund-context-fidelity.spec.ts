import { expect, test, type Page, type Route } from '@playwright/test';
import { PortfolioOverviewResponseV1Schema } from '../../shared/contracts/portfolio-overview-v1.contract';
import { makeDashboardSummaryFixture } from './fixtures/dashboard-summary';
import {
  CURRENT_FORECAST_V2_FIXTURE,
  makeCurrentPlanVersionsResponse,
  makeDualForecastResponse,
  makeFinancialFactsLatestResponse,
  makeNeutralFundMoicRankingsResponseV2,
} from './fixtures/qa-audit-api';

const ROUTE_READY_TIMEOUT_MS = 60_000;
const APP_BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173';

const FIDELITY_FUND = {
  id: 314,
  name: 'Fund 314 - Fidelity Seed',
  size: 62_500_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2026,
  deployedCapital: 16_700_000,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  termYears: 10,
};

const FIDELITY_COMPANIES = [
  {
    id: 10,
    name: 'Northstar Systems',
    sector: 'Infrastructure',
    stage: 'Series A',
    invested: 5_000_000,
    currentValue: 13_200_000,
    moic: 2.64,
    status: 'active',
  },
  {
    id: 11,
    name: 'Clearpath Bio',
    sector: 'Healthcare',
    stage: 'Seed',
    invested: 6_700_000,
    currentValue: 18_400_000,
    moic: 2.75,
    status: 'active',
  },
  {
    id: 12,
    name: 'Atlas Data',
    sector: 'Data',
    stage: 'Series B',
    invested: 5_000_000,
    currentValue: 15_500_000,
    moic: 3.1,
    status: 'active',
  },
];

const FIDELITY_METRICS = {
  fundId: FIDELITY_FUND.id,
  fundName: FIDELITY_FUND.name,
  actual: {
    asOfDate: '2026-02-01T00:00:00.000Z',
    totalCommitted: FIDELITY_FUND.size,
    totalCalled: 20_000_000,
    totalDeployed: FIDELITY_FUND.deployedCapital,
    totalUncalled: 42_500_000,
    currentNAV: 46_100_000,
    totalDistributions: 1_000_000,
    totalValue: 47_100_000,
    irr: 0.185,
    tvpi: 2.36,
    dpi: 0.05,
    rvpi: 2.31,
    activeCompanies: FIDELITY_COMPANIES.length,
    exitedCompanies: 0,
    writtenOffCompanies: 0,
    totalCompanies: FIDELITY_COMPANIES.length,
    deploymentRate: 26.72,
    averageCheckSize: FIDELITY_FUND.deployedCapital / FIDELITY_COMPANIES.length,
  },
  projected: null,
  target: {
    targetFundSize: FIDELITY_FUND.size,
    targetIRR: 0.2,
    targetTVPI: 2.5,
    targetDPI: 1,
    targetDeploymentYears: 4,
    targetCompanyCount: 20,
    targetAverageCheckSize: 3_125_000,
    targetReserveRatio: 0.4,
  },
  variance: {
    deploymentVariance: {
      actual: FIDELITY_FUND.deployedCapital,
      target: 20_000_000,
      variance: -3_300_000,
      percentDeviation: -16.5,
      status: 'behind',
    },
    performanceVariance: {
      actualIRR: 0.185,
      targetIRR: 0.2,
      variance: -0.015,
      status: 'below',
    },
    tvpiVariance: {
      actual: 2.36,
      projected: 2.36,
      target: 2.5,
      varianceVsProjected: 0,
      varianceVsTarget: -0.14,
    },
    paceVariance: {
      status: 'behind',
      monthsDeviation: -2,
      periodElapsedPercent: 25,
      capitalDeployedPercent: 26.72,
    },
    portfolioVariance: {
      actualCompanies: FIDELITY_COMPANIES.length,
      targetCompanies: 20,
      variance: FIDELITY_COMPANIES.length - 20,
      onTrack: false,
    },
  },
  lastUpdated: '2026-02-01T00:00:00.000Z',
};

/**
 * F_1.9.0 basis paths for the workspace-context rail: golden live, golden
 * held, and the unavailable path (no served block). The slice loop uses the
 * golden live default.
 */
type FidelityBasis = 'live' | 'held' | 'absent';

function makeFidelityDualForecast(basis: FidelityBasis) {
  return makeDualForecastResponse({
    fundId: FIDELITY_FUND.id,
    fundName: FIDELITY_FUND.name,
    asOfDate: FIDELITY_METRICS.actual.asOfDate,
    actual: FIDELITY_METRICS.actual,
    ...(basis === 'absent' ? {} : { currentForecastV2: basis }),
  });
}

const FIDELITY_DUAL_FORECAST_BY_BASIS: Record<FidelityBasis, unknown> = {
  live: makeFidelityDualForecast('live'),
  held: makeFidelityDualForecast('held'),
  absent: makeFidelityDualForecast('absent'),
};

const FIDELITY_FACTS_LATEST = makeFinancialFactsLatestResponse(FIDELITY_FUND.id);
const FIDELITY_PLAN_VERSIONS = makeCurrentPlanVersionsResponse(FIDELITY_FUND.id);

const FIDELITY_PORTFOLIO_OVERVIEW = PortfolioOverviewResponseV1Schema.parse({
  fundId: FIDELITY_FUND.id,
  generatedAt: FIDELITY_METRICS.actual.asOfDate,
  currency: 'USD',
  provenance: {
    sourceKind: 'computed',
    actionability: 'actionable',
    sourceEngine: 'portfolio-overview',
    engineVersion: 'route-fidelity-fixture@1',
    inputHash: 'route-fund-context-fidelity-input',
    assumptionsHash: 'route-fund-context-fidelity-assumptions',
    generatedAt: FIDELITY_METRICS.actual.asOfDate,
    sourceRoute: 'GET /api/portfolio-overview',
    isFinanciallyActionable: true,
    warnings: [],
  },
  sourceRecordCounts: {
    funds: 1,
    companies: FIDELITY_COMPANIES.length,
    investments: FIDELITY_COMPANIES.length,
    valuations: FIDELITY_COMPANIES.length,
  },
  metrics: {
    totalInvested: String(FIDELITY_METRICS.actual.totalDeployed),
    totalValue: String(FIDELITY_METRICS.actual.currentNAV),
    averageMOIC: '2.7604790419161677',
    returnPct: '176.04790419161677',
    totalCompanies: FIDELITY_COMPANIES.length,
    activeCompanies: FIDELITY_COMPANIES.length,
    exitedCompanies: 0,
  },
  companies: FIDELITY_COMPANIES.map((company) => ({
    id: company.id,
    name: company.name,
    sector: company.sector,
    stage: company.stage,
    status: company.status,
    invested: String(company.invested),
    currentValue: String(company.currentValue),
    moic: String(company.moic),
  })),
  meta: {
    mode: 'live',
    requestedAsOf: null,
    resolvedAsOf: null,
    source: 'live',
    historicalAvailable: false,
  },
});

const EMPTY_VARIANCE_DASHBOARD = {
  success: true,
  data: {
    defaultBaseline: null,
    recentBaselines: [],
    activeAlerts: [],
    alertsBySeverity: { critical: 0, warning: 0, info: 0, urgent: 0 },
    alertsByseverity: { critical: 0, warning: 0, info: 0, urgent: 0 },
    summary: {
      totalBaselines: 0,
      totalActiveAlerts: 0,
      lastAnalysisDate: null,
      overallRiskLevel: 'low',
      trendDirection: 'stable',
    },
    recentReports: [],
  },
};

const ROUTE_SLICE = [
  '/dashboard',
  '/portfolio',
  '/portfolio?tab=reserve-planning',
  '/performance',
  `/forecasting?fundId=${FIDELITY_FUND.id}`,
  `/fund-model-results/${FIDELITY_FUND.id}`,
  '/sensitivity-analysis',
  '/reports',
  '/pipeline',
] as const;

interface RouteFidelityApiTracker {
  unexpectedRequests: string[];
  observedFundRequests: string[];
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill(jsonResponse(body, status));
}

function requestLabel(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  return `${request.method()} ${url.pathname}${url.search}`;
}

function fundResultsResponse() {
  return {
    status: 'ready',
    fundId: FIDELITY_FUND.id,
    fund: {
      name: FIDELITY_FUND.name,
      vintageYear: FIDELITY_FUND.vintageYear,
      size: FIDELITY_FUND.size,
    },
    lifecycle: {
      fundId: FIDELITY_FUND.id,
      configState: {
        latestVersion: 1,
        draftVersion: null,
        publishedVersion: 1,
        hasDraft: false,
        hasPublished: true,
        publishedAt: '2026-02-01T00:00:00.000Z',
        draftUpdatedAt: null,
        publishedUpdatedAt: '2026-02-01T00:00:00.000Z',
      },
      calculationState: {
        status: 'ready',
        configVersion: 1,
        runId: 1,
        correlationId: 'route-fund-fidelity',
        dispatchState: 'dispatched',
        availableSnapshotTypes: ['RESERVE', 'PACING'],
        expectedSnapshotTypes: ['RESERVE', 'PACING'],
        lastCalculatedAt: '2026-02-01T00:00:00.000Z',
        lastError: null,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent: false },
    },
    sections: {
      reserve: { status: 'unavailable', reason: 'Route fidelity fixture' },
      pacing: { status: 'unavailable', reason: 'Route fidelity fixture' },
      scorecard: {
        status: 'available',
        payload: {
          fundName: { value: FIDELITY_FUND.name, source: 'funds' },
          fundSize: { value: FIDELITY_FUND.size, source: 'funds' },
          vintageYear: { value: FIDELITY_FUND.vintageYear, source: 'funds' },
        },
      },
      scenarios: { status: 'unavailable', reason: 'Route fidelity fixture' },
      waterfall: { status: 'unavailable', reason: 'Route fidelity fixture' },
      economics: { status: 'unavailable', reason: 'Route fidelity fixture' },
    },
  };
}

interface RouteFidelityApiOptions {
  basis?: FidelityBasis;
  facts?: 'present' | 'missing';
}

async function installRouteFidelityApi(
  page: Page,
  options: RouteFidelityApiOptions = {}
): Promise<RouteFidelityApiTracker> {
  const basis = options.basis ?? 'live';
  const facts = options.facts ?? 'present';
  const unexpectedRequests: string[] = [];
  const observedFundRequests: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem('ff_enable_kpi_selectors', '0');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const label = requestLabel(route);

    if (url.pathname.includes('/fund') || url.pathname.includes('/portfolio')) {
      observedFundRequests.push(label);
    }

    if (
      url.pathname === '/api/telemetry/wizard' ||
      url.pathname === '/api/metrics/rum' ||
      url.pathname.startsWith('/api/v1/image/')
    ) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/auth/session') {
      await fulfillJson(route, {
        user: {
          id: '314',
          email: 'route-fidelity@example.com',
          role: 'admin',
          fundIds: [FIDELITY_FUND.id],
        },
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds') {
      await fulfillJson(route, [FIDELITY_FUND]);
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/dashboard-summary/${FIDELITY_FUND.id}`
    ) {
      await fulfillJson(
        route,
        makeDashboardSummaryFixture({
          fund: FIDELITY_FUND,
          metrics: {
            totalValue: FIDELITY_METRICS.actual.totalValue,
            irr: FIDELITY_METRICS.actual.irr,
            tvpi: FIDELITY_METRICS.actual.tvpi,
            dpi: FIDELITY_METRICS.actual.dpi,
            asOfDate: FIDELITY_METRICS.actual.asOfDate,
            createdAt: FIDELITY_METRICS.lastUpdated,
          },
          deploymentRate: FIDELITY_METRICS.actual.deploymentRate,
          portfolioCompanies: FIDELITY_COMPANIES,
        })
      );
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === `/api/funds/${FIDELITY_FUND.id}/metrics` ||
        url.pathname === `/api/fund-metrics/${FIDELITY_FUND.id}`)
    ) {
      await fulfillJson(route, FIDELITY_METRICS);
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/dual-forecast`
    ) {
      await fulfillJson(route, FIDELITY_DUAL_FORECAST_BY_BASIS[basis]);
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/current-plan-versions`
    ) {
      await fulfillJson(route, FIDELITY_PLAN_VERSIONS);
      return;
    }

    // F_1.9.0 workspace-context-rail accepted-facts read; the route contract
    // 404s when no accepted snapshot exists (unavailable-basis path).
    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/financial-facts/latest`
    ) {
      if (facts === 'missing') {
        await fulfillJson(route, { error: 'No accepted financial facts snapshot' }, 404);
      } else {
        await fulfillJson(route, FIDELITY_FACTS_LATEST);
      }
      return;
    }

    if (request.method() === 'GET' && url.pathname === `/api/funds/${FIDELITY_FUND.id}/data`) {
      await fulfillJson(route, {
        fund: FIDELITY_FUND,
        investments: [],
        valuations: [],
        capitalCalls: [],
        distributions: [],
        feeExpenses: [],
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === '/api/portfolio' || url.pathname === '/api/portfolio-companies')
    ) {
      await fulfillJson(route, FIDELITY_COMPANIES);
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === '/api/portfolio-overview' &&
      url.searchParams.get('fundId') === String(FIDELITY_FUND.id)
    ) {
      await fulfillJson(route, FIDELITY_PORTFOLIO_OVERVIEW);
      return;
    }

    if (request.method() === 'GET' && url.pathname.endsWith('/calculated-metrics')) {
      await fulfillJson(route, {
        totalCommitted: FIDELITY_METRICS.actual.totalCommitted,
        totalInvested: FIDELITY_METRICS.actual.totalDeployed,
        totalValue: FIDELITY_METRICS.actual.totalValue,
        irr: FIDELITY_METRICS.actual.irr,
        moic: FIDELITY_METRICS.actual.totalValue / FIDELITY_METRICS.actual.totalDeployed,
        dpi: FIDELITY_METRICS.actual.dpi,
        tvpi: FIDELITY_METRICS.actual.tvpi,
        activeInvestments: FIDELITY_COMPANIES.length,
        exited: 0,
        avgCheckSize: FIDELITY_METRICS.actual.averageCheckSize,
        deploymentRate: FIDELITY_METRICS.actual.deploymentRate,
        remainingCapital:
          FIDELITY_METRICS.actual.totalCommitted - FIDELITY_METRICS.actual.totalDeployed,
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/deals/opportunities') {
      await fulfillJson(route, {
        success: true,
        data: [],
        pagination: { hasMore: false, nextCursor: null, count: 0 },
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/deals/stages') {
      await fulfillJson(route, { success: true, data: [] });
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === '/api/pipeline' || url.pathname === '/api/reports')
    ) {
      await fulfillJson(route, []);
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/variance-dashboard`
    ) {
      await fulfillJson(route, EMPTY_VARIANCE_DASHBOARD);
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === `/api/funds/${FIDELITY_FUND.id}/variance-reports` ||
        url.pathname === `/api/funds/${FIDELITY_FUND.id}/baselines` ||
        url.pathname === `/api/funds/${FIDELITY_FUND.id}/alerts`)
    ) {
      await fulfillJson(route, { success: true, data: [], count: 0 });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/performance/timeseries`
    ) {
      await fulfillJson(route, {
        fundId: FIDELITY_FUND.id,
        fundName: FIDELITY_FUND.name,
        granularity: 'monthly',
        timeseries: [
          {
            date: '2026-02-01',
            actual: {
              irr: FIDELITY_METRICS.actual.irr,
              tvpi: FIDELITY_METRICS.actual.tvpi,
              dpi: FIDELITY_METRICS.actual.dpi,
              totalValue: FIDELITY_METRICS.actual.totalValue,
            },
            _source: 'database',
          },
        ],
        meta: {
          startDate: '2026-01-01',
          endDate: '2026-02-01',
          dataPoints: 1,
          cacheHit: false,
          computeTimeMs: 1,
        },
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/performance/breakdown`
    ) {
      await fulfillJson(route, {
        fundId: FIDELITY_FUND.id,
        fundName: FIDELITY_FUND.name,
        asOfDate: '2026-02-01',
        groupBy: url.searchParams.get('groupBy') ?? 'sector',
        breakdown: FIDELITY_COMPANIES.map((company) => ({
          group: company.sector,
          companyCount: 1,
          totalDeployed: company.invested,
          currentValue: company.currentValue,
          moic: company.moic,
          irr: null,
          unrealizedGain: company.currentValue - company.invested,
          percentOfPortfolio: company.invested / FIDELITY_FUND.deployedCapital,
        })),
        totals: {
          companyCount: FIDELITY_COMPANIES.length,
          totalDeployed: FIDELITY_FUND.deployedCapital,
          currentValue: FIDELITY_METRICS.actual.currentNAV,
          averageMOIC: 2.77,
          portfolioIRR: FIDELITY_METRICS.actual.irr,
        },
        meta: { cacheHit: false, computeTimeMs: 1 },
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/performance/comparison`
    ) {
      await fulfillJson(route, {
        fundId: FIDELITY_FUND.id,
        fundName: FIDELITY_FUND.name,
        comparisons: [],
        meta: { cacheHit: false, computeTimeMs: 1 },
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/moic/rankings` &&
      url.search === '?contract=v2'
    ) {
      await fulfillJson(route, makeNeutralFundMoicRankingsResponseV2(FIDELITY_FUND.id));
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/moic/reserve-intelligence/latest`
    ) {
      await fulfillJson(route, { code: 'RESERVE_INTELLIGENCE_RUN_NOT_FOUND' }, 404);
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/scenario-sets` &&
      url.search === ''
    ) {
      await fulfillJson(route, { scenarioSets: [] });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/internal-analysis/drafts`
    ) {
      await fulfillJson(route, { drafts: [] });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/internal-analysis/references`
    ) {
      await fulfillJson(route, { references: [] });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/allocations/latest`
    ) {
      await fulfillJson(route, {
        fund_id: FIDELITY_FUND.id,
        companies: [],
        metadata: {
          total_planned_cents: 0,
          total_deployed_cents: 0,
          companies_count: 0,
          allocation_facts_missing_count: 0,
          last_updated_at: null,
          actuals_drift_summary: {
            facts_status: 'available',
            drifted_company_count: 0,
            material_company_count: 0,
            degraded_company_count: 0,
            facts_input_hash: null,
            as_of_date: '2026-02-01',
          },
        },
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/allocation-scenarios`
    ) {
      await fulfillJson(route, { scenarios: [] });
      return;
    }

    if (request.method() === 'GET' && url.pathname === `/api/funds/${FIDELITY_FUND.id}/results`) {
      await fulfillJson(route, fundResultsResponse());
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === `/api/funds/${FIDELITY_FUND.id}/lifecycle-history` ||
        url.pathname === `/api/funds/${FIDELITY_FUND.id}/results-comparison`)
    ) {
      await fulfillJson(route, { fundId: FIDELITY_FUND.id, entries: [], comparisons: [] });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname.startsWith(`/api/funds/${FIDELITY_FUND.id}/sensitivity/`)
    ) {
      await fulfillJson(route, { success: true, data: [] });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/backtesting/scenarios') {
      await fulfillJson(route, {
        scenarios: ['financial_crisis_2008', 'covid_2020', 'bull_market_2021'],
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/backtesting/fund/${FIDELITY_FUND.id}/history`
    ) {
      await fulfillJson(route, {
        fundId: FIDELITY_FUND.id,
        pagination: {
          limit: Number(url.searchParams.get('limit') ?? 10),
          offset: Number(url.searchParams.get('offset') ?? 0),
          count: 0,
          hasMore: false,
        },
        history: [],
      });
      return;
    }

    unexpectedRequests.push(label);
    await fulfillJson(
      route,
      { error: 'UNEXPECTED_ROUTE_FUND_FIDELITY_API_REQUEST', request: label },
      500
    );
  });

  return { unexpectedRequests, observedFundRequests };
}

async function readHeaderText(page: Page) {
  const header = page.locator('div.sticky').filter({
    has: page.getByRole('heading', { name: FIDELITY_FUND.name }),
  });
  await expect(header).toBeVisible({ timeout: ROUTE_READY_TIMEOUT_MS });
  await expect(header.getByText('Live metrics')).toBeVisible({ timeout: ROUTE_READY_TIMEOUT_MS });
  return ((await header.textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

function expectHeaderFacts(headerText: string) {
  expect(headerText).toContain(FIDELITY_FUND.name);
  expect(headerText).toContain('Fund Size: $63M');
  expect(headerText).toContain('27% Deployed');
  expect(headerText).toContain('Total Invested$17M');
  expect(headerText).toContain('Current Value$47M');
  expect(headerText).toContain('Active3');
  expect(headerText).toContain('Remaining$46M');

  expect(headerText).not.toContain('$100M');
  expect(headerText).not.toContain('$150.0M');
  expect(headerText).not.toContain('$43M');
  expect(headerText).not.toContain('$0');
  expect(headerText).not.toMatch(/(^|\D)68%($|\D)/);
}

test.describe('route fund context fidelity', () => {
  for (const routePath of ROUTE_SLICE) {
    test(`shows canonical active fund facts on ${routePath}`, async ({ page }) => {
      const consoleFailures: string[] = [];
      const failedResponses: string[] = [];

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleFailures.push(message.text());
        }
      });
      page.on('response', (response) => {
        const url = new URL(response.url());
        if (url.pathname.startsWith('/api/') && response.status() >= 400) {
          failedResponses.push(`${response.status()} ${url.pathname}${url.search}`);
        }
      });

      const apiTracker = await installRouteFidelityApi(page);
      await page.goto(new URL(routePath, APP_BASE_URL).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      const headerText = await readHeaderText(page);
      expectHeaderFacts(headerText);

      expect(apiTracker.observedFundRequests).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/\/api\/funds?\/1(?:\/|\b)/)])
      );
      expect(apiTracker.observedFundRequests).toEqual(
        expect.arrayContaining([
          expect.stringMatching(new RegExp(`/api/funds/${FIDELITY_FUND.id}/metrics\\b`)),
        ])
      );
      expect(apiTracker.unexpectedRequests).toEqual([]);
      expect(failedResponses).toEqual([]);
      expect(consoleFailures).toEqual([]);
    });
  }
});

test.describe('workspace context rail basis fidelity (F_1.9.0)', () => {
  const RAIL_ROUTE = `/fund-model-results/${FIDELITY_FUND.id}`;
  const shortInput = CURRENT_FORECAST_V2_FIXTURE.inputHash.slice(0, 8);
  const shortResult = CURRENT_FORECAST_V2_FIXTURE.resultHash.slice(0, 8);
  const shortAssumptions = CURRENT_FORECAST_V2_FIXTURE.assumptionsHash.slice(0, 8);
  const shortFacts = CURRENT_FORECAST_V2_FIXTURE.factsInputHash.slice(0, 8);

  async function openRailRoute(page: Page, options: RouteFidelityApiOptions) {
    const apiTracker = await installRouteFidelityApi(page, options);
    await page.goto(new URL(RAIL_ROUTE, APP_BASE_URL).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const rail = page.getByTestId('workspace-context-rail');
    await expect(rail).toBeVisible({ timeout: ROUTE_READY_TIMEOUT_MS });
    return { apiTracker, rail };
  }

  for (const responsiveCase of [
    {
      label: 'compact command-bar trigger below 1024px',
      width: 820,
      route: `/fund-model-results/${FIDELITY_FUND.id}/internal-analysis`,
      trigger: 'workspace-context-trigger-compact',
    },
    {
      label: 'slide-over trigger from 1024px through 1279px',
      width: 1100,
      route: `/fund-model-results/${FIDELITY_FUND.id}/analysis`,
      trigger: 'workspace-context-trigger',
    },
    {
      label: 'pinned rail at 1280px and wider',
      width: 1440,
      route: `/fund-model-results/${FIDELITY_FUND.id}/moic-analysis`,
      trigger: null,
    },
  ] as const) {
    test(`${responsiveCase.label} mounts route-scoped context`, async ({ page }) => {
      await page.setViewportSize({ width: responsiveCase.width, height: 900 });
      const apiTracker = await installRouteFidelityApi(page, { basis: 'live' });

      await page.goto(new URL(responsiveCase.route, APP_BASE_URL).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      await expect(page.getByRole('navigation', { name: 'Fund workspace' })).toBeVisible({
        timeout: ROUTE_READY_TIMEOUT_MS,
      });

      const rail = page.getByTestId('workspace-context-rail');
      if (responsiveCase.trigger === null) {
        await expect(rail).toBeVisible();
        await expect(page.getByTestId('workspace-context-trigger')).toBeHidden();
        await expect(page.getByTestId('workspace-context-trigger-compact')).toBeHidden();
      } else {
        await expect(rail).toBeHidden();
        const trigger = page.getByTestId(responsiveCase.trigger);
        await expect(trigger).toBeVisible();
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('heading', { name: FIDELITY_FUND.name })).toBeVisible();
      }

      expect(apiTracker.unexpectedRequests).toEqual([]);
    });
  }

  test('golden live basis renders served identity, plan label, and facts freshness', async ({
    page,
  }) => {
    const { apiTracker, rail } = await openRailRoute(page, { basis: 'live' });
    const basis = rail.getByTestId('workspace-context-basis');

    await expect(basis.getByText('Live', { exact: true })).toBeVisible();
    await expect(basis.getByText('As of Feb 14, 2026').first()).toBeVisible();
    await expect(basis.getByText('Plan v1')).toBeVisible();
    await expect(basis.getByText(shortInput)).toBeVisible();
    await expect(basis.getByText(shortResult)).toBeVisible();
    await expect(basis.getByText(shortAssumptions)).toBeVisible();
    await expect(basis.getByText(/basis unavailable/i)).toHaveCount(0);
    await expect(basis.getByText('Current forecast is held')).toHaveCount(0);

    // Facts hash renders only under the freshness label.
    await expect(
      rail.getByText(
        `Facts as of ${CURRENT_FORECAST_V2_FIXTURE.factsAsOfDate} · input ${shortFacts}`
      )
    ).toBeVisible();
    await expect(basis.getByText(new RegExp(shortFacts))).toHaveCount(0);

    // Rendering the authorized command does not issue a mutation.
    await expect(
      rail.getByRole('button', { name: 'Recompute from latest accepted facts' })
    ).toBeEnabled();

    expect(apiTracker.unexpectedRequests).toEqual([]);
  });

  test('golden held basis renders the pinned identity and held disclosure, never unavailable', async ({
    page,
  }) => {
    const { apiTracker, rail } = await openRailRoute(page, { basis: 'held' });
    const basis = rail.getByTestId('workspace-context-basis');

    await expect(basis.getByText('Held reference')).toBeVisible();
    // Pinned basis identity of the served reference.
    await expect(basis.getByText(shortInput)).toBeVisible();
    await expect(basis.getByText(shortResult)).toBeVisible();
    await expect(basis.getByText(shortAssumptions)).toBeVisible();
    await expect(basis.getByText('As of Feb 14, 2026').first()).toBeVisible();
    // Held disclosure content.
    await expect(basis.getByText('Current forecast is held')).toBeVisible();
    await expect(basis.getByText(CURRENT_FORECAST_V2_FIXTURE.heldReasonCopy)).toBeVisible();
    await expect(basis.getByText('Pinned 3 days ago')).toBeVisible();
    // A held serving is a golden state, never basis-unavailable.
    await expect(basis.getByText(/basis unavailable/i)).toHaveCount(0);

    expect(apiTracker.unexpectedRequests).toEqual([]);
  });

  test('unavailable basis renders disabled-with-reason and never fabricates identity', async ({
    page,
  }) => {
    const { apiTracker, rail } = await openRailRoute(page, {
      basis: 'absent',
      facts: 'missing',
    });
    const basis = rail.getByTestId('workspace-context-basis');

    await expect(basis.getByText('No served current forecast was returned.')).toBeVisible();
    await expect(basis.getByText('Basis unavailable').first()).toBeVisible();
    await expect(basis.getByText(shortInput)).toHaveCount(0);
    await expect(basis.getByText('Current forecast is held')).toHaveCount(0);
    await expect(rail.getByText('Accepted facts unavailable.')).toBeVisible();
    await expect(
      rail.getByText('A single main fund vehicle is required; accepted facts did not provide one.')
    ).toBeVisible();

    expect(apiTracker.unexpectedRequests).toEqual([]);
  });
});
