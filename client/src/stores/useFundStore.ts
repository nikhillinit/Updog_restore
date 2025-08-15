import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { allocate100 } from '../core/utils/allocate100';
import { clampPct, clampInt } from '../lib/coerce';
import type { Stage, SectorProfile, Allocation, InvestmentStrategy } from '@shared/types';

export type StrategyStage = {
  id: string;
  name: string;
  graduate: number; // %
  exit: number;     // %
  months: number;   // int >= 1
};

type StrategySlice = {
  stages: StrategyStage[];
  sectorProfiles: SectorProfile[];
  allocations: Allocation[];
  followOnChecks: { A: number; B: number; C: number };

  // Stage management
  addStage: () => void;
  removeStage: (idx: number) => void;
  updateStageName: (idx: number, name: string) => void;
  updateStageRate: (idx: number, patch: Partial<Pick<StrategyStage, 'graduate'|'exit'|'months'>>) => void;

  // Selector-like helper
  stageValidation: () => { allValid: boolean; errorsByRow: (string | null)[] };

  // Conversion utilities
  toInvestmentStrategy: () => InvestmentStrategy;
  fromInvestmentStrategy: (strategy: InvestmentStrategy) => void;
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
    (set, get) => ({
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
        const id = generateStableId();
        const next = [...s.stages, { id, name: '', graduate: 0, exit: 0, months: 12 }];
        return { stages: enforceLast(next) };
      }),

      removeStage: (idx: number) => set((s) => {
        const next = s.stages.filter((_, i) => i !== idx);
        return { stages: enforceLast(next) };
      }),

      updateStageName: (idx: number, name: string) => set((s) => {
        const stages = [...s.stages];
        if (stages[idx]) {
          stages[idx] = { ...stages[idx], name };
        }
        return { stages };
      }),

      updateStageRate: (idx, patch) => set((s) => {
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
        const errors = stages.map((r: StrategyStage, i: number) => {
          if (!r.name?.trim()) return 'Stage name required';
          if (r.graduate + r.exit > 100) return 'Graduate + Exit must be ≤ 100%';
          if (i === stages.length - 1 && r.graduate !== 0) return 'Last stage must have 0% graduation';
          return null;
        });
        return { allValid: errors.every(e => !e), errorsByRow: errors };
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

      fromInvestmentStrategy: (strategy: InvestmentStrategy) => set(() => {
        const stages = strategy.stages.map(s => ({
          id: s.id,
          name: s.name,
          graduate: s.graduationRate,
          exit: s.exitRate,
          months: 12 // Default months if not provided
        }));
        
        return {
          stages: enforceLast(stages),
          sectorProfiles: strategy.sectorProfiles,
          allocations: strategy.allocations
        };
      })
    }),
    {
      name: 'investment-strategy',
      version: 1,
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
      migrate: (state: any, v: number) => {
        state.stages = (state.stages ?? []).map((r: any) => ({ months: 12, ...r }));
        return state;
      }
    }
  )
);
