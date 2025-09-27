/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
// ReserveEngine.ts - Type-safe reserve allocation engine

import type { 
  ReserveInput, 
  ReserveOutput, 
  ReserveSummary 
} from '@shared/types';
import { ReserveInputSchema, ReserveOutputSchema , ConfidenceLevel } from '@shared/types';
import { map, reduce } from '@/utils/array-safety';

// =============================================================================
// CONFIGURATION & VALIDATION
// =============================================================================

/** Algorithm mode detection with type safety */
function isAlgorithmModeEnabled(): boolean {
  return process.env['ALG_RESERVE']?.toLowerCase() === 'true' || process.env['NODE_ENV'] === 'development';
}

/** Validate and parse reserve input with Zod */
function validateReserveInput(input: unknown): ReserveInput {
  const result = ReserveInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid reserve input: ${result.error.message}`);
  }
  return result.data;
}

/** Validate reserve output before returning */
function validateReserveOutput(output: unknown): ReserveOutput {
  const result = ReserveOutputSchema.safeParse(output);
  if (!result.success) {
    throw new Error(`Invalid reserve output: ${result.error.message}`);
  }
  return result.data;
}

// =============================================================================
// CORE ALLOCATION LOGIC
// =============================================================================

// Enhanced rule-based allocation with confidence scoring
function calculateRuleBasedAllocation(company: ReserveInput): ReserveOutput {
  const { invested, stage, sector, ownership } = company;
  
  // Stage-based multiplier
  const stageMultipliers: Record<string, number> = {
    'Seed': 1.5,
    'Series A': 2.0,
    'Series B': 2.5,
    'Series C': 1.8,
    'Growth': 1.2
  };
  
  // Sector risk adjustment
  const sectorMultipliers: Record<string, number> = {
    'SaaS': 1.1,
    'Fintech': 1.2,
    'Healthcare': 1.3,
    'Analytics': 1.0,
    'Infrastructure': 0.9,
    'Enterprise': 0.8
  };
  
  const stageMultiplier = stageMultipliers[stage] || 2.0;
  const sectorMultiplier = sectorMultipliers[sector] || 1.0;
  
  // Base allocation with stage and sector adjustments
  let allocation = invested * stageMultiplier * sectorMultiplier;
  
  // Ownership percentage adjustment (higher ownership = higher reserves)
  if (ownership > 0.1) {
    allocation *= 1.2;
  } else if (ownership < 0.05) {
    allocation *= 0.8;
  }
  
  // Calculate confidence based on data quality using defined levels
  let confidence: number = ConfidenceLevel.COLD_START; // Base cold-start confidence
  
  // Increase confidence based on available data
  if (stage && sector) confidence += 0.2;
  if (ownership > 0) confidence += 0.15;
  if (invested > 1000000) confidence += 0.1; // Larger investments = more data
  
  // Cap confidence at reasonable cold-start level
  confidence = Math.min(confidence, ConfidenceLevel.MEDIUM);
  
  let rationale = `${stage} stage, ${sector} sector`;
  if (confidence <= ConfidenceLevel.LOW) {
    rationale += " (cold-start mode)";
  } else {
    rationale += " (enhanced rules)";
  }
  
  const output = {
    allocation: Math.round(allocation),
    confidence: Math.round(confidence * 100) / 100,
    rationale
  };
  
  return validateReserveOutput(output);
}

// Mock ML algorithm for high-confidence mode
function calculateMLBasedAllocation(company: ReserveInput): ReserveOutput {
  // This would call actual ML model in production
  const baseAllocation = calculateRuleBasedAllocation(company);
  
  // Simulate ML enhancement
  const mlAdjustment = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2 multiplier
  const enhancedAllocation = baseAllocation.allocation * mlAdjustment;
  
  const output = {
    allocation: Math.round(enhancedAllocation),
    confidence: Math.min(ConfidenceLevel.ML_ENHANCED, baseAllocation.confidence + 0.3),
    rationale: `ML-enhanced allocation (${baseAllocation.rationale.replace('(cold-start mode)', '').replace('(enhanced rules)', '').trim()})`
  };
  
  return validateReserveOutput(output);
}

// =============================================================================
// MAIN ENGINE FUNCTIONS
// =============================================================================

/** 
 * Primary ReserveEngine function with input validation 
 * @param portfolio Array of portfolio companies
 * @returns Array of reserve allocations with confidence scores
 */
export function ReserveEngine(portfolio: unknown[]): ReserveOutput[] {
  if (!Array.isArray(portfolio) || portfolio.length === 0) {
    return [];
  }
  
  // Validate all inputs
  const validatedPortfolio: ReserveInput[] = map(portfolio, (company, index) => {
    try {
      return validateReserveInput(company);
    } catch (error) {
      throw new Error(`Invalid company data at index ${index}: ${error}`);
    }
  });
  
  const useAlgorithm = isAlgorithmModeEnabled();
  
  return map(validatedPortfolio, (company) => {
    // Use ML algorithm if enabled and confidence threshold met
    if (useAlgorithm && Math.random() > 0.3) { // 70% chance of using ML in algorithm mode
      return calculateMLBasedAllocation(company);
    } else {
      return calculateRuleBasedAllocation(company);
    }
  });
}

/**
 * Generate a comprehensive reserve summary for a fund
 * @param fundId Fund identifier
 * @param portfolio Portfolio companies
 * @returns Complete reserve summary with metadata
 */
export function generateReserveSummary(fundId: number, portfolio: ReserveInput[]): ReserveSummary {
  const allocations = ReserveEngine(portfolio);
  
  const totalAllocation = reduce(allocations, (sum, item) => sum + item.allocation, 0);
  const avgConfidence = allocations.length > 0 
    ? reduce(allocations, (sum, item) => sum + item.confidence, 0) / allocations.length 
    : 0;
  const highConfidenceCount = allocations.filter(item => item.confidence >= ConfidenceLevel.MEDIUM).length;
  
  return {
    fundId,
    totalAllocation,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    highConfidenceCount,
    allocations,
    generatedAt: new Date(),
  };
}

