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
    irr: string;
    multiple: string;
    dpi: string;
    tvpi: string;
  } | null;
  summary: {
    totalCompanies: number;
    deploymentRate: number;
    currentIRR: number;
  };
}
