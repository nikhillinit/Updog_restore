export interface FundMetrics {
  label: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: string;
  color: string;
}

export interface ChartType {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
}

export interface DashboardSummary {
  fund: {
    id: number;
    name: string;
    size: string;
    deployedCapital: string;
    managementFee: string;
    carryPercentage: string;
    vintageYear: number;
    status: string;
  };
  portfolioCompanies: Array<{
    id: number;
    name: string;
    sector: string;
    stage: string;
    investmentAmount: string;
    currentValuation: string | null;
    foundedYear: number | null;
    status: string;
    description: string | null;
  }>;
  recentActivities: Array<{
    id: number;
    type: string;
    title: string;
    description: string | null;
    amount: string | null;
    activityDate: string;
  }>;
  metrics: {
    totalValue: string;
    irr: string | null;
    multiple: string | null;
    dpi: string | null;
    tvpi: string | null;
    asOfDate?: string;
    createdAt?: string;
  } | null;
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
    portfolioAllocation: {
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
    };
  };
}

export interface DashboardKpiEvidence {
  source: string;
  sourceEndpoint: 'GET /api/dashboard-summary/:fundId';
  readModel: 'dashboard-summary-read-service';
  fundId: number;
  asOfDate: string | null;
  calculatedAt: string | null;
  freshness: 'timestamped' | 'timestamp_unavailable' | 'source_unavailable';
  status: 'available' | 'unavailable' | 'unverified';
  note: string;
}
