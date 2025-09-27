/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
// CohortEngine.ts - Type-safe vintage cohort analysis engine

import type { 
  CohortInput, 
  CohortOutput,
  CohortSummary 
} from '@shared/types';
import { CohortInputSchema, CohortOutputSchema } from '@shared/types';
import { map, reduce } from '@/utils/array-safety';

// =============================================================================
// CONFIGURATION & VALIDATION
// =============================================================================

/** Algorithm mode detection with type safety */
function isAlgorithmModeEnabled(): boolean {
  return process.env['ALG_COHORT']?.toLowerCase() === 'true' || process.env['NODE_ENV'] === 'development';
}

/** Validate and parse cohort input with Zod */
function validateCohortInput(input: unknown): CohortInput {
  const result = CohortInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid cohort input: ${result.error.message}`);
  }
  return result.data;
}

/** Validate cohort output before returning */
function validateCohortOutput(output: unknown): CohortOutput {
  const result = CohortOutputSchema.safeParse(output);
  if (!result.success) {
    throw new Error(`Invalid cohort output: ${result.error.message}`);
  }
  return result.data;
}

// =============================================================================
// MOCK DATA GENERATION (for scaffolding)
// =============================================================================

/** Generate mock portfolio companies for a cohort */
function generateMockCompanies(cohortSize: number, _vintageYear: number) {
  const sectors = ['SaaS', 'Fintech', 'Healthcare', 'Analytics', 'Infrastructure', 'Enterprise'];
  const stages = ['Seed', 'Series A', 'Series B', 'Series C'];
  const companyPrefixes = ['Tech', 'Data', 'Cloud', 'Smart', 'Digital', 'Next'];
  const companySuffixes = ['Corp', 'Inc', 'Labs', 'Systems', 'Solutions', 'Technologies'];
  
  return Array.from({ length: cohortSize }, (_, i) => {
    const baseValuation = 1000000 + (Math.random() * 50000000); // $1M - $51M
    const growthFactor = Math.pow(1.5, Math.random() * 3); // 1.0x - 3.375x growth
    
    return {
      id: i + 1,
      name: `${companyPrefixes[Math.floor(Math.random() * companyPrefixes.length)]}${companySuffixes[Math.floor(Math.random() * companySuffixes.length)]}`,
      stage: stages[Math.floor(Math.random() * stages.length)],
      valuation: Math.round(baseValuation * growthFactor)
    };
  });
}

// =============================================================================
// CORE COHORT ANALYSIS LOGIC
// =============================================================================

/** Calculate rule-based cohort performance metrics */
function calculateRuleBasedCohortMetrics(input: CohortInput): CohortOutput {
  const { fundId, vintageYear, cohortSize } = input;
  const cohortId = `cohort-${fundId}-${vintageYear}`;
  
  // Generate mock companies for this cohort
  const companies = generateMockCompanies(cohortSize, vintageYear);
  
  // Calculate basic performance metrics based on vintage year and cohort characteristics
  const yearsActive = new Date().getFullYear() - vintageYear;
  const maturityFactor = Math.min(yearsActive / 5, 1); // Normalize to 0-1 over 5 years
  
  // Base IRR calculation with vintage year effects
  let baseIRR = 0.15; // 15% base IRR
  
  // Vintage year adjustments (market conditions)
  const vintageAdjustments: Record<number, number> = {
    2020: -0.05, // COVID impact
    2021: 0.08,  // Recovery boom
    2022: -0.03, // Market correction
    2023: 0.02,  // Normalization
    2024: 0.05   // Growth resumption
  };
  
  baseIRR += vintageAdjustments[vintageYear] || 0;
  baseIRR *= maturityFactor; // Scale by fund maturity
  
  // Multiple calculation (TVPI)
  const baseMultiple = 1.0 + (baseIRR * yearsActive);
  const multiple = Math.max(1.0, baseMultiple + (Math.random() * 0.5 - 0.25)); // ±25% variance
  
  // DPI calculation (distributions to paid-in)
  const dpi = Math.max(0, multiple * maturityFactor * 0.4); // 40% of multiple realized over time
  
  const performance = {
    irr: Math.round(baseIRR * 10000) / 10000, // Round to 4 decimal places
    multiple: Math.round(multiple * 100) / 100,
    dpi: Math.round(dpi * 100) / 100
  };
  
  const output: CohortOutput = {
    cohortId,
    vintageYear,
    performance,
    companies
  };
  
  return validateCohortOutput(output);
}

/** Calculate ML-enhanced cohort performance with advanced analytics */
function calculateMLBasedCohortMetrics(input: CohortInput): CohortOutput {
  // Start with rule-based calculation
  const baseOutput = calculateRuleBasedCohortMetrics(input);
  
  // Apply ML enhancements (simulated)
  const mlAdjustment = 0.9 + (Math.random() * 0.2); // 0.9 to 1.1 multiplier
  
  const enhancedPerformance = {
    irr: Math.round(baseOutput.performance.irr * mlAdjustment * 10000) / 10000,
    multiple: Math.round(baseOutput.performance.multiple * mlAdjustment * 100) / 100,
    dpi: Math.round(baseOutput.performance.dpi * mlAdjustment * 100) / 100
  };
  
  // Enhanced company valuations with ML insights
  const enhancedCompanies = map(baseOutput.companies, company => ({
    ...company,
    valuation: Math.round(company.valuation * mlAdjustment)
  }));
  
  const output: CohortOutput = {
    ...baseOutput,
    performance: enhancedPerformance,
    companies: enhancedCompanies
  };
  
  return validateCohortOutput(output);
}

// =============================================================================
// MAIN ENGINE FUNCTIONS
// =============================================================================

/**
 * Primary CohortEngine function with input validation
 * @param input Cohort analysis parameters
 * @returns Cohort performance analysis with company details
 */
export function CohortEngine(input: unknown): CohortOutput {
  const validatedInput = validateCohortInput(input);
  const useAlgorithm = isAlgorithmModeEnabled();
  
  // Use ML algorithm if enabled
  if (useAlgorithm) {
    return calculateMLBasedCohortMetrics(validatedInput);
  } else {
    return calculateRuleBasedCohortMetrics(validatedInput);
  }
}

/**
 * Generate comprehensive cohort summary with metadata
 * @param input Cohort analysis parameters
 * @returns Complete cohort summary with aggregated metrics
 */
export function generateCohortSummary(input: CohortInput): CohortSummary {
  const cohortOutput = CohortEngine(input);
  
  const totalCompanies = cohortOutput.companies.length;
  const avgValuation = totalCompanies > 0 
    ? reduce(cohortOutput.companies, (sum, company) => sum + company.valuation, 0) / totalCompanies
    : 0;
  
  // Calculate stage distribution
  const stageDistribution = reduce(cohortOutput.companies, (acc, company) => {
    acc[company.stage] = (acc[company.stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const summary: CohortSummary = {
    cohortId: cohortOutput.cohortId,
    vintageYear: cohortOutput.vintageYear,
    totalCompanies,
    performance: cohortOutput.performance,
    avgValuation: Math.round(avgValuation),
    stageDistribution,
    companies: cohortOutput.companies,
    generatedAt: new Date(),
    // Additional metadata
    metadata: {
      algorithmMode: isAlgorithmModeEnabled() ? 'ml-enhanced' : 'rule-based',
      yearsActive: new Date().getFullYear() - cohortOutput.vintageYear,
      maturityLevel: Math.min((new Date().getFullYear() - cohortOutput.vintageYear) / 5, 1)
    }
  };
  
  return summary;
}

/**
 * Compare multiple vintage cohorts
 * @param cohorts Array of cohort inputs to compare
 * @returns Comparative analysis of cohort performance
 */
export function compareCohorts(cohorts: CohortInput[]): {
  cohorts: CohortSummary[];
  comparison: {
    bestPerforming: string;
    avgIRR: number;
    avgMultiple: number;
    totalCompanies: number;
  };
} {
  if (cohorts.length === 0) {
    throw new Error('At least one cohort required for comparison');
  }
  
  const cohortSummaries = map(cohorts, generateCohortSummary);
  
  // Find best performing cohort by IRR  
  const bestPerforming = reduce(cohortSummaries.slice(1), (best, current) =>
    current.performance.irr > best.performance.irr ? current : best,
    cohortSummaries[0]
  );
  
  // Calculate aggregate metrics
  const avgIRR = reduce(cohortSummaries, (sum, cohort) => sum + cohort.performance.irr, 0) / cohortSummaries.length;
  const avgMultiple = reduce(cohortSummaries, (sum, cohort) => sum + cohort.performance.multiple, 0) / cohortSummaries.length;
  const totalCompanies = reduce(cohortSummaries, (sum, cohort) => sum + cohort.totalCompanies, 0);
  
  return {
    cohorts: cohortSummaries,
    comparison: {
      bestPerforming: bestPerforming.cohortId,
      avgIRR: Math.round(avgIRR * 10000) / 10000,
      avgMultiple: Math.round(avgMultiple * 100) / 100,
      totalCompanies
    }
  };
}

