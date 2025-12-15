/**
 * Capital Allocation Truth Case Adapter
 *
 * Maps truth case JSON structure to production function signatures.
 * Follows semantic lock specification at docs/CA-SEMANTIC-LOCK.md
 *
 * @see docs/capital-allocation.truth-cases.json
 * @see docs/CA-SEMANTIC-LOCK.md
 */

// ============================================================================
// Truth Case Types (from JSON schema)
// ============================================================================

export interface CATruthCase {
  id: string;
  module: 'CapitalAllocation';
  category: 'reserve_engine' | 'pacing_engine' | 'cohort_engine' | 'integration';
  description: string;
  inputs: CATruthCaseInputs;
  expected: CATruthCaseExpected;
  notes: string;
  schemaVersion: string;
}

export interface CATruthCaseInputs {
  fund: {
    commitment: number;
    target_reserve_pct: number;
    reserve_policy: 'static_pct' | 'dynamic_ratio';
    pacing_window_months: number;
    vintage_year: number;
  };
  timeline: {
    start_date: string;
    end_date: string;
  };
  flows: {
    contributions: Array<{
      date: string;
      amount: number;
    }>;
    distributions: Array<{
      date: string;
      amount: number;
      recycle_eligible?: boolean;
    }>;
  };
  constraints: {
    min_cash_buffer: number;
    rebalance_frequency: 'monthly' | 'quarterly' | 'annual';
    max_allocation_per_cohort?: number;
  };
  cohorts?: Array<{
    name: string;
    start_date: string;
    end_date: string;
    weight: number;
  }>;
}

export interface CATruthCaseExpected {
  reserve_balance: number;
  allocations_by_cohort: Array<{
    cohort: string;
    amount: number;
  }>;
  violations: string[];
  // Optional fields for more complex cases
  reserve_balance_over_time?: Array<{
    date: string;
    balance: number;
  }>;
  pacing_targets_by_period?: Array<{
    period: string;
    target: number;
  }>;
}

// ============================================================================
// Production Engine Types (to be created in client/src/core/capitalAllocation/)
// ============================================================================

export interface CAEngineInput {
  fund: {
    commitmentCents: number;
    targetReservePct: number;
    reservePolicy: 'static_pct' | 'dynamic_ratio';
    pacingWindowMonths: number;
    vintageYear: number;
  };
  timeline: {
    startDate: string;
    endDate: string;
  };
  flows: {
    contributions: Array<{
      date: string;
      amountCents: number;
    }>;
    distributions: Array<{
      date: string;
      amountCents: number;
      recycleEligible: boolean;
    }>;
  };
  constraints: {
    minCashBufferCents: number;
    rebalanceFrequency: 'monthly' | 'quarterly' | 'annual';
    maxAllocationPerCohortCents?: number;
  };
  cohorts: Array<{
    name: string;
    id: string;
    startDate: string;
    endDate: string;
    weightBps: number; // Basis points (0-10000000 for 1e7 scale)
  }>;
}

export interface CAEngineOutput {
  reserveBalanceCents: number;
  allocationsByCohort: Array<{
    cohort: string;
    amountCents: number;
  }>;
  violations: string[];
  // Conservation tracking
  endingCashCents: number;
  effectiveBufferCents: number;
  remainingCapacityCents: number;
}

// ============================================================================
// Unit Inference (per CA-SEMANTIC-LOCK.md Section 3.4)
// ============================================================================

/**
 * Infer unit scale from commitment value.
 * Per semantic lock: commitment < 10,000 assumes $M scale
 */
export function inferUnitScale(commitment: number): number {
  return commitment < 10_000 ? 1_000_000 : 1;
}

/**
 * Convert truth case dollar amount to cents
 */
export function toCents(amount: number, unitScale: number): number {
  return Math.round(amount * unitScale * 100);
}

/**
 * Convert cents back to truth case units for comparison
 */
export function fromCents(cents: number, unitScale: number): number {
  return cents / (unitScale * 100);
}

// ============================================================================
// Weight Normalization (per CA-SEMANTIC-LOCK.md Section 5.3)
// ============================================================================

const WEIGHT_SCALE = 10_000_000; // 1e7 for 7-decimal precision

/**
 * Validate and normalize weights to 1e7 scale basis points.
 * Throws if weights are invalid per semantic lock rules.
 */
