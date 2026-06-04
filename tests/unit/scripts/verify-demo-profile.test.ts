import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

import {
  buildExpectedManualProfileFacts,
  buildExpectedDemoProfileFacts,
  verifyDemoProfile,
  verifyManualProfile,
  runVerifyDemoProfileCli,
  verifyDemoProfileStorageWithStore,
} from '../../../scripts/verify-demo-profile';
import {
  runDemoProfileDryRun,
  type DemoProfileImportStore,
} from '../../../server/services/demo-profile-import-service';
import type { DemoProfileImportLedgerRecord } from '../../../server/services/demo-profile-import-service';
import type { UnifiedFundMetrics } from '@shared/types/metrics';
import { buildDemoProfileImportBundle } from '../../fixtures/demo-profile-import-fixture';

function encodedBundle(): string {
  return Buffer.from(JSON.stringify(buildDemoProfileImportBundle()), 'utf8').toString('base64');
}

function uuidFor(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function buildLedgerRows(fundId: number): DemoProfileImportLedgerRecord[] {
  const bundle = buildDemoProfileImportBundle();
  const preview = runDemoProfileDryRun(bundle);
  return preview.rows.map((row, index) => ({
    fundId,
    datasetId: bundle.datasetId,
    targetTable: row.targetTable,
    sourceKey: row.sourceKey,
    sourceHash: row.sourceHash,
    targetPkType: row.targetPkType,
    targetIdText: row.targetPkType === 'uuid' ? uuidFor(index + 1) : String(index + 1),
  }));
}

function buildStore(rows: DemoProfileImportLedgerRecord[], missingSourceKey?: string) {
  const store = {
    async getFund() {
      return { id: 77, name: 'Verifier Fund' };
    },
    async ensureSystemActor() {
      return undefined;
    },
    async getLedgerRow() {
      return null;
    },
    async listLedgerRows() {
      return rows;
    },
    async insertLedgerRow() {
      return undefined;
    },
    async deleteLedgerRowsForDataset() {
      return undefined;
    },
    async targetExists(row: DemoProfileImportLedgerRecord) {
      return row.sourceKey !== missingSourceKey;
    },
    async getActiveDefaultBaselineId() {
      return null;
    },
    async deactivateActiveDefaultBaselines() {
      return undefined;
    },
    async restoreDefaultBaseline() {
      return undefined;
    },
    async insertPortfolioCompany() {
      return 1;
    },
    async insertInvestment() {
      return 1;
    },
    async insertInvestmentLot() {
      return uuidFor(1);
    },
    async insertDealOpportunity() {
      return 1;
    },
    async insertFundMetric() {
      return 1;
    },
    async insertPacingHistory() {
      return 1;
    },
    async insertFundBaseline() {
      return uuidFor(2);
    },
    async insertVarianceReport() {
      return uuidFor(3);
    },
    async insertBacktestResult() {
      return uuidFor(4);
    },
    async deleteTargets() {
      return 0;
    },
  };

  return store as DemoProfileImportStore;
}

function persistentEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    ALLOW_MEMORY_STORAGE: '0',
    DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
  } as NodeJS.ProcessEnv;
}

type ActualMetricTestOverrides = Partial<UnifiedFundMetrics['actual']> & {
  remainingDeployableCapital?: number;
  provenance?: Record<string, unknown>;
};

