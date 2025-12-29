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
  VarianceReport,
  PortfolioCompany
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type {
  PowerLawDistribution} from './power-law-distribution';
import {
  createVCPowerLawDistribution,
  type InvestmentStage
} from './power-law-distribution';
import { PRNG } from '@shared/utils/prng';

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
  distribution: 'normal' | 'lognormal' | 'triangular' | 'beta' | 'powerlaw';
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
 * Pattern extracted from historical variance data
 */
interface MetricPattern {
  mean: number;
  standardDeviation: number;
  skewness?: number;
  kurtosis?: number;
  count: number;
  confidence: number;
}

/**
 * Variance patterns for all tracked metrics
 */
interface VariancePatterns {
  totalValueVariance: MetricPattern;
  irrVariance: MetricPattern;
  multipleVariance: MetricPattern;
  dpiVariance: MetricPattern;
  tvpiVariance: MetricPattern;
}

/**
 * Reserve allocation scenario for optimization
 */
interface ReserveScenario {
  allocation: number;
  expectedCoverage: number;
  riskAdjustedReturn: number;
}

/**
 * Portfolio company with optional investments relation
 */
type PortfolioCompanyWithInvestments = PortfolioCompany & {
  investments?: unknown[];
};

/**
 * Main Monte Carlo Simulation Service
 *
 * Enhanced with power law distribution for realistic VC return modeling
 */
export class MonteCarloSimulationService {
  private powerLawDistribution: PowerLawDistribution;
  private prng: PRNG;

  constructor(seed?: number) {
    this.powerLawDistribution = createVCPowerLawDistribution();
    this.prng = new PRNG(seed);
  }
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

    // Validate that all required simulation results exist
    const totalValue = simulationResults['totalValue'];
    const irr = simulationResults['irr'];
    const multiple = simulationResults['multiple'];
    const dpi = simulationResults['dpi'];
    const tvpi = simulationResults['tvpi'];

    if (!totalValue || !irr || !multiple || !dpi || !tvpi) {
      throw new Error('Missing required simulation results');
    }

