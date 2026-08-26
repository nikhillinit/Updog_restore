import { describe, it, expect, beforeEach } from 'vitest';
import { __createIsolatedFundStore } from '../../../client/src/stores/fundStore';
import type { CapitalPlanAllocation } from '../../../client/src/stores/fundStore';

describe('fundStore capital plan allocations', () => {
  let store: ReturnType<typeof __createIsolatedFundStore>;

  beforeEach(() => {
    store = __createIsolatedFundStore();
  });

  describe('defaults', () => {
    it('has default capitalStageAllocations summing to 100%', () => {
      const state = store.getState();
      expect(state.capitalStageAllocations).toHaveLength(3);
      expect(state.capitalStageAllocations.reduce((s, a) => s + a.pct, 0)).toBe(100);
    });

    it('has default capitalPlanAllocations with expected entry rounds', () => {
      const state = store.getState();
      expect(state.capitalPlanAllocations).toHaveLength(3);
      const rounds = state.capitalPlanAllocations.map((a) => a.entryRound);
      expect(rounds).toEqual(['Pre-Seed', 'Seed', 'Series A']);
    });

    it('has dollar-denominated check amounts in defaults', () => {
      const first = store.getState().capitalPlanAllocations[0];
      expect(first?.initialCheckAmount).toBe(250000);
    });
  });

  describe('setCapitalStageAllocations', () => {
    it('replaces stage allocations', () => {
      const newRows = [
        { id: 'a', label: 'Alpha', pct: 60 },
        { id: 'b', label: 'Beta', pct: 40 },
      ];
      store.getState().setCapitalStageAllocations(newRows);
      expect(store.getState().capitalStageAllocations).toEqual(newRows);
    });

    it('does not affect plan allocations', () => {
      const before = store.getState().capitalPlanAllocations;
      store.getState().setCapitalStageAllocations([{ id: 'x', label: 'X', pct: 100 }]);
      expect(store.getState().capitalPlanAllocations).toBe(before);
    });
  });

  describe('addCapitalPlanAllocation', () => {
    it('appends a new allocation', () => {
      const initial = store.getState().capitalPlanAllocations.length;
      const newAlloc: CapitalPlanAllocation = {
        id: 'test-alloc',
        name: 'Test',
        entryRound: 'Seed',
        capitalAllocationPct: 10,
        initialCheckStrategy: 'amount',
        initialCheckAmount: 100000,
        followOnStrategy: 'amount',
        followOnParticipationPct: 50,
        investmentHorizonMonths: 12,
      };
      store.getState().addCapitalPlanAllocation(newAlloc);
      expect(store.getState().capitalPlanAllocations).toHaveLength(initial + 1);
      const last = store.getState().capitalPlanAllocations.at(-1);
      expect(last?.id).toBe('test-alloc');
    });
  });

  describe('updateCapitalPlanAllocation', () => {
    it('updates fields by id', () => {
      const first = store.getState().capitalPlanAllocations[0];
      expect(first).toBeDefined();
      store.getState().updateCapitalPlanAllocation(first!.id, { name: 'Updated' });
      const updated = store.getState().capitalPlanAllocations.find((a) => a.id === first!.id);
      expect(updated?.name).toBe('Updated');
    });

    it('does not affect other allocations', () => {
      const [first, second] = store.getState().capitalPlanAllocations;
      store.getState().updateCapitalPlanAllocation(first!.id, { name: 'Changed' });
      const unchanged = store.getState().capitalPlanAllocations.find((a) => a.id === second!.id);
      expect(unchanged?.name).toBe(second!.name);
    });

    it('supports partial updates preserving existing fields', () => {
      const first = store.getState().capitalPlanAllocations[0]!;
      store.getState().updateCapitalPlanAllocation(first.id, { capitalAllocationPct: 50 });
      const updated = store.getState().capitalPlanAllocations.find((a) => a.id === first.id)!;
      expect(updated.capitalAllocationPct).toBe(50);
      expect(updated.entryRound).toBe(first.entryRound);
      expect(updated.initialCheckAmount).toBe(first.initialCheckAmount);
    });
  });

  describe('removeCapitalPlanAllocation', () => {
    it('removes by id', () => {
      const initial = store.getState().capitalPlanAllocations.length;
      const first = store.getState().capitalPlanAllocations[0]!;
      store.getState().removeCapitalPlanAllocation(first.id);
      expect(store.getState().capitalPlanAllocations).toHaveLength(initial - 1);
      expect(
        store.getState().capitalPlanAllocations.find((a) => a.id === first.id)
      ).toBeUndefined();
    });
  });

  describe('setCapitalPlanAllocations (bulk)', () => {
    it('replaces all allocations', () => {
      const newAllocations: CapitalPlanAllocation[] = [
        {
          id: 'bulk-1',
          name: 'Bulk Test',
          entryRound: 'Series A',
          capitalAllocationPct: 100,
          initialCheckStrategy: 'amount',
          initialCheckAmount: 1000000,
          followOnStrategy: 'amount',
          followOnParticipationPct: 75,
          investmentHorizonMonths: 36,
        },
      ];
      store.getState().setCapitalPlanAllocations(newAllocations);
      expect(store.getState().capitalPlanAllocations).toEqual(newAllocations);
    });
  });

  describe('does not interfere with existing store fields', () => {
    it('strategy allocations remain unchanged after capital plan operations', () => {
      const strategyAllocsBefore = store.getState().allocations;
      store.getState().addCapitalPlanAllocation({
        id: 'interference-test',
        name: 'Test',
        entryRound: 'Seed',
        capitalAllocationPct: 50,
        initialCheckStrategy: 'amount',
        followOnStrategy: 'amount',
        followOnParticipationPct: 50,
        investmentHorizonMonths: 12,
      });
      expect(store.getState().allocations).toBe(strategyAllocsBefore);
    });

    it('stages remain unchanged after capital plan operations', () => {
      const stagesBefore = store.getState().stages;
      store.getState().setCapitalStageAllocations([{ id: 'x', label: 'X', pct: 100 }]);
      expect(store.getState().stages).toBe(stagesBefore);
    });
  });
});