function buildUnifiedMetrics(overrides: ActualMetricTestOverrides = {}) {
  const actual: UnifiedFundMetrics['actual'] & ActualMetricTestOverrides = {
    asOfDate: '2026-01-31T00:00:00.000Z',
    totalCommitted: 20_000_000,
    totalCalled: 1_000_000,
    totalDeployed: 1_000_000,
    totalUncalled: 19_000_000,
    currentNAV: 4_500_000,
    totalDistributions: 0,
    totalValue: 4_500_000,
    irr: null,
    tvpi: 4.5,
    dpi: null,
    rvpi: 4.5,
    activeCompanies: 1,
    exitedCompanies: 0,
    writtenOffCompanies: 0,
    totalCompanies: 1,
    deploymentRate: 5,
    averageCheckSize: 1_000_000,
    ...overrides,
  };

  return {
    fundId: 77,
    fundName: 'Verifier Fund',
    actual,
    projected: {
      asOfDate: '2026-01-31T00:00:00.000Z',
      projectionDate: '2026-01-31T00:00:00.000Z',
      projectedDeployment: [],
      projectedDistributions: [],
      projectedNAV: [],
      expectedTVPI: 0,
      expectedIRR: 0,
      expectedDPI: 0,
      totalReserveNeeds: 0,
      allocatedReserves: 0,
      unallocatedReserves: 0,
      reserveAllocationRate: 0,
      deploymentPace: 'on-track',
      quartersRemaining: 0,
      recommendedQuarterlyDeployment: 0,
    },
    target: {
      targetFundSize: 20_000_000,
      targetIRR: 0,
      targetTVPI: 0,
      targetDeploymentYears: 4,
      targetCompanyCount: 1,
      targetAverageCheckSize: 1_000_000,
    },
    variance: {
      deploymentVariance: {
        actual: actual.totalDeployed,
        target: 0,
        variance: actual.totalDeployed,
        percentDeviation: 0,
        status: 'on-track',
      },
      performanceVariance: {
        actualIRR: actual.irr,
        targetIRR: 0,
        variance: null,
        status: 'insufficient-data',
      },
      tvpiVariance: {
        actual: actual.tvpi,
        projected: 0,
        target: 0,
        varianceVsProjected: actual.tvpi,
        varianceVsTarget: actual.tvpi,
      },
      paceVariance: {
        status: 'on-track',
        monthsDeviation: 0,
        periodElapsedPercent: 0,
        capitalDeployedPercent: actual.deploymentRate,
      },
      portfolioVariance: {
        actualCompanies: actual.activeCompanies,
        targetCompanies: 1,
        variance: actual.activeCompanies - 1,
        onTrack: true,
      },
    },
    lastUpdated: '2026-01-31T00:00:00.000Z',
  } satisfies UnifiedFundMetrics;
}

type ApiReadbackOverrides = Partial<{
  fund: unknown;
  portfolioCompanies: unknown;
  investments: unknown;
  investmentLots: unknown;
  fundMetrics: unknown;
  pacingHistory: unknown;
  fundBaselines: unknown;
  varianceReports: unknown;
  backtestResults: unknown;
  pipelineDeals: unknown;
}>;

interface ApiReadbackOptions {
  enforceScopedTokenFundId?: number;
}

function authorizationHeader(input: URL | RequestInfo, init?: RequestInit): string | undefined {
  const initHeader = new Headers(init?.headers).get('authorization');
  if (initHeader !== null) {
    return initHeader;
  }

  if (input instanceof Request) {
    return input.headers.get('authorization') ?? undefined;
  }

  return undefined;
}

function fundIdsFromAuthorizationHeader(headerValue: string | undefined): number[] | undefined {
  if (headerValue === undefined || !headerValue.startsWith('Bearer ')) {
    return undefined;
  }

  const decoded = jwt.decode(headerValue.slice('Bearer '.length));
  if (typeof decoded !== 'object' || decoded === null || !Array.isArray(decoded['fundIds'])) {
    return undefined;
  }

  return decoded['fundIds'].filter(
    (fundId): fundId is number => typeof fundId === 'number' && Number.isInteger(fundId)
  );
}

