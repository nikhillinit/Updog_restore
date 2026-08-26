import { useStoreWithEqualityFn } from 'zustand/traditional';
import { fundStore } from './fundStore';
import type { FundState, StrategyStage } from './fundStore';

type UseFundStore = {
  (): FundState;
  <T>(selector: (state: FundState) => T, equality?: (a: T, b: T) => boolean): T;
} & typeof fundStore;

function useFundStoreSelector<T = FundState>(
  selector?: (state: FundState) => T,
  equality?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    fundStore,
    selector ?? ((state: FundState) => state as T),
    equality
  );
}

export const useFundStore = Object.assign(useFundStoreSelector, fundStore) as UseFundStore;
export type { FundState, StrategyStage };
