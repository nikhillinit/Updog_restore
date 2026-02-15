/**
 * Shared types for LP report PDF generation.
 * @module server/services/pdf-generation/types
 */

/** Data returned by fetchLPReportData, consumed by all report builders. */
export interface LPReportData {
  lp: { id: number; name: string; email: string };
  commitments: Array<{
    commitmentId: number;
    fundId: number;
    fundName: string;
    commitmentAmount: number;
    ownershipPercentage: number;
  }>;
  transactions: Array<{
    commitmentId: number;
    fundId: number | null;
    date: Date;
    type: string;
    amount: number;
    description: string | null;
  }>;
}

export interface K1ReportData {
  partnerName: string;
  partnerAddress?: string;
  partnerTaxId?: string;
  fundName: string;
  taxYear: number;
  partnershipTaxId?: string;
  allocations: {
    ordinaryIncome: number;
    capitalGainsShortTerm: number;
    capitalGainsLongTerm: number;
    section1231Gains: number;
    interestIncome: number;
    dividendIncome: number;
    royalties: number;
    netRentalIncome: number;
    otherIncome: number;
  };
  distributions: Array<{
    date: string;
    type: string;
    amount: number;
  }>;
  capitalAccount: {
    beginningBalance: number;
    contributions: number;
    distributions: number;
    allocatedIncome: number;
    endingBalance: number;
  };
  footnotes?: string[];
  preliminary?: boolean;
  /** ISO timestamp for deterministic PDF output */
  generatedAt?: string;
}

export interface QuarterlyReportData {
  fundName: string;
  quarter: string;
  year: number;
  lpName: string;
  summary: {
    nav: number;
    tvpi: number;
    dpi: number;
    irr: number;
    totalCommitted: number;
    totalCalled: number;
    totalDistributed: number;
    unfunded: number;
  };
  portfolioCompanies: Array<{
    name: string;
    invested: number;
    value: number;
    moic: number;
  }>;
  cashFlows?: Array<{
    date: string;
    type: 'contribution' | 'distribution';
    amount: number;
  }>;
  commentary?: string;
  /** ISO timestamp for deterministic PDF output */
  generatedAt?: string;
}

/** Pre-fetched fund metrics for report builders (DI pattern) */
export interface ReportMetrics {
  irr: number;
  tvpi: number;
  dpi: number;
  portfolioCompanies: Array<{ name: string; invested: number; value: number; moic: number }>;
}

export interface CapitalAccountReportData {
  lpName: string;
  fundName: string;
  asOfDate: string;
  commitment: number;
  transactions: Array<{
    date: string;
    type: string;
    description: string;
    amount: number;
    balance: number;
  }>;
  summary: {
    beginningBalance: number;
    totalContributions: number;
    totalDistributions: number;
    netIncome: number;
    endingBalance: number;
  };
  /** ISO timestamp for deterministic PDF output */
  generatedAt?: string;
}