function mockApiReadback(
  metrics: UnifiedFundMetrics,
  overrides: ApiReadbackOverrides = {},
  options: ApiReadbackOptions = {}
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      if (options.enforceScopedTokenFundId !== undefined) {
        const fundIds = fundIdsFromAuthorizationHeader(authorizationHeader(input, init));
        if (fundIds === undefined || !fundIds.includes(options.enforceScopedTokenFundId)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        }
      }

      let payload: unknown;

      if (url.pathname === '/api/funds/77/metrics') {
        payload = metrics;
      } else if (url.pathname === '/api/funds/77') {
        payload = overrides.fund ?? { id: 77, name: 'Verifier Fund', size: '20000000.00' };
      } else if (url.pathname === '/api/funds/77/companies') {
        payload = overrides.portfolioCompanies ?? {
          companies: [{ id: 1, fundId: 77 }],
          pagination: { has_more: false, next_cursor: null },
        };
      } else if (url.pathname === '/api/investments') {
        payload = overrides.investments ?? [{ id: 11, fundId: 77 }];
      } else if (url.pathname === '/api/funds/77/portfolio/lots') {
        payload = overrides.investmentLots ?? {
          data: [{ id: 'lot-1', investmentId: 11 }],
          pagination: { count: 1 },
        };
      } else if (url.pathname === '/api/funds/77/performance/metrics') {
        payload = overrides.fundMetrics ?? { success: true, data: [{ fundId: 77 }], count: 1 };
      } else if (url.pathname === '/api/funds/77/pacing-history') {
        payload = overrides.pacingHistory ?? { success: true, data: [{ fundId: 77 }], count: 1 };
      } else if (url.pathname === '/api/funds/77/baselines') {
        payload = overrides.fundBaselines ?? { data: [{ id: 'baseline-1', fundId: 77 }], count: 1 };
      } else if (url.pathname === '/api/funds/77/variance-reports') {
        payload = overrides.varianceReports ?? {
          data: [{ id: 'variance-1', fundId: 77, baselineId: 'baseline-1' }],
          count: 1,
        };
      } else if (url.pathname === '/api/backtesting/fund/77/history') {
        payload = overrides.backtestResults ?? {
          fundId: 77,
          history: [{ id: 'backtest-1', config: { fundId: 77 } }],
          pagination: { count: 1 },
        };
      } else if (url.pathname === '/api/deals/opportunities') {
        payload = overrides.pipelineDeals ?? {
          success: true,
          data: [{ id: 21, fundId: 77 }],
          pagination: { count: 1 },
        };
      } else {
        payload = { error: 'not_found' };
        return new Response(JSON.stringify(payload), { status: 404 });
      }

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    })
  );
}

