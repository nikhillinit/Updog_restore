import { createStore } from 'zustand/vanilla';
import { devtools, persist } from 'zustand/middleware';
import { allocate100 } from '../core/utils/allocate100';
import { clampPct, clampInt } from '../lib/coerce';
import { normalizeNumber, eq } from '../utils/state-utils';
import dequal from 'fast-deep-equal';
import type { SectorProfile, Allocation, InvestmentStrategy } from '@shared/types';

export type StrategyStage = {
  id: string;
  name: string;
  graduate: number; // %
  exit: number;     // %
  months: number;   // int >= 1
};

// LP and Capital types
export type LPClass = {
  id: string;
  name: string;
  targetAllocation: number;
  managementFeeRate?: number;
  carriedInterest?: number;
  preferredReturn?: number;
};

export type LP = {
  id: string;
  name: string;
  commitment: number;
  lpClassId?: string;
  type: 'institutional' | 'family-office' | 'fund-of-funds' | 'individual' | 'other';
};

// Waterfall types
export type WaterfallTier = {
  id: string;
  name: string;
  preferredReturn?: number;
  catchUp?: number;
  gpSplit: number;
  lpSplit: number;
  condition?: 'irr' | 'moic' | 'none';
  conditionValue?: number;
};

export type FundState = {
  // Hydration flag
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  // Fund Basics
  fundName?: string;
  isEvergreen?: boolean;
  fundLife?: number;
  investmentPeriod?: number;
  fundSize?: number;
  managementFeeRate?: number;
  carriedInterest?: number;

  // Capital Structure
  gpCommitment?: number;
  lpClasses: LPClass[];
  lps: LP[];

  // Investment Strategy
  stages: StrategyStage[];
  sectorProfiles: SectorProfile[];
  allocations: Allocation[];
  followOnChecks: { A: number; B: number; C: number };

  // Distributions & Carry
  waterfallType?: 'american' | 'european' | 'hybrid';
  waterfallTiers: WaterfallTier[];
  recyclingEnabled?: boolean;
  recyclingType?: 'exits' | 'fees' | 'both';
  recyclingCap?: number;
  recyclingPeriod?: number;
  exitRecyclingRate?: number;
  mgmtFeeRecyclingRate?: number;

  // Fund Basics actions
  updateFundBasics: (patch: Partial<Pick<FundState, 'fundName' | 'isEvergreen' | 'fundLife' | 'investmentPeriod' | 'fundSize' | 'managementFeeRate' | 'carriedInterest'>>) => void;

  // Capital Structure actions
  updateCapitalStructure: (patch: Partial<Pick<FundState, 'gpCommitment'>>) => void;
  addLPClass: (lpClass: LPClass) => void;
  updateLPClass: (id: string, patch: Partial<LPClass>) => void;
  removeLPClass: (id: string) => void;
  addLP: (lp: LP) => void;
  updateLP: (id: string, patch: Partial<LP>) => void;
  removeLP: (id: string) => void;

  // Stage management
  addStage: () => void;
  removeStage: (idx: number) => void;
  updateStageName: (idx: number, name: string) => void;
  updateStageRate: (idx: number, patch: Partial<Pick<StrategyStage, 'graduate'|'exit'|'months'>>) => void;

  // Distributions actions
  updateDistributions: (patch: Partial<Pick<FundState, 'waterfallType' | 'recyclingEnabled' | 'recyclingType' | 'recyclingCap' | 'recyclingPeriod' | 'exitRecyclingRate' | 'mgmtFeeRecyclingRate'>>) => void;
  addWaterfallTier: (tier: WaterfallTier) => void;
  updateWaterfallTier: (id: string, patch: Partial<WaterfallTier>) => void;
  removeWaterfallTier: (id: string) => void;

  // Selector-like helper
  stageValidation: () => { allValid: boolean; errorsByRow: (string | null)[] };

  // Conversion utilities
  toInvestmentStrategy: () => InvestmentStrategy;
  fromInvestmentStrategy: (strategy: InvestmentStrategy) => void;
};

// Helper functions
const enforceLast = (rows: StrategyStage[]) =>
  rows.map((r, i) => (i === rows.length - 1 ? { ...r, graduate: 0 } : r));

