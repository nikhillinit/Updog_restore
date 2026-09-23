import { createStore } from 'zustand/vanilla';
import { createJSONStorage, devtools, persist, type StateStorage } from 'zustand/middleware';
import { allocate100 } from '../core/utils/allocate100';
import { clampPct, clampInt } from '../lib/coerce';
import { sortById, normalizeNumber, eq } from '../utils/state-utils';
import dequal from 'fast-deep-equal';
import {
  FundWorkspaceEnvelopeSchema,
  FundWorkspaceIdentitySchema,
} from '../schemas/fund-workspace-schema';
import type { SectorProfile, Allocation, InvestmentStrategy } from '@shared/types';
import type { EconomicsAssumptionsV1 } from '@shared/contracts/economics-v1.contract';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';

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

export type DraftSyncStatus =
  'idle' | 'hydrating' | 'saving' | 'synced' | 'stale' | 'uncertain' | 'error';

export type FundWorkflowOperation = 'create' | 'save_draft' | 'finalize' | 'publish_draft';

/** An immutable dispatched command whose outcome is not yet acknowledged. */
export type PendingFundCommand = {
  operation: FundWorkflowOperation;
  key: string;
  targetFundId: number | null;
  expectedETag: string | null;
  /** Exact JSON of the dispatched body, replayed with its original key and revision. */
  bodySignature: string;
  dispatchedAt: string;
};

export const FUND_WORKSPACE_STORAGE_KEY = 'fund-workspace-session';
export const FUND_WORKSPACE_ENVELOPE = 'fund-workspace/1';

