/**
 * Capital-first fund modeling with proper follow-on calculations
 * 
 * This addresses several issues with simple "initial check = follow-on check" assumptions:
 * 1. Follow-ons are typically larger than initial checks
 * 2. Follow-on demand must be balanced against initial capital allocation
 * 3. Graduation rates and participation rates affect reserve demand
 * 4. Different follow-on modes (maintain ownership vs fixed checks) have different math
 */

export type StageKey = 'preseed' | 'seed' | 'seriesA' | 'seriesBplus';
export const StageOrder: StageKey[] = ['preseed', 'seed', 'seriesA', 'seriesBplus'];

const nextStage = (s: StageKey): StageKey | null => {
  const i = StageOrder.indexOf(s);
  return i >= 0 && i < StageOrder.length - 1 ? StageOrder[i + 1] ?? null : null;
};

export interface MarketByStage {
  [stage: string]: {
    valuationPost?: number; // Post-money valuation in $
    roundSize?: number;     // Round size in $ for the NEXT round at this stage
  };
}

export type FollowOnMode = 'maintain_ownership' | 'fixed_check';

export interface FollowOnRule {
  from: StageKey;
  to: StageKey;                    // Usually nextStage(from)
  mode: FollowOnMode;
  participationPct: number;        // 0..100 for this transition
  targetOwnershipPct?: number;     // If maintain_ownership and you want a target
  fixedAmount?: number;            // If fixed_check
}

export interface CapitalFirstInputsV2 {
  totalCommitment: number;         // SSOT $ (NOTE: gpCommitmentPct removed - not needed for portfolio calculations)
  feeDragPct: number;              // Simple preview %
  allocationPctByStage: Record<StageKey, number>; // Must sum to 100
  initialCheckByStage: Record<StageKey, number>;  // $
  graduationPctByStage: Record<StageKey, number>; // 0..100 → next stage
  marketByStage: MarketByStage;    // Valuations/round sizes from Sector Profile
  followOnRules: FollowOnRule[];   // Per transition; omit = no FO
}

export interface CapitalFirstResultV2 {
  grossInvestable: number;
  initialInvestmentsByStage: Record<StageKey, number>;
  initialSpendByStage: Record<StageKey, number>;
  followOnSpendByStage: Record<StageKey, number>;
  followOnReserveDemand: number;
  impliedReserveRatioPct: number;
  warnings: string[];
}

/**
 * Compute fund deployment using capital-first approach with proper follow-on modeling
 * 
 * For each stage:
 * - Calculate expected follow-on cost per initial deal
 * - Balance initial count so total spend (initial + follow-ons) fits allocation
 * - This prevents "unused capital" issues common in count-first approaches
 */
