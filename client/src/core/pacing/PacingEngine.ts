// PacingEngine.ts

export interface PacingInput {
  fundSize: number;
  deploymentQuarter: number;
  marketCondition: 'bull' | 'bear' | 'neutral';
}

export interface PacingOutput {
  quarter: number;
  deployment: number;
  note: string;
}

// Algorithm mode detection
function isAlgorithmModeEnabled(): boolean {
  return process.env.ALG_PACING === 'true' || process.env.NODE_ENV === 'development';
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
  
  const adjustment = marketAdjustments[marketCondition];
  const baseAmount = fundSize / 8; // 8 quarters deployment
  
  return Array.from({ length: 8 }, (_, i) => {
    const quarter = deploymentQuarter + i;
    let multiplier: number;
    
    // Determine phase and apply multiplier
    if (i < 3) {
      multiplier = adjustment.early;
    } else if (i < 6) {
      multiplier = adjustment.mid;
    } else {
      multiplier = adjustment.late;
    }
    
    // Add some variability to avoid perfectly smooth deployment
    const variability = 0.9 + (Math.random() * 0.2); // ±10% variance
    const deployment = baseAmount * multiplier * variability;
    
    let phaseNote = '';
    if (i < 3) phaseNote = 'early-stage focus';
    else if (i < 6) phaseNote = 'mid-stage deployment';
    else phaseNote = 'late-stage optimization';
    
    return {
      quarter,
      deployment: Math.round(deployment),
      note: `${marketCondition} market pacing (${phaseNote})`
    };
  });
}

// Mock ML algorithm for advanced pacing
function calculateMLBasedPacing(input: PacingInput): PacingOutput[] {
  const ruleBased = calculateRuleBasedPacing(input);
  
  // Simulate ML enhancement with trend analysis
  return ruleBased.map((item, index) => {
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

export function PacingEngine(input: PacingInput): PacingOutput[] {
  const useAlgorithm = isAlgorithmModeEnabled();
  
  // Use ML algorithm if enabled
  if (useAlgorithm) {
    return calculateMLBasedPacing(input);
  } else {
    return calculateRuleBasedPacing(input);
  }
}
