/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { allocate100 } from '../core/utils/allocate100';
import { clampPct, clampInt } from '../lib/coerce';
import { sortById, normalizeNumber, eq } from '../utils/state-utils';
import type { Stage, SectorProfile, Allocation, InvestmentStrategy } from '@shared/types';

export type StrategyStage = {
  id: string;
  name: string;
  graduate: number; // %
  exit: number;     // %
  months: number;   // int >= 1
};

type StrategySlice = {
  // Hydration flag
  hydrated: boolean;
  setHydrated: (_v: boolean) => void;

  stages: StrategyStage[];
  sectorProfiles: SectorProfile[];
  allocations: Allocation[];
  followOnChecks: { A: number; B: number; C: number };

  // Stage management
  addStage: () => void;
  removeStage: (_idx: number) => void;
  updateStageName: (_idx: number, _name: string) => void;
  updateStageRate: (_idx: number, _patch: Partial<Pick<StrategyStage, 'graduate'|'exit'|'months'>>) => void;

  // Selector-like helper
  stageValidation: () => { allValid: boolean; errorsByRow: (string | null)[] };

  // Conversion utilities
  toInvestmentStrategy: () => InvestmentStrategy;
  fromInvestmentStrategy: (_strategy: InvestmentStrategy) => void;
};

// helper functions
const enforceLast = (rows: StrategyStage[]) =>
  rows.map((r, i) => (i === rows.length - 1 ? { ...r, graduate: 0 } : r));