export function computeFromCapital_v2(i: CapitalFirstInputsV2): CapitalFirstResultV2 {
  const warn: string[] = [];
  
  // Validation
  const allocSum = Object.values(i.allocationPctByStage).reduce<number>((a, b) => a + b, 0);
  if (Math.abs(allocSum - 100) > 0.01) {
    warn.push('Allocations must sum to 100%.');
  }
  if (i.totalCommitment <= 0) {
    warn.push('Total commitment must be positive.');
  }

  const grossInvestable = Math.max(0, i.totalCommitment * (1 - i.feeDragPct / 100));

  // Build rule lookup
  const ruleMap = new Map<StageKey, FollowOnRule>();
  i.followOnRules.forEach(r => ruleMap.set(r.from, r));

  const initialInvestmentsByStage: Record<StageKey, number> = {
    preseed: 0, seed: 0, seriesA: 0, seriesBplus: 0
  };
  const initialSpendByStage: Record<StageKey, number> = {
    preseed: 0, seed: 0, seriesA: 0, seriesBplus: 0
  };
  const followOnSpendByStage: Record<StageKey, number> = {
    preseed: 0, seed: 0, seriesA: 0, seriesBplus: 0
  };

  // Calculate for each stage
  (StageOrder as StageKey[]).forEach(s => {
    const B_s = grossInvestable * ((i.allocationPctByStage[s] ?? 0) / 100);
    const c_s = Math.max(1, i.initialCheckByStage[s] ?? 0);

    // Transition config
    const rule = ruleMap.get(s);
    const to = rule?.to ?? nextStage(s);
    let g_s = 0;    // Effective graduation × participation (0..1)
    let f_s = 0;    // $ follow-on per graduating deal actually executed

    if (rule && to) {
      const grad = Math.max(0, Math.min(100, i.graduationPctByStage[s] ?? 0)) / 100;
      const part = Math.max(0, Math.min(100, rule.participationPct ?? 0)) / 100;
      g_s = grad * part;

      if (rule.mode === 'fixed_check') {
        f_s = Math.max(0, rule.fixedAmount ?? 0);
      } else { // maintain_ownership
        const valPost = i.marketByStage[s]?.valuationPost ?? 0;
        const impliedOwn = valPost > 0 ? (c_s / valPost) : 0; // Simple post-money ownership
        const ownPct = (rule.targetOwnershipPct ?? (impliedOwn * 100)) / 100;
        const nextRoundSize = i.marketByStage[to]?.roundSize ?? 0;
        f_s = Math.max(0, ownPct) * Math.max(0, nextRoundSize);
        
        if (!valPost || !nextRoundSize) {
          warn.push(`${s}: missing valuation or next round size for maintain_ownership; follow-on may be understated.`);
        }
      }
    }

    // Capital-balanced calculation:
    // Total cost per initial deal = initial check + expected follow-on cost
    const denom = c_s + g_s * f_s;               // $ per initial deal including expected FO
    const n_s = denom > 0 ? (B_s / denom) : 0;   // Fractional count

    initialInvestmentsByStage[s] = n_s;
    initialSpendByStage[s] = n_s * c_s;
    followOnSpendByStage[s] = n_s * g_s * f_s;
  });

  const followOnReserveDemand = Object.values(followOnSpendByStage).reduce<number>((a, b) => a + b, 0);
  const impliedReserveRatioPct = (followOnReserveDemand / Math.max(1, grossInvestable)) * 100;

  return {
    grossInvestable,
    initialInvestmentsByStage,
    initialSpendByStage,
    followOnSpendByStage,
    followOnReserveDemand,
    impliedReserveRatioPct,
    warnings: warn
  };
}

/**
 * Convert fractional counts to nearest whole numbers and calculate surplus/deficit
 * Useful for "Show nearest whole portfolio" toggle
 */
export function roundToNearestWhole(
  counts: Record<StageKey, number>,
  initSpend: Record<StageKey, number>,
  foSpend: Record<StageKey, number>
) {
  const rounded: Record<StageKey, number> = { preseed: 0, seed: 0, seriesA: 0, seriesBplus: 0 };
  const surplusByStage: Record<StageKey, number> = { preseed: 0, seed: 0, seriesA: 0, seriesBplus: 0 };

  (StageOrder as StageKey[]).forEach(s => {
    const n = counts[s];
    const r = Math.round(n);
    rounded[s] = r;
    
    const perDeal = (n > 0) ? ((initSpend[s] + foSpend[s]) / n) : 0;
    const used = r * perDeal;
    const planned = initSpend[s] + foSpend[s];
    surplusByStage[s] = planned - used; // Positive = you free up $, negative = shortfall
  });

  return { rounded, surplusByStage };
}

/**
 * Validate inputs and return user-friendly error messages
 * Enhanced with defensive validations for zero/negative checks and common edge cases
 */
