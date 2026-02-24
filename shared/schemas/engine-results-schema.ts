/**
 * Zod schema for persisted engine calculation results
 *
 * Stored as JSONB alongside fund records. Advisory data --
 * not required for fund creation, can be null for older funds.
 */

import { z } from 'zod';

export const engineAllocationSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  stage: z.string(),
  allocation: z.number(),
  expectedReturn: z.number(),
  riskScore: z.number().min(0).max(1),
});

export const enginePortfolioMetricsSchema = z.object({
  expectedPortfolioMOIC: z.number(),
  concentrationRisk: z.number().min(0).max(1),
  reserveUtilization: z.number().min(0).max(1),
  diversificationScore: z.number().min(0).max(1),
});

export const engineRiskAnalysisSchema = z.object({
  overallRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  reserveExhaustionRisk: z.boolean(),
  highConcentrationWarning: z.boolean(),
  unrealisticReturnsWarning: z.boolean(),
});

export const engineScenarioResultSchema = z.object({
  scenarioName: z.string(),
  moic: z.number(),
  irr: z.number().nullable(),
  reserveUtilization: z.number(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export const engineResultsSchema = z.object({
  calculatedAt: z.string().datetime(),
  engineVersion: z.string().default('1.0.0'),
  allocations: z.array(engineAllocationSchema),
  portfolioMetrics: enginePortfolioMetricsSchema,
  riskAnalysis: engineRiskAnalysisSchema,
  scenarioResults: z.array(engineScenarioResultSchema).optional(),
  inputSummary: z.object({
    totalAllocated: z.number(),
    totalAvailable: z.number(),
    portfolioSize: z.number(),
  }),
});

export type EngineAllocation = z.infer<typeof engineAllocationSchema>;
export type EnginePortfolioMetrics = z.infer<typeof enginePortfolioMetricsSchema>;
export type EngineRiskAnalysis = z.infer<typeof engineRiskAnalysisSchema>;
export type EngineScenarioResult = z.infer<typeof engineScenarioResultSchema>;
export type EngineResults = z.infer<typeof engineResultsSchema>;
