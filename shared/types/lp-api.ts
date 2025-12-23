/**
 * LP Reporting API Type Definitions
 *
 * Types for Limited Partner (LP) reporting dashboard endpoints:
 * - GET /api/lp/profile
 * - GET /api/lp/summary
 * - GET /api/lp/capital-account
 * - GET /api/lp/funds/:fundId/detail
 * - GET /api/lp/funds/:fundId/performance
 * - GET /api/lp/funds/:fundId/holdings
 * - POST /api/lp/reports/generate
 *
 * @module shared/types/lp-api
 */

// ============================================================================
// LP PROFILE TYPES
// ============================================================================

export type LPEntityType = 'individual' | 'trust' | 'llc' | 'corporation' | 'partnership' | 'other';

export interface LPCommitment {
  fundId: number;
  fundName: string;
  commitmentAmount: number;
  commitmentDate: string;
  status: 'active' | 'fulfilled' | 'defaulted';
}

export interface LPProfile {
  id: number;
  name: string;
  email: string;
  entityType: LPEntityType;
  taxId?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  commitments: LPCommitment[];
  createdAt: string;
  updatedAt: string;
}

export interface LPProfileResponse {
  profile: LPProfile;
  meta: {
    lastLoginAt?: string;
    totalCommitments: number;
    activeFunds: number;
  };
}

// ============================================================================
// LP SUMMARY TYPES
// ============================================================================

export interface LPSummaryMetrics {
  totalCommitted: number;
  totalCalled: number;
  totalDistributed: number;
  currentNAV: number;
  unrealizedGain: number;
  realizedGain: number;
  tvpi: number;
  dpi: number;
  irr: number;
}

export interface LPFundSummary {
  fundId: number;
  fundName: string;
  vintageYear: number;
  commitment: number;
  called: number;
  distributed: number;
  nav: number;
  tvpi: number;
  dpi: number;
  irr: number;
  lastUpdated: string;
}

export interface LPSummaryResponse {
  lpId: number;
  lpName: string;
  asOfDate: string;
  aggregateMetrics: LPSummaryMetrics;
  fundSummaries: LPFundSummary[];
  meta: {
    cacheHit: boolean;
    computeTimeMs: number;
  };
}

// ============================================================================
// CAPITAL ACCOUNT TYPES
// ============================================================================

export type TransactionType =
  | 'capital_call'
  | 'distribution'
  | 'recallable_distribution'
  | 'management_fee'
  | 'organizational_expense'
  | 'preferred_return'
  | 'carried_interest'
  | 'return_of_capital'
  | 'gain_distribution';

export interface CapitalAccountTransaction {
  id: number;
  transactionDate: string;
  effectiveDate: string;
  fundId: number;
  fundName: string;
  type: TransactionType;
  amount: number;
  description: string;
  cumulativeCalled: number;
  cumulativeDistributed: number;
  cumulativeNav: number;
  createdAt: string;
}

export interface CapitalAccountQuery {
  fundId?: number;
  startDate?: string;
  endDate?: string;
  types?: TransactionType[];
  cursor?: string;
  limit?: number;
  sortBy?: 'transactionDate' | 'effectiveDate' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

export interface CapitalAccountResponse {
  lpId: number;
  lpName: string;
  transactions: CapitalAccountTransaction[];
  summary: {
    totalCalled: number;
    totalDistributed: number;
    currentNav: number;
    transactionCount: number;
  };
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    limit: number;
    total: number;
  };
  meta: {
    cacheHit: boolean;
    computeTimeMs: number;
  };
}

// ============================================================================
// FUND DETAIL TYPES
// ============================================================================

export interface LPFundDetail {
  fundId: number;
  fundName: string;
  vintageYear: number;
  fundSize: number;
  commitment: number;
  percentOfFund: number;
  called: number;
  percentCalled: number;
  distributed: number;
  nav: number;
  unrealizedValue: number;
  realizedValue: number;
  tvpi: number;
  dpi: number;
  rvpi: number;
  irr: number;
  asOfDate: string;
}

export interface LPFundDetailResponse {
  lpId: number;
  lpName: string;
  fundDetail: LPFundDetail;
  recentTransactions: CapitalAccountTransaction[];
  meta: {
    cacheHit: boolean;
    computeTimeMs: number;
  };
}