export function validateCapitalFirstInputs(inputs: CapitalFirstInputsV2): string[] {
  const errors: string[] = [];

  // Basic fund-level validations
  if (inputs.totalCommitment <= 0) {
    errors.push('Total commitment must be positive');
  }

  if (inputs.totalCommitment > 10_000_000_000) { // $10B sanity check
    errors.push('Total commitment seems unusually large (>$10B). Please verify.');
  }

  if (inputs.feeDragPct < 0 || inputs.feeDragPct > 50) {
    errors.push('Fee drag must be between 0% and 50%');
  }

  // Check allocation percentages
  const allocSum = Object.values(inputs.allocationPctByStage).reduce<number>((a, b) => a + b, 0);
  if (Math.abs(allocSum - 100) > 0.01) {
    errors.push(`Allocations must sum to 100% (currently ${allocSum.toFixed(1)}%)`);
  }

  // Defensive validation: Check for non-positive initial checks
  StageOrder.forEach(stage => {
    const check = inputs.initialCheckByStage[stage];
    if (check !== undefined) {
      if (check <= 0) {
        errors.push(`${stage} initial check must be positive (currently ${check})`);
      }
      if (check < 10_000) {
        errors.push(`${stage} initial check seems unusually small (<$10K). Please verify.`);
      }
      if (check > 50_000_000) { // $50M check size
        errors.push(`${stage} initial check seems unusually large (>$50M). Please verify.`);
      }
    }
  });

  // Check graduation percentages with standard portfolio constraints
  StageOrder.forEach((stage, index) => {
    const grad = inputs.graduationPctByStage[stage];
    if (grad !== undefined) {
      if (grad < 0 || grad > 100) {
        errors.push(`${stage} graduation rate must be between 0% and 100%`);
      }
      
      // Last stage must have 0% graduation (standard portfolio constraint)
      if (index === StageOrder.length - 1 && grad !== 0) {
        errors.push(`${stage} (final stage) must have 0% graduation rate`);
      }
    }
  });

  // Validate follow-on rules
  inputs.followOnRules.forEach((rule, index) => {
    if (rule.participationPct < 0 || rule.participationPct > 100) {
      errors.push(`Follow-on rule ${index + 1}: participation rate must be between 0% and 100%`);
    }
    
    if (rule.mode === 'maintain_ownership' && rule.targetOwnershipPct) {
      if (rule.targetOwnershipPct <= 0 || rule.targetOwnershipPct > 50) {
        errors.push(`Follow-on rule ${index + 1}: target ownership must be between 0% and 50%`);
      }
    }
    
    if (rule.mode === 'fixed_check' && rule.fixedAmount) {
      if (rule.fixedAmount <= 0) {
        errors.push(`Follow-on rule ${index + 1}: fixed amount must be positive`);
      }
      if (rule.fixedAmount > 100_000_000) { // $100M follow-on
        errors.push(`Follow-on rule ${index + 1}: fixed amount seems unusually large (>$100M)`);
      }
    }
  });

  // Check for reasonable market data
  StageOrder.forEach(stage => {
    const market = inputs.marketByStage[stage];
    if (market) {
      if (market.valuationPost && market.valuationPost <= 0) {
        errors.push(`${stage} post-money valuation must be positive`);
      }
      if (market.roundSize && market.roundSize <= 0) {
        errors.push(`${stage} round size must be positive`);
      }
      
      // Sanity check: round size vs valuation
      if (market.valuationPost && market.roundSize && market.roundSize > market.valuationPost) {
        errors.push(`${stage} round size cannot exceed post-money valuation`);
      }
    }
  });

  return errors;
}

/**
 * Additional validation specifically for UI blocking
 * Returns true if the configuration has critical errors that prevent calculation
 */
export function hasCriticalErrors(inputs: CapitalFirstInputsV2): boolean {
  if (inputs.totalCommitment <= 0) return true;

  const allocSum = Object.values(inputs.allocationPctByStage).reduce<number>((a, b) => a + b, 0);
  if (Math.abs(allocSum - 100) > 0.01) return true;

  // Check for any non-positive initial checks
  return StageOrder.some(stage => {
    const check = inputs.initialCheckByStage[stage];
    return check !== undefined && check <= 0;
  });
}

