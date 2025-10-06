import { FundRepo, FundMetrics } from "./interfaces";

const DEFAULT_FUND_ID = "fund-dev-1";

const seedMetrics: Record<string, FundMetrics> = {
  [DEFAULT_FUND_ID]: {
    totalCommitted: 12_500_000,
    totalInvested: 8_500_000,
    totalValue: 24_000_000,
    irr: 28.5,
    moic: 2.82,
    dpi: 0.85,
  },
};

export class MemoryFundRepo implements FundRepo {
  async getCurrentFundId(): Promise<string | null> {
    return DEFAULT_FUND_ID;
  }
  async getFundMetrics(fundId: string): Promise<FundMetrics | null> {
    return seedMetrics[fundId] ?? null;
  }
}