const generateStableId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return `stage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Canonicalization types
type StrategySlices = {
  stages: StrategyStage[];
  sectorProfiles: SectorProfile[];
  allocations: Allocation[];
};

// Normalize incoming payload into canonical internal shape with structural sharing
function canonicalizeStrategyInput(
  next: InvestmentStrategy,
  prev: StrategySlices
): StrategySlices {
  // 1) Stages: clamp defaults, sort by id, and REUSE objects when unchanged
  const prevById = new Map(prev.stages.map(s => [s.id, s]));

  const normStages = (next.stages ?? prev.stages).map(ns => {
    const p = prevById.get(ns.id);
    // normalize fields to internal model
    const name = (ns.name?.trim() ?? p?.name ?? '');
    const graduate = normalizeNumber((ns as any).graduationRate ?? (ns as any).graduate ?? p?.graduate ?? 0);
    const exit = normalizeNumber((ns as any).exitRate ?? (ns as any).exit ?? p?.exit ?? 0);
    const months = (ns as any).months ?? p?.months ?? 12; // Default months that was breaking tests

    // if identical to prev, return the *same* object reference (structural sharing)
    if (p && p.name === name && eq(p.graduate, graduate) && eq(p.exit, exit) && p.months === months) {
      return p;
    }

    return { 
      id: ns.id, 
      name, 
      graduate: clampPct(graduate), 
      exit: clampPct(exit), 
      months: clampInt(months, 1, 120) 
    };
  });

  // Apply last stage rule (preserve original order for stages)
  const finalStages = enforceLast(normStages);

  // 2) Sector profiles: normalize and reuse when same (ID-based matching)
  const prevSPById = new Map(prev.sectorProfiles.map(sp => [sp.id, sp]));
  const normSectorProfiles = (next.sectorProfiles ?? prev.sectorProfiles)
    .map(sp => {
      const p = prevSPById.get(sp.id);
      const name = sp.name?.trim() ?? p?.name ?? '';
      const targetPercentage = normalizeNumber(sp.targetPercentage ?? p?.targetPercentage ?? 0);
      const description = sp.description ?? p?.description ?? '';
      
      // reuse object if equal
      if (p && p.name === name && eq(p.targetPercentage, targetPercentage) && p.description === description) {
        return p;
      }
      return { id: sp.id, name, targetPercentage: clampPct(targetPercentage), description };
    });

  // 3) Allocations: normalize % (handle both "percent" and "percentage"), reuse when same (ID-based matching)
  const prevAllocById = new Map(prev.allocations.map(a => [a.id, a]));
  const normAllocations = (next.allocations ?? prev.allocations)
    .map(a => {
      const p = prevAllocById.get(a.id);
      const category = a.category?.trim() ?? p?.category ?? '';
      const percentage = normalizeNumber(
        (a as any).percentage ?? (a as any).percent ?? p?.percentage ?? 0
      );
      const description = a.description ?? p?.description ?? '';
      
      if (p && p.category === category && eq(p.percentage, percentage) && p.description === description) {
        return p;
      }
      return { 
        id: a.id ?? p?.id ?? generateStableId(),
        category, 
        percentage: clampPct(percentage), // Always emit canonical "percentage" field
        description 
      };
    });

  return { 
    stages: finalStages, 
    sectorProfiles: normSectorProfiles, 
    allocations: normAllocations 
  };
}

// HMR type safety
interface HotData {
  fundStore?: ReturnType<typeof createFundStore>;
}

function createFundStore() {
  // Cache for stageValidation to prevent object recreation
  let cachedStagesState: StrategyStage[] | null = null;
  let cachedValidationResult: { allValid: boolean; errorsByRow: (string | null)[] } | null = null;

  return createStore<FundState>()(
    devtools(
      persist(
        (set, get) => ({
          hydrated: false,
          setHydrated: (v) => set({ hydrated: v }),
          
          // Fund Basics defaults
          fundName: undefined,
          isEvergreen: false,
          fundLife: undefined,
          investmentPeriod: undefined,
          fundSize: undefined,
          managementFeeRate: undefined,
          carriedInterest: undefined,

          // Capital Structure defaults
          gpCommitment: undefined,
          lpClasses: [],
          lps: [],

          // Investment Strategy defaults
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

          // Distributions & Carry defaults
          waterfallType: 'american',
          waterfallTiers: [
            {
              id: 'tier-default',
              name: 'Standard Carry',
              lpSplit: 80,
              gpSplit: 20,
              preferredReturn: 8,
              catchUp: 100,
              condition: 'none'
            }
          ],
          recyclingEnabled: false,
          recyclingType: 'exits',
          recyclingCap: undefined,
          recyclingPeriod: undefined,
          exitRecyclingRate: 100,
          mgmtFeeRecyclingRate: 0,

          // Fund Basics actions
          updateFundBasics: (patch) => set((state) => ({ ...state, ...patch })),

          // Capital Structure actions
          updateCapitalStructure: (patch) => set((state) => ({ ...state, ...patch })),
          
          addLPClass: (lpClass) => set((state) => ({
            lpClasses: [...state.lpClasses, lpClass]
          })),
          
          updateLPClass: (id, patch) => set((state) => ({
            lpClasses: state.lpClasses.map(cls => 
              cls.id === id ? { ...cls, ...patch } : cls
            )
          })),
          
          removeLPClass: (id) => set((state) => ({
            lpClasses: state.lpClasses.filter(cls => cls.id !== id)
          })),
          
          addLP: (lp) => set((state) => ({
            lps: [...state.lps, lp]
          })),
          
          updateLP: (id, patch) => set((state) => ({
            lps: state.lps.map(lp => 
              lp.id === id ? { ...lp, ...patch } : lp
            )
          })),
          
          removeLP: (id) => set((state) => ({
            lps: state.lps.filter(lp => lp.id !== id)
          })),

          // Distributions actions
          updateDistributions: (patch) => set((state) => ({ ...state, ...patch })),
          
          addWaterfallTier: (tier) => set((state) => ({
            waterfallTiers: [...state.waterfallTiers, tier]
          })),
          
          updateWaterfallTier: (id, patch) => set((state) => ({
            waterfallTiers: state.waterfallTiers.map(tier => 
              tier.id === id ? { ...tier, ...patch } : tier
            )
          })),
          
          removeWaterfallTier: (id) => set((state) => ({
            waterfallTiers: state.waterfallTiers.filter(tier => tier.id !== id)
          })),

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

          fromInvestmentStrategy: (strategy: InvestmentStrategy) => set((state) => {
            const prevRaw = {
              stages: state.stages,
              sectorProfiles: state.sectorProfiles,
              allocations: state.allocations,
            };

            // Quick identity fast-path for trivial no-ops
            if (
              (strategy as any).stages === state.stages &&
              (strategy as any).sectorProfiles === state.sectorProfiles &&
              (strategy as any).allocations === state.allocations
            ) {
              return state; // no-op, no notify
            }

            // Canonicalize PREV through the same pipeline (cheap; mostly reuses refs)
            const prevCanonical = canonicalizeStrategyInput(
              { stages: prevRaw.stages, sectorProfiles: prevRaw.sectorProfiles, allocations: prevRaw.allocations } as any,
              prevRaw
            );

            const nextCanonical = canonicalizeStrategyInput(strategy, prevRaw);

            // If canonicalized slices are deeply equal, keep the *same* state object (no notify)
            if (dequal(prevCanonical, nextCanonical)) return state;

            // Invalidate cache and publish update
            cachedStagesState = null;
            cachedValidationResult = null;

            // Otherwise replace only changed slices, preserving others by reference
            return {
              ...state,
              ...nextCanonical,
            };
          })
        }),
        {
          name: 'investment-strategy',
          version: 2,
          partialize: (s) => ({
            // Only persist primitive inputs
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
          onRehydrateStorage: () => (_state, err) => {
            if (err) console.error('[fund-store] rehydrate error', err);
            // Flip on next microtask so subscribers see the final rehydrated values
            Promise.resolve().then(() => fundStore.getState().setHydrated(true));
          }
        }
      ),
      {
        name: 'fund-store'
      }
    )
  );
}

// HMR-safe store creation with Vite's hot data bucket
const hotData = (import.meta as any).hot?.data as HotData | undefined;
const store = hotData?.fundStore ?? createFundStore();

if ((import.meta as any).hot) {
  (import.meta as any).hot.dispose((data: HotData) => {
    data.fundStore = store;
  });
}

export const fundStore = store;

// Export factory for test isolation
export const __createIsolatedFundStore = createFundStore;
export const __canonicalizeStrategyInput = canonicalizeStrategyInput;

// Dev-only store tracer for debugging state updates
if (import.meta.env.DEV && import.meta.env['VITE_WIZARD_DEBUG'] === '1') {
  const unsub = fundStore.subscribe((state, prev) => {
    const changed: string[] = [];
    if (state.hydrated !== prev.hydrated) changed.push('hydrated');
    if (state.stages !== prev.stages) changed.push('stages');
    if (state.sectorProfiles !== prev.sectorProfiles) changed.push('sectorProfiles');
    if (state.allocations !== prev.allocations) changed.push('allocations');
    if (state.followOnChecks !== prev.followOnChecks) changed.push('followOnChecks');
    if (changed.length) {
      console.debug('[fund-store publish]', changed.join(','), { 
        changed,
        timestamp: new Date().toISOString(),
        perf: Math.round(performance.now())
      });
    }
  });
}