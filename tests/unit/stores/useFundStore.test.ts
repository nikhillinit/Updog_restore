import { describe, it, expect, beforeEach } from 'vitest';
import { useFundStore } from '@/stores/useFundStore';

const reset = () => {
  // Get the current state to see what methods are available
  const currentState = useFundStore.getState();
  
  // Reset to empty state for testing
  useFundStore.setState({
    ...currentState,
    stages: [], 
    sectorProfiles: [], 
    allocations: [], 
    hydrated: true
  }, true);
};

describe('useFundStore.fromInvestmentStrategy', () => {
  beforeEach(reset);

  it('does NOT publish when payload equals current state (true no-op)', () => {
    let publishes = 0;
    const unsub = useFundStore.subscribe(() => { publishes += 1; });

    const same = { stages: [], sectorProfiles: [], allocations: [] };
    useFundStore.getState().fromInvestmentStrategy(same);

    unsub();
    expect(publishes).toBe(0);
    expect(useFundStore.getState().stages).toEqual([]);
  });

  it('publishes exactly once when first payload changes state; second identical call is a no-op', () => {
    let publishes = 0;
    const unsub = useFundStore.subscribe(() => { publishes += 1; });

    const changed = {
      stages: [{ id: 's1', name: 'Seed', graduationRate: 0.2, exitRate: 0.1, months: 12 }],
      sectorProfiles: [{ id: 'p1', name: 'Climate', targetPercentage: 40 }],
      allocations: [{ id: 'a1', category: 'Reserves', percentage: 25 }]
    };

    useFundStore.getState().fromInvestmentStrategy(changed as any);
    const ref1 = useFundStore.getState().stages;

    useFundStore.getState().fromInvestmentStrategy(changed as any);
    const ref2 = useFundStore.getState().stages;

    unsub();
    expect(publishes).toBe(1);  // first call published
    expect(ref1).toBe(ref2);    // second call was a no-op (same reference)
  });

  it('handles NaN values consistently in equality checks', () => {
    let publishes = 0;
    const unsub = useFundStore.subscribe(() => { publishes += 1; });

    const dataWithNaN = {
      stages: [{ id: 's1', name: 'Seed', graduationRate: NaN, exitRate: 0.1, months: 12 }],
      sectorProfiles: [],
      allocations: []
    };

    // First call with NaN should publish
    useFundStore.getState().fromInvestmentStrategy(dataWithNaN as any);
    // Second identical call should be no-op (NaN === NaN with Object.is)
    useFundStore.getState().fromInvestmentStrategy(dataWithNaN as any);

    unsub();
    expect(publishes).toBe(1); // Only first call should publish
  });

  it('normalizes order differences as no-op', () => {
    let publishes = 0;
    const unsub = useFundStore.subscribe(() => { publishes += 1; });

    const data1 = {
      stages: [],
      sectorProfiles: [
        { id: 'sector-2', name: 'HealthTech', targetPercentage: 30 },
        { id: 'sector-1', name: 'FinTech', targetPercentage: 40 }
      ],
      allocations: []
    };
    
    const data2 = {
      stages: [],
      sectorProfiles: [
        { id: 'sector-1', name: 'FinTech', targetPercentage: 40 },
        { id: 'sector-2', name: 'HealthTech', targetPercentage: 30 }
      ],
      allocations: []
    };

    useFundStore.getState().fromInvestmentStrategy(data1 as any);
    useFundStore.getState().fromInvestmentStrategy(data2 as any);

    unsub();
    expect(publishes).toBe(1); // Second call should be no-op if sorting works
  });
});