/**
 * Enhanced capital-first calculation with balance constraints and demo safety
 * Includes comprehensive error handling and fallback values
 */
export function computeCapitalFirstSafe(inputs: CapitalFirstInputsV2): {
  success: boolean;
  result?: CapitalFirstResultV2;
  error?: string;
  validationErrors?: string[];
} {
  try {
    // Validate inputs first
    const validationErrors = validateCapitalFirstInputs(inputs);
    if (validationErrors.length > 0) {
      return { success: false, validationErrors };
    }

    // Check for critical errors that would break calculations
    if (hasCriticalErrors(inputs)) {
      return {
        success: false,
        error: 'Critical validation errors prevent calculation. Please fix allocation percentages and check sizes.'
      };
    }

    // Run the calculation
    const result = computeFromCapital_v2(inputs);

    // Post-calculation validation
    const hasNaN = Object.values(result.initialInvestmentsByStage).some(v => !Number.isFinite(v));
    if (hasNaN) {
      return {
        success: false,
        error: 'Calculation resulted in invalid numbers. Please check your inputs.'
      };
    }

    // Check for reasonable results
    if (result.impliedReserveRatioPct > 80) {
      result.warnings.push('Reserve ratio is very high (>80%). Consider adjusting follow-on strategies.');
    }

    return { success: true, result };

  } catch (error) {
    console.error('Capital-first calculation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown calculation error'
    };
  }
}

/**
 * Calculate total capital deployed vs budget for balance checking
 * Useful for detecting over-allocation and capital leakage
 */
export function calculateCapitalBalance(result: CapitalFirstResultV2): {
  totalInitialSpend: number;
  totalFollowOnSpend: number;
  totalCapitalDeployed: number;
  utilizationRate: number;
  surplus: number;
} {
  const totalInitialSpend = Object.values(result.initialSpendByStage).reduce<number>((a, b) => a + b, 0);
  const totalFollowOnSpend = Object.values(result.followOnSpendByStage).reduce<number>((a, b) => a + b, 0);
  const totalCapitalDeployed = totalInitialSpend + totalFollowOnSpend;

  const utilizationRate = result.grossInvestable > 0 ?
    (totalCapitalDeployed / result.grossInvestable) * 100 : 0;

  const surplus = result.grossInvestable - totalCapitalDeployed;

  return {
    totalInitialSpend,
    totalFollowOnSpend,
    totalCapitalDeployed,
    utilizationRate,
    surplus
  };
}

/**
 * Generate demo-safe default inputs for rapid prototyping
 * Returns a valid configuration that works out of the box
 */
export function generateDemoInputs(fundSize: number = 15_000_000): CapitalFirstInputsV2 {
  return {
    totalCommitment: fundSize,
    feeDragPct: 12, // Conservative estimate: 2% annual fee over 6 years
    allocationPctByStage: {
      preseed: 25,
      seed: 40,
      seriesA: 30,
      seriesBplus: 5
    },
    initialCheckByStage: {
      preseed: 250_000,
      seed: 500_000,
      seriesA: 1_000_000,
      seriesBplus: 2_000_000
    },
    graduationPctByStage: {
      preseed: 20,
      seed: 35,
      seriesA: 50,
      seriesBplus: 0 // Final stage
    },
    marketByStage: {
      preseed: { valuationPost: 3_000_000, roundSize: 1_500_000 },
      seed: { valuationPost: 8_000_000, roundSize: 5_000_000 },
      seriesA: { valuationPost: 25_000_000, roundSize: 15_000_000 },
      seriesBplus: { valuationPost: 75_000_000, roundSize: 40_000_000 }
    },
    followOnRules: [
      {
        from: 'preseed',
        to: 'seed',
        mode: 'maintain_ownership',
        participationPct: 80,
        targetOwnershipPct: 8
      },
      {
        from: 'seed',
        to: 'seriesA',
        mode: 'fixed_check',
        participationPct: 60,
        fixedAmount: 750_000
      }
    ]
  };
}