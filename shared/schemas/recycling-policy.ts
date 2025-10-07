/**
 * RecyclingPolicy Schema
 * Management fee & exit proceeds recycling
 */

import { z } from 'zod';
import Decimal from 'decimal.js';
import { ZodPositiveDecimal } from './decimal-zod';

/**
 * Recycling sources
 */
export const RecyclingSource = z.enum([
  'management_fees',
  'exit_proceeds',
  'both'
]);

export type RecyclingSource = z.infer<typeof RecyclingSource>;

/**
 * Recycling cap structure
 */
export const RecyclingCapSchema = z.object({
  /** Cap type */
  type: z.enum(['percentage', 'absolute']),

  /** Cap value (percentage or absolute amount) */
  value: ZodPositiveDecimal,

  /** Basis for percentage cap */
  basis: z.enum([
    'committed_capital',
    'called_capital',
    'original_investment'
  ]).default('committed_capital')
});

export type RecyclingCap = z.infer<typeof RecyclingCapSchema>;

/**
 * Recycling term structure
 */
export const RecyclingTermSchema = z.object({
  /** Base term in months */
  months: z.number().int().positive(),

  /** Extension period (months) */
  extensionMonths: z.number().int().min(0).default(0),

  /** Automatic extension if conditions met */
  automaticExtension: z.boolean().default(false)
});

export type RecyclingTerm = z.infer<typeof RecyclingTermSchema>;

/**
 * Recycling timing
 */
export const RecyclingTiming = z.enum([
  'immediate',    // Reinvest as soon as proceeds available
  'quarterly',    // Aggregate and reinvest quarterly
  'semi_annual',  // Aggregate and reinvest semi-annually
  'annual'        // Aggregate and reinvest annually
]);

export type RecyclingTiming = z.infer<typeof RecyclingTiming>;

/**
 * Complete recycling policy
 */
export const RecyclingPolicySchema = z.object({
  /** Policy identifier */
  id: z.string(),

  /** Human-readable name */
  name: z.string(),

  /** Enable recycling */
  enabled: z.boolean().default(true),

  /** Recycling sources */
  sources: z.array(RecyclingSource).min(1),

  /** Recycling cap */
  cap: RecyclingCapSchema,

  /** Recycling term */
  term: RecyclingTermSchema,

  /** Proactively assume recycling for forecasting */
  anticipatedRecycling: z.boolean().default(false),

  /** Reinvestment timing */
  reinvestmentTiming: RecyclingTiming.default('immediate'),

  /** Minimum reinvestment amount */
  minimumReinvestmentAmount: ZodPositiveDecimal.optional(),

  /** Investment IDs excluded from recycling */
  excludedInvestments: z.array(z.string()).optional()
}).refine(
  (data) => {
    // If percentage cap, validate <= 100%
    if (data.cap.type === 'percentage') {
      return data.cap.value.lte(1);
    }
    return true;
  },
  {
    message: 'Percentage cap cannot exceed 100%',
    path: ['cap', 'value']
  }
);

export type RecyclingPolicy = z.infer<typeof RecyclingPolicySchema>;

/**
 * Recycling calculation context
 */
export interface RecyclingContext {
  committedCapital: Decimal;
  calledCapital: Decimal;
  investedCapital: Decimal;
  currentMonth: number;
  totalFeesPaid: Decimal;
  totalExitProceeds: Decimal;
  totalRecycled: Decimal;
  recycledFromFees: Decimal;
  recycledFromProceeds: Decimal;
}

/**
 * Recycling availability result
 */
export interface RecyclingAvailability {
  totalAvailable: Decimal;
  fromFees: Decimal;
  fromProceeds: Decimal;
  capReached: boolean;
  termExpired: boolean;
}

/**
 * Calculate available recycling capacity
 */
export function calculateRecyclingAvailability(
  policy: RecyclingPolicy,
  context: RecyclingContext
): RecyclingAvailability {
  // Check if recycling is enabled
  if (!policy.enabled) {
    return {
      totalAvailable: new Decimal(0),
      fromFees: new Decimal(0),
      fromProceeds: new Decimal(0),
      capReached: false,
      termExpired: false
    };
  }

  // Check if term expired
  const termMonths = policy.term.months + (policy.term.automaticExtension ? policy.term.extensionMonths : 0);
  const termExpired = context.currentMonth > termMonths;

  if (termExpired) {
    return {
      totalAvailable: new Decimal(0),
      fromFees: new Decimal(0),
      fromProceeds: new Decimal(0),
      capReached: false,
      termExpired: true
    };
  }

  // Calculate cap
  let cap: Decimal;
  if (policy.cap.type === 'percentage') {
    const basisAmount = getRecyclingBasisAmount(policy.cap.basis, context);
    cap = basisAmount.times(policy.cap.value);
  } else {
    cap = policy.cap.value;
  }

  // Calculate used capacity
  const usedCapacity = context.totalRecycled;
  const remainingCapacity = cap.minus(usedCapacity);
  const capReached = remainingCapacity.lte(0);

  if (capReached) {
    return {
      totalAvailable: new Decimal(0),
      fromFees: new Decimal(0),
      fromProceeds: new Decimal(0),
      capReached: true,
      termExpired: false
    };
  }

  // Calculate available from each source
  let fromFees = new Decimal(0);
  let fromProceeds = new Decimal(0);

  const sources = new Set(policy.sources);

  if (sources.has('management_fees') || sources.has('both')) {
    // Available fees = fees paid - fees already recycled
    const availableFees = context.totalFeesPaid.minus(context.recycledFromFees);
    fromFees = Decimal.max(new Decimal(0), Decimal.min(availableFees, remainingCapacity));
  }

  if (sources.has('exit_proceeds') || sources.has('both')) {
    // Available proceeds = exit proceeds - proceeds already recycled
    const availableProceeds = context.totalExitProceeds.minus(context.recycledFromProceeds);
    const remainingAfterFees = remainingCapacity.minus(fromFees);
    fromProceeds = Decimal.max(new Decimal(0), Decimal.min(availableProceeds, remainingAfterFees));
  }

  // Apply minimum reinvestment amount if specified
  let totalAvailable = fromFees.plus(fromProceeds);
  if (policy.minimumReinvestmentAmount && totalAvailable.lt(policy.minimumReinvestmentAmount)) {
    totalAvailable = new Decimal(0);
    fromFees = new Decimal(0);
    fromProceeds = new Decimal(0);
  }

  return {
    totalAvailable,
    fromFees,
    fromProceeds,
    capReached: false,
    termExpired: false
  };
}

/**
 * Get basis amount for recycling cap
 */
function getRecyclingBasisAmount(
  basis: 'committed_capital' | 'called_capital' | 'original_investment',
  context: RecyclingContext
): Decimal {
  switch (basis) {
    case 'committed_capital':
      return context.committedCapital;
    case 'called_capital':
      return context.calledCapital;
    case 'original_investment':
      return context.investedCapital;
  }
}

/**
 * Check if recycling should occur based on timing
 */
export function shouldRecycleNow(
  policy: RecyclingPolicy,
  currentMonth: number
): boolean {
  if (!policy.enabled) return false;

  switch (policy.reinvestmentTiming) {
    case 'immediate':
      return true;
    case 'quarterly':
      return currentMonth % 3 === 0;
    case 'semi_annual':
      return currentMonth % 6 === 0;
    case 'annual':
      return currentMonth % 12 === 0;
  }
}
