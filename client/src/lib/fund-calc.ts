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

/**
 * Generate time series data for charts
 * @param periods number of periods to generate
 * @param initialValue starting value
 * @param growthRate average growth rate per period
 * @param volatility volatility of growth
 * @param seed optional seed for deterministic results
 * @returns array of values over time
 */
export const generateTimeSeries = (
  periods: number,
  initialValue: number,
  growthRate: number,
  volatility: number,
  seed?: number
): number[] => {
  const values: number[] = [initialValue];
  let currentValue = initialValue;
  
  // Use seed for deterministic random if provided
  let random = seed ? (() => {
    let x = seed;
    return () => {
      x = (x * 1103515245 + 12345) % 2147483648;
      return x / 2147483648;
    };
  })() : Math.random;
  
  for (let i = 1; i < periods; i++) {
    const randomGrowth = (random() - 0.5) * 2 * volatility;
    const periodGrowth = growthRate + randomGrowth;
    currentValue = currentValue * (1 + periodGrowth);
    values.push(Math.max(0, currentValue));
  }
  
  return values;
};

/**
 * Main simulation function - runs comprehensive fund analysis
 * This is the heavy computation that should run in a Worker
 * @param inputs simulation inputs
 * @param seed optional seed for deterministic results
 * @returns comprehensive simulation results
 */
export const runSimulation = async (
  inputs: any,
  seed?: number
): Promise<any> => {
  // Simulate heavy computation
  const runs = inputs?.monteCarloRuns || 1000;
  const periods = inputs?.periods || 120; // 10 years monthly
  
  // Performance metrics
  const startTime = performance.now();
  
  // Generate Monte Carlo scenarios for key metrics
  const moicScenarios = quickMonteCarlo(
    inputs?.baseMOIC || 2.5,
    inputs?.moicVolatility || 0.3,
    runs
  );
  
  // Generate IRR scenarios
  const irrBase = inputs?.baseIRR || 0.25;
  const irrScenarios = quickMonteCarlo(
    irrBase,
    inputs?.irrVolatility || 0.2,
    runs
  );
  
  // Generate time series for charts
  const tvpiSeries = generateTimeSeries(
    periods,
    inputs?.initialCapital || 100000000,
    inputs?.growthRate || 0.015, // 1.5% monthly
    inputs?.growthVolatility || 0.05,
    seed
  );
  
  const dpiSeries = generateTimeSeries(
    periods,
    0,
    inputs?.distributionRate || 0.008,
    inputs?.distributionVolatility || 0.1,
    seed ? seed + 1 : undefined
  );
  
  // Calculate exits by quarter
  const exitsByQuarter = Array.from({ length: 40 }, (_, i) => ({
    quarter: `Q${(i % 4) + 1} ${Math.floor(i / 4) + 2020}`,
    exits: Math.floor(Math.random() * 5) + 1,
    value: Math.random() * 50000000 + 10000000
  }));
  
  // Key Performance Indicators
  const kpi = {
    tvpi: (tvpiSeries[tvpiSeries.length - 1] / (inputs?.initialCapital || 100000000)).toFixed(2),
    irr: (irrScenarios.p50 * 100).toFixed(1) + '%',
    moic: moicScenarios.p50.toFixed(2) + 'x',
    dpi: (dpiSeries.reduce((a, b) => a + b, 0) / (inputs?.initialCapital || 100000000)).toFixed(2)
  };
  
  // Simulate some heavy nested computation
  const portfolioAnalysis = [];
  for (let i = 0; i < 100; i++) {
    portfolioAnalysis.push({
      companyId: `company-${i}`,
      metrics: {
        revenue: Math.random() * 100000000,
        growth: Math.random(),
        multiple: Math.random() * 10,
        irr: calculateIRR([
          -1000000,
          ...Array.from({ length: 5 }, () => Math.random() * 500000)
        ])
      }
    });
  }
  
  const duration = performance.now() - startTime;
  
  return {
    kpi,
    moicScenarios,
    irrScenarios,
    tvpiSeries,
    dpiSeries,
    exitsByQuarter,
    portfolioAnalysis,
    metadata: {
      runs,
      periods,
      duration,
      timestamp: new Date().toISOString()
    }
  };
};