// ============================================================================
// PERFORMANCE TYPES
// ============================================================================

export interface LPPerformancePoint {
  date: string;
  called: number;
  distributed: number;
  nav: number;
  tvpi: number;
  dpi: number;
  irr: number;
}

export interface BenchmarkData {
  date: string;
  value: number;
}

export interface LPPerformanceBenchmark {
  name: string;
  source: 'cambridge' | 'burgiss' | 'pitchbook' | 'custom';
  category: string;
  timeseries: BenchmarkData[];
}

export interface LPPerformanceQuery {
  fundId: number;
  startDate?: string;
  endDate?: string;
  granularity?: 'monthly' | 'quarterly' | 'annual';
  includeBenchmarks?: boolean;
}

export interface LPPerformanceResponse {
  lpId: number;
  lpName: string;
  fundId: number;
  fundName: string;
  timeseries: LPPerformancePoint[];
  benchmarks: LPPerformanceBenchmark[];
  meta: {
    startDate: string;
    endDate: string;
    dataPoints: number;
    cacheHit: boolean;
    computeTimeMs: number;
  };
}

// ============================================================================
// HOLDINGS TYPES
// ============================================================================

export interface LPPortfolioHolding {
  companyId: number;
  companyName: string;
  sector: string;
  stage: string;
  initialInvestmentDate: string;
  fundDeployed: number;
  lpProRataShare: number;
  currentValue: number;
  unrealizedGain: number;
  moic: number;
  ownershipPercent: number;
  status: 'active' | 'exited' | 'written_off';
}

export interface LPHoldingsQuery {
  fundId: number;
  asOfDate?: string;
  includeExited?: boolean;
}

export interface LPHoldingsResponse {
  lpId: number;
  lpName: string;
  fundId: number;
  fundName: string;
  asOfDate: string;
  holdings: LPPortfolioHolding[];
  summary: {
    totalCompanies: number;
    totalDeployed: number;
    totalCurrentValue: number;
    averageMOIC: number;
  };
  meta: {
    cacheHit: boolean;
    computeTimeMs: number;
  };
}

// ============================================================================
// REPORTS TYPES
// ============================================================================

export type ReportType = 'quarterly_statement' | 'annual_statement' | 'k1_tax' | 'custom';
export type ReportFormat = 'pdf' | 'excel' | 'csv';
export type ReportStatus = 'pending' | 'generating' | 'ready' | 'failed';

export interface ReportGenerationRequest {
  reportType: ReportType;
  format: ReportFormat;
  fundIds?: number[];
  startDate?: string;
  endDate?: string;
  includeSections?: string[];
  customOptions?: Record<string, unknown>;
}

export interface GeneratedReport {
  id: string;
  reportType: ReportType;
  format: ReportFormat;
  status: ReportStatus;
  downloadUrl?: string;
  generatedAt?: string;
  expiresAt?: string;
  error?: string;
}

export interface ReportGenerationResponse {
  reportId: string;
  status: ReportStatus;
  estimatedCompletionMs?: number;
  pollUrl: string;
}

export interface ReportListQuery {
  fundId?: number;
  reportType?: ReportType;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface ReportListResponse {
  reports: GeneratedReport[];
  total: number;
}

// ============================================================================
// SETTINGS TYPES
// ============================================================================

export interface LPNotificationPreferences {
  emailCapitalCalls: boolean;
  emailDistributions: boolean;
  emailQuarterlyReports: boolean;
  emailAnnualReports: boolean;
  emailMarketUpdates: boolean;
}

export interface LPDisplayPreferences {
  currency: 'USD' | 'EUR' | 'GBP';
  numberFormat: 'US' | 'EU';
  timezone: string;
  defaultFundView?: number;
}

export interface LPSettings {
  lpId: number;
  notifications: LPNotificationPreferences;
  display: LPDisplayPreferences;
  updatedAt: string;
}

export interface LPSettingsResponse {
  settings: LPSettings;
  meta: {
    lastModifiedBy?: string;
  };
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface LPApiError {
  error: string;
  message: string;
  field?: string;
  timestamp: string;
  requestId?: string;
}