describe('verify-demo-profile helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('derives expected fund facts from the sanitized bundle', () => {
    const facts = buildExpectedDemoProfileFacts(buildDemoProfileImportBundle());

    expect(facts.totalInvested).toBe(1_000_000);
    expect(facts.currentNav).toBe(4_500_000);
    expect(facts.activeCompanies).toBe(1);
    expect(facts.countsByTable.portfoliocompanies).toBe(1);
    expect(facts.countsByTable.backtest_results).toBe(1);
  });

  it('adapts manual manifest facts into the shared expected-facts shape', () => {
    const facts = buildExpectedManualProfileFacts({
      datasetId: 'manual-gp-proof',
      countsByTable: {
        portfoliocompanies: 1,
        investments: 1,
      },
      totalInvested: 750_000,
      currentNav: 1_250_000,
      activeCompanies: 1,
    });

    expect(facts).toMatchObject({
      datasetId: 'manual-gp-proof',
      totalInvested: 750_000,
      currentNav: 1_250_000,
      activeCompanies: 1,
      defaultBaselineExpected: false,
    });
    expect(facts.countsByTable.portfoliocompanies).toBe(1);
    expect(facts.countsByTable.investments).toBe(1);
    expect(facts.countsByTable.investment_lots).toBe(0);
  });

  it('derives invested capital from company amounts when investment rows are absent', () => {
    const bundle = buildDemoProfileImportBundle();
    const facts = buildExpectedDemoProfileFacts({
      ...bundle,
      sections: {
        ...bundle.sections,
        investments: [],
        investmentLots: [],
      },
    });

    expect(facts.totalInvested).toBe(1_000_000);
  });

  it('passes storage verification when every ledger target exists', async () => {
    const bundle = buildDemoProfileImportBundle();
    const result = await verifyDemoProfileStorageWithStore(buildStore(buildLedgerRows(77)), {
      fundId: 77,
      bundle,
    });

    expect(result.issues).toEqual([]);
    expect(result.storage.ledgerRows).toBe(9);
  });

  it('reports missing ledger targets and count mismatches', async () => {
    const bundle = buildDemoProfileImportBundle();
    const rows = buildLedgerRows(77).slice(1);
    const result = await verifyDemoProfileStorageWithStore(buildStore(rows, rows[0]!.sourceKey), {
      fundId: 77,
      bundle,
    });

    expect(result.issues.map((issue) => issue.code)).toContain('LEDGER_COUNT_MISMATCH');
    expect(result.issues.map((issue) => issue.code)).toContain('LEDGER_TARGETS_MISSING');
  });

  it('rejects an invalid expected fund size before verification', async () => {
    const result = await runVerifyDemoProfileCli(
      [
        '--fund-id',
        '77',
        '--env-payload',
        'DEMO_PROFILE_PAYLOAD_B64',
        '--expected-fund-size',
        'not-a-number',
      ],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'test',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('INVALID_CLI_ARGUMENTS');
    expect(result.stderr).toContain('--expected-fund-size must be a positive number');
  });

  it('refuses CLI verification in test mock database mode', async () => {
    const result = await runVerifyDemoProfileCli(
      ['--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64'],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'test',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DEMO_PROFILE_IMPORT_TEST_STORAGE');
  });

  it('refuses CLI verification when no persistent database is configured', async () => {
    const result = await runVerifyDemoProfileCli(
      ['--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64'],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'development',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DEMO_PROFILE_IMPORT_DATABASE_REQUIRED');
  });

  it('refuses CLI verification in explicit memory storage mode', async () => {
    const result = await runVerifyDemoProfileCli(
      ['--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64', '--require-api'],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'development',
        ALLOW_MEMORY_STORAGE: '1',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DEMO_PROFILE_IMPORT_MEMORY_STORAGE');
  });

  it('refuses professional demo verification when API origins disagree', async () => {
    const result = await runVerifyDemoProfileCli(
      ['--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64', '--require-api'],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'development',
        PROFESSIONAL_DEMO_MODE: 'professional-demo-local-postgres',
        DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
        BASE_URL: 'http://localhost:5000',
        CLIENT_URL: 'http://localhost:5173',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DEMO_PROFILE_PROFESSIONAL_RUNTIME_INVALID');
    expect(result.stderr).toContain('CLIENT_URL must match BASE_URL');
  });

  it('fails verification when API visibility is required but no API base URL is configured', async () => {
    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      requireApi: true,
      env: persistentEnv(),
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ layer: 'config', code: 'API_BASE_URL_REQUIRED' })
    );
  });

  it('reports expected and actual API metric mismatches', async () => {
    mockApiReadback(buildUnifiedMetrics({ totalDeployed: 2_000_000 }));

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_TOTAL_INVESTED_MISMATCH',
        expected: 1_000_000,
        actual: 2_000_000,
      })
    );
    expect(report.api?.readbacks['metrics']).toEqual(
      expect.objectContaining({
        expected: expect.objectContaining({ totalInvested: 1_000_000 }),
        actual: expect.objectContaining({ totalInvested: 2_000_000 }),
      })
    );
  });

  it('rejects negative monetary fields with API_MONETARY_FIELD_NEGATIVE', async () => {
    mockApiReadback(buildUnifiedMetrics({ currentNAV: -1, totalValue: -1 }));

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_MONETARY_FIELD_NEGATIVE',
        actual: { field: 'currentNAV', value: -1 },
      })
    );
  });

  it('rejects totalDeployed above totalCommitted with API_TOTAL_DEPLOYED_EXCEEDS_COMMITTED', async () => {
    mockApiReadback(
      buildUnifiedMetrics({
        totalCommitted: 1_000_000,
        totalCalled: 1_000_000,
        totalDeployed: 2_000_000,
        totalUncalled: 0,
        deploymentRate: 200,
      })
    );

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_TOTAL_DEPLOYED_EXCEEDS_COMMITTED',
      })
    );
  });

  it('rejects totalValue that does not equal currentNAV plus totalDistributions', async () => {
    mockApiReadback(buildUnifiedMetrics({ totalDistributions: 500_000, totalValue: 4_500_000 }));

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_TOTAL_VALUE_INVARIANT_FAILED',
        expected: 5_000_000,
        actual: 4_500_000,
      })
    );
  });

  it('rejects deploymentRate that does not equal deployed over committed percent', async () => {
    mockApiReadback(buildUnifiedMetrics({ deploymentRate: 7 }));

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_DEPLOYMENT_RATE_INVARIANT_FAILED',
        expected: 5,
        actual: 7,
      })
    );
  });

  it('rejects totalUncalled that does not equal committed minus called', async () => {
    mockApiReadback(buildUnifiedMetrics({ totalUncalled: 18_000_000 }));

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_ACCOUNTING_UNCALLED_INVARIANT_FAILED',
        expected: 19_000_000,
        actual: 18_000_000,
      })
    );
  });

  it('rejects header remainingDeployableCapital that does not equal committed minus deployed', async () => {
    mockApiReadback(buildUnifiedMetrics({ remainingDeployableCapital: 18_000_000 }));

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_HEADER_REMAINING_DEPLOYABLE_CAPITAL_INVARIANT_FAILED',
        expected: 19_000_000,
        actual: 18_000_000,
      })
    );
  });

  it('rejects non-finite numeric readbacks instead of treating them as close', async () => {
    mockApiReadback(
      buildUnifiedMetrics({
        remainingDeployableCapital: Number.NaN,
      })
    );

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_HEADER_REMAINING_DEPLOYABLE_CAPITAL_INVARIANT_FAILED',
      })
    );
  });

  it('rejects zero deployed with non-zero currentNAV unless explicit provenance exists', async () => {
    mockApiReadback(
      buildUnifiedMetrics({
        totalCalled: 0,
        totalDeployed: 0,
        totalUncalled: 20_000_000,
        deploymentRate: 0,
        averageCheckSize: 0,
      })
    );

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_ZERO_DEPLOYED_NONZERO_NAV_WITHOUT_PROVENANCE',
      })
    );

    mockApiReadback(
      buildUnifiedMetrics({
        totalCalled: 0,
        totalDeployed: 0,
        totalUncalled: 20_000_000,
        deploymentRate: 0,
        averageCheckSize: 0,
        provenance: { currentNAV: 'external-mark-source' },
      })
    );

    const reportWithProvenance = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(reportWithProvenance.issues).not.toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_ZERO_DEPLOYED_NONZERO_NAV_WITHOUT_PROVENANCE',
      })
    );
  });

  it('rejects count-only API readbacks without fund ownership fields', async () => {
    mockApiReadback(buildUnifiedMetrics(), {
      portfolioCompanies: {
        companies: [{}],
        pagination: { has_more: false, next_cursor: null },
      },
    });

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_PORTFOLIO_COMPANIES_OWNERSHIP_FIELD_MISSING',
      })
    );
  });

  it('requires a non-empty token scoped to the verified fund when configured', async () => {
    mockApiReadback(buildUnifiedMetrics());

    const unrestrictedToken = jwt.sign({ sub: 'test-user', fundIds: [] }, 'test-secret');
    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      authToken: unrestrictedToken,
      requireScopedAuth: true,
      env: persistentEnv(),
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'config',
        code: 'API_SCOPED_AUTH_EMPTY_FUND_IDS',
      })
    );
  });

  it('passes scoped-auth proof when the token contains the verified fund', async () => {
    mockApiReadback(buildUnifiedMetrics());

    const scopedToken = jwt.sign({ sub: 'test-user', fundIds: [77] }, 'test-secret');
    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      authToken: scopedToken,
      requireScopedAuth: true,
      env: persistentEnv(),
    });

    expect(report.issues).not.toContainEqual(
      expect.objectContaining({
        code: expect.stringMatching(/^API_SCOPED_AUTH_/),
      })
    );
  });

  it('runs the manual verifier through the shared API ownership matrix without import ledger rows', async () => {
    const scopedToken = jwt.sign({ sub: 'test-user', fundIds: [77] }, 'test-secret');
    const wrongFundToken = jwt.sign({ sub: 'test-user', fundIds: [78] }, 'test-secret');
    mockApiReadback(buildUnifiedMetrics(), {}, { enforceScopedTokenFundId: 77 });

    const report = await verifyManualProfile({
      fundId: 77,
      expected: {
        datasetId: 'manual-gp-proof-77',
        countsByTable: {
          portfoliocompanies: 1,
          investments: 1,
          investment_lots: 1,
          fund_metrics: 1,
          pacing_history: 1,
          fund_baselines: 1,
          variance_reports: 1,
          backtest_results: 1,
          deal_opportunities: 1,
        },
        totalInvested: 1_000_000,
        currentNav: 4_500_000,
        activeCompanies: 1,
      },
      apiBaseUrl: 'http://localhost:5000',
      authToken: scopedToken,
      negativeControlAuthToken: wrongFundToken,
      requireNegativeControls: true,
      requireScopedAuth: true,
      requireApi: true,
      expectedFundSize: 20_000_000,
      env: persistentEnv(),
    });

    expect(report.passed).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.storage.ledgerRows).toBe(0);
    expect(report.storage.missingTargets).toEqual([]);
    expect(report.expected.countsByTable.portfoliocompanies).toBe(1);
    expect(report.api?.readbacks['portfolioCompanies']).toEqual(
      expect.objectContaining({ expected: 1, actual: 1 })
    );
  });

  it('fails the manual verifier when wrong-fund negative controls are accepted', async () => {
    const scopedToken = jwt.sign({ sub: 'test-user', fundIds: [77] }, 'test-secret');
    const wrongFundToken = jwt.sign({ sub: 'test-user', fundIds: [78] }, 'test-secret');
    mockApiReadback(buildUnifiedMetrics());

    const report = await verifyManualProfile({
      fundId: 77,
      expected: {
        datasetId: 'manual-gp-proof-77',
        countsByTable: {
          portfoliocompanies: 1,
          investments: 1,
          investment_lots: 1,
          fund_metrics: 1,
          pacing_history: 1,
          fund_baselines: 1,
          variance_reports: 1,
          backtest_results: 1,
          deal_opportunities: 1,
        },
        totalInvested: 1_000_000,
        currentNav: 4_500_000,
        activeCompanies: 1,
      },
      apiBaseUrl: 'http://localhost:5000',
      authToken: scopedToken,
      negativeControlAuthToken: wrongFundToken,
      requireNegativeControls: true,
      requireScopedAuth: true,
      env: persistentEnv(),
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        layer: 'api',
        code: 'API_NEGATIVE_CONTROL_UNEXPECTED_SUCCESS',
      })
    );
  });

  it('passes verification after storage and API readback match expected facts', async () => {
    mockApiReadback(buildUnifiedMetrics());

    const report = await verifyDemoProfile({
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      store: buildStore(buildLedgerRows(77)),
      apiBaseUrl: 'http://localhost:5000',
      env: persistentEnv(),
    });

    expect(report.passed).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.storage.ledgerRows).toBe(9);
    expect(report.api?.metrics).toBeDefined();
    expect(report.api?.readbacks['portfolioCompanies']).toEqual(
      expect.objectContaining({ expected: 1, actual: 1 })
    );
    expect(report.api?.readbacks['investmentLots']).toEqual(
      expect.objectContaining({ expected: 1, actual: 1 })
    );
    expect(report.api?.readbacks['fundMetrics']).toEqual(
      expect.objectContaining({ expected: 1, actual: 1 })
    );
    expect(report.api?.readbacks['pacingHistory']).toEqual(
      expect.objectContaining({ expected: 1, actual: 1 })
    );
  });
});