export type FundState = {
  // Hydration flag
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  // Canonical fund identity once the routed wizard has bootstrapped a server draft.
  draftFundId: number | null;
  setDraftFundId: (fundId: number | null) => void;
  // True once the server has an authoritative draft snapshot for draftFundId.
  draftServerReady: boolean;
  setDraftServerReady: (ready: boolean) => void;
  // Persisted fence: local values were discarded and must be replaced from the server.
  needsServerHydration: boolean;
  // Actor whose recovery this tab session belongs to; never hydrate another actor's envelope.
  workspaceActorId: string | null;
  // Raw role of the bound actor (transient; early guidance only, never a server check).
  workspaceActorRole: string | null;
  // One local construction session per tab; callbacks fence on it.
  sessionId: string;
  // UUID reserved for POST /api/funds; reused on retry so replay returns the same fund.
  creationKey: string | null;
  reserveCreationKey: () => string;
  // Acknowledged strong ETag of draftFundId's current revision.
  draftETag: string | null;
  setDraftETag: (etag: string | null) => void;
  draftSyncStatus: DraftSyncStatus;
  setDraftSyncStatus: (status: DraftSyncStatus) => void;
  pendingCommand: PendingFundCommand | null;
  beginCommand: (command: Omit<PendingFundCommand, 'dispatchedAt'>) => void;
  resolveCommand: () => void;
  // sessionStorage rejected the last envelope write; changes are only in this tab.
  persistenceFailed: boolean;
  // Reset every editable field and mint a fresh session/creation identity.
  startNewFundSession: () => void;
  // Fresh session bound to an existing server draft; the sync hook hydrates it.
  resumeServerDraft: (fundId: number) => void;

  // Fund Basics
  fundName?: string;
  establishmentDate?: string; // ISO date string for fund establishment
  modelInputsAsOfDate?: string; // Owner-asserted YYYY-MM-DD input provenance
  vintageYear?: number; // Derived from establishment date
  isEvergreen?: boolean;
  fundLife?: number;
  investmentPeriod?: number;
  fundSize?: number;
  managementFeeRate?: number;
  carriedInterest?: number;

  // Capital Structure
  gpCommitment?: number;
  /** Ratio from 0 to 1 of GP commitment satisfied through non-cash fee offsets. */
  fundedFromFeesPct: number;
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
  waterfallType?: 'american' | 'hybrid';
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

  // Experimental GP economics assumptions
  economicsAssumptions?: EconomicsAssumptionsV1 | undefined;

  // No editor yet; carried so full-replace draft writes never drop server values.
  targetMetrics?: FundDraftWriteV1['targetMetrics'] | undefined;

  // Fund Basics actions
  updateFundBasics: (
    patch: Partial<
      Pick<
        FundState,
        | 'fundName'
        | 'establishmentDate'
        | 'modelInputsAsOfDate'
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
  updateCapitalStructure: (
    patch: Partial<Pick<FundState, 'gpCommitment' | 'fundedFromFeesPct'>>
  ) => void;
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

  // Experimental GP economics actions
  updateEconomicsAssumptions: (economicsAssumptions?: EconomicsAssumptionsV1) => void;

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

const generateStableId = (): string => crypto.randomUUID();

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
    | 'modelInputsAsOfDate'
    | 'vintageYear'
    | 'isEvergreen'
    | 'fundLife'
    | 'investmentPeriod'
    | 'fundSize'
    | 'managementFeeRate'
    | 'carriedInterest'
  >
>;
type CapitalStructurePatch = Partial<Pick<FundState, 'gpCommitment' | 'fundedFromFeesPct'>>;
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

const resolveTrimmedText = (value: string | undefined, fallback: string | undefined): string =>
  value?.trim() ?? fallback ?? '';

const resolveText = (value: string | undefined, fallback: string | undefined): string =>
  value ?? fallback ?? '';

const resolveNumber = (value: number | undefined, fallback: number | undefined): number =>
  normalizeNumber(value ?? fallback ?? 0);

const sectorProfileUnchanged = (
  previous: SectorProfile | undefined,
  profile: SectorProfile
): previous is SectorProfile =>
  Boolean(
    previous &&
    previous.name === profile.name &&
    eq(previous.targetPercentage, profile.targetPercentage) &&
    previous.description === profile.description
  );

function normalizeSectorProfile(
  sp: SectorProfile,
  previous: SectorProfile | undefined
): SectorProfile {
  const profile = {
    id: sp.id,
    name: resolveTrimmedText(sp.name, previous?.name),
    targetPercentage: resolveNumber(sp.targetPercentage, previous?.targetPercentage),
    description: resolveText(sp.description, previous?.description),
  };

  if (sectorProfileUnchanged(previous, profile)) {
    return previous;
  }

  return { ...profile, targetPercentage: clampPct(profile.targetPercentage) };
}

const resolveAllocationPercentage = (
  allocation: FlexibleAllocationInput,
  previous: Allocation | undefined
): number => resolveNumber(allocation.percentage ?? allocation.percent, previous?.percentage);

const resolveAllocationId = (
  allocation: FlexibleAllocationInput,
  previous: Allocation | undefined
): string => allocation.id ?? previous?.id ?? generateStableId();

const allocationUnchanged = (
  previous: Allocation | undefined,
  allocation: Allocation
): previous is Allocation =>
  Boolean(
    previous &&
    previous.category === allocation.category &&
    eq(previous.percentage, allocation.percentage) &&
    previous.description === allocation.description
  );

function normalizeAllocation(a: Allocation, previous: Allocation | undefined): Allocation {
  const flexAlloc = a as FlexibleAllocationInput;
  const allocation = {
    id: resolveAllocationId(flexAlloc, previous),
    category: resolveTrimmedText(a.category, previous?.category),
    percentage: resolveAllocationPercentage(flexAlloc, previous),
    description: resolveText(a.description, previous?.description),
  };

  if (allocationUnchanged(previous, allocation)) {
    return previous;
  }

  return { ...allocation, percentage: clampPct(allocation.percentage) };
}

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
  const normSectorProfiles = (next.sectorProfiles ?? prev.sectorProfiles)
    .map((sp) => normalizeSectorProfile(sp, prevSPById['get'](sp.id)))
    .sort(sortById);

  // 3) Allocations: normalize % (handle both "percent" and "percentage"), reuse when same (ID-based matching)
  const prevAllocById = new Map(prev.allocations.map((a) => [a.id, a]));
  const normAllocations = (next.allocations ?? prev.allocations)
    .map((a) => normalizeAllocation(a, prevAllocById['get'](a.id)))
    .sort(sortById);

  return {
    stages: finalStages,
    sectorProfiles: normSectorProfiles,
    allocations: normAllocations,
  };
}

type FundData = Pick<
  FundState,
  | 'fundName'
  | 'establishmentDate'
  | 'modelInputsAsOfDate'
  | 'vintageYear'
  | 'isEvergreen'
  | 'fundLife'
  | 'investmentPeriod'
  | 'fundSize'
  | 'managementFeeRate'
  | 'carriedInterest'
  | 'gpCommitment'
  | 'fundedFromFeesPct'
  | 'lpClasses'
  | 'lps'
  | 'stages'
  | 'sectorProfiles'
  | 'allocations'
  | 'followOnChecks'
  | 'capitalStageAllocations'
  | 'capitalPlanAllocations'
  | 'pipelineProfiles'
  | 'waterfallType'
  | 'waterfallTiers'
  | 'recyclingEnabled'
  | 'recyclingType'
  | 'recyclingCap'
  | 'recyclingPeriod'
  | 'exitRecyclingRate'
  | 'mgmtFeeRecyclingRate'
  | 'allowFutureRecycling'
  | 'feeProfiles'
  | 'fundExpenses'
  | 'economicsAssumptions'
  | 'targetMetrics'
>;

const FUND_DATA_KEYS = [
  'fundName',
  'establishmentDate',
  'modelInputsAsOfDate',
  'vintageYear',
  'isEvergreen',
  'fundLife',
  'investmentPeriod',
  'fundSize',
  'managementFeeRate',
  'carriedInterest',
  'gpCommitment',
  'fundedFromFeesPct',
  'lpClasses',
  'lps',
  'stages',
  'sectorProfiles',
  'allocations',
  'followOnChecks',
  'capitalStageAllocations',
  'capitalPlanAllocations',
  'pipelineProfiles',
  'waterfallType',
  'waterfallTiers',
  'recyclingEnabled',
  'recyclingType',
  'recyclingCap',
  'recyclingPeriod',
  'exitRecyclingRate',
  'mgmtFeeRecyclingRate',
  'allowFutureRecycling',
  'feeProfiles',
  'fundExpenses',
  'economicsAssumptions',
  'targetMetrics',
] as const satisfies readonly (keyof FundData)[];

type FundIdentity = Pick<
  FundState,
  | 'workspaceActorId'
  | 'sessionId'
  | 'creationKey'
  | 'draftFundId'
  | 'draftServerReady'
  | 'needsServerHydration'
  | 'draftETag'
  | 'pendingCommand'
>;

/** Versioned, actor-scoped sessionStorage envelope: every editable field plus identity. */
export type FundWorkspaceEnvelope = FundData &
  FundIdentity & { envelope: typeof FUND_WORKSPACE_ENVELOPE };

function createDefaultData(): FundData {
  return {
    // Fund Basics defaults
    // Note: undefined optional fields are omitted per exactOptionalPropertyTypes
    isEvergreen: false,

    // Capital Structure defaults
    fundedFromFeesPct: 0,
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
    economicsAssumptions: undefined,
  };
}

function freshIdentity(actorId: string | null): FundIdentity {
  return {
    workspaceActorId: actorId,
    sessionId: generateStableId(),
    creationKey: null,
    draftFundId: null,
    draftServerReady: false,
    needsServerHydration: false,
    draftETag: null,
    pendingCommand: null,
  };
}

export function toFundWorkspaceEnvelope(state: FundState): FundWorkspaceEnvelope {
  const data = {} as FundData;
  for (const key of FUND_DATA_KEYS) {
    if (state[key] !== undefined) (data as Record<string, unknown>)[key] = state[key];
  }
  return {
    envelope: FUND_WORKSPACE_ENVELOPE,
    ...data,
    workspaceActorId: state.workspaceActorId,
    sessionId: state.sessionId,
    creationKey: state.creationKey,
    draftFundId: state.draftFundId,
    draftServerReady: state.draftServerReady,
    needsServerHydration: state.needsServerHydration,
    draftETag: state.draftETag,
    pendingCommand: state.pendingCommand,
  };
}

/** Explicit session identity plus unnamed edits recovered from older envelopes. */
export function hasFundWorkspaceSession(state: FundState): boolean {
  if (state.creationKey != null || state.pendingCommand != null || state.draftFundId != null) {
    return true;
  }
  const defaults = fundStore.getInitialState();
  const stageValues = ({ id: _id, ...values }: StrategyStage) => values;
  return FUND_DATA_KEYS.some((key) =>
    key === 'stages'
      ? !dequal(state.stages.map(stageValues), defaults.stages.map(stageValues))
      : !dequal(state[key], defaults[key])
  );
}

export function isFundWorkspaceEnvelope(value: unknown): value is FundWorkspaceEnvelope {
  return FundWorkspaceEnvelopeSchema.safeParse(value).success;
}

// Actor bound by the authenticated shell. Envelopes are only read or written for it.
let expectedActorId: string | null = null;
let actorBindingVersion = 0;

// ponytail: drop writes while no actor is bound so a fresh in-memory state never
// clobbers the stored envelope before rehydration; surface quota/security failures.
const guardedSessionStorage: StateStorage = {
  getItem: (name) => {
    try {
      return sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (expectedActorId === null) return;
    let failed = false;
    try {
      sessionStorage.setItem(name, value);
    } catch {
      failed = true;
    }
    if (fundStore.getState().persistenceFailed !== failed) {
      fundStore.setState({ persistenceFailed: failed });
    }
  },
  removeItem: (name) => {
    try {
      sessionStorage.removeItem(name);
    } catch {
      // nothing to remove
    }
  },
};

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
          draftFundId: null,
          setDraftFundId: (fundId: number | null) => set({ draftFundId: fundId }),
          draftServerReady: false,
          setDraftServerReady: (ready: boolean) => set({ draftServerReady: ready }),
          needsServerHydration: false,
          workspaceActorId: null,
          workspaceActorRole: null,
          sessionId: generateStableId(),
          creationKey: null,
          reserveCreationKey: () => {
            const existing = get().creationKey;
            if (existing) return existing;
            const creationKey = generateStableId();
            set({ creationKey });
            return creationKey;
          },
          draftETag: null,
          setDraftETag: (draftETag: string | null) => set({ draftETag }),
          draftSyncStatus: 'idle',
          setDraftSyncStatus: (draftSyncStatus: DraftSyncStatus) => set({ draftSyncStatus }),
          pendingCommand: null,
          beginCommand: (command) =>
            set({ pendingCommand: { ...command, dispatchedAt: new Date().toISOString() } }),
          resolveCommand: () =>
            set((state) => ({
              pendingCommand: null,
              needsServerHydration: state.needsServerHydration && state.draftFundId !== null,
            })),
          persistenceFailed: false,
          resumeServerDraft: (fundId: number) =>
            set(
              (state) =>
                ({
                  ...pickActions(state),
                  ...createDefaultData(),
                  ...freshIdentity(state.workspaceActorId),
                  workspaceActorRole: state.workspaceActorRole,
                  draftFundId: fundId,
                  draftServerReady: true,
                  hydrated: true,
                  draftSyncStatus: 'idle',
                  persistenceFailed: state.persistenceFailed,
                }) as FundState,
              true
            ),
          startNewFundSession: () =>
            set(
              (state) =>
                ({
                  ...pickActions(state),
                  ...createDefaultData(),
                  ...freshIdentity(state.workspaceActorId),
                  workspaceActorRole: state.workspaceActorRole,
                  creationKey: generateStableId(),
                  hydrated: true,
                  draftSyncStatus: 'idle',
                  persistenceFailed: state.persistenceFailed,
                }) as FundState,
              true
            ),

          ...createDefaultData(),

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

          updateEconomicsAssumptions: (economicsAssumptions?: EconomicsAssumptionsV1) =>
            set({ economicsAssumptions }),

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
          name: FUND_WORKSPACE_STORAGE_KEY,
          version: 1,
          storage: createJSONStorage(() => guardedSessionStorage),
          partialize: (state: FundState) => toFundWorkspaceEnvelope(state),
          merge: (persisted: unknown, current: FundState): FundState => {
            if (expectedActorId === null) return current;
            const full = FundWorkspaceEnvelopeSchema.safeParse(persisted);
            if (full.success) {
              if (full.data.workspaceActorId !== expectedActorId) return current;
              const { envelope: _envelope, ...data } = full.data as FundWorkspaceEnvelope;
              return { ...current, ...data };
            }
            // Invalid form values must not cost an unsettled command its key:
            // keep identity, drop the values (a server-ready draft re-hydrates).
            const identity = FundWorkspaceIdentitySchema.safeParse(persisted);
            if (!identity.success || identity.data.workspaceActorId !== expectedActorId) {
              return current;
            }
            console.warn('[fund-store] discarded invalid workspace values', {
              paths: full.error.issues.map((issue) => issue.path.join('.')),
            });
            const { envelope: _envelope, ...recovered } = identity.data;
            return {
              ...current,
              ...recovered,
              needsServerHydration:
                recovered.draftFundId !== null || recovered.pendingCommand !== null,
            };
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

function pickActions(state: FundState): Partial<FundState> {
  const actions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'function') actions[key] = value;
  }
  return actions as Partial<FundState>;
}

/**
 * Bind the authenticated actor and load that actor's tab envelope. A different
 * previous actor fences and clears the session first; nothing from another
 * actor is ever hydrated.
 */
export async function bindFundWorkspaceActor(
  actorId: string,
  role: string | null = null
): Promise<void> {
  const bindingVersion = ++actorBindingVersion;
  const previous = expectedActorId;
  if (previous !== null && previous !== actorId) resetFundWorkspace();
  expectedActorId = actorId;
  await fundStore.persist.rehydrate();
  if (bindingVersion !== actorBindingVersion || expectedActorId !== actorId) return;
  const state = fundStore.getState();
  if (state.workspaceActorId !== actorId || state.workspaceActorRole !== role) {
    fundStore.setState({ workspaceActorId: actorId, workspaceActorRole: role, hydrated: true });
  }
}

/** Fence outstanding bindings and erase the signed-out actor's tab state. */
export function unbindFundWorkspaceActor(): void {
  actorBindingVersion++;
  expectedActorId = null;
  resetFundWorkspace();
  fundStore.setState({ workspaceActorRole: null });
}

/** Clear every local field and the stored envelope for this tab. */
export function resetFundWorkspace(): void {
  const state = fundStore.getState();
  fundStore.setState(
    {
      ...pickActions(state),
      ...createDefaultData(),
      ...freshIdentity(expectedActorId),
      workspaceActorRole: state.workspaceActorRole,
      hydrated: true,
      draftSyncStatus: 'idle',
      persistenceFailed: false,
    } as FundState,
    true
  );
  guardedSessionStorage.removeItem(FUND_WORKSPACE_STORAGE_KEY);
}

/**
 * Key for a command. The pending command's key is reused only for the same
 * operation, target, body and revision (an uncertain or retry-requested outcome); any
 * other attempt is a new command with a new key.
 */
export function fundCommandKey(
  operation: FundWorkflowOperation,
  targetFundId: number | null,
  bodySignature: string,
  expectedETag: string | null = null
): string {
  const pending = fundStore.getState().pendingCommand;
  if (
    pending &&
    pending.operation === operation &&
    pending.targetFundId === targetFundId &&
    pending.bodySignature === bodySignature &&
    pending.expectedETag === expectedETag
  ) {
    return pending.key;
  }
  return generateStableId();
}

export const FUND_COMMAND_STORAGE_MESSAGE =
  'Changes are only in this tab. Storage is unavailable, so saving is paused.';
export const FUND_DRAFT_HYDRATION_MESSAGE =
  'Recover the saved draft before starting another write.';

/** Persist before dispatch; unresolved commands always replay their exact request. */
export function prepareFundCommand<T>(
  operation: FundWorkflowOperation,
  targetFundId: number | null,
  payload: T,
  etag: string | null
): { payload: T; key: string; etag: string | null } {
  const state = fundStore.getState();
  const pending = state.pendingCommand;
  if (pending && (pending.operation !== operation || pending.targetFundId !== targetFundId)) {
    throw new Error('Check the pending command status before starting another command.');
  }
  if (state.needsServerHydration && !pending) {
    throw new Error(FUND_DRAFT_HYDRATION_MESSAGE);
  }
  const bodySignature = pending?.bodySignature ?? JSON.stringify(payload);
  const key =
    pending?.key ??
    (operation === 'create'
      ? state.reserveCreationKey()
      : fundCommandKey(operation, targetFundId, bodySignature, etag));
  const expectedETag = pending ? pending.expectedETag : etag;
  const originalPayload = JSON.parse(bodySignature) as T;
  state.beginCommand({ operation, targetFundId, key, expectedETag, bodySignature });
  if (fundStore.getState().persistenceFailed) {
    // Never dispatched and never stored: release it. A pre-existing command was
    // stored when first dispatched, so its outcome stays unsettled.
    if (!pending) fundStore.getState().resolveCommand();
    throw new Error(FUND_COMMAND_STORAGE_MESSAGE);
  }
  return { payload: originalPayload, key, etag: expectedETag };
}

/** Test seam: bound actor lookup. */
export function __getBoundFundWorkspaceActor(): string | null {
  return expectedActorId;
}

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
      console.warn('[fund-store publish]', changed.join(','), {
        changed,
        timestamp: new Date().toISOString(),
        perf: Math.round(performance.now()),
      });
    }
  });
}
