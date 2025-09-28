/**
 * Monte Carlo Simulation Engine
 *
 * Leverages historical variance data to generate probabilistic portfolio performance forecasts.
 * Integrates with existing variance tracking infrastructure for practical fund strategy decisions.
 */

import { db } from '../db';
import {
  fundBaselines,
  varianceReports,
  funds,
  portfolioCompanies,
  fundSnapshots
} from '@shared/schema';
import type {
  FundBaseline,
  VarianceReport
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Core Monte Carlo simulation parameters
 */
export interface SimulationParameters {
  fundId: number;
  scenarios: number; // Number of simulation runs (default: 10000)
  timeHorizonYears: number; // Forecast period in years
  confidenceIntervals: number[]; // [10, 25, 50, 75, 90] percentiles
  baselineId?: string; // Use specific baseline, defaults to fund's default baseline
  randomSeed?: number; // For reproducible results
}

/**
 * Distribution parameters derived from historical variance data
 */
export interface DistributionParams {
  mean: number;
  standardDeviation: number;
  skew?: number;
  kurtosis?: number;
  distribution: 'normal' | 'lognormal' | 'triangular' | 'beta';
  historicalCount: number;
  confidence: number; // 0-1 confidence in parameter accuracy
}

/**
 * Simulation results for a single metric
 */
export interface SimulationResult {
  metric: string;
  scenarios: number[];
  percentiles: Record<number, number>; // percentile -> value
  mean: number;
  median: number;
  standardDeviation: number;
  min: number;
  max: number;
  probabilityDistribution: Array<{ value: number; probability: number }>;
}

/**
 * Complete Monte Carlo forecast results
 */
export interface MonteCarloForecast {
  fundId: number;
  baselineId: string;
  simulationId: string;
  parameters: SimulationParameters;
  createdAt: Date;

  // Core performance metrics
  totalValue: SimulationResult;
  irr: SimulationResult;
  multiple: SimulationResult;
  dpi: SimulationResult;
  tvpi: SimulationResult;

  // Portfolio analysis
  portfolioMetrics: {
    expectedExits: SimulationResult;
    exitMultiples: SimulationResult;
    sectorPerformance: Record<string, SimulationResult>;
    stagePerformance: Record<string, SimulationResult>;
  };

  // Reserve optimization insights
  reserveOptimization: {
    optimalAllocation: number;
    expectedCoverage: SimulationResult;
    riskAdjustedReturn: SimulationResult;
  };

  // Risk metrics
  riskMetrics: {
    valueAtRisk: Record<number, number>; // confidence level -> VaR
    expectedShortfall: Record<number, number>; // confidence level -> ES
    probabilityOfLoss: number;
    downsideviation: number;
  };

  // Scenario insights
  scenarioAnalysis: {
    bestCase: Record<string, number>; // 90th percentile outcomes
    worstCase: Record<string, number>; // 10th percentile outcomes
    stressTest: Record<string, number>; // 5th percentile outcomes
  };
}

/**
 * Reserve optimization recommendation
 */
export interface ReserveOptimization {
  currentAllocation: number;
  recommendedAllocation: number;
  improvementPotential: number;
  riskReduction: number;
  expectedReturn: number;
  scenarios: Array<{
    allocation: number;
    expectedReturn: number;
    risk: number;
    sharpeRatio: number;
  }>;
}

/**
 * Scenario generation configuration
 */
export interface ScenarioConfig {
  fundId: number;
  scenarioCount: number;
  portfolioConstructions: Array<{
    name: string;
    sectorWeights: Record<string, number>;
    stageWeights: Record<string, number>;
    riskProfile: 'conservative' | 'moderate' | 'aggressive';
  }>;
}

/**
 * Main Monte Carlo Simulation Service
 */
export class MonteCarloSimulationService {
  /**
   * Generate Monte Carlo forecast for fund performance
   */
  async generateForecast(params: SimulationParameters): Promise<MonteCarloForecast> {
    const startTime = Date.now();
    const simulationId = uuidv4();

    // Get baseline data
    const baseline = await this.getBaselineData(params.fundId, params.baselineId);

    // Extract historical variance patterns
    const variancePatterns = await this.extractVariancePatterns(params.fundId, baseline.id);

    // Generate distribution parameters
    const distributions = await this.generateDistributions(variancePatterns);

    // Run Monte Carlo simulations
    const simulationResults = await this.runSimulations(params, baseline, distributions);

    // Analyze portfolio metrics
    const portfolioMetrics = await this.analyzePortfolioScenarios(params, baseline, simulationResults);

    // Optimize reserve allocation
    const reserveOptimization = await this.optimizeReserves(params, baseline, simulationResults);

    // Calculate risk metrics
    const riskMetrics = this.calculateRiskMetrics(simulationResults);

    // Generate scenario analysis
    const scenarioAnalysis = this.generateScenarioAnalysis(simulationResults);

    const forecast: MonteCarloForecast = {
      fundId: params.fundId,
      baselineId: baseline.id,
      simulationId,
      parameters: params,
      createdAt: new Date(),
      totalValue: simulationResults.totalValue,
      irr: simulationResults.irr,
      multiple: simulationResults.multiple,
      dpi: simulationResults.dpi,
      tvpi: simulationResults.tvpi,
      portfolioMetrics,
      reserveOptimization,
      riskMetrics,
      scenarioAnalysis
    };

    // Store forecast results
    await this.storeForecast(forecast);

    return forecast;
  }

  /**
   * Get baseline data for simulation
   */
  private async getBaselineData(fundId: number, baselineId?: string): Promise<FundBaseline> {
    let baseline: FundBaseline | undefined;

    if (baselineId) {
      baseline = await db.query.fundBaselines.findFirst({
        where: and(
          eq(fundBaselines.id, baselineId),
          eq(fundBaselines.fundId, fundId),
          eq(fundBaselines.isActive, true)
        )
      });
    } else {
      // Get default baseline
      baseline = await db.query.fundBaselines.findFirst({
        where: and(
          eq(fundBaselines.fundId, fundId),
          eq(fundBaselines.isDefault, true),
          eq(fundBaselines.isActive, true)
        )
      });
    }

    if (!baseline) {
      throw new Error('No suitable baseline found for Monte Carlo simulation');
    }

    return baseline;
  }

  /**
   * Extract historical variance patterns for distribution modeling
   */
  private async extractVariancePatterns(fundId: number, baselineId: string) {
    // Get variance reports for this fund and baseline
    const reports = await db.query.varianceReports.findMany({
      where: and(
        eq(varianceReports.fundId, fundId),
        eq(varianceReports.baselineId, baselineId)
      ),
      orderBy: desc(varianceReports.asOfDate),
      limit: 50 // Last 50 reports for pattern analysis
    });

    // Extract variance patterns by metric
    const patterns = {
      totalValueVariance: this.extractMetricPattern(reports, 'totalValueVariancePct'),
      irrVariance: this.extractMetricPattern(reports, 'irrVariance'),
      multipleVariance: this.extractMetricPattern(reports, 'multipleVariance'),
      dpiVariance: this.extractMetricPattern(reports, 'dpiVariance'),
      tvpiVariance: this.extractMetricPattern(reports, 'tvpiVariance')
    };

    return patterns;
  }

  /**
   * Extract statistical pattern from metric variance history
   */
  private extractMetricPattern(reports: VarianceReport[], metricField: string) {
    const values = reports
      .map(r => r[metricField as keyof VarianceReport])
      .filter(v => v !== null && v !== undefined)
      .map(v => parseFloat(v.toString()));

    if (values.length < 3) {
      // Use default conservative estimates if insufficient data
      return {
        mean: 0,
        standardDeviation: 0.15, // 15% default volatility
        count: 0,
        confidence: 0.3 // Low confidence due to insufficient data
      };
    }

    const mean = values.reduce((sum: any, v: any) => sum + v, 0) / values.length;
    const variance = values.reduce((sum: any, v: any) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    const standardDeviation = Math.sqrt(variance);

    // Calculate skewness and kurtosis for distribution selection
    const skewness = this.calculateSkewness(values, mean, standardDeviation);
    const kurtosis = this.calculateKurtosis(values, mean, standardDeviation);

    return {
      mean,
      standardDeviation,
      skewness,
      kurtosis,
      count: values.length,
      confidence: Math.min(values.length / 20, 1.0) // Higher confidence with more data points
    };
  }

  /**
   * Generate distribution parameters for each metric
   */
  private async generateDistributions(patterns: any): Promise<Record<string, DistributionParams>> {
    const distributions: Record<string, DistributionParams> = {};

    for (const [metric, pattern] of Object.entries(patterns)) {
      const p = pattern as any;

      // Select appropriate distribution based on data characteristics
      let distribution: 'normal' | 'lognormal' | 'triangular' | 'beta' = 'normal';

      if (Math.abs(p.skewness) > 1.0) {
        distribution = 'lognormal'; // Use lognormal for highly skewed data
      } else if (p.count < 10) {
        distribution = 'triangular'; // Use triangular for limited data
      }

      distributions[metric] = {
        mean: p.mean,
        standardDeviation: p.standardDeviation,
        skew: p.skewness,
        kurtosis: p.kurtosis,
        distribution,
        historicalCount: p.count,
        confidence: p.confidence
      };
    }

    return distributions;
  }

  /**
   * Run Monte Carlo simulations
   */
  private async runSimulations(
    params: SimulationParameters,
    baseline: FundBaseline,
    distributions: Record<string, DistributionParams>
  ) {
    const scenarios = params.scenarios || 10000;
    const results: Record<string, number[]> = {
      totalValue: [],
      irr: [],
      multiple: [],
      dpi: [],
      tvpi: []
    };

    // Set random seed for reproducibility
    if (params.randomSeed) {
      this.setRandomSeed(params.randomSeed);
    }

    // Run simulation scenarios
    for (let i = 0; i < scenarios; i++) {
      const scenario = this.generateScenario(baseline, distributions, params.timeHorizonYears);

      results.totalValue.push(scenario.totalValue);
      results.irr.push(scenario.irr);
      results.multiple.push(scenario.multiple);
      results.dpi.push(scenario.dpi);
      results.tvpi.push(scenario.tvpi);
    }

    // Convert to SimulationResult format
    const simulationResults: Record<string, SimulationResult> = {};
    for (const [metric, values] of Object.entries(results)) {
      simulationResults[metric] = this.calculateSimulationResult(metric, values, params.confidenceIntervals);
    }

    return simulationResults;
  }

  /**
   * Generate a single scenario based on distributions
   */
  private generateScenario(
    baseline: FundBaseline,
    distributions: Record<string, DistributionParams>,
    timeHorizonYears: number
  ) {
    // Sample from distributions for each metric
    const totalValueVariance = this.sampleFromDistribution(distributions.totalValueVariance);
    const irrVariance = this.sampleFromDistribution(distributions.irrVariance);
    const multipleVariance = this.sampleFromDistribution(distributions.multipleVariance);
    const dpiVariance = this.sampleFromDistribution(distributions.dpiVariance);
    const tvpiVariance = this.sampleFromDistribution(distributions.tvpiVariance);

    // Apply time decay and compounding effects
    const timeDecay = Math.pow(0.95, timeHorizonYears); // Variance tends to stabilize over time
    const compoundGrowth = Math.pow(1 + parseFloat(baseline.irr?.toString() || '0.15'), timeHorizonYears);

    // Calculate scenario values
    const baselineTotalValue = parseFloat(baseline.totalValue.toString());
    const baselineIrr = parseFloat(baseline.irr?.toString() || '0.15');
    const baselineMultiple = parseFloat(baseline.multiple?.toString() || '2.0');
    const baselineDpi = parseFloat(baseline.dpi?.toString() || '0.5');
    const baselineTvpi = parseFloat(baseline.tvpi?.toString() || '1.5');

    return {
      totalValue: baselineTotalValue * (1 + totalValueVariance * timeDecay) * compoundGrowth,
      irr: baselineIrr + (irrVariance * timeDecay),
      multiple: baselineMultiple * (1 + multipleVariance * timeDecay),
      dpi: baselineDpi + (dpiVariance * timeDecay),
      tvpi: baselineTvpi + (tvpiVariance * timeDecay)
    };
  }

  /**
   * Sample from a distribution based on its parameters
   */
  private sampleFromDistribution(params: DistributionParams): number {
    switch (params.distribution) {
      case 'normal':
        return this.sampleNormal(params.mean, params.standardDeviation);
      case 'lognormal':
        return this.sampleLogNormal(params.mean, params.standardDeviation);
      case 'triangular':
        return this.sampleTriangular(params.mean - params.standardDeviation, params.mean + params.standardDeviation, params.mean);
      case 'beta':
        return this.sampleBeta(2, 5, params.mean - 2 * params.standardDeviation, params.mean + 2 * params.standardDeviation);
      default:
        return this.sampleNormal(params.mean, params.standardDeviation);
    }
  }

  /**
   * Analyze portfolio scenarios for different metrics
   */
  private async analyzePortfolioScenarios(
    params: SimulationParameters,
    baseline: FundBaseline,
    simulationResults: Record<string, SimulationResult>
  ) {
    // Get portfolio composition
    const portfolioCompaniesData = await db.query.portfolioCompanies.findMany({
      where: eq(portfolioCompanies.fundId, params.fundId),
      with: { investments: true }
    });

    // Generate portfolio-specific scenarios
    const expectedExits = this.generateExitScenarios(portfolioCompaniesData, params.scenarios || 10000);
    const exitMultiples = this.generateExitMultipleScenarios(portfolioCompaniesData, params.scenarios || 10000);

    // Analyze sector performance
    const sectorPerformance: Record<string, SimulationResult> = {};
    const sectors = [...new Set(portfolioCompaniesData.map(c => c.sector).filter(Boolean))];

    for (const sector of sectors) {
      const sectorScenarios = this.generateSectorScenarios(
        portfolioCompaniesData.filter(c => c.sector === sector),
        params.scenarios || 10000
      );
      sectorPerformance[sector as string] = this.calculateSimulationResult(
        `${sector}_performance`,
        sectorScenarios,
        params.confidenceIntervals || [10, 25, 50, 75, 90]
      );
    }

    // Analyze stage performance
    const stagePerformance: Record<string, SimulationResult> = {};
    const stages = [...new Set(portfolioCompaniesData.map(c => c.stage).filter(Boolean))];

    for (const stage of stages) {
      const stageScenarios = this.generateStageScenarios(
        portfolioCompaniesData.filter(c => c.stage === stage),
        params.scenarios || 10000
      );
      stagePerformance[stage as string] = this.calculateSimulationResult(
        `${stage}_performance`,
        stageScenarios,
        params.confidenceIntervals || [10, 25, 50, 75, 90]
      );
    }

    return {
      expectedExits: this.calculateSimulationResult('expected_exits', expectedExits, params.confidenceIntervals || [10, 25, 50, 75, 90]),
      exitMultiples: this.calculateSimulationResult('exit_multiples', exitMultiples, params.confidenceIntervals || [10, 25, 50, 75, 90]),
      sectorPerformance,
      stagePerformance
    };
  }

  /**
   * Optimize reserve allocation based on simulation results
   */
  private async optimizeReserves(
    params: SimulationParameters,
    baseline: FundBaseline,
    simulationResults: Record<string, SimulationResult>
  ) {
    const fundSize = parseFloat((await this.getFundSize(params.fundId)).toString());
    const deployedCapital = parseFloat(baseline.deployedCapital.toString());
    const currentReserveRatio = (fundSize - deployedCapital) / fundSize;

    // Test different reserve allocation scenarios
    const reserveScenarios = [];
    for (let allocation = 0.1; allocation <= 0.5; allocation += 0.05) {
      const coverage = this.calculateReserveCoverage(allocation, simulationResults, params.scenarios || 10000);
      const riskAdjustedReturn = this.calculateRiskAdjustedReturn(allocation, simulationResults);

      reserveScenarios.push({
        allocation,
        expectedCoverage: coverage,
        riskAdjustedReturn
      });
    }

    // Find optimal allocation
    const optimalScenario = reserveScenarios.reduce((best: any, current: any) =>
      current.riskAdjustedReturn > best.riskAdjustedReturn ? current : best
    );

    return {
      optimalAllocation: optimalScenario.allocation,
      expectedCoverage: this.calculateSimulationResult(
        'expected_coverage',
        reserveScenarios.map(s => s.expectedCoverage),
        params.confidenceIntervals || [10, 25, 50, 75, 90]
      ),
      riskAdjustedReturn: this.calculateSimulationResult(
        'risk_adjusted_return',
        reserveScenarios.map(s => s.riskAdjustedReturn),
        params.confidenceIntervals || [10, 25, 50, 75, 90]
      )
    };
  }

  /**
   * Calculate simulation result with percentiles and statistics
   */
  private calculateSimulationResult(metric: string, values: number[], confidenceIntervals: number[]): SimulationResult {
    const sortedValues = values.slice().sort((a: any, b: any) => a - b);
    const mean = values.reduce((sum: any, v: any) => sum + v, 0) / values.length;
    const variance = values.reduce((sum: any, v: any) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    const standardDeviation = Math.sqrt(variance);

    // Calculate percentiles
    const percentiles: Record<number, number> = {};
    for (const percentile of confidenceIntervals) {
      const index = Math.floor((percentile / 100) * (sortedValues.length - 1));
      percentiles[percentile] = sortedValues[index];
    }

    // Generate probability distribution (binned)
    const binCount = 50;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binSize = (max - min) / binCount;
    const probabilityDistribution = [];

    for (let i = 0; i < binCount; i++) {
      const binStart = min + i * binSize;
      const binEnd = binStart + binSize;
      const count = values.filter(v => v >= binStart && v < binEnd).length;
      const probability = count / values.length;

      if (probability > 0) {
        probabilityDistribution.push({
          value: binStart + binSize / 2,
          probability
        });
      }
    }

    return {
      metric,
      scenarios: values,
      percentiles,
      mean,
      median: percentiles[50] || sortedValues[Math.floor(sortedValues.length / 2)],
      standardDeviation,
      min: Math.min(...values),
      max: Math.max(...values),
      probabilityDistribution
    };
  }

  /**
   * Calculate risk metrics from simulation results
   */
  private calculateRiskMetrics(simulationResults: Record<string, SimulationResult>) {
    const totalValueScenarios = simulationResults.totalValue.scenarios;
    const irrScenarios = simulationResults.irr.scenarios;

    // Value at Risk (VaR) - loss not exceeded with given confidence
    const valueAtRisk: Record<number, number> = {};
    [5, 10, 25].forEach(confidence => {
      const index = Math.floor((confidence / 100) * totalValueScenarios.length);
      valueAtRisk[confidence] = totalValueScenarios.sort((a: any, b: any) => a - b)[index];
    });

    // Expected Shortfall (Conditional VaR) - expected loss beyond VaR
    const expectedShortfall: Record<number, number> = {};
    [5, 10, 25].forEach(confidence => {
      const varValue = valueAtRisk[confidence];
      const tailLosses = totalValueScenarios.filter(v => v <= varValue);
      expectedShortfall[confidence] = tailLosses.reduce((sum: any, v: any) => sum + v, 0) / tailLosses.length;
    });

    // Probability of loss
    const baseline = simulationResults.totalValue.mean;
    const probabilityOfLoss = totalValueScenarios.filter(v => v < baseline).length / totalValueScenarios.length;

    // Downside deviation
    const downsideVariance = irrScenarios
      .filter(v => v < simulationResults.irr.mean)
      .reduce((sum: any, v: any) => sum + Math.pow(v - simulationResults.irr.mean, 2), 0) / irrScenarios.length;
    const downsideviation = Math.sqrt(downsideVariance);

    return {
      valueAtRisk,
      expectedShortfall,
      probabilityOfLoss,
      downsideviation
    };
  }

  /**
   * Generate scenario analysis (best/worst/stress cases)
   */
  private generateScenarioAnalysis(simulationResults: Record<string, SimulationResult>) {
    const bestCase: Record<string, number> = {};
    const worstCase: Record<string, number> = {};
    const stressTest: Record<string, number> = {};

    for (const [metric, result] of Object.entries(simulationResults)) {
      bestCase[metric] = result.percentiles[90] || result.max;
      worstCase[metric] = result.percentiles[10] || result.min;
      stressTest[metric] = result.percentiles[5] || result.min;
    }

    return {
      bestCase,
      worstCase,
      stressTest
    };
  }

  /**
   * Store forecast results for future reference
   */
  private async storeForecast(forecast: MonteCarloForecast): Promise<void> {
    // Store in fund snapshots for integration with existing infrastructure
    await db.insert(fundSnapshots).values({
      fundId: forecast.fundId,
      type: 'MONTE_CARLO',
      payload: forecast,
      calcVersion: 'mc-v1.0',
      correlationId: forecast.simulationId,
      snapshotTime: forecast.createdAt,
      metadata: {
        baselineId: forecast.baselineId,
        scenarios: forecast.parameters.scenarios,
        timeHorizon: forecast.parameters.timeHorizonYears
      }
    });
  }

  // Statistical utility functions
  private calculateSkewness(values: number[], mean: number, stdDev: number): number {
    const n = values.length;
    const skew = values.reduce((sum: any, v: any) => sum + Math.pow((v - mean) / stdDev, 3), 0) / n;
    return skew;
  }

  private calculateKurtosis(values: number[], mean: number, stdDev: number): number {
    const n = values.length;
    const kurt = values.reduce((sum: any, v: any) => sum + Math.pow((v - mean) / stdDev, 4), 0) / n;
    return kurt - 3; // Excess kurtosis
  }

  private setRandomSeed(seed: number): void {
    // Simple linear congruential generator for reproducible results
    let state = seed;
    Math.random = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  // Distribution sampling functions
  private sampleNormal(mean: number, stdDev: number): number {
    // Box-Muller transformation
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  private sampleLogNormal(mean: number, stdDev: number): number {
    return Math.exp(this.sampleNormal(mean, stdDev));
  }

  private sampleTriangular(min: number, max: number, mode: number): number {
    const u = Math.random();
    if (u < (mode - min) / (max - min)) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  }

  private sampleBeta(alpha: number, beta: number, min: number, max: number): number {
    // Simplified beta sampling using gamma distribution approximation
    const gamma1 = this.sampleGamma(alpha);
    const gamma2 = this.sampleGamma(beta);
    const betaSample = gamma1 / (gamma1 + gamma2);
    return min + betaSample * (max - min);
  }

  private sampleGamma(shape: number): number {
    // Simplified gamma sampling for beta distribution
    if (shape >= 1) {
      const d = shape - 1 / 3;
      const c = 1 / Math.sqrt(9 * d);
      while (true) {
        const z = this.sampleNormal(0, 1);
        if (z > -1 / c) {
          const v = Math.pow(1 + c * z, 3);
          const u = Math.random();
          if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) {
            return d * v;
          }
        }
      }
    } else {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
  }

  // Helper functions for portfolio analysis
  private generateExitScenarios(companies: any[], scenarios: number): number[] {
    return Array(scenarios).fill(0).map(() =>
      companies.filter(() => Math.random() < 0.3).length // 30% exit probability
    );
  }

  private generateExitMultipleScenarios(companies: any[], scenarios: number): number[] {
    return Array(scenarios).fill(0).map(() =>
      this.sampleLogNormal(1.5, 0.8) // Typical VC exit multiples
    );
  }

  private generateSectorScenarios(companies: any[], scenarios: number): number[] {
    return Array(scenarios).fill(0).map(() =>
      companies.reduce((sum: any, company: any) => {
        const performance = this.sampleNormal(0.15, 0.25); // 15% mean return, 25% volatility
        return sum + performance;
      }, 0) / companies.length
    );
  }

  private generateStageScenarios(companies: any[], scenarios: number): number[] {
    // Different volatility by stage
    const stageVolatility: Record<string, number> = {
      'seed': 0.5,
      'series-a': 0.4,
      'series-b': 0.3,
      'series-c': 0.25,
      'later-stage': 0.2
    };

    return Array(scenarios).fill(0).map(() =>
      companies.reduce((sum: any, company: any) => {
        const volatility = stageVolatility[company.stage] || 0.3;
        const performance = this.sampleNormal(0.15, volatility);
        return sum + performance;
      }, 0) / companies.length
    );
  }

  private calculateReserveCoverage(allocation: number, simulationResults: Record<string, SimulationResult>, scenarios: number): number {
    // Simulate reserve coverage scenarios
    const coverageScenarios = Array(scenarios).fill(0).map(() => {
      const totalValue = simulationResults.totalValue.scenarios[Math.floor(Math.random() * simulationResults.totalValue.scenarios.length)];
      const reserveAmount = totalValue * allocation;
      const followOnNeed = this.sampleLogNormal(reserveAmount * 0.6, reserveAmount * 0.3);
      return Math.min(reserveAmount / followOnNeed, 1.0);
    });

    return coverageScenarios.reduce((sum: any, v: any) => sum + v, 0) / coverageScenarios.length;
  }

  private calculateRiskAdjustedReturn(allocation: number, simulationResults: Record<string, SimulationResult>): number {
    const expectedReturn = simulationResults.irr.mean;
    const volatility = simulationResults.irr.standardDeviation;
    const allocationPenalty = Math.pow(allocation - 0.25, 2); // Penalty for deviating from 25% optimal

    return expectedReturn / volatility - allocationPenalty;
  }

  private async getFundSize(fundId: number): Promise<number> {
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId)
    });
    return parseFloat(fund?.size?.toString() || '100000000');
  }
}

// Export singleton instance
export const monteCarloSimulationService = new MonteCarloSimulationService();