    const forecast: MonteCarloForecast = {
      fundId: params.fundId,
      baselineId: baseline.id,
      simulationId,
      parameters: params,
      createdAt: new Date(),
      totalValue,
      irr,
      multiple,
      dpi,
      tvpi,
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
  private extractMetricPattern(reports: VarianceReport[], metricField: string): MetricPattern {
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

    const mean = values.reduce((sum: number, v: number) => sum + v, 0) / values.length;
    const variance = values.reduce((sum: number, v: number) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
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
   * Enhanced with power law distribution for return multiples
   */
  private async generateDistributions(patterns: VariancePatterns): Promise<Record<string, DistributionParams>> {
    const distributions: Record<string, DistributionParams> = {};

    for (const [metric, pattern] of Object.entries(patterns)) {
      const p = pattern as MetricPattern;

      // Select appropriate distribution based on data characteristics
      let distribution: 'normal' | 'lognormal' | 'triangular' | 'beta' | 'powerlaw' = 'normal';

      // Use power law for return multiples (matches VC reality)
      if (metric === 'multipleVariance' || metric.includes('multiple')) {
        distribution = 'powerlaw';
      } else if (p.skewness !== undefined && Math.abs(p.skewness) > 1.0) {
        distribution = 'lognormal'; // Use lognormal for highly skewed data
      } else if (p.count < 10) {
        distribution = 'triangular'; // Use triangular for limited data
      }

      const distributionParams: DistributionParams = {
        mean: p.mean,
        standardDeviation: p.standardDeviation,
        distribution,
        historicalCount: p.count,
        confidence: p.confidence
      };
      if (p.skewness !== undefined) {
        distributionParams.skew = p.skewness;
      }
      if (p.kurtosis !== undefined) {
        distributionParams.kurtosis = p.kurtosis;
      }
      distributions[metric] = distributionParams;
    }

    return distributions;
  }

  /**
   * Run Monte Carlo simulations
   * Enhanced with power law distribution and portfolio-aware sampling
   */
  private async runSimulations(
    params: SimulationParameters,
    baseline: FundBaseline,
    distributions: Record<string, DistributionParams>
  ) {
    const scenarios = params.scenarios || 10000;
    interface SimulationResultArrays {
      totalValue: number[];
      irr: number[];
      multiple: number[];
      dpi: number[];
      tvpi: number[];
    }
    const results: SimulationResultArrays = {
      totalValue: [],
      irr: [],
      multiple: [],
      dpi: [],
      tvpi: []
    };

    // Set random seed for reproducibility using local PRNG
    if (params.randomSeed) {
      this.prng.reset(params.randomSeed);
      this.powerLawDistribution = createVCPowerLawDistribution(params.randomSeed);
    }

    // Get portfolio stage distribution
    const stageDistribution = await this.getPortfolioStageDistribution(params.fundId);

    // Run simulation scenarios
    for (let i = 0; i < scenarios; i++) {
      const scenario = await this.generateScenario(
        baseline,
        distributions,
        params.timeHorizonYears,
        stageDistribution
      );

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
   * Enhanced with power law distribution for realistic VC returns
   */
  private async generateScenario(
    baseline: FundBaseline,
    distributions: Record<string, DistributionParams>,
    timeHorizonYears: number,
    stageDistribution: Record<string, number>
  ) {
    // Select stage based on portfolio distribution
    const selectedStage = this.selectStageFromDistribution(stageDistribution);

    // Generate power law scenario for realistic VC returns
    const powerLawScenario = this.powerLawDistribution.generateInvestmentScenario(
      selectedStage,
      timeHorizonYears
    );

    // Sample from traditional distributions for other metrics
    const totalValueVariance = this.sampleFromDistribution(distributions['totalValueVariance'] || {
      mean: 0,
      standardDeviation: 0.15,
      distribution: 'normal',
      historicalCount: 0,
      confidence: 0.5
    });
    const dpiVariance = this.sampleFromDistribution(distributions['dpiVariance'] || {
      mean: 0,
      standardDeviation: 0.1,
      distribution: 'normal',
      historicalCount: 0,
      confidence: 0.5
    });
    const tvpiVariance = this.sampleFromDistribution(distributions['tvpiVariance'] || {
      mean: 0,
      standardDeviation: 0.1,
      distribution: 'normal',
      historicalCount: 0,
      confidence: 0.5
    });

    // Calculate baseline values
    const baselineTotalValue = parseFloat(baseline.totalValue.toString());
    const baselineDpi = parseFloat(baseline.dpi?.toString() || '0.5');
    const baselineTvpi = parseFloat(baseline.tvpi?.toString() || '1.5');

    // Use power law results for multiple and IRR (NO TIME DECAY)
    // Apply minimal variance to other metrics to preserve power law characteristics
    return {
      totalValue: baselineTotalValue * powerLawScenario.multiple * (1 + totalValueVariance * 0.1), // Reduced variance impact
      irr: powerLawScenario.irr,
      multiple: powerLawScenario.multiple,
      dpi: baselineDpi + (dpiVariance * 0.5), // Reduced impact, no time decay
      tvpi: baselineTvpi + (tvpiVariance * 0.5) // Reduced impact, no time decay
    };
  }

  /**
   * Sample from a distribution based on its parameters
   * Enhanced with power law distribution support
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
      case 'powerlaw': {
        // Use power law distribution for return multiples
        const powerLawSample = this.powerLawDistribution.sampleReturn('seed');
        return powerLawSample.multiple - 1; // Convert to variance form
      }
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
    const sectors = [...new Set(portfolioCompaniesData.map((c) => c.sector).filter(Boolean))];

    for (const sector of sectors) {
      const sectorScenarios = this.generateSectorScenarios(
        portfolioCompaniesData.filter((c) => c.sector === sector),
        params.scenarios || 10000
      );
      sectorPerformance[sector] = this.calculateSimulationResult(
        `${sector}_performance`,
        sectorScenarios,
        params.confidenceIntervals || [10, 25, 50, 75, 90]
      );
    }

    // Analyze stage performance
    const stagePerformance: Record<string, SimulationResult> = {};
    const stages = [...new Set(portfolioCompaniesData.map((c) => c.stage).filter(Boolean))];

    for (const stage of stages) {
      const stageScenarios = this.generateStageScenarios(
        portfolioCompaniesData.filter((c) => c.stage === stage),
        params.scenarios || 10000
      );
      stagePerformance[stage] = this.calculateSimulationResult(
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
    const reserveScenarios: ReserveScenario[] = [];
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
    const optimalScenario = reserveScenarios.reduce((best: ReserveScenario, current: ReserveScenario) =>
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
    const sortedValues = values.slice().sort((a: number, b: number) => a - b);
    const mean = values.reduce((sum: number, v: number) => sum + v, 0) / values.length;
    const variance = values.reduce((sum: number, v: number) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    const standardDeviation = Math.sqrt(variance);

    // Calculate percentiles
    const percentiles: Record<number, number> = {};
    for (const percentile of confidenceIntervals) {
      const index = Math.floor((percentile / 100) * (sortedValues.length - 1));
      percentiles[percentile] = sortedValues[index] ?? sortedValues[0] ?? 0;
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
      median: percentiles[50] ?? sortedValues[Math.floor(sortedValues.length / 2)] ?? mean,
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
    const totalValueResult = simulationResults['totalValue'];
    const irrResult = simulationResults['irr'];

    if (!totalValueResult || !irrResult) {
      throw new Error('Missing required simulation results for risk metrics');
    }

    const totalValueScenarios = totalValueResult.scenarios;
    const irrScenarios = irrResult.scenarios;

    // Value at Risk (VaR) - loss not exceeded with given confidence
    const valueAtRisk: Record<number, number> = {};
    const sortedTotalValue = [...totalValueScenarios].sort((a: number, b: number) => a - b);
    [5, 10, 25].forEach(confidence => {
      const index = Math.floor((confidence / 100) * sortedTotalValue.length);
      valueAtRisk[confidence] = sortedTotalValue[index] ?? sortedTotalValue[0] ?? 0;
    });

    // Expected Shortfall (Conditional VaR) - expected loss beyond VaR
    const expectedShortfall: Record<number, number> = {};
    [5, 10, 25].forEach(confidence => {
      const varValue = valueAtRisk[confidence] ?? 0;
      const tailLosses = totalValueScenarios.filter(v => v <= varValue);
      expectedShortfall[confidence] = tailLosses.length > 0
        ? tailLosses.reduce((sum: number, v: number) => sum + v, 0) / tailLosses.length
        : 0;
    });

    // Probability of loss
    const baseline = totalValueResult.mean;
    const probabilityOfLoss = totalValueScenarios.filter(v => v < baseline).length / totalValueScenarios.length;

    // Downside deviation
    const irrMean = irrResult.mean;
    const downsideValues = irrScenarios.filter(v => v < irrMean);
    const downsideVariance = downsideValues.length > 0
      ? downsideValues.reduce((sum: number, v: number) => sum + Math.pow(v - irrMean, 2), 0) / irrScenarios.length
      : 0;
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
    const skew = values.reduce((sum: number, v: number) => sum + Math.pow((v - mean) / stdDev, 3), 0) / n;
    return skew;
  }

  private calculateKurtosis(values: number[], mean: number, stdDev: number): number {
    const n = values.length;
    const kurt = values.reduce((sum: number, v: number) => sum + Math.pow((v - mean) / stdDev, 4), 0) / n;
    return kurt - 3; // Excess kurtosis
  }

  // Distribution sampling functions using local PRNG (no global Math.random override)
  private sampleNormal(mean: number, stdDev: number): number {
    return this.prng.nextNormal(mean, stdDev);
  }

  private sampleLogNormal(mean: number, stdDev: number): number {
    return this.prng.nextLogNormal(mean, stdDev);
  }

  private sampleTriangular(min: number, max: number, mode: number): number {
    return this.prng.nextTriangular(min, max, mode);
  }

  private sampleBeta(alpha: number, beta: number, min: number, max: number): number {
    return this.prng.nextBeta(alpha, beta, min, max);
  }

  // Helper functions for portfolio analysis
  private generateExitScenarios(companies: PortfolioCompanyWithInvestments[], scenarios: number): number[] {
    return Array(scenarios).fill(0).map(() =>
      companies.filter(() => this.prng.next() < 0.3).length // 30% exit probability
    );
  }

  private generateExitMultipleScenarios(companies: PortfolioCompanyWithInvestments[], scenarios: number): number[] {
    return Array(scenarios).fill(0).map(() =>
      this.sampleLogNormal(1.5, 0.8) // Typical VC exit multiples
    );
  }

  private generateSectorScenarios(companies: PortfolioCompanyWithInvestments[], scenarios: number): number[] {
    return Array(scenarios).fill(0).map(() =>
      companies.reduce((sum: number, _company: PortfolioCompanyWithInvestments) => {
        const performance = this.sampleNormal(0.15, 0.25); // 15% mean return, 25% volatility
        return sum + performance;
      }, 0) / companies.length
    );
  }

  private generateStageScenarios(companies: PortfolioCompanyWithInvestments[], scenarios: number): number[] {
    // Different volatility by stage
    const stageVolatility: Record<string, number> = {
      'seed': 0.5,
      'series-a': 0.4,
      'series-b': 0.3,
      'series-c': 0.25,
      'later-stage': 0.2
    };

    return Array(scenarios).fill(0).map(() =>
      companies.reduce((sum: number, company: PortfolioCompanyWithInvestments) => {
        const volatility = stageVolatility[company.stage] || 0.3;
        const performance = this.sampleNormal(0.15, volatility);
        return sum + performance;
      }, 0) / companies.length
    );
  }

  private calculateReserveCoverage(allocation: number, simulationResults: Record<string, SimulationResult>, scenarios: number): number {
    const totalValueResult = simulationResults['totalValue'];
    if (!totalValueResult) {
      return 0;
    }
    const totalValueScenarios = totalValueResult.scenarios;

    // Simulate reserve coverage scenarios
    const coverageScenarios = Array(scenarios).fill(0).map(() => {
      const randomIndex = Math.floor(this.prng.next() * totalValueScenarios.length);
      const totalValue = totalValueScenarios[randomIndex] ?? 0;
      const reserveAmount = totalValue * allocation;
      const followOnNeed = this.sampleLogNormal(reserveAmount * 0.6, reserveAmount * 0.3);
      return followOnNeed > 0 ? Math.min(reserveAmount / followOnNeed, 1.0) : 0;
    });

    return coverageScenarios.reduce((sum: number, v: number) => sum + v, 0) / coverageScenarios.length;
  }

  private calculateRiskAdjustedReturn(allocation: number, simulationResults: Record<string, SimulationResult>): number {
    const irrResult = simulationResults['irr'];
    if (!irrResult) {
      return 0;
    }
    const expectedReturn = irrResult.mean;
    const volatility = irrResult.standardDeviation;
    const allocationPenalty = Math.pow(allocation - 0.25, 2); // Penalty for deviating from 25% optimal

    return volatility > 0 ? expectedReturn / volatility - allocationPenalty : 0;
  }

  private async getFundSize(fundId: number): Promise<number> {
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId)
    });
    return parseFloat(fund?.size?.toString() || '100000000');
  }

  /**
   * Get portfolio stage distribution for power law sampling
   */
  private async getPortfolioStageDistribution(fundId: number): Promise<Record<string, number>> {
    const portfolioCompaniesData = await db.query.portfolioCompanies.findMany({
      where: eq(portfolioCompanies.fundId, fundId)
    });

    if (portfolioCompaniesData.length === 0) {
      // Default to seed stage if no portfolio data
      return { 'seed': 1.0 };
    }

    // Count companies by stage
    const stageCounts: Record<string, number> = {};
    portfolioCompaniesData.forEach(company => {
      const stage = this.normalizeStage(company.stage);
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    });

    // Convert to proportions
    const total = portfolioCompaniesData.length;
    const stageDistribution: Record<string, number> = {};
    for (const [stage, count] of Object.entries(stageCounts)) {
      stageDistribution[stage] = (count ?? 0) / total;
    }

    return stageDistribution;
  }

  /**
   * Normalize stage names to match power law distribution types
   */
  private normalizeStage(stage: string | null): InvestmentStage {
    if (!stage) return 'seed';

    const normalized = stage.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (normalized.includes('pre-seed') || normalized.includes('preseed')) {
      return 'pre-seed';
    } else if (normalized.includes('seed') && !normalized.includes('series')) {
      return 'seed';
    } else if (normalized.includes('series-a') || normalized.includes('a-round')) {
      return 'series-a';
    } else if (normalized.includes('series-b') || normalized.includes('b-round')) {
      return 'series-b';
    } else if (normalized.includes('series-c') || normalized.includes('c-round') ||
               normalized.includes('series-d') || normalized.includes('later')) {
      return 'series-c+';
    }

    // Default to seed for unknown stages
    return 'seed';
  }

  /**
   * Select stage randomly based on distribution weights using local PRNG
   */
  private selectStageFromDistribution(distribution: Record<string, number>): InvestmentStage {
    const stages = Object.keys(distribution);
    if (stages.length === 0) {
      return 'seed';
    }

    const rand = this.prng.next();
    let cumulativeProb = 0;

    for (const stage of stages) {
      cumulativeProb += distribution[stage] ?? 0;
      if (rand <= cumulativeProb) {
        return this.normalizeStage(stage);
      }
    }

    // Fallback to first stage
    const firstStage = stages[0];
    return firstStage ? this.normalizeStage(firstStage) : 'seed';
  }
}

// Export singleton instance
export const monteCarloSimulationService = new MonteCarloSimulationService();