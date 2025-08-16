/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * Generate random number from normal distribution using Box-Muller transform
 * @param mean mean of the distribution
 * @param stdDev standard deviation
 * @returns random number from normal distribution
 */
const randomNormal = (mean = 0, stdDev = 1): number => {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/**
 * Calculate quantile from sorted array
 * @param sortedArray sorted array of numbers
 * @param quantile quantile to calculate (0-1)
 * @returns quantile value
 */
const quantile = (sortedArray: number[], quantile: number): number => {
  const index = quantile * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  
  if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
  if (lower < 0) return sortedArray[0];
  
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
};

/**
 * quickMonteCarlo - Zero-config Monte Carlo simulation for fund metrics
 * @param baseCase   expected outcome (e.g. MOIC or IRR)
 * @param sigma      volatility (standard deviation, default 0.2 = 20%)
 * @param runs       number of simulations (default 1000)
 * @returns percentile analysis (p10, p50, p90)
 */
export const quickMonteCarlo = (
  baseCase: number,
  sigma = 0.2,
  runs = 1000
): { p10: number; p50: number; p90: number } => {
  if (runs > 10000) {
    console.warn('Monte Carlo: Large run count may impact performance');
  }
  
  const results = Array.from({ length: runs }, () => 
    baseCase * (1 + randomNormal(0, sigma))
  ).sort((a, b) => a - b);
  
  return {
    p10: quantile(results, 0.1),
    p50: quantile(results, 0.5),
    p90: quantile(results, 0.9)
  };
};

/**
 * Calculate Internal Rate of Return (IRR) for cash flows
 * @param cashFlows array of cash flows (negative for investments, positive for returns)
 * @returns IRR as decimal (e.g., 0.15 = 15%)
 */
export const calculateIRR = (cashFlows: number[]): number => {
  if (cashFlows.length < 2) {
    throw new Error('IRR requires at least 2 cash flows');
  }
  
  // Simple Newton-Raphson method for IRR calculation
  let rate = 0.1; // Initial guess: 10%
  const tolerance = 1e-6;
  const maxIterations = 100;
  
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let npvDerivative = 0;
    
    for (let j = 0; j < cashFlows.length; j++) {
      const factor = Math.pow(1 + rate, j);
      npv += cashFlows[j] / factor;
      npvDerivative -= (j * cashFlows[j]) / (factor * (1 + rate));
    }
    
    if (Math.abs(npv) < tolerance) {
      return rate;
    }
    
    if (Math.abs(npvDerivative) < tolerance) {
      break; // Avoid division by zero
    }
    
    rate = rate - npv / npvDerivative;
  }
  
  return rate;
};

/**
 * Calculate Multiple of Invested Capital (MOIC)
 * @param invested total amount invested
 * @param returned total amount returned (including unrealized value)
 * @returns MOIC as multiple (e.g., 2.5 = 2.5x)
 */
export const calculateMOIC = (invested: number, returned: number): number => {
  if (invested <= 0) {
    throw new Error('Invested amount must be positive');
  }
  return returned / invested;
};

/**
 * Scenario analysis helper
 * @param baseCase base case value
 * @param scenarios array of scenario adjustments (e.g., [0.8, 1.0, 1.2] for bear/base/bull)
 * @returns scenario values
 */
export const scenarioAnalysis = (
  baseCase: number,
  scenarios: number[] = [0.7, 1.0, 1.3]
): { bear: number; base: number; bull: number } => {
  return {
    bear: baseCase * scenarios[0],
    base: baseCase * scenarios[1],
    bull: baseCase * scenarios[2]
  };
};

