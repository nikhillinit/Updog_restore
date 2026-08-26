import type { DashboardKpiEvidence, DashboardSummary } from '../../../client/src/types/fund';

type Numeric = number | string;

type DashboardSummaryFundFixture = {
  id: number;
  name: string;
  size: Numeric;
  deployedCapital?: Numeric | null;
  managementFee: Numeric;
  carryPercentage: Numeric;
  vintageYear: number;
  status: string;
};

type DashboardSummaryCompanyFixture = {
  id?: number;
  name: string;
  sector: string;
  stage: string;
  investmentAmount?: Numeric;
  currentValuation?: Numeric | null;
  invested?: Numeric;
  currentValue?: Numeric | null;
  foundedYear?: number | null;
  status?: string;
  description?: string | null;
};

type DashboardSummaryMetricsFixture = {
  totalValue?: Numeric | null;
  irr?: Numeric | null;
  multiple?: Numeric | null;
  dpi?: Numeric | null;
  tvpi?: Numeric | null;
  asOfDate?: string;
  createdAt?: string;
};

type DashboardSummaryFixtureInput = {
  fund: DashboardSummaryFundFixture;
  metrics?: DashboardSummaryMetricsFixture | null;
  portfolioCompanies?: DashboardSummaryCompanyFixture[];
  deploymentRate?: number;
  currentIRR?: number;
  generatedAt?: string;
};

const SOURCE_ENDPOINT = 'GET /api/dashboard-summary/:fundId' as const;
const READ_MODEL = 'dashboard-summary-read-service' as const;
const DEFAULT_GENERATED_AT = '2026-01-31T00:00:00.000Z';
const VALUATION_FRESHNESS_UNAVAILABLE_REASON =
  'Legacy portfolio company rows do not include valuation timestamps; valuation freshness is unavailable until valuation marks feed this read model.';

function stringifyMetric(value: Numeric | null | undefined): string | null {
  return value == null ? null : String(value);
}

function parseNumeric(value: Numeric | null | undefined): number {
  if (value == null) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function makeKpiEvidence(input: {
  fundId: number;
  source: string;
  asOfDate: string | null;
  calculatedAt: string | null;
  sourceAvailable: boolean;
  status?: DashboardKpiEvidence['status'];
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

export function makeDashboardSummaryFixture(input: DashboardSummaryFixtureInput): DashboardSummary {
  const portfolioCompanies = input.portfolioCompanies ?? [];
  const metrics = input.metrics ?? null;
  const generatedAt = input.generatedAt ?? metrics?.createdAt ?? DEFAULT_GENERATED_AT;
  const metricsAsOfDate = metrics?.asOfDate ?? null;
  const metricsCalculatedAt = metrics?.createdAt ?? null;
  const totalValue = metrics?.totalValue ?? null;
  const irr = metrics?.irr ?? null;
  const deployedCapital = parseNumeric(input.fund.deployedCapital);
  const fundSize = parseNumeric(input.fund.size);
  const deploymentRate =
    input.deploymentRate ?? (fundSize === 0 ? 0 : (deployedCapital / fundSize) * 100);
  const currentIRR = input.currentIRR ?? parseNumeric(irr) * 100;
  const valuedCompanyCount = portfolioCompanies.filter((company) => {
    const valuation = company.currentValuation ?? company.currentValue;
    return valuation !== null && valuation !== undefined;
  }).length;

  return {
    fund: {
      id: input.fund.id,
      name: input.fund.name,
      size: String(input.fund.size),
      deployedCapital: String(input.fund.deployedCapital ?? 0),
      managementFee: String(input.fund.managementFee),
      carryPercentage: String(input.fund.carryPercentage),
      vintageYear: input.fund.vintageYear,
      status: input.fund.status,
    },
    portfolioCompanies: portfolioCompanies.map((company, index) => ({
      id: company.id ?? index + 1,
      name: company.name,
      sector: company.sector,
      stage: company.stage,
      investmentAmount: String(company.investmentAmount ?? company.invested ?? 0),
      currentValuation: stringifyMetric(company.currentValuation ?? company.currentValue),
      foundedYear: company.foundedYear ?? null,
      status: company.status ?? 'active',
      description: company.description ?? null,
    })),
    recentActivities: [],
    metrics:
      metrics === null
        ? null
        : {
            totalValue: String(totalValue ?? 0),
            irr: stringifyMetric(irr),
            multiple: stringifyMetric(metrics.multiple),
            dpi: stringifyMetric(metrics.dpi),
            tvpi: stringifyMetric(metrics.tvpi),
            asOfDate: metrics.asOfDate,
            createdAt: metrics.createdAt,
          },
    summary: {
      totalCompanies: portfolioCompanies.length,
      deploymentRate,
      currentIRR,
    },
    evidence: {
      fundId: input.fund.id,
      sourceEndpoint: SOURCE_ENDPOINT,
      readModel: READ_MODEL,
      generatedAt,
      kpis: {
        currentAum: makeKpiEvidence({
          fundId: input.fund.id,
          source: 'fund_metrics.totalvalue',
          asOfDate: metricsAsOfDate,
          calculatedAt: metricsCalculatedAt,
          sourceAvailable: totalValue !== null && totalValue !== undefined,
          note: 'Dashboard summary value from the latest fund_metrics row.',
        }),
        irr: makeKpiEvidence({
          fundId: input.fund.id,
          source: 'fund_metrics.irr',
          asOfDate: metricsAsOfDate,
          calculatedAt: metricsCalculatedAt,
          sourceAvailable: irr !== null && irr !== undefined,
          status: irr !== null && irr !== undefined ? 'unverified' : 'unavailable',
          note: 'Unverified dashboard metric; not authoritative IRR/XIRR.',
        }),
        portfolioCompanies: makeKpiEvidence({
          fundId: input.fund.id,
          source: 'storage.getPortfolioCompanies.count',
          asOfDate: null,
          calculatedAt: null,
          sourceAvailable: true,
          note: 'Count is scoped to the requested fund in the dashboard summary read model.',
        }),
        deployment: makeKpiEvidence({
          fundId: input.fund.id,
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
        fundId: input.fund.id,
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