export function normalizeWeightsToBps(weights: number[]): number[] {
  // Rule 1: No negative weights
  if (weights.some(w => w < 0)) {
    throw new Error('Cohort weights cannot be negative');
  }

  const sum = weights.reduce((a, b) => a + b, 0);

  // Rule 2: Sum must be positive
  if (sum <= 0) {
    throw new Error('Sum of cohort weights must be positive');
  }

  // Rule 3: Only normalize if within 0.1% tolerance
  const tolerance = 0.001;
  if (Math.abs(sum - 1.0) > tolerance) {
    throw new Error(
      `Cohort weights sum to ${sum}, which differs from 1.0 by more than ${tolerance * 100}%`
    );
  }

  // Normalize to exactly sum=WEIGHT_SCALE
  const rawBps = weights.map(w => Math.round((w / sum) * WEIGHT_SCALE));
  const bpsSum = rawBps.reduce((a, b) => a + b, 0);

  // Adjust last element to ensure exact sum
  if (bpsSum !== WEIGHT_SCALE) {
    rawBps[rawBps.length - 1] += WEIGHT_SCALE - bpsSum;
  }

  return rawBps;
}

// ============================================================================
// Adapter Function
// ============================================================================

/**
 * Adapt truth case JSON to production engine input.
 * Performs unit inference and normalization.
 */
export function adaptCATruthCase(tc: CATruthCase): CAEngineInput {
  const unitScale = inferUnitScale(tc.inputs.fund.commitment);

  // Generate implicit cohort if none provided (per CA-001 pattern)
  const cohorts = tc.inputs.cohorts ?? [
    {
      name: String(tc.inputs.fund.vintage_year),
      start_date: `${tc.inputs.fund.vintage_year}-01-01`,
      end_date: `${tc.inputs.fund.vintage_year}-12-31`,
      weight: 1.0,
    },
  ];

  const weights = cohorts.map(c => c.weight);
  const weightsBps = normalizeWeightsToBps(weights);

  return {
    fund: {
      commitmentCents: toCents(tc.inputs.fund.commitment, unitScale),
      targetReservePct: tc.inputs.fund.target_reserve_pct,
      reservePolicy: tc.inputs.fund.reserve_policy,
      pacingWindowMonths: tc.inputs.fund.pacing_window_months,
      vintageYear: tc.inputs.fund.vintage_year,
    },
    timeline: {
      startDate: tc.inputs.timeline.start_date,
      endDate: tc.inputs.timeline.end_date,
    },
    flows: {
      contributions: tc.inputs.flows.contributions.map(c => ({
        date: c.date,
        amountCents: toCents(c.amount, unitScale),
      })),
      distributions: tc.inputs.flows.distributions.map(d => ({
        date: d.date,
        amountCents: toCents(d.amount, unitScale),
        recycleEligible: d.recycle_eligible ?? false,
      })),
    },
    constraints: {
      minCashBufferCents: toCents(tc.inputs.constraints.min_cash_buffer, unitScale),
      rebalanceFrequency: tc.inputs.constraints.rebalance_frequency,
      maxAllocationPerCohortCents: tc.inputs.constraints.max_allocation_per_cohort
        ? toCents(tc.inputs.constraints.max_allocation_per_cohort, unitScale)
        : undefined,
    },
    cohorts: cohorts.map((c, i) => ({
      name: c.name,
      id: `_implicit_${c.name}`,
      startDate: c.start_date,
      endDate: c.end_date,
      weightBps: weightsBps[i],
    })),
  };
}

/**
 * Convert engine output back to truth case units for comparison.
 */
export function convertOutputToTruthCaseUnits(
  output: CAEngineOutput,
  commitment: number
): CATruthCaseExpected {
  const unitScale = inferUnitScale(commitment);

  return {
    reserve_balance: fromCents(output.reserveBalanceCents, unitScale),
    allocations_by_cohort: output.allocationsByCohort.map(a => ({
      cohort: a.cohort,
      amount: fromCents(a.amountCents, unitScale),
    })),
    violations: output.violations,
  };
}

// ============================================================================
// Loader
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

/**
 * Load all CA truth cases from JSON file.
 */
export function loadCATruthCases(): CATruthCase[] {
  const filePath = path.resolve(__dirname, '../../../docs/capital-allocation.truth-cases.json');
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as CATruthCase[];
}

/**
 * Load a specific truth case by ID.
 */
export function loadCATruthCaseById(id: string): CATruthCase | undefined {
  const cases = loadCATruthCases();
  return cases.find(tc => tc.id === id);
}

/**
 * Check if a truth case should be skipped (e.g., CA-005 deferred).
 */
export function shouldSkipCase(tc: CATruthCase): { skip: boolean; reason?: string } {
  if (tc.id === 'CA-005') {
    return {
      skip: true,
      reason: 'CA-005 deferred to Phase 2 (NAV formula unspecified per CA-SEMANTIC-LOCK.md Section 6)',
    };
  }
  return { skip: false };
}
