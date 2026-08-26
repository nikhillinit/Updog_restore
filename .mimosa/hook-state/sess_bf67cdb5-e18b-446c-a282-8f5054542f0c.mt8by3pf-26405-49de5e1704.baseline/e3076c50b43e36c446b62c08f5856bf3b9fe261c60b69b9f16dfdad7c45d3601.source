import { describe, it, expect, beforeEach } from 'vitest';
import { useFundStore } from '@/stores/useFundStore';

const reset = () => {
  const cur = useFundStore.getState();
  useFundStore.setState({ ...cur, stages: [], sectorProfiles: [], allocations: [], hydrated: true }, true);
};

describe('useFundStore.fromInvestmentStrategy idempotency', () => {
  beforeEach(reset);

  it('publishes exactly once on change, then no-op on repeat', () => {
    let publishes = 0;
    const unsub = useFundStore.subscribe(() => { publishes += 1; });

    const payload = { 
      stages: [{ id: 'test-1', name: 'Test Stage', graduationRate: 50, exitRate: 30 }], 
      sectorProfiles: [], 
      allocations: [] 
    } as any;
    useFundStore.getState().fromInvestmentStrategy(payload);
    useFundStore.getState().fromInvestmentStrategy(payload);

    unsub();
    expect(publishes).toBe(1);
  });
});