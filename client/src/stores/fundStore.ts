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
  exit: number; // %
  months: number; // int >= 1
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

// Fee and Expense types
export type FeeBasis =
  | 'committed_capital'
  | 'called_capital_period'
  | 'gross_cumulative_called'
  | 'net_cumulative_called'
  | 'cumulative_invested'
  | 'fair_market_value'
  | 'unrealized_investments';

export type FeeTier = {
  id: string;
  name: string;
  percentage: number;
  feeBasis: FeeBasis;
  startMonth: number;
  endMonth?: number;
  recyclingPercentage?: number; // % of fees that can be recycled
};

export type FeeProfile = {
  id: string;
  name: string;
  feeTiers: FeeTier[];
};

export type FundExpense = {
  id: string;
  category: string;
  monthlyAmount: number;
  startMonth: number;
  endMonth?: number;
};

// Pipeline profile types (Step 4 investment pipeline per sector)
export type PipelineStage = {
  id: string;
  name: string;
  roundSize: number; // $M
  valuation: number; // $M
  valuationType: 'pre' | 'post';
  esopPct: number; // %
  graduationRate: number; // %
  exitRate: number; // %
  exitValuation: number; // $M
  monthsToGraduate: number;
  monthsToExit: number;
};

export type PipelineProfile = {
  id: string;
  name: string;
  stages: PipelineStage[];
};

// Capital Plan types (Step 3 capital allocation config)
export type CapitalStageAllocation = {
  id: string;
  label: string;
  pct: number;
};

export type CapitalPlanAllocation = {
  id: string;
  name: string;
  sectorProfileId?: string;
  entryRound: string;
  capitalAllocationPct: number;
  initialCheckStrategy: 'amount' | 'ownership';
  initialCheckAmount?: number;
  initialOwnershipPct?: number;
  followOnStrategy: 'amount' | 'maintain_ownership';
  followOnAmount?: number;
  followOnParticipationPct: number;
  investmentHorizonMonths: number;
};

export type FundState = {
  // Hydration flag
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  // Fund Basics
  fundName?: string;
  establishmentDate?: string; // ISO date string for fund establishment
  vintageYear?: number; // Derived from establishment date
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

  // Capital Plan (Step 3 capital allocation config)
  capitalStageAllocations: CapitalStageAllocation[];
  capitalPlanAllocations: CapitalPlanAllocation[];

  // Investment Pipeline (Step 4 sector pipeline profiles)
  pipelineProfiles: PipelineProfile[];

  // Distributions & Carry
  waterfallType?: 'american' | 'european' | 'hybrid';
  waterfallTiers: WaterfallTier[];
  recyclingEnabled?: boolean;
  recyclingType?: 'exits' | 'fees' | 'both';
  recyclingCap?: number;
  recyclingPeriod?: number;
  exitRecyclingRate?: number;
  mgmtFeeRecyclingRate?: number;
  allowFutureRecycling?: boolean;

  // Fees & Expenses
  feeProfiles: FeeProfile[];
  fundExpenses: FundExpense[];

  // Fund Basics actions
  updateFundBasics: (
    patch: Partial<
      Pick<
        FundState,
        | 'fundName'
        | 'establishmentDate'
        | 'vintageYear'
        | 'isEvergreen'
        | 'fundLife'
        | 'investmentPeriod'
        | 'fundSize'
        | 'managementFeeRate'
        | 'carriedInterest'
      >
    >
  ) => void;

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
  updateStageRate: (
    idx: number,
    patch: Partial<Pick<StrategyStage, 'graduate' | 'exit' | 'months'>>
  ) => void;

  // Distributions actions
  updateDistributions: (
    patch: Partial<
      Pick<
        FundState,
        | 'waterfallType'
        | 'recyclingEnabled'
        | 'recyclingType'
        | 'recyclingCap'
        | 'recyclingPeriod'
        | 'exitRecyclingRate'
        | 'mgmtFeeRecyclingRate'
        | 'allowFutureRecycling'
      >
    >
  ) => void;
  addWaterfallTier: (tier: WaterfallTier) => void;
  updateWaterfallTier: (id: string, patch: Partial<WaterfallTier>) => void;
  removeWaterfallTier: (id: string) => void;

  // Fee Profile actions
  addFeeProfile: (profile: FeeProfile) => void;
  updateFeeProfile: (id: string, patch: Partial<FeeProfile>) => void;
  removeFeeProfile: (id: string) => void;
  addFeeTier: (profileId: string, tier: FeeTier) => void;
  updateFeeTier: (profileId: string, tierId: string, patch: Partial<FeeTier>) => void;
  removeFeeTier: (profileId: string, tierId: string) => void;

  // Fund Expense actions
  addFundExpense: (expense: FundExpense) => void;
  updateFundExpense: (id: string, patch: Partial<FundExpense>) => void;
  removeFundExpense: (id: string) => void;

  // Capital Plan actions (Step 3)
  setCapitalStageAllocations: (rows: CapitalStageAllocation[]) => void;
  setCapitalPlanAllocations: (rows: CapitalPlanAllocation[]) => void;
  addCapitalPlanAllocation: (allocation: CapitalPlanAllocation) => void;
  updateCapitalPlanAllocation: (id: string, patch: Partial<CapitalPlanAllocation>) => void;
  removeCapitalPlanAllocation: (id: string) => void;

  // Pipeline Profile actions (Step 4)
  setPipelineProfiles: (profiles: PipelineProfile[]) => void;

  // Selector-like helper
  stageValidation: () => { allValid: boolean; errorsByRow: (string | null)[] };

  // Conversion utilities
  toInvestmentStrategy: () => InvestmentStrategy;
  fromInvestmentStrategy: (strategy: InvestmentStrategy) => void;
};

