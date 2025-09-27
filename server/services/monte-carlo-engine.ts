/**
 * Monte Carlo Engine Service
 *
 * High-performance simulation engine for VC portfolio modeling with focus on:
 * - Practical fund construction insights
 * - Fast execution (<5 seconds for 10k simulations)
 * - Actionable risk metrics and reserve optimization
 * - Integration with existing variance tracking data
 *
 * @author Claude Code
 * @version 2.0
 */

import { db } from '../db';
import {
  funds,
  fundBaselines,
  monteCarloSimulations,
  varianceReports
} from '@shared/schema';
import type {
  InsertMonteCarloSimulation,
  FundBaseline
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { toSafeNumber } from '@shared/type-safety-utils';
import { logMonteCarloOperation, logMonteCarloError, logPerformance, PerformanceMonitor } from '../utils/logger.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SimulationConfig {
  fundId: number;
  runs: number; // 1000-10000 simulation runs
  timeHorizonYears: number;
  baselineId?: string;
  portfolioSize?: number; // Target portfolio size
  deploymentScheduleMonths?: number; // Deployment period
  randomSeed?: number; // For reproducible results
}

export interface MarketEnvironment {
  scenario: 'bull' | 'bear' | 'neutral';
  exitMultipliers: {
    mean: number;
    volatility: number;
  };
  failureRate: number; // 0-1
  followOnProbability: number; // 0-1
}

export interface PortfolioInputs {
  fundSize: number;
  deployedCapital: number;
  reserveRatio: number;
  sectorWeights: Record<string, number>;
  stageWeights: Record<string, number>;
  averageInvestmentSize: number;
}

export interface DistributionParameters {
  irr: { mean: number; volatility: number };
  multiple: { mean: number; volatility: number };
  dpi: { mean: number; volatility: number };
  exitTiming: { mean: number; volatility: number }; // Years to exit
  followOnSize: { mean: number; volatility: number }; // As % of initial
}

export interface SimulationResults {
  simulationId: string;
  config: SimulationConfig;
  executionTimeMs: number;

  // Performance distributions
  irr: PerformanceDistribution;
  multiple: PerformanceDistribution;
  dpi: PerformanceDistribution;
  tvpi: PerformanceDistribution;
  totalValue: PerformanceDistribution;

  // Risk metrics
  riskMetrics: RiskMetrics;

  // Reserve optimization
  reserveOptimization: ReserveOptimization;

  // Scenario analysis
  scenarios: ScenarioAnalysis;

  // Actionable insights
  insights: ActionableInsights;
}

export interface PerformanceDistribution {
  scenarios: number[];
  percentiles: {
    p5: number;
    p25: number;
    p50: number; // median
    p75: number;
    p95: number;
  };
  statistics: {
    mean: number;
    standardDeviation: number;
    min: number;
    max: number;
  };
  confidenceIntervals: {
    ci68: [number, number]; // ±1 std dev
    ci95: [number, number]; // ±2 std dev
  };
}

export interface RiskMetrics {
  valueAtRisk: {
    var5: number;  // 5% VaR
    var10: number; // 10% VaR
  };
  conditionalValueAtRisk: {
    cvar5: number;
    cvar10: number;
  };
  probabilityOfLoss: number;
  downsideRisk: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
}

export interface ReserveOptimization {
  currentReserveRatio: number;
  optimalReserveRatio: number;
  improvementPotential: number; // Expected IRR improvement
  coverageScenarios: {
    p25: number; // % of follow-on needs covered
    p50: number;
    p75: number;
  };
  allocationRecommendations: Array<{
    reserveRatio: number;
    expectedIRR: number;
    riskAdjustedReturn: number;
    followOnCoverage: number;
  }>;
}

export interface ScenarioAnalysis {
  bullMarket: Record<string, number>;    // 90th percentile
  bearMarket: Record<string, number>;    // 10th percentile
  stressTest: Record<string, number>;    // 5th percentile
  baseCase: Record<string, number>;      // 50th percentile
}

export interface ActionableInsights {
  primaryRecommendations: string[];
  riskWarnings: string[];
  opportunityAreas: string[];
  keyMetrics: Array<{
    metric: string;
    value: number;
    benchmark: number;
    status: 'above' | 'below' | 'at' | 'warning';
    impact: 'high' | 'medium' | 'low';
  }>;
}

