import {
  FundViewContextV1Schema,
  type FundViewContextV1,
} from '@shared/contracts/fund-view-context-v1.contract';

export type { FundViewContextV1 };

export function parseFundViewContextV1(candidate: unknown): FundViewContextV1 {
  return FundViewContextV1Schema.parse(candidate);
}
