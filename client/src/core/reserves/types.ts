/**
 * Canonical type definitions for the reserves calculation engine
 * These types provide a single source of truth for data flowing through the engine
 */

// Import canonical stage types from shared schemas
import type { CanonicalStage } from '@shared/schemas/stage';
import { normalizeStage, toNoSeparatorStage } from '@shared/schemas/stage';

// Re-export canonical utilities
export { normalizeStage, toNoSeparatorStage };

/**
 * @deprecated Use CanonicalStage from '@shared/schemas/stage' for new code.
 * This type alias maintains backward compatibility with existing no-separator format.
 */
export type Stage = 'preseed' | 'seed' | 'series_a' | 'series_b' | 'series_c' | 'series_dplus';

// Export canonical type for new code
export type { CanonicalStage };

// Engine input types that match what ConstrainedReserveEngine expects
export interface EngineCompany {
  id: string;
  name: string;
  stage: Stage;
  invested: number;      // Amount already invested (in dollars)
  ownership: number;     // Current ownership percentage (0..1)
  reserveCap?: number;   // Optional cap on reserves for this company
}

export interface EngineStagePolicy {
  stage: Stage;
  reserveMultiple: number;  // Multiple of initial investment to reserve
  weight: number;           // Relative weight for this stage (default 1)
}

export interface EngineConstraints {
  minCheck?: number;
  maxPerCompany?: number;
  maxPerStage?: Record<string, number>;
  discountRateAnnual?: number;
  graduationYears?: Record<string, number>;
  graduationProb?: Record<string, number>;
}

export interface EngineInput {
  companies: EngineCompany[];
  availableReserves: number;
  stagePolicies: EngineStagePolicy[];
  constraints?: EngineConstraints;
}

// Engine output types matching what ConstrainedReserveEngine returns
export interface EngineAllocation {
  id: string;
  name: string;
  stage: Stage;
  allocated: number;  // Amount allocated in dollars
}

export interface EngineResult {
  allocations: EngineAllocation[];
  totalAllocated: number;
  remaining: number;
  conservationOk: boolean;
}

// Type guards for runtime validation
export function isValidStage(stage: string): stage is Stage {
  const validStages: Stage[] = ['preseed', 'seed', 'series_a', 'series_b', 'series_c', 'series_dplus'];
  return validStages.includes(stage as Stage);
}

export function isRawCompany(obj: any): obj is {
  id: any;
  name?: any;
  stage: any;
  invested?: any;
  ownership?: any;
  allocated?: any;
  reserveCap?: any;
} {
  return obj && 
         typeof obj === 'object' &&
         obj.id != null &&
         obj.stage != null;
}

export function isRawStagePolicy(obj: any): obj is {
  stage: any;
  reserveMultiple?: any;
  weight?: any;
  reserve_ratio?: any;
  max_check_size_cents?: any;
  maxInvestment?: any;
} {
  return obj && 
         typeof obj === 'object' &&
         obj.stage != null;
}

/**
 * @deprecated Use normalizeStage from '@shared/schemas/stage' (re-exported above).
 * This local implementation is removed - use the canonical version instead.
 *
 * For Stage (legacy no-separator format), use:
 *   import { normalizeStage, toNoSeparatorStage } from '@shared/schemas/stage';
 *   const canonicalStage = normalizeStage(stageStr);
 *   const legacyStage = toNoSeparatorStage(canonicalStage);
 */