const generateStableId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return `stage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Business rules (canonical):
 * - Percentages are clamped to [0, 100].
 * - Last stage `graduate` is always 0.
 * - Remain is derived: remain = 100 - (graduate + exit). Never persisted.
 * - Months are integers ≥ 1.
 * - graduate + exit must be ≤ 100 for each stage.
 * 
 * Any consumer should rely on these invariants.
 */
export const useFundStore = create<StrategySlice>()(
  persist(
    (set, get) => {
      // Cache for stageValidation to prevent object recreation
      let cachedStagesState: StrategyStage[] | null = null;
      let cachedValidationResult: { allValid: boolean; errorsByRow: (string | null)[] } | null = null;
      
      return {
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      
      stages: [
        { id: generateStableId(), name: 'Seed', graduate: 30, exit: 20, months: 18 },
        { id: generateStableId(), name: 'Series A', graduate: 40, exit: 25, months: 24 },
        { id: generateStableId(), name: 'Series B+', graduate: 0, exit: 35, months: 30 }
      ],
      sectorProfiles: [
        { id: 'sector-1', name: 'FinTech', targetPercentage: 40, description: 'Financial technology companies' },
        { id: 'sector-2', name: 'HealthTech', targetPercentage: 30, description: 'Healthcare technology companies' },
        { id: 'sector-3', name: 'Enterprise SaaS', targetPercentage: 30, description: 'B2B software solutions' }
      ],
      allocations: [
        { id: 'alloc-1', category: 'New Investments', percentage: 75, description: 'Fresh capital for new portfolio companies' },
        { id: 'alloc-2', category: 'Reserves', percentage: 20, description: 'Follow-on investments for existing portfolio' },
        { id: 'alloc-3', category: 'Operating Expenses', percentage: 5, description: 'Fund management and operations' }
      ],
      followOnChecks: { A: 800_000, B: 1_500_000, C: 2_500_000 },

      addStage: () => set((s) => {
        // Invalidate cache when stages change
        cachedStagesState = null;
        cachedValidationResult = null;
        
        const id = generateStableId();
        const next = [...s.stages, { id, name: '', graduate: 0, exit: 0, months: 12 }];
        return { stages: enforceLast(next) };
      }),

      removeStage: (idx: number) => set((s) => {
        // Invalidate cache when stages change
        cachedStagesState = null;
        cachedValidationResult = null;
        
        const next = s.stages.filter((_, i) => i !== idx);
        return { stages: enforceLast(next) };
      }),

      updateStageName: (idx: number, name: string) => set((s) => {
        // Invalidate cache when stages change
        cachedStagesState = null;
        cachedValidationResult = null;
        
        const stages = [...s.stages];
        if (stages[idx]) {
          stages[idx] = { ...stages[idx], name };
        }
        return { stages };
      }),

      updateStageRate: (idx, patch) => set((s) => {
        // Invalidate cache when stages change
        cachedStagesState = null;
        cachedValidationResult = null;
        
        const stages: StrategyStage[] = [...s.stages];
        const r = stages[idx];
        if (!r) return {};

        const isLast = idx === stages.length - 1;
        const gradRaw = isLast ? 0 : clampPct(patch.graduate ?? r.graduate);
        const exitRaw = clampPct(patch.exit ?? r.exit);
        const months = clampInt(patch.months ?? r.months, 1, 120);

        const [graduate, exit] = allocate100(gradRaw, exitRaw);
        stages[idx] = { ...r, graduate, exit, months };

        // Re-enforce last rule in case stages changed earlier
        const lastIdx = stages.length - 1;
        if (lastIdx >= 0 && stages[lastIdx].graduate !== 0) {
          stages[lastIdx] = { ...stages[lastIdx], graduate: 0 };
        }

        return { stages };
      }),

      stageValidation: () => {
        const { stages } = get();
        
        // Return cached result if stages haven't changed
        if (cachedStagesState === stages && cachedValidationResult) {
          return cachedValidationResult;
        }
        
        // Compute new validation result
        const errors = stages.map((r: StrategyStage, i: number) => {
          if (!r.name?.trim()) return 'Stage name required';
          if (r.graduate + r.exit > 100) return 'Graduate + Exit must be ≤ 100%';
          if (i === stages.length - 1 && r.graduate !== 0) return 'Last stage must have 0% graduation';
          return null;
        });
        
        const result = { allValid: errors.every(e => !e), errorsByRow: errors };
        
        // Cache the result
        cachedStagesState = stages;
        cachedValidationResult = result;
        
        return result;
      },

      // Conversion utilities to work with existing InvestmentStrategy type
      toInvestmentStrategy: () => {
        const { stages, sectorProfiles, allocations } = get();
        return {
          stages: stages.map(s => ({
            id: s.id,
            name: s.name,
            graduationRate: s.graduate,
            exitRate: s.exit
          })),
          sectorProfiles,
          allocations
        };
      },

      fromInvestmentStrategy: (strategy: InvestmentStrategy) => {
        const current = get();
        
        // 1) Normalize & default only when absent (use ?? not ||)
        const mappedStages = strategy.stages.map(s => ({
          id: s.id,
          name: s.name,
          graduate: normalizeNumber(s.graduationRate),
          exit: normalizeNumber(s.exitRate),
          months: (s as any).months ?? 12 // Only default when undefined/null (months not in base type)
        }));
        
        // 2) Sort before compare & write (order-agnostic)
        const newStages = enforceLast(mappedStages).sort(sortById);
        const prevStages = current.stages.slice().sort(sortById);
        
        // 3) Deep equality check for stages (using NaN-safe equality)
        const stagesEqual = 
          prevStages.length === newStages.length &&
          prevStages.every((a, i) => 
            a.id === newStages[i].id &&
            a.name === newStages[i].name &&
            eq(a.graduate, newStages[i].graduate) &&
            eq(a.exit, newStages[i].exit) &&
            eq(a.months, newStages[i].months)
          );
        
        // Sort and compare profiles (with normalized percentages)
        const nextProfiles = strategy.sectorProfiles.slice().sort(sortById);
        const prevProfiles = current.sectorProfiles.slice().sort(sortById);
        const profilesEqual = 
          prevProfiles.length === nextProfiles.length &&
          prevProfiles.every((a, i) => 
            a.id === nextProfiles[i]?.id &&
            a.name === nextProfiles[i]?.name &&
            eq(a.targetPercentage, normalizeNumber(nextProfiles[i]?.targetPercentage)) &&
            a.description === nextProfiles[i]?.description
          );
        
        // Sort and compare allocations (with normalized percentages)
        const nextAllocs = strategy.allocations.slice().sort(sortById);
        const prevAllocs = current.allocations.slice().sort(sortById);
        const allocsEqual = 
          prevAllocs.length === nextAllocs.length &&
          prevAllocs.every((a, i) => 
            a.id === nextAllocs[i]?.id &&
            a.category === nextAllocs[i]?.category &&
            eq(a.percentage, normalizeNumber(nextAllocs[i]?.percentage)) &&
            a.description === nextAllocs[i]?.description
          );
        
        // 4) True no-op: don't call set() if nothing changed
        if (stagesEqual && profilesEqual && allocsEqual) {
          return; // Early return - no state update
        }
        
        // 5) Invalidate cache and publish update
        cachedStagesState = null;
        cachedValidationResult = null;
        
        set({
          stages: newStages,
          sectorProfiles: nextProfiles,
          allocations: nextAllocs
        });
      }
    };
  },
  {
      name: 'investment-strategy',
      version: 2, // Bump version for new structure
      partialize: (s) => ({
        // Only persist primitive inputs (no derived remain)
        stages: s.stages.map((r: StrategyStage) => ({
          id: r.id, name: r.name, graduate: r.graduate, exit: r.exit, months: r.months
        })),
        sectorProfiles: s.sectorProfiles,
        allocations: s.allocations,
        followOnChecks: s.followOnChecks,
        modelVersion: 'reserves-ev1',
      }),
      migrate: (state: any, from: number) => {
        if (from < 2) {
          state.stages = (state.stages ?? []).map((r: any) => ({ months: 12, ...r }));
        }
        return state;
      },
      onRehydrateStorage: () => (state, err) => {
        if (err) {
          console.error('[fund-store] rehydrate failed', err);
        }
        // Set hydrated flag after rehydration completes
        state?.setHydrated(true);
      }
    }
  )
);

// Dev-only store tracer for debugging state updates
if (import.meta.env.DEV && typeof window !== 'undefined' && !(window as any).__fundStoreTracer) {
  (window as any).__fundStoreTracer = true;
  const unsub = useFundStore.subscribe((state, prev) => {
    const changed: string[] = [];
    if (state.hydrated !== prev.hydrated) changed.push('hydrated');
    if (state.stages !== prev.stages) changed.push('stages');
    if (state.sectorProfiles !== prev.sectorProfiles) changed.push('sectorProfiles');
    if (state.allocations !== prev.allocations) changed.push('allocations');
    if (changed.length) {
      console.debug('[fund-store publish]', changed.join(','), { state, prev });
    }
  });
  // Store unsubscribe function for cleanup if needed
  (window as any).__unsubFundStoreTracer = unsub;
}