// ============================================================================
// MONTE CARLO ENGINE CLASS
// ============================================================================

export class MonteCarloEngine {

  /**
   * Run portfolio construction simulation
   */
  async runPortfolioSimulation(config: SimulationConfig): Promise<SimulationResults> {
    const startTime = Date.now();
    const simulationId = uuidv4();

    try {
      // Validate configuration
      this.validateConfig(config);

      // Get baseline data and historical patterns
      const baseline = await this.getBaselineData(config.fundId, config.baselineId);
      const portfolioInputs = await this.getPortfolioInputs(config.fundId, baseline);
      const distributions = await this.calibrateDistributions(config.fundId, baseline);

      // Set random seed for reproducibility
      if (config.randomSeed) {
        this.setRandomSeed(config.randomSeed);
      }

      // Run simulations in parallel batches for performance
      const batchSize = Math.min(1000, Math.floor(config.runs / 4));
      const scenarios = await this.runSimulationBatches(
        config,
        portfolioInputs,
        distributions,
        batchSize
      );

      // Calculate performance distributions
      const performanceResults = this.calculatePerformanceDistributions(scenarios);

      // Calculate risk metrics
      const riskMetrics = this.calculateRiskMetrics(scenarios, performanceResults);

      // Optimize reserve allocation
      const reserveOptimization = await this.optimizeReserveAllocation(
        config,
        portfolioInputs,
        scenarios
      );

      // Generate scenario analysis
      const scenarioAnalysis = this.generateScenarioAnalysis(performanceResults);

      // Generate actionable insights
      const insights = this.generateInsights(
        performanceResults,
        riskMetrics,
        reserveOptimization,
        baseline
      );

      const results: SimulationResults = {
        simulationId,
        config,
        executionTimeMs: Date.now() - startTime,
        irr: performanceResults.irr,
        multiple: performanceResults.multiple,
        dpi: performanceResults.dpi,
        tvpi: performanceResults.tvpi,
        totalValue: performanceResults.totalValue,
        riskMetrics,
        reserveOptimization,
        scenarios: scenarioAnalysis,
        insights
      };

      // Store results
      await this.storeResults(results);

      return results;

    } catch (error) {
      throw new Error(`Portfolio simulation failed: ${error.message}`);
    }
  }

  /**
   * Calculate comprehensive risk metrics
   */
  calculateRiskMetrics(scenarios: any[], performanceResults: any): RiskMetrics {
    const irrScenarios = performanceResults.irr.scenarios.sort((a: number, b: number) => a - b);
    const totalValueScenarios = performanceResults.totalValue.scenarios.sort((a: number, b: number) => a - b);

    // Value at Risk (VaR)
    const var5Index = Math.floor(0.05 * irrScenarios.length);
    const var10Index = Math.floor(0.10 * irrScenarios.length);

    const var5 = irrScenarios[var5Index];
    const var10 = irrScenarios[var10Index];

    // Conditional Value at Risk (Expected Shortfall)
    const cvar5 = irrScenarios.slice(0, var5Index).reduce((sum: number, val: number) => sum + val, 0) / var5Index;
    const cvar10 = irrScenarios.slice(0, var10Index).reduce((sum: number, val: number) => sum + val, 0) / var10Index;

    // Probability of loss (IRR < 0)
    const probabilityOfLoss = irrScenarios.filter(irr => irr < 0).length / irrScenarios.length;

    // Downside risk (standard deviation of negative returns)
    const negativeReturns = irrScenarios.filter(irr => irr < performanceResults.irr.statistics.mean);
    const downsideVariance = negativeReturns.reduce((sum: number, ret: number) => {
      return sum + Math.pow(ret - performanceResults.irr.statistics.mean, 2);
    }, 0) / negativeReturns.length;
    const downsideRisk = Math.sqrt(downsideVariance);

    // Sharpe ratio (assuming risk-free rate of 2%)
    const riskFreeRate = 0.02;
    const excessReturn = performanceResults.irr.statistics.mean - riskFreeRate;
    const sharpeRatio = excessReturn / performanceResults.irr.statistics.standardDeviation;

    // Sortino ratio (downside deviation)
    const sortinoRatio = excessReturn / downsideRisk;

    // Max drawdown simulation
    const maxDrawdown = this.calculateMaxDrawdown(scenarios);

    return {
      valueAtRisk: { var5, var10 },
      conditionalValueAtRisk: { cvar5, cvar10 },
      probabilityOfLoss,
      downsideRisk,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown
    };
  }

