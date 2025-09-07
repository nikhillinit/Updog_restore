/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { allocate100 } from '../core/utils/allocate100';
import { clampPct, clampInt } from '../lib/coerce';
import type { Stage, SectorProfile, Allocation, InvestmentStrategy } from '@shared/types';

// Development-only watchdog to prevent set() during render
let renderPhaseGuard = false;
let selectingPhase = false;
const isDev = import.meta.env.DEV;

const withRenderGuard = <T extends (...args: any[]) => any>(fn: T, actionName: string): T => {
  if (!isDev) return fn;
  
  return ((...args: any[]) => {
    if (renderPhaseGuard) {
      console.error(`🚨 RENDER GUARD: Attempted to call ${actionName} during React render phase!`);
      console.trace('Stack trace:');
      return;
    }
    if (selectingPhase) {
      console.error(`🚨 SELECT GUARD: Attempted to call ${actionName} during selector execution!`, new Error().stack);
      return;
    }
    return fn(...args);
  }) as T;
};

// Guard selector execution
const guardSelect = <T>(fn: () => T): T => {
  if (!isDev) return fn();
  selectingPhase = true;
  try {
    return fn();
  } finally {
    selectingPhase = false;
  }
};

// Export for use in components
export const setRenderPhase = (inRender: boolean) => {
  if (isDev) {
    renderPhaseGuard = inRender;
  }
};

// Export selector guard for use in components
export const withSelectGuard = <T>(fn: () => T): T => {
  if (!isDev) return fn();
  return guardSelect(fn);
};

// Instrumented set function with loop detection
const createSafeSet = (originalSet: any) => {
  if (!isDev) return originalSet;
  
  return (...args: any[]) => {
    if (renderPhaseGuard) {
      console.error('[useFundStore] set() during render/selector', new Error().stack);
      return;
    }
    if (selectingPhase) {
      console.error('[useFundStore] set() during selector execution', new Error().stack);
      return;
    }
    return originalSet(...args);
  };
};

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
    (originalSet, get) => {
      const safeSet = createSafeSet(originalSet);
      const set = safeSet;
      
      return {
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

      addStage: withRenderGuard(() => set((s: any) => {
        const id = generateStableId();
        const next = [...s.stages, { id, name: '', graduate: 0, exit: 0, months: 12 }];
        return { stages: enforceLast(next) };
      }), 'addStage'),

      removeStage: withRenderGuard((idx: number) => set((s: any) => {
        const next = s.stages.filter((_: any, i: number) => i !== idx);
        return { stages: enforceLast(next) };
      }), 'removeStage'),

      updateStageName: withRenderGuard((idx: number, name: string) => set((s: any) => {
        const stages = [...s.stages];
        if (stages[idx]) {
          stages[idx] = { ...stages[idx], name };
        }
        return { stages };
      }), 'updateStageName'),

      updateStageRate: withRenderGuard((idx, patch) => set((s: any) => {
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
      }), 'updateStageRate'),

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

      fromInvestmentStrategy: withRenderGuard((strategy: InvestmentStrategy) => set(() => {
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
      }), 'fromInvestmentStrategy')
      }; // End of store object
    },
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
      migrate: (state: any, _v: number) => {
        state.stages = (state.stages ?? []).map((r: any) => ({ months: 12, ...r }));
        return state;
      }
    }
  )
);

