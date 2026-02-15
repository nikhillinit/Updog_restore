// client/src/lib/map-fund-store-to-payload.ts

export interface CreateFundPayload {
  name: string;
  size: number;
  managementFee: number;
  carryPercentage: number;
  vintageYear: number;
  deployedCapital?: number;
}

export interface FundStoreSnapshot {
  fundName: string | undefined;
  fundSize: number | undefined;
  managementFeeRate: number | undefined;
  carriedInterest: number | undefined;
  vintageYear: number | undefined;
  establishmentDate: string | undefined;
}

export function mapFundStoreToCreatePayload(state: FundStoreSnapshot): CreateFundPayload {
  const currentYear = new Date().getFullYear();
  return {
    name: state.fundName?.trim() || 'Untitled Fund',
    size: state.fundSize ?? 0,
    managementFee: (state.managementFeeRate ?? 0) / 100,
    carryPercentage: (state.carriedInterest ?? 0) / 100,
    vintageYear: state.vintageYear ?? currentYear,
  };
}
