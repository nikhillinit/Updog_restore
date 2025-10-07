export interface FundMetrics {
  totalCommitted: number;
  totalInvested: number;
  totalValue: number;
  irr?: number;
  moic?: number;
  dpi?: number;
}

export interface FundRepo {
  getCurrentFundId(): Promise<string | null>;
  getFundMetrics(fundId: string): Promise<FundMetrics | null>;
}

export interface RepoBag {
  fund: FundRepo;
}
