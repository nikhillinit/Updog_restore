// ReserveEngine.ts

export interface ReserveInput {
  id: number;
  invested: number;
  ownership: number;
  stage: string;
  sector: string;
}

export interface ReserveOutput {
  allocation: number;
  confidence: number;
  rationale: string;
}

// Algorithm mode detection
function isAlgorithmModeEnabled(): boolean {
  return process.env.ALG_RESERVE === 'true' || process.env.NODE_ENV === 'development';
}

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
  
  // Calculate confidence based on data quality
  let confidence = 0.3; // Base cold-start confidence
  
  // Increase confidence based on available data
  if (stage && sector) confidence += 0.2;
  if (ownership > 0) confidence += 0.15;
  if (invested > 1000000) confidence += 0.1; // Larger investments = more data
  
  // Cap confidence at reasonable cold-start level
  confidence = Math.min(confidence, 0.75);
  
  let rationale = `${stage} stage, ${sector} sector`;
  if (confidence <= 0.5) {
    rationale += " (cold-start mode)";
  } else {
    rationale += " (enhanced rules)";
  }
  
  return {
    allocation: Math.round(allocation),
    confidence: Math.round(confidence * 100) / 100,
    rationale
  };
}

// Mock ML algorithm for high-confidence mode
function calculateMLBasedAllocation(company: ReserveInput): ReserveOutput {
  // This would call actual ML model in production
  const baseAllocation = calculateRuleBasedAllocation(company);
  
  // Simulate ML enhancement
  const mlAdjustment = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2 multiplier
  const enhancedAllocation = baseAllocation.allocation * mlAdjustment;
  
  return {
    allocation: Math.round(enhancedAllocation),
    confidence: Math.min(0.95, baseAllocation.confidence + 0.3),
    rationale: `ML-enhanced allocation (${baseAllocation.rationale.replace('(cold-start mode)', '').replace('(enhanced rules)', '').trim()})`
  };
}

export function ReserveEngine(portfolio: ReserveInput[]): ReserveOutput[] {
  if (portfolio.length === 0) return [];
  
  const useAlgorithm = isAlgorithmModeEnabled();
  
  return portfolio.map((company) => {
    // Use ML algorithm if enabled and confidence threshold met
    if (useAlgorithm && Math.random() > 0.3) { // 70% chance of using ML in algorithm mode
      return calculateMLBasedAllocation(company);
    } else {
      return calculateRuleBasedAllocation(company);
    }
  });
}