  /**
   * Optimize reserve allocation strategy
   */
  async optimizeReserveAllocation(
    config: SimulationConfig,
    portfolioInputs: PortfolioInputs,
    scenarios: any[]
  ): Promise<ReserveOptimization> {
    const currentReserveRatio = portfolioInputs.reserveRatio;

    // Test reserve ratios from 10% to 50%
    const reserveRatios = [];
    for (let ratio = 0.10; ratio <= 0.50; ratio += 0.05) {
      reserveRatios.push(ratio);
    }

    const allocationAnalysis = [];

    for (const ratio of reserveRatios) {
      // Simulate portfolio with this reserve ratio
      const adjustedScenarios = this.simulateReserveAllocation(scenarios, ratio, portfolioInputs);

      const expectedIRR = adjustedScenarios.reduce((sum: number, s: any) => sum + s.irr, 0) / adjustedScenarios.length;
      const irrVolatility = Math.sqrt(
        adjustedScenarios.reduce((sum: number, s: any) => sum + Math.pow(s.irr - expectedIRR, 2), 0) / adjustedScenarios.length
      );

      const followOnCoverage = this.calculateFollowOnCoverage(adjustedScenarios, ratio);
      const riskAdjustedReturn = (expectedIRR - 0.02) / irrVolatility; // Sharpe-like ratio

      allocationAnalysis.push({
        reserveRatio: ratio,
        expectedIRR,
        riskAdjustedReturn,
        followOnCoverage
      });
    }

    // Find optimal allocation (highest risk-adjusted return)
    const optimal = allocationAnalysis.reduce((best: any, current: any) =>
      current.riskAdjustedReturn > best.riskAdjustedReturn ? current : best
    );

    // Calculate coverage scenarios for current allocation
    const coverageScenarios = this.calculateCoverageScenarios(scenarios, portfolioInputs);

    return {
      currentReserveRatio,
      optimalReserveRatio: optimal.reserveRatio,
      improvementPotential: optimal.expectedIRR -
        allocationAnalysis.find(a => Math.abs(a.reserveRatio - currentReserveRatio) < 0.01)?.expectedIRR || 0,
      coverageScenarios,
      allocationRecommendations: allocationAnalysis
    };
  }

  /**
   * Generate performance forecasts with market scenarios
   */
  generatePerformanceForecasts(
    config: SimulationConfig,
    marketEnvironments: MarketEnvironment[]
  ): Promise<Record<string, SimulationResults>> {
    // Implementation for multiple market environment scenarios
    throw new Error('Method not implemented yet');
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private validateConfig(config: SimulationConfig): void {
    if (config.runs < 100 || config.runs > 50000) {
      throw new Error('Simulation runs must be between 100 and 50,000');
    }
    if (config.timeHorizonYears < 1 || config.timeHorizonYears > 15) {
      throw new Error('Time horizon must be between 1 and 15 years');
    }
  }

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
      baseline = await db.query.fundBaselines.findFirst({
        where: and(
          eq(fundBaselines.fundId, fundId),
          eq(fundBaselines.isDefault, true),
          eq(fundBaselines.isActive, true)
        )
      });
    }

    if (!baseline) {
      throw new Error('No suitable baseline found for simulation');
    }

