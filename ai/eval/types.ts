/**
 * Type-safe evaluation schemas for fund modeling agents
 * Aligned with DeterministicReserveEngine and Construction/Current flows
 */

import { z } from 'zod';

/**
 * Evaluation record for a single agent run
 * Compares candidate scenario against baseline with venture-specific metrics
 */
export const EvaluationSchema = z.object({
  runId: z.string().uuid(),
  timestamp: z.string().datetime(),

  // Input context
  inputs: z.object({
    scenarioType: z.enum(['construction', 'current']),
    portfolioSize: z.number(),
    availableReserves: z.number(),
  }),

  // Venture-specific metrics (Construction vs Current)
  metrics: z.object({
    // Fund performance deltas
    irrDelta: z.number().nullable(),              // IRR improvement vs baseline
    tvpiDelta: z.number().nullable(),             // TVPI improvement
    dpiDelta: z.number().nullable(),              // DPI improvement
    navDelta: z.number().nullable(),              // NAV change

    // Reserve allocation quality
    exitMoicOnPlannedReserves: z.number().nullable(),  // From DeterministicReserveEngine
    reserveUtilization: z.number().min(0).max(1),      // % of reserves allocated
    diversificationScore: z.number().min(0).max(1),    // Portfolio concentration

    // Operational metrics
    tokenCostUsd: z.number().positive(),
    ttfbMs: z.number().positive(),               // Time to first byte
    latencyMs: z.number().positive(),            // Total latency
    success: z.boolean(),
  }),

  // Optional details
  notes: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type Evaluation = z.infer<typeof EvaluationSchema>;

/**
 * Input for evaluator: baseline + candidate runs
 */
export const RunRecordSchema = z.object({
  // Baseline scenario (usually "Current")
  baseline: z.object({
    irr: z.number().nullable(),
    tvpi: z.number().nullable(),
    dpi: z.number().nullable(),
    nav: z.number().nullable(),
  }),

  // Candidate scenario (usually "Construction" with optimizations)
  candidate: z.object({
    irr: z.number().nullable(),
    tvpi: z.number().nullable(),
    dpi: z.number().nullable(),
    nav: z.number().nullable(),
    exitMoicOnPlannedReserves: z.number().nullable(),
  }),

  // Timing data
  timings: z.object({
    ttfbMs: z.number(),
    latencyMs: z.number(),
  }),

  // Cost data
  cost: z.object({
    usd: z.number(),
    tokens: z.number().optional(),
  }),

  // Context
  portfolioSize: z.number(),
  reservesAvailable: z.number(),
  reservesAllocated: z.number(),
});

export type RunRecord = z.infer<typeof RunRecordSchema>;

/**
 * Optimization suggestion from Optimizer
 */
export const OptimizationSuggestionSchema = z.object({
  suggestionId: z.string().uuid(),
  timestamp: z.string().datetime(),

  // Suggested changes
  parameters: z.object({
    followOnPolicy: z.string().optional(),
    allocationStrategy: z.string().optional(),
    graduationPriors: z.record(z.number()).optional(),
  }),

  // Expected impact
  projectedImpact: z.object({
    irrLift: z.number(),
    tvpiLift: z.number(),
    confidence: z.number().min(0).max(1),
  }),

  // Diff for UI preview
  diff: z.object({
    description: z.string(),
    affectedCompanies: z.array(z.string()),
    reserveReallocations: z.array(z.object({
      companyId: z.string(),
      currentAllocation: z.number(),
      suggestedAllocation: z.number(),
    })),
  }),

  // Safety checks
  constraints: z.object({
    maxSingleAllocation: z.number(),
    maxConcentration: z.number(),
    respectsUserPreferences: z.boolean(),
  }),
});

export type OptimizationSuggestion = z.infer<typeof OptimizationSuggestionSchema>;
