/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
// PacingEngine.ts - Type-safe fund deployment pacing engine

import type { 
  PacingInput, 
  PacingOutput, 
  PacingSummary 
} from '@shared/types';
import { PacingInputSchema, PacingOutputSchema } from '@shared/types';
import { map, reduce } from '@/utils/array-safety';

// =============================================================================
// CONFIGURATION & VALIDATION
// =============================================================================

/** Validate and parse pacing input with Zod */
function validatePacingInput(input: unknown): PacingInput {
  const result = PacingInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid pacing input: ${result.error.message}`);
  }
  return result.data;
}

/** Validate pacing output before returning */
function validatePacingOutput(output: unknown): PacingOutput {
  const result = PacingOutputSchema.safeParse(output);
  if (!result.success) {
    throw new Error(`Invalid pacing output: ${result.error.message}`);
  }
  return result.data;
}

// =============================================================================
// CORE PACING LOGIC
// =============================================================================

// Algorithm mode detection
function isAlgorithmModeEnabled(): boolean {
  return process.env['ALG_PACING']?.toLowerCase() === 'true' || process.env['NODE_ENV'] === 'development';
}

// Enhanced rule-based pacing with market condition adjustments
function calculateRuleBasedPacing(input: PacingInput): PacingOutput[] {
  const { fundSize, deploymentQuarter, marketCondition } = input;
  
  // Market condition adjustments
  const marketAdjustments: Record<string, { early: number; mid: number; late: number }> = {
    'bull': { early: 1.3, mid: 1.1, late: 0.8 },    // Front-loaded in bull markets
    'bear': { early: 0.7, mid: 0.9, late: 1.2 },    // Back-loaded in bear markets  
    'neutral': { early: 1.0, mid: 1.0, late: 1.0 }  // Even distribution
  };
  
  const adjustment = marketAdjustments[marketCondition] ?? marketAdjustments['neutral'];
  const baseAmount = fundSize / 8; // 8 quarters deployment

  return Array.from({ length: 8 }, (_: any, i: any) => {
    const quarter = deploymentQuarter + i;
    let multiplier: number;

    // Determine phase and apply multiplier
    if (i < 3) {
      multiplier = adjustment?.early ?? 1.0;
    } else if (i < 6) {
      multiplier = adjustment?.mid ?? 1.0;
    } else {
      multiplier = adjustment?.late ?? 1.0;
    }
    
    // Add some variability to avoid perfectly smooth deployment
    const variability = 0.9 + (Math.random() * 0.2); // ±10% variance
    const deployment = baseAmount * multiplier * variability;
    
    let phaseNote = '';
    if (i < 3) phaseNote = 'early-stage focus';
    else if (i < 6) phaseNote = 'mid-stage deployment';
    else phaseNote = 'late-stage optimization';
    
    const output = {
      quarter,
      deployment: Math.round(deployment),
      note: `${marketCondition} market pacing (${phaseNote})`
    };
    
    return validatePacingOutput(output);
  });
}

// Mock ML algorithm for advanced pacing
function calculateMLBasedPacing(input: PacingInput): PacingOutput[] {
  const ruleBased = calculateRuleBasedPacing(input);
  
  // Simulate ML enhancement with trend analysis
  return map(ruleBased, (item: any, _index: any) => {
    // ML adjusts based on simulated market trends and fund performance
    const trendAdjustment = 0.85 + (Math.random() * 0.3); // 0.85 to 1.15
    const mlEnhancedDeployment = item.deployment * trendAdjustment;
    
    return {
      ...item,
      deployment: Math.round(mlEnhancedDeployment),
      note: `ML-optimized pacing (${input.marketCondition} trend analysis)`
    };
  });
}

// =============================================================================
// MAIN ENGINE FUNCTIONS
// =============================================================================

/**
 * Primary PacingEngine function with input validation
 * @param input Pacing parameters (fund size, quarter, market condition)
 * @returns Array of quarterly deployment allocations
 */
export function PacingEngine(input: unknown): PacingOutput[] {
  const validatedInput = validatePacingInput(input);
  const useAlgorithm = isAlgorithmModeEnabled();
  
  // Use ML algorithm if enabled
  if (useAlgorithm) {
    return calculateMLBasedPacing(validatedInput);
  } else {
    return calculateRuleBasedPacing(validatedInput);
  }
}

/**
 * Generate comprehensive pacing summary with metadata
 * @param input Pacing parameters
 * @returns Complete pacing summary with statistics
 */
export function generatePacingSummary(input: PacingInput): PacingSummary {
  const deployments = PacingEngine(input);
  
  const totalQuarters = deployments.length;
  const totalDeployment = reduce(deployments, (sum: any, d: any) => sum + d.deployment, 0);
  const avgQuarterlyDeployment = totalQuarters > 0 ? totalDeployment / totalQuarters : 0;
  
  return {
    fundSize: input.fundSize,
    totalQuarters,
    avgQuarterlyDeployment: Math.round(avgQuarterlyDeployment),
    marketCondition: input.marketCondition,
    deployments,
    generatedAt: new Date(),
  };
}