    return baseline;
  }

  private async getPortfolioInputs(fundId: number, baseline: FundBaseline): Promise<PortfolioInputs> {
    // Get fund size
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId)
    });

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    const fundSize = parseFloat(fund.size.toString());
    const deployedCapital = parseFloat(baseline.deployedCapital.toString());
    const reserveRatio = (fundSize - deployedCapital) / fundSize;

    // Get portfolio composition from baseline
    const sectorDistribution = baseline.sectorDistribution as Record<string, number> || {};
    const stageDistribution = baseline.stageDistribution as Record<string, number> || {};

    // Normalize distributions
    const totalSectorCount = Object.values(sectorDistribution).reduce((sum: any, count: any) => sum + count, 0);
    const totalStageCount = Object.values(stageDistribution).reduce((sum: any, count: any) => sum + count, 0);

    const sectorWeights: Record<string, number> = {};
    const stageWeights: Record<string, number> = {};

    for (const [sector, count] of Object.entries(sectorDistribution)) {
      sectorWeights[sector] = totalSectorCount > 0 ? count / totalSectorCount : 0;
    }

    for (const [stage, count] of Object.entries(stageDistribution)) {
      stageWeights[stage] = totalStageCount > 0 ? count / totalStageCount : 0;
    }

    return {
      fundSize,
      deployedCapital,
      reserveRatio,
      sectorWeights,
      stageWeights,
      averageInvestmentSize: parseFloat(baseline.averageInvestment?.toString() || '1000000')
    };
  }

  private async calibrateDistributions(fundId: number, baseline: FundBaseline): Promise<DistributionParameters> {
    // Get historical variance data
    const reports = await db.query.varianceReports.findMany({
      where: and(
        eq(varianceReports.fundId, fundId),
        eq(varianceReports.baselineId, baseline.id)
      ),
      orderBy: desc(varianceReports.asOfDate),
      limit: 30 // Last 30 reports for calibration
    });

    if (reports.length < 3) {
      // Use default industry parameters if insufficient data
      return this.getDefaultDistributions();
    }

    // Extract variance patterns
    const irrVariances = this.extractVariances(reports, 'irrVariance');
    const multipleVariances = this.extractVariances(reports, 'multipleVariance');
    const dpiVariances = this.extractVariances(reports, 'dpiVariance');

    return {
      irr: {
        mean: parseFloat(baseline.irr?.toString() || '0.15'),
        volatility: this.calculateVolatility(irrVariances) || 0.08
      },
      multiple: {
        mean: parseFloat(baseline.multiple?.toString() || '2.5'),
        volatility: this.calculateVolatility(multipleVariances) || 0.6
      },
      dpi: {
        mean: parseFloat(baseline.dpi?.toString() || '0.8'),
        volatility: this.calculateVolatility(dpiVariances) || 0.3
      },
      exitTiming: {
        mean: 5.5, // Average 5.5 years to exit
        volatility: 2.0
      },
      followOnSize: {
        mean: 0.5, // 50% of initial investment
        volatility: 0.3
      }
    };
  }

  private getDefaultDistributions(): DistributionParameters {
    return {
      irr: { mean: 0.15, volatility: 0.08 },
      multiple: { mean: 2.5, volatility: 0.6 },
      dpi: { mean: 0.8, volatility: 0.3 },
      exitTiming: { mean: 5.5, volatility: 2.0 },
      followOnSize: { mean: 0.5, volatility: 0.3 }
    };
  }

  private extractVariances(reports: any[], field: string): number[] {
    return reports
      .map(r => r[field])
      .filter(v => v !== null && v !== undefined)
      .map(v => parseFloat(v.toString()));
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum: any, v: any) => sum + v, 0) / values.length;
    const variance = values.reduce((sum: any, v: any) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  private async runSimulationBatches(
    config: SimulationConfig,
    portfolioInputs: PortfolioInputs,
    distributions: DistributionParameters,
    batchSize: number
  ): Promise<any[]> {
    const totalBatches = Math.ceil(config.runs / batchSize);
    const allScenarios: any[] = [];

    // Run batches in parallel for performance
    const batchPromises = [];
    for (let i = 0; i < totalBatches; i++) {
      const runsInBatch = Math.min(batchSize, config.runs - i * batchSize);
      batchPromises.push(
        this.runSimulationBatch(runsInBatch, portfolioInputs, distributions, config.timeHorizonYears)
      );
    }

    const batchResults = await Promise.all(batchPromises);
    for (const batch of batchResults) {
      allScenarios.push(...batch);
    }

    return allScenarios;
  }

  private async runSimulationBatch(
    runs: number,
    portfolioInputs: PortfolioInputs,
    distributions: DistributionParameters,
    timeHorizonYears: number
  ): Promise<any[]> {
    const scenarios = [];

    for (let i = 0; i < runs; i++) {
      const scenario = this.generateSingleScenario(portfolioInputs, distributions, timeHorizonYears);
      scenarios.push(scenario);
    }

    return scenarios;
  }

  private generateSingleScenario(
    portfolioInputs: PortfolioInputs,
    distributions: DistributionParameters,
    timeHorizonYears: number
  ): any {
    // Generate correlated random variables for this scenario
    const irrSample = this.sampleNormal(distributions.irr.mean, distributions.irr.volatility);
    const multipleSample = this.sampleNormal(distributions.multiple.mean, distributions.multiple.volatility);
    const dpiSample = this.sampleNormal(distributions.dpi.mean, distributions.dpi.volatility);
    const exitTimingSample = Math.max(1, this.sampleNormal(distributions.exitTiming.mean, distributions.exitTiming.volatility));

    // Apply time decay for longer horizons
    const timeDecay = Math.pow(0.98, timeHorizonYears - 5); // Slight decay for longer periods
    const compoundFactor = Math.pow(1 + irrSample, timeHorizonYears);

    // Calculate scenario values
    const totalValue = portfolioInputs.deployedCapital * multipleSample * compoundFactor * timeDecay;
    const tvpi = multipleSample * timeDecay;

    return {
      irr: irrSample,
      multiple: multipleSample,
      dpi: Math.max(0, dpiSample),
      tvpi: Math.max(0, tvpi),
      totalValue: Math.max(0, totalValue),
      exitTiming: exitTimingSample,
      followOnNeed: this.sampleNormal(distributions.followOnSize.mean, distributions.followOnSize.volatility)
    };
  }

  private calculatePerformanceDistributions(scenarios: any[]): any {
    const metrics = ['irr', 'multiple', 'dpi', 'tvpi', 'totalValue'];
    const results: any = {};

    for (const metric of metrics) {
      const values = scenarios.map(s => s[metric]).sort((a: any, b: any) => a - b);
      results[metric] = this.createPerformanceDistribution(values);
    }

    return results;
  }

  private createPerformanceDistribution(values: number[]): PerformanceDistribution {
    const mean = values.reduce((sum: any, v: any) => sum + v, 0) / values.length;
    const variance = values.reduce((sum: any, v: any) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    const standardDeviation = Math.sqrt(variance);

    const percentiles = {
      p5: this.getPercentile(values, 5),
      p25: this.getPercentile(values, 25),
      p50: this.getPercentile(values, 50),
      p75: this.getPercentile(values, 75),
      p95: this.getPercentile(values, 95)
    };

    return {
      scenarios: values,
      percentiles,
      statistics: {
        mean,
        standardDeviation,
        min: Math.min(...values),
        max: Math.max(...values)
      },
      confidenceIntervals: {
        ci68: [mean - standardDeviation, mean + standardDeviation],
        ci95: [mean - 2 * standardDeviation, mean + 2 * standardDeviation]
      }
    };
  }

  private getPercentile(sortedValues: number[], percentile: number): number {
    const index = Math.floor((percentile / 100) * (sortedValues.length - 1));
    return sortedValues[index];
  }

  private calculateMaxDrawdown(scenarios: any[]): number {
    // Simulate portfolio value over time to find max drawdown
    const timePoints = 20; // Quarterly points over 5 years
    let maxDrawdown = 0;

    for (const scenario of scenarios.slice(0, 1000)) { // Sample for performance
      let peak = scenario.totalValue;
      let currentValue = scenario.totalValue;

      for (let t = 1; t <= timePoints; t++) {
        // Simulate value evolution with some volatility
        const volatility = 0.15;
        const randomShock = this.sampleNormal(0, volatility / Math.sqrt(4)); // Quarterly volatility
        currentValue *= (1 + randomShock);

        if (currentValue > peak) {
          peak = currentValue;
        }

        const drawdown = (peak - currentValue) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown;
  }

  private simulateReserveAllocation(scenarios: any[], reserveRatio: number, portfolioInputs: PortfolioInputs): any[] {
    return scenarios.map(scenario => {
      // Adjust scenario based on reserve allocation
      const reserveAmount = portfolioInputs.fundSize * reserveRatio;
      const deployableCapital = portfolioInputs.fundSize - reserveAmount;

      // Follow-on investment impact
      const followOnMultiplier = Math.min(1 + scenario.followOnNeed * reserveRatio, 1.5);

      return {
        ...scenario,
        irr: scenario.irr * followOnMultiplier,
        multiple: scenario.multiple * followOnMultiplier,
        totalValue: scenario.totalValue * (deployableCapital / portfolioInputs.deployedCapital) * followOnMultiplier
      };
    });
  }

  private calculateFollowOnCoverage(scenarios: any[], reserveRatio: number): number {
    const coverageRatios = scenarios.map(scenario => {
      const followOnNeed = Math.abs(scenario.followOnNeed);
      const coverage = Math.min(reserveRatio / Math.max(followOnNeed, 0.01), 1.0);
      return coverage;
    });

    return coverageRatios.reduce((sum: any, ratio: any) => sum + ratio, 0) / coverageRatios.length;
  }

  private calculateCoverageScenarios(scenarios: any[], portfolioInputs: PortfolioInputs): any {
    const coverageValues = scenarios.map(scenario => {
      const followOnNeed = Math.abs(scenario.followOnNeed);
      return Math.min(portfolioInputs.reserveRatio / Math.max(followOnNeed, 0.01), 1.0);
    }).sort((a: any, b: any) => a - b);

    return {
      p25: this.getPercentile(coverageValues, 25),
      p50: this.getPercentile(coverageValues, 50),
      p75: this.getPercentile(coverageValues, 75)
    };
  }

  private generateScenarioAnalysis(performanceResults: any): ScenarioAnalysis {
    return {
      bullMarket: {
        irr: performanceResults.irr.percentiles.p90 || performanceResults.irr.percentiles.p95,
        multiple: performanceResults.multiple.percentiles.p90 || performanceResults.multiple.percentiles.p95,
        totalValue: performanceResults.totalValue.percentiles.p90 || performanceResults.totalValue.percentiles.p95
      },
      bearMarket: {
        irr: performanceResults.irr.percentiles.p10 || performanceResults.irr.percentiles.p5,
        multiple: performanceResults.multiple.percentiles.p10 || performanceResults.multiple.percentiles.p5,
        totalValue: performanceResults.totalValue.percentiles.p10 || performanceResults.totalValue.percentiles.p5
      },
      stressTest: {
        irr: performanceResults.irr.percentiles.p5,
        multiple: performanceResults.multiple.percentiles.p5,
        totalValue: performanceResults.totalValue.percentiles.p5
      },
      baseCase: {
        irr: performanceResults.irr.percentiles.p50,
        multiple: performanceResults.multiple.percentiles.p50,
        totalValue: performanceResults.totalValue.percentiles.p50
      }
    };
  }

  private generateInsights(
    performanceResults: any,
    riskMetrics: RiskMetrics,
    reserveOptimization: ReserveOptimization,
    baseline: FundBaseline
  ): ActionableInsights {
    const recommendations: string[] = [];
    const warnings: string[] = [];
    const opportunities: string[] = [];

    // Reserve allocation insights
    if (reserveOptimization.improvementPotential > 0.02) {
      recommendations.push(
        `Adjust reserve allocation to ${(reserveOptimization.optimalReserveRatio * 100).toFixed(1)}% to improve expected IRR by ${(reserveOptimization.improvementPotential * 100).toFixed(1)}%`
      );
    }

    // Risk warnings
    if (riskMetrics.probabilityOfLoss > 0.15) {
      warnings.push(`High downside risk: ${(riskMetrics.probabilityOfLoss * 100).toFixed(1)}% probability of negative returns`);
    }

    if (riskMetrics.sharpeRatio < 1.0) {
      warnings.push(`Low risk-adjusted returns (Sharpe ratio: ${riskMetrics.sharpeRatio.toFixed(2)})`);
    }

    // Opportunity identification
    if (performanceResults.irr.statistics.standardDeviation > 0.12) {
      opportunities.push('High return variance suggests potential for better portfolio diversification');
    }

    if (reserveOptimization.coverageScenarios.p50 < 0.7) {
      opportunities.push('Consider increasing follow-on capacity to capture more upside opportunities');
    }

    // Key metrics comparison
    const keyMetrics: Array<{
      metric: string;
      value: number;
      benchmark: number;
      status: 'above' | 'below' | 'at' | 'warning';
      impact: 'high' | 'medium' | 'low';
    }> = [
      {
        metric: 'Expected IRR',
        value: toSafeNumber(performanceResults.irr.statistics.mean),
        benchmark: 0.15,
        status: toSafeNumber(performanceResults.irr.statistics.mean) >= 0.15 ? 'above' : 'below',
        impact: 'high'
      },
      {
        metric: 'Risk-Adjusted Return',
        value: toSafeNumber(riskMetrics.sharpeRatio),
        benchmark: 1.0,
        status: toSafeNumber(riskMetrics.sharpeRatio) >= 1.0 ? 'above' : 'below',
        impact: 'high'
      },
      {
        metric: 'Downside Risk',
        value: toSafeNumber(riskMetrics.probabilityOfLoss),
        benchmark: 0.1,
        status: toSafeNumber(riskMetrics.probabilityOfLoss) <= 0.1 ? 'above' : 'warning',
        impact: 'medium'
      }
    ];

    return {
      primaryRecommendations: recommendations.slice(0, 3),
      riskWarnings: warnings,
      opportunityAreas: opportunities,
      keyMetrics
    };
  }

  private async storeResults(results: SimulationResults): Promise<void> {
    const simulationData: InsertMonteCarloSimulation = {
      fundId: results.config.fundId,
      simulationName: `Monte Carlo Simulation ${new Date().toISOString()}`,
      simulationType: 'portfolio_construction',
      numberOfRuns: results.config.runs,
      inputDistributions: {},
      summaryStatistics: {},
      percentileResults: {},
      createdBy: 1, // TODO: Get from context
      tags: ['portfolio-construction', 'risk-analysis', 'reserve-optimization'],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      metadata: {
        baseline: results.config.baselineId,
        timeHorizon: results.config.timeHorizonYears,
        randomSeed: results.config.randomSeed
      }
    };

    await db.insert(monteCarloSimulations).values(simulationData);
  }

  // Utility functions
  private setRandomSeed(seed: number): void {
    let state = seed;
    Math.random = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  private sampleNormal(mean: number, stdDev: number): number {
    // Box-Muller transformation for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

/**
 * Example usage of the Monte Carlo Engine
 */
export async function exampleUsage(): Promise<void> {
  const engine = new MonteCarloEngine();

  // Basic portfolio simulation
  const config: SimulationConfig = {
    fundId: 1,
    runs: 10000,
    timeHorizonYears: 8,
    portfolioSize: 25,
    deploymentScheduleMonths: 36,
    randomSeed: 12345 // For reproducible results
  };

  try {
    const perfMonitor = new PerformanceMonitor('monte_carlo_simulation', { fundId: config.fundId, runs: config.runs });
    logMonteCarloOperation('Starting simulation', config.fundId, {
      runs: config.runs,
      timeHorizonYears: config.timeHorizonYears,
      portfolioSize: config.portfolioSize
    });

    const results = await engine.runPortfolioSimulation(config);
    const executionTime = perfMonitor.end({ simulationId: results.simulationId });

    logMonteCarloOperation('Simulation completed successfully', config.fundId, {
      simulationId: results.simulationId,
      executionTimeMs: results.executionTimeMs,
      expectedIRR: results.irr.statistics.mean,
      expectedMultiple: results.multiple.statistics.mean,
      optimalReserveRatio: results.reserveOptimization.optimalReserveRatio,
      valueAtRisk5: results.riskMetrics.valueAtRisk.var5,
      recommendations: results.insights.primaryRecommendations.length,
      riskWarnings: results.insights.riskWarnings.length
    });

  } catch (error) {
    logMonteCarloError('Simulation failed', config.fundId, error as Error, {
      runs: config.runs,
      timeHorizonYears: config.timeHorizonYears
    });
  }
}

// Export singleton instance for convenience
export const monteCarloEngine = new MonteCarloEngine();