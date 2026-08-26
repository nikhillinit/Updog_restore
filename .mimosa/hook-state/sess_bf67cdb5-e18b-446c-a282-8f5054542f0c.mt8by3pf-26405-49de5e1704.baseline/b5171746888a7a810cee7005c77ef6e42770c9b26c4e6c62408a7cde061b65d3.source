import { toNumber } from '@shared/number';
import type { IStorage } from '../storage';

type DashboardEvidenceStatus = 'available' | 'unavailable' | 'unverified';
type DashboardEvidenceFreshness = 'timestamped' | 'timestamp_unavailable' | 'source_unavailable';

interface DashboardKpiEvidence {
  source: string;
  sourceEndpoint: 'GET /api/dashboard-summary/:fundId';
  readModel: 'dashboard-summary-read-service';
  fundId: number;
  asOfDate: string | null;
  calculatedAt: string | null;
  freshness: DashboardEvidenceFreshness;
  status: DashboardEvidenceStatus;
  note: string;
}

interface PortfolioAllocationEvidence {
  source: 'storage.getPortfolioCompanies';
  sourceTable: 'portfoliocompanies';
  sourceEndpoint: 'GET /api/dashboard-summary/:fundId';
  readModel: 'dashboard-summary-read-service';
  fundId: number;
  companyCount: number;
  valuedCompanyCount: number;
  valuationFreshness: {
    status: 'unavailable';
    reason: string;
  };
}

export interface DashboardSummaryReadModel {
  fund: Awaited<ReturnType<IStorage['getFund']>>;
  portfolioCompanies: Awaited<ReturnType<IStorage['getPortfolioCompanies']>>;
  recentActivities: Awaited<ReturnType<IStorage['getActivities']>>;
  metrics: Awaited<ReturnType<IStorage['getFundMetrics']>>[number] | null;
  summary: {
    totalCompanies: number;
    deploymentRate: number;
    currentIRR: number;
  };
  evidence: {
    fundId: number;
    sourceEndpoint: 'GET /api/dashboard-summary/:fundId';
    readModel: 'dashboard-summary-read-service';
    generatedAt: string;
    kpis: {
      currentAum: DashboardKpiEvidence;
      irr: DashboardKpiEvidence;
      portfolioCompanies: DashboardKpiEvidence;
      deployment: DashboardKpiEvidence;
    };
    portfolioAllocation: PortfolioAllocationEvidence;
  };
}

const SOURCE_ENDPOINT = 'GET /api/dashboard-summary/:fundId' as const;
const READ_MODEL = 'dashboard-summary-read-service' as const;
const VALUATION_FRESHNESS_UNAVAILABLE_REASON =
  'Legacy portfolio company rows do not include valuation timestamps; valuation freshness is unavailable until valuation marks feed this read model.';

function toIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type StoredFundMetrics = Awaited<ReturnType<IStorage['getFundMetrics']>>[number];

function toEpoch(value: Date | string | null | undefined): number {
  if (value == null) {
    return Number.NEGATIVE_INFINITY;
  }

  const time = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

// storage.getFundMetrics has no ORDER BY (and MemStorage returns insertion
// order), so "last row" is arbitrary. Latest must be chosen here or the
// evidence envelope can present a stale row as current provenance.
function selectLatestMetrics(metrics: StoredFundMetrics[]): StoredFundMetrics | null {
  let latest: StoredFundMetrics | null = null;

  for (const row of metrics) {
    if (latest === null) {
      latest = row;
      continue;
    }

    const byAsOf = toEpoch(row.asOfDate) - toEpoch(latest.asOfDate);
    const byCreated = byAsOf !== 0 ? 0 : toEpoch(row.createdAt) - toEpoch(latest.createdAt);
    const byId = byAsOf !== 0 || byCreated !== 0 ? 0 : row.id - latest.id;

    if (byAsOf > 0 || byCreated > 0 || byId > 0) {
      latest = row;
    }
  }

  return latest;
}

function makeKpiEvidence(input: {
  fundId: number;
  source: string;
  asOfDate: string | null;
  calculatedAt: string | null;
  sourceAvailable: boolean;
  status?: DashboardEvidenceStatus;
  note: string;
}): DashboardKpiEvidence {
  const hasTimestamp = input.asOfDate !== null || input.calculatedAt !== null;

  return {
    source: input.source,
    sourceEndpoint: SOURCE_ENDPOINT,
    readModel: READ_MODEL,
    fundId: input.fundId,
    asOfDate: input.asOfDate,
    calculatedAt: input.calculatedAt,
    freshness: hasTimestamp
      ? 'timestamped'
      : input.sourceAvailable
        ? 'timestamp_unavailable'
        : 'source_unavailable',
    status: input.status ?? (input.sourceAvailable ? 'available' : 'unavailable'),
    note: input.note,
  };
}

export async function getDashboardSummaryReadModel(
  store: IStorage,
  fundId: number
): Promise<DashboardSummaryReadModel | undefined> {
  const [fund, portfolioCompanies, activities, metrics] = await Promise.all([
    store.getFund(fundId),
    store.getPortfolioCompanies(fundId),
    store.getActivities(fundId),
    store.getFundMetrics(fundId),
  ]);

  if (!fund) {
    return undefined;
  }

  const latestMetrics = selectLatestMetrics(metrics);
  const recentActivities = activities.slice(0, 5);

  const fundSize = toNumber(fund.size || 0, 'fund size');
  const deployedCapital = toNumber(fund.deployedCapital || 0, 'deployed capital');
  const currentIRR = latestMetrics ? toNumber(latestMetrics.irr || 0, 'IRR') * 100 : 0;
  const metricsAsOfDate = toIsoTimestamp(latestMetrics?.asOfDate);
  const metricsCalculatedAt = toIsoTimestamp(latestMetrics?.createdAt);
  const valuedCompanyCount = portfolioCompanies.filter(
    (company) => company.currentValuation !== null && company.currentValuation !== undefined
  ).length;

  return {
    fund,
    portfolioCompanies,
    recentActivities,
    metrics: latestMetrics,
    summary: {
      totalCompanies: portfolioCompanies.length,
      deploymentRate: fundSize !== 0 ? (deployedCapital / fundSize) * 100 : 0,
      currentIRR,
    },
    evidence: {
      fundId,
      sourceEndpoint: SOURCE_ENDPOINT,
      readModel: READ_MODEL,
      generatedAt: new Date().toISOString(),
      kpis: {
        currentAum: makeKpiEvidence({
          fundId,
          source: 'fund_metrics.totalvalue',
          asOfDate: metricsAsOfDate,
          calculatedAt: metricsCalculatedAt,
          sourceAvailable: latestMetrics !== null,
          note: 'Dashboard summary value from the latest fund_metrics row.',
        }),
        irr: makeKpiEvidence({
          fundId,
          source: 'fund_metrics.irr',
          asOfDate: metricsAsOfDate,
          calculatedAt: metricsCalculatedAt,
          sourceAvailable: latestMetrics?.irr !== null && latestMetrics?.irr !== undefined,
          status:
            latestMetrics?.irr !== null && latestMetrics?.irr !== undefined
              ? 'unverified'
              : 'unavailable',
          note: 'Unverified dashboard metric; not authoritative IRR/XIRR.',
        }),
        portfolioCompanies: makeKpiEvidence({
          fundId,
          source: 'storage.getPortfolioCompanies.count',
          asOfDate: null,
          calculatedAt: null,
          sourceAvailable: true,
          note: 'Count is scoped to the requested fund in the dashboard summary read model.',
        }),
        deployment: makeKpiEvidence({
          fundId,
          source: 'funds.deployed_capital / funds.size',
          asOfDate: null,
          calculatedAt: null,
          sourceAvailable: true,
          note: 'Deployment is derived from the fund row; this read model has no fund updated timestamp.',
        }),
      },
      portfolioAllocation: {
        source: 'storage.getPortfolioCompanies',
        sourceTable: 'portfoliocompanies',
        sourceEndpoint: SOURCE_ENDPOINT,
        readModel: READ_MODEL,
        fundId,
        companyCount: portfolioCompanies.length,
        valuedCompanyCount,
        valuationFreshness: {
          status: 'unavailable',
          reason: VALUATION_FRESHNESS_UNAVAILABLE_REASON,
        },
      },
    },
  };
}