// Helper functions
const enforceLast = (rows: StrategyStage[]): StrategyStage[] =>
  rows.map((r: StrategyStage, i: number) => (i === rows.length - 1 ? { ...r, graduate: 0 } : r));

const generateStableId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `stage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Canonicalization types
type StrategySlices = {
  stages: StrategyStage[];
  sectorProfiles: SectorProfile[];
  allocations: Allocation[];
};

// Flexible input types that accept both internal and external naming conventions
// Stage can come from InvestmentStrategy (graduationRate/exitRate) or internal StrategyStage (graduate/exit)
type FlexibleStageInput = {
  id: string;
  name?: string;
  graduationRate?: number;
  graduate?: number;
  exitRate?: number;
  exit?: number;
  months?: number;
};

// Allocation can use either "percentage" or "percent" depending on the source
type FlexibleAllocationInput = {
  id?: string;
  category?: string;
  percentage?: number;
  percent?: number;
  description?: string;
};

// Patch types for cleaner action signatures
type FundBasicsPatch = Partial<
  Pick<
    FundState,
    | 'fundName'
    | 'establishmentDate'
    | 'vintageYear'
    | 'isEvergreen'
    | 'fundLife'
    | 'investmentPeriod'
    | 'fundSize'
    | 'managementFeeRate'
    | 'carriedInterest'
  >
>;
type CapitalStructurePatch = Partial<Pick<FundState, 'gpCommitment'>>;
type DistributionsPatch = Partial<
  Pick<
    FundState,
    | 'waterfallType'
    | 'recyclingEnabled'
    | 'recyclingType'
    | 'recyclingCap'
    | 'recyclingPeriod'
    | 'exitRecyclingRate'
    | 'mgmtFeeRecyclingRate'
    | 'allowFutureRecycling'
  >
>;

// Normalize incoming payload into canonical internal shape with structural sharing
function canonicalizeStrategyInput(next: InvestmentStrategy, prev: StrategySlices): StrategySlices {
  // 1) Stages: clamp defaults, sort by id, and REUSE objects when unchanged
  const prevById = new Map(prev.stages.map((s) => [s.id, s]));

  const normStages = (next.stages ?? prev.stages).map((ns) => {
    const p = prevById['get'](ns.id);
    // Cast to flexible type to handle both InvestmentStrategy.Stage and internal StrategyStage naming
    const flexStage = ns as FlexibleStageInput;
    // normalize fields to internal model
    const name = ns.name?.trim() ?? p?.name ?? '';
    const graduate = normalizeNumber(
      flexStage.graduationRate ?? flexStage.graduate ?? p?.graduate ?? 0
    );
    const exit = normalizeNumber(flexStage.exitRate ?? flexStage.exit ?? p?.exit ?? 0);
    const months = flexStage.months ?? p?.months ?? 12; // Default months that was breaking tests

    // if identical to prev, return the *same* object reference (structural sharing)
    if (
      p &&
      p.name === name &&
      eq(p.graduate, graduate) &&
      eq(p.exit, exit) &&
      p.months === months
    ) {
      return p;
    }

    return {
      id: ns.id,
      name,
      graduate: clampPct(graduate),
      exit: clampPct(exit),
      months: clampInt(months, 1, 120),
    };
  });

  // Apply last stage rule (preserve original order for stages)
  const finalStages = enforceLast(normStages);

  // 2) Sector profiles: normalize and reuse when same (ID-based matching)
  const prevSPById = new Map(prev.sectorProfiles.map((sp) => [sp.id, sp]));
  const normSectorProfiles = (next.sectorProfiles ?? prev.sectorProfiles).map((sp) => {
    const p = prevSPById['get'](sp.id);
    const name = sp.name?.trim() ?? p?.name ?? '';
    const targetPercentage = normalizeNumber(sp.targetPercentage ?? p?.targetPercentage ?? 0);
    const description = sp.description ?? p?.description ?? '';

    // reuse object if equal
    if (
      p &&
      p.name === name &&
      eq(p.targetPercentage, targetPercentage) &&
      p.description === description
    ) {
      return p;
    }
    return { id: sp.id, name, targetPercentage: clampPct(targetPercentage), description };
  });

  // 3) Allocations: normalize % (handle both "percent" and "percentage"), reuse when same (ID-based matching)
  const prevAllocById = new Map(prev.allocations.map((a) => [a.id, a]));
  const normAllocations = (next.allocations ?? prev.allocations).map((a) => {
    const p = prevAllocById['get'](a.id);
    // Cast to flexible type to handle both "percentage" and "percent" naming conventions
    const flexAlloc = a as FlexibleAllocationInput;
    const category = a.category?.trim() ?? p?.category ?? '';
    const percentage = normalizeNumber(
      flexAlloc.percentage ?? flexAlloc.percent ?? p?.percentage ?? 0
    );
    const description = a.description ?? p?.description ?? '';

    if (
      p &&
      p.category === category &&
      eq(p.percentage, percentage) &&
      p.description === description
    ) {
      return p;
    }
    return {
      id: a.id ?? p?.id ?? generateStableId(),
      category,
      percentage: clampPct(percentage), // Always emit canonical "percentage" field
      description,
    };
  });

  return {
    stages: finalStages,
    sectorProfiles: normSectorProfiles,
    allocations: normAllocations,
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
        (set, get): FundState => ({
          hydrated: false,
          setHydrated: (v: boolean) => set({ hydrated: v }),

          // Fund Basics defaults
          // Note: undefined optional fields are omitted per exactOptionalPropertyTypes
          isEvergreen: false,

          // Capital Structure defaults
          lpClasses: [],
          lps: [],

          // Investment Strategy defaults
          stages: [
            { id: generateStableId(), name: 'Seed', graduate: 30, exit: 20, months: 18 },
            { id: generateStableId(), name: 'Series A', graduate: 40, exit: 25, months: 24 },
            { id: generateStableId(), name: 'Series B+', graduate: 0, exit: 35, months: 30 },
          ],
          sectorProfiles: [
            {
              id: 'sector-1',
              name: 'FinTech',
              targetPercentage: 40,
              description: 'Financial technology companies',
            },
            {
              id: 'sector-2',
              name: 'HealthTech',
              targetPercentage: 30,
              description: 'Healthcare technology companies',
            },
            {
              id: 'sector-3',
              name: 'Enterprise SaaS',
              targetPercentage: 30,
              description: 'B2B software solutions',
            },
          ],
          allocations: [
            {
              id: 'alloc-1',
              category: 'New Investments',
              percentage: 75,
              description: 'Fresh capital for new portfolio companies',
            },
            {
              id: 'alloc-2',
              category: 'Reserves',
              percentage: 20,
              description: 'Follow-on investments for existing portfolio',
            },
            {
              id: 'alloc-3',
              category: 'Operating Expenses',
              percentage: 5,
              description: 'Fund management and operations',
            },
          ],
          followOnChecks: { A: 800_000, B: 1_500_000, C: 2_500_000 },

          // Capital Plan defaults (Step 3)
          capitalStageAllocations: [
            { id: 'preseed_seed', label: 'Pre-Seed + Seed', pct: 43 },
            { id: 'series_a', label: 'Series A', pct: 14 },
            { id: 'reserved', label: 'Reserved', pct: 43 },
          ],
          capitalPlanAllocations: [
            {
              id: 'pre-seed-allocation',
              name: 'Pre-Seed Investments',
              entryRound: 'Pre-Seed',
              capitalAllocationPct: 43,
              initialCheckStrategy: 'amount' as const,
              initialCheckAmount: 250000,
              followOnStrategy: 'maintain_ownership' as const,
              followOnParticipationPct: 100,
              investmentHorizonMonths: 18,
            },
            {
              id: 'seed-allocation',
              name: 'Seed Investments',
              entryRound: 'Seed',
              capitalAllocationPct: 43,
              initialCheckStrategy: 'amount' as const,
              initialCheckAmount: 500000,
              followOnStrategy: 'maintain_ownership' as const,
              followOnParticipationPct: 100,
              investmentHorizonMonths: 24,
            },
            {
              id: 'series-a-allocation',
              name: 'Series A Investments',
              entryRound: 'Series A',
              capitalAllocationPct: 14,
              initialCheckStrategy: 'amount' as const,
              initialCheckAmount: 750000,
              followOnStrategy: 'maintain_ownership' as const,
              followOnParticipationPct: 100,
              investmentHorizonMonths: 18,
            },
          ],

          // Pipeline Profiles default (empty -- populated by Step 4 or legacy migration)
          pipelineProfiles: [],

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
              condition: 'none',
            },
          ],
          recyclingEnabled: false,
          recyclingType: 'exits',
          exitRecyclingRate: 100,
          mgmtFeeRecyclingRate: 0,
          allowFutureRecycling: false,

          // Fees & Expenses defaults
          feeProfiles: [
            {
              id: 'default-profile',
              name: 'Default Fee Profile',
              feeTiers: [
                {
                  id: 'tier-1',
                  name: 'Management Fee',
                  percentage: 2.0,
                  feeBasis: 'committed_capital',
                  startMonth: 1,
                  endMonth: 120, // 10 years
                },
              ],
            },
          ],
          fundExpenses: [],

          // Fund Basics actions
          updateFundBasics: (patch: FundBasicsPatch) => set((state) => ({ ...state, ...patch })),

          // Capital Structure actions
          updateCapitalStructure: (patch: CapitalStructurePatch) =>
            set((state) => ({ ...state, ...patch })),

          addLPClass: (lpClass: LPClass) =>
            set((state) => ({
              lpClasses: [...state.lpClasses, lpClass],
            })),

          updateLPClass: (id: string, patch: Partial<LPClass>) =>
            set((state) => ({
              lpClasses: state.lpClasses.map((cls: LPClass) =>
                cls.id === id ? { ...cls, ...patch } : cls
              ),
            })),

          removeLPClass: (id: string) =>
            set((state) => ({
              lpClasses: state.lpClasses.filter((cls: LPClass) => cls.id !== id),
            })),

          addLP: (lp: LP) =>
            set((state) => ({
              lps: [...state.lps, lp],
            })),

          updateLP: (id: string, patch: Partial<LP>) =>
            set((state) => ({
              lps: state.lps.map((existingLp: LP) =>
                existingLp.id === id ? { ...existingLp, ...patch } : existingLp
              ),
            })),

          removeLP: (id: string) =>
            set((state) => ({
              lps: state.lps.filter((existingLp: LP) => existingLp.id !== id),
            })),

          // Distributions actions
          updateDistributions: (patch: DistributionsPatch) =>
            set((state) => ({ ...state, ...patch })),

          addWaterfallTier: (tier: WaterfallTier) =>
            set((state) => ({
              waterfallTiers: [...state.waterfallTiers, tier],
            })),

          updateWaterfallTier: (id: string, patch: Partial<WaterfallTier>) =>
            set((state) => ({
              waterfallTiers: state.waterfallTiers.map((existingTier: WaterfallTier) =>
                existingTier.id === id ? { ...existingTier, ...patch } : existingTier
              ),
            })),

          removeWaterfallTier: (id: string) =>
            set((state) => ({
              waterfallTiers: state.waterfallTiers.filter(
                (existingTier: WaterfallTier) => existingTier.id !== id
              ),
            })),

          // Fee Profile actions
          addFeeProfile: (profile: FeeProfile) =>
            set((state) => ({
              feeProfiles: [...state.feeProfiles, profile],
            })),

          updateFeeProfile: (id: string, patch: Partial<FeeProfile>) =>
            set((state) => ({
              feeProfiles: state.feeProfiles.map((existingProfile: FeeProfile) =>
                existingProfile.id === id ? { ...existingProfile, ...patch } : existingProfile
              ),
            })),

          removeFeeProfile: (id: string) =>
            set((state) => ({
              feeProfiles: state.feeProfiles.filter(
                (existingProfile: FeeProfile) => existingProfile.id !== id
              ),
            })),

          addFeeTier: (profileId: string, tier: FeeTier) =>
            set((state) => ({
              feeProfiles: state.feeProfiles.map((profile: FeeProfile) =>
                profile.id === profileId
                  ? { ...profile, feeTiers: [...profile.feeTiers, tier] }
                  : profile
              ),
            })),

          updateFeeTier: (profileId: string, tierId: string, patch: Partial<FeeTier>) =>
            set((state) => ({
              feeProfiles: state.feeProfiles.map((profile: FeeProfile) =>
                profile.id === profileId
                  ? {
                      ...profile,
                      feeTiers: profile.feeTiers.map((existingTier: FeeTier) =>
                        existingTier.id === tierId ? { ...existingTier, ...patch } : existingTier
                      ),
                    }
                  : profile
              ),
            })),

          removeFeeTier: (profileId: string, tierId: string) =>
            set((state) => ({
              feeProfiles: state.feeProfiles.map((profile: FeeProfile) =>
                profile.id === profileId
                  ? {
                      ...profile,
                      feeTiers: profile.feeTiers.filter(
                        (existingTier: FeeTier) => existingTier.id !== tierId
                      ),
                    }
                  : profile
              ),
            })),

          // Fund Expense actions
          addFundExpense: (expense: FundExpense) =>
            set((state) => ({
              fundExpenses: [...state.fundExpenses, expense],
            })),

          updateFundExpense: (id: string, patch: Partial<FundExpense>) =>
            set((state) => ({
              fundExpenses: state.fundExpenses.map((existingExpense: FundExpense) =>
                existingExpense.id === id ? { ...existingExpense, ...patch } : existingExpense
              ),
            })),

          removeFundExpense: (id: string) =>
            set((state) => ({
              fundExpenses: state.fundExpenses.filter(
                (existingExpense: FundExpense) => existingExpense.id !== id
              ),
            })),

          // Capital Plan actions (Step 3)
          setCapitalStageAllocations: (rows: CapitalStageAllocation[]) =>
            set({ capitalStageAllocations: rows }),

          setCapitalPlanAllocations: (rows: CapitalPlanAllocation[]) =>
            set({ capitalPlanAllocations: rows }),

          addCapitalPlanAllocation: (allocation: CapitalPlanAllocation) =>
            set((state) => ({
              capitalPlanAllocations: [...state.capitalPlanAllocations, allocation],
            })),

          updateCapitalPlanAllocation: (id: string, patch: Partial<CapitalPlanAllocation>) =>
            set((state) => ({
              capitalPlanAllocations: state.capitalPlanAllocations.map(
                (a: CapitalPlanAllocation) => (a.id === id ? { ...a, ...patch } : a)
              ),
            })),

          removeCapitalPlanAllocation: (id: string) =>
            set((state) => ({
              capitalPlanAllocations: state.capitalPlanAllocations.filter(
                (a: CapitalPlanAllocation) => a.id !== id
              ),
            })),

          setPipelineProfiles: (profiles: PipelineProfile[]) => set({ pipelineProfiles: profiles }),

          addStage: () =>
            set((state) => {
              // Invalidate cache when stages change
              cachedStagesState = null;
              cachedValidationResult = null;

              const id = generateStableId();
              const next = [...state.stages, { id, name: '', graduate: 0, exit: 0, months: 12 }];
              return { stages: enforceLast(next) };
            }),

          removeStage: (idx: number) =>
            set((state) => {
              // Invalidate cache when stages change
              cachedStagesState = null;
              cachedValidationResult = null;

              const next = state.stages.filter((_: StrategyStage, i: number) => i !== idx);
              return { stages: enforceLast(next) };
            }),

          updateStageName: (idx: number, name: string) =>
            set((state) => {
              // Invalidate cache when stages change
              cachedStagesState = null;
              cachedValidationResult = null;

              const stages = [...state.stages];
              if (stages[idx]) {
                stages[idx] = { ...stages[idx], name };
              }
              return { stages };
            }),

          updateStageRate: (
            idx: number,
            patch: Partial<Pick<StrategyStage, 'graduate' | 'exit' | 'months'>>
          ) =>
            set((state) => {
              // Invalidate cache when stages change
              cachedStagesState = null;
              cachedValidationResult = null;

              const stages: StrategyStage[] = [...state.stages];
              const r = stages[idx];
              if (!r) return state;

              const isLast = idx === stages.length - 1;
              const gradRaw = isLast ? 0 : clampPct(patch.graduate ?? r.graduate);
              const exitRaw = clampPct(patch.exit ?? r.exit);
              const months = clampInt(patch.months ?? r.months, 1, 120);

              const [graduate, exit] = allocate100(gradRaw, exitRaw);
              stages[idx] = { ...r, graduate, exit, months };

              // Re-enforce last rule in case stages changed earlier
              const lastIdx = stages.length - 1;
              if (lastIdx >= 0 && stages[lastIdx]?.graduate !== 0) {
                stages[lastIdx] = { ...stages[lastIdx]!, graduate: 0 };
              }

              return { stages };
            }),

          stageValidation: (): { allValid: boolean; errorsByRow: (string | null)[] } => {
            const { stages } = get();

            // Return cached result if stages haven't changed
            if (cachedStagesState === stages && cachedValidationResult) {
              return cachedValidationResult;
            }

            // Compute new validation result
            const errors = stages.map((r: StrategyStage, i: number) => {
              if (!r.name?.trim()) return 'Stage name required';
              if (r.graduate + r.exit > 100) return 'Graduate + Exit must be ≤ 100%';
              if (i === stages.length - 1 && r.graduate !== 0)
                return 'Last stage must have 0% graduation';
              return null;
            });

            const result = {
              allValid: errors.every((e: string | null) => !e),
              errorsByRow: errors,
            };

            // Cache the result
            cachedStagesState = stages;
            cachedValidationResult = result;

            return result;
          },

          // Conversion utilities to work with existing InvestmentStrategy type
          toInvestmentStrategy: (): InvestmentStrategy => {
            const { stages, sectorProfiles, allocations } = get();
            return {
              stages: stages.map((s: StrategyStage) => ({
                id: s.id,
                name: s.name,
                graduationRate: s.graduate,
                exitRate: s.exit,
              })),
              sectorProfiles,
              allocations,
            };
          },

          fromInvestmentStrategy: (strategy: InvestmentStrategy) =>
            set((state: FundState) => {
              const prevRaw = {
                stages: state.stages,
                sectorProfiles: state.sectorProfiles,
                allocations: state.allocations,
              };

              // Quick identity fast-path for trivial no-ops
              // Cast to unknown first for safe comparison of potentially different array element types
              if (
                (strategy.stages as unknown) === (state.stages as unknown) &&
                strategy.sectorProfiles === state.sectorProfiles &&
                strategy.allocations === state.allocations
              ) {
                return state; // no-op, no notify
              }

              // Canonicalize PREV through the same pipeline (cheap; mostly reuses refs)
              // Create InvestmentStrategy-compatible input from internal StrategyStage format
              const prevAsStrategy: InvestmentStrategy = {
                stages: prevRaw.stages.map((s) => ({
                  id: s.id,
                  name: s.name,
                  graduationRate: s.graduate,
                  exitRate: s.exit,
                })),
                sectorProfiles: prevRaw.sectorProfiles,
                allocations: prevRaw.allocations,
              };
              const prevCanonical = canonicalizeStrategyInput(prevAsStrategy, prevRaw);

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
            }),
        }),
        {
          name: 'investment-strategy',
          version: 2,
          partialize: (s: FundState) => ({
            // Only persist primitive inputs
            stages: s.stages.map((r: StrategyStage) => ({
              id: r.id,
              name: r.name,
              graduate: r.graduate,
              exit: r.exit,
              months: r.months,
            })),
            sectorProfiles: s.sectorProfiles,
            allocations: s.allocations,
            followOnChecks: s.followOnChecks,
            capitalStageAllocations: s.capitalStageAllocations,
            capitalPlanAllocations: s.capitalPlanAllocations,
            modelVersion: 'reserves-ev1',
          }),
          migrate: (persistedState: unknown, from: number) => {
            // Type guard for persisted state shape
            const state = persistedState as { stages?: Array<{ months?: number }> };
            if (from < 2) {
              state.stages = (state.stages ?? []).map((r: { months?: number }) => ({
                months: 12,
                ...r,
              }));
            }
            return state;
          },
          onRehydrateStorage: () => (_state: FundState | undefined, err: unknown) => {
            if (err) console.error('[fund-store] rehydrate error', err);
            // Flip on next microtask so subscribers see the final rehydrated values
            Promise.resolve().then(() => fundStore.getState().setHydrated(true));
          },
        }
      ),
      {
        name: 'fund-store',
      }
    )
  );
}

// HMR-safe store creation with Vite's hot data bucket
// Note: import.meta.hot is typed in vite/client, but we need to handle the optional chaining
const hotData = import.meta.hot?.data as HotData | undefined;
const store = hotData?.fundStore ?? createFundStore();

if (import.meta.hot) {
  import.meta.hot.dispose((data: HotData) => {
    data.fundStore = store;
  });
}

export const fundStore = store;

// Export factory for test isolation
export const __createIsolatedFundStore = createFundStore;
export const __canonicalizeStrategyInput = canonicalizeStrategyInput;

// Dev-only store tracer for debugging state updates
if (import.meta.env.DEV && import.meta.env['VITE_WIZARD_DEBUG'] === '1') {
  fundStore.subscribe((state: FundState, prev: FundState) => {
    const changed: string[] = [];
    if (state.hydrated !== prev.hydrated) changed.push('hydrated');
    if (state.stages !== prev.stages) changed.push('stages');
    if (state.sectorProfiles !== prev.sectorProfiles) changed.push('sectorProfiles');
    if (state.pipelineProfiles !== prev.pipelineProfiles) changed.push('pipelineProfiles');
    if (state.allocations !== prev.allocations) changed.push('allocations');
    if (state.followOnChecks !== prev.followOnChecks) changed.push('followOnChecks');
    if (changed.length) {
      console.debug('[fund-store publish]', changed.join(','), {
        changed,
        timestamp: new Date().toISOString(),
        perf: Math.round(performance.now()),
      });
    }
  });
}
