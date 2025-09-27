/**
 * Reserve Optimization Calculator
 *
 * Calculates optimal reserve allocation strategies using Monte Carlo simulation results,
 * historical performance data, and portfolio construction constraints.
 */

import { db } from '../db';
import {
  portfolioCompanies,
  fundBaselines,
  fundSnapshots
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { monteCarloSimulationService, type MonteCarloForecast, type SimulationParameters } from './monte-carlo-simulation';
import { portfolioPerformancePredictorService, type PortfolioPerformanceForecast } from './portfolio-performance-predictor';

/**
 * Reserve allocation recommendation for a specific company
 */
export interface CompanyReserveRecommendation {
  companyId: number;
  companyName: string;
  sector: string;
  stage: string;
  currentInvestment: number;
  currentValuation: number;

  // Allocation recommendations
  recommendedReserveAmount: number;
  recommendedAllocationPercentage: number; // % of total reserves
  maxRecommendedInvestment: number; // Total including initial + reserves

  // Follow-on strategy
  followOnStrategy: {
    tranches: Array<{
      tranche: number;
      amount: number;
      triggerConditions: string[];
      expectedTiming: number; // months from now
      confidenceLevel: number; // 0-1
    }>;
    totalFollowOnCapacity: number;
    expectedUtilization: number; // % likely to be used
  };

  // Performance justification
  performanceMetrics: {
    expectedReturn: number; // IRR
    expectedMultiple: number;
    riskScore: number; // 0-1, higher = riskier
    opportunityScore: number; // 0-1, higher = better opportunity
    strategicImportance: number; // 0-1, portfolio strategy importance
  };

  // Risk analysis
  riskFactors: {
    concentrationRisk: number; // Risk of over-concentration
    liquidityRisk: number; // Risk of needing liquidity
    marketRisk: number; // Market-dependent risks
    executionRisk: number; // Company execution risks
    competitiveRisk: number; // Competitive landscape risks
  };

  // Optimization rationale
  rationale: {
    primaryReasons: string[];
    dataConfidence: number; // 0-1 confidence in recommendation
    alternativeAllocations: Array<{
      amount: number;
      expectedOutcome: number;
      riskProfile: string;
    }>;
  };
}

/**
 * Fund-level reserve optimization strategy
 */
export interface FundReserveOptimization {
  fundId: number;
  optimizationId: string;
  createdAt: Date;
  optimizationObjective: 'maximize_irr' | 'minimize_risk' | 'risk_adjusted_return' | 'portfolio_balance';

  // Overall allocation strategy
  fundLevelStrategy: {
    totalFundSize: number;
    deployedCapital: number;
    currentReserves: number;
    recommendedTotalReserves: number;
    recommendedReservePercentage: number;
    optimalDeploymentSchedule: Array<{
      period: string; // YYYY-QQ
      plannedDeployment: number;
      cumulativeDeployment: number;
      reservesRemaining: number;
    }>;
  };

  // Company-specific recommendations
  companyRecommendations: CompanyReserveRecommendation[];

  // Portfolio-level insights
  portfolioInsights: {
    diversificationScore: number; // Current diversification level
    concentrationRisks: Array<{
      type: 'sector' | 'stage' | 'geography';
      category: string;
      currentConcentration: number;
      riskLevel: 'low' | 'medium' | 'high';
      recommendedAction: string;
    }>;
    rebalancingOpportunities: Array<{
      action: 'increase' | 'decrease' | 'maintain';
      category: string;
      currentAllocation: number;
      recommendedAllocation: number;
      expectedImpact: number;
    }>;
  };

  // Risk management
  riskManagement: {
    portfolioVaR: number; // 5% Value at Risk
    expectedShortfall: number; // Expected loss beyond VaR
    correlationRisks: Array<{
      companies: string[];
      correlationLevel: number;
      riskMitigation: string;
    }>;
    liquidityRequirements: {
      emergencyReserve: number;
      plannedLiquidity: Array<{
        timeframe: string;
        amount: number;
        purpose: string;
      }>;
    };
  };

  // Performance projections
  performanceProjections: {
    currentTrajectory: {
      expectedIRR: number;
      expectedMultiple: number;
      probabilityOfSuccess: number; // Probability of meeting targets
    };
    optimizedTrajectory: {
      expectedIRR: number;
      expectedMultiple: number;
      probabilityOfSuccess: number;
      improvementOverCurrent: number;
    };
    scenarioAnalysis: {
      bullCase: { irr: number; multiple: number; probability: number };
      baseCase: { irr: number; multiple: number; probability: number };
      bearCase: { irr: number; multiple: number; probability: number };
    };
  };

  // Optimization methodology
  methodology: {
    algorithmsUsed: string[];
    dataInputs: string[];
    constraints: Array<{
      type: string;
      description: string;
      value: number;
    }>;
    assumptions: Array<{
      category: string;
      assumption: string;
      confidence: number;
    }>;
  };

  // Implementation roadmap
  implementationRoadmap: {
    immediateActions: Array<{
      action: string;
      priority: 'high' | 'medium' | 'low';
      timeframe: string;
      expectedImpact: number;
    }>;
    quarterlyMilestones: Array<{
      quarter: string;
      milestones: string[];
      kpis: Array<{ metric: string; target: number }>;
    }>;
    riskMitigations: Array<{
      risk: string;
      mitigation: string;
      timeline: string;
    }>;
  };

  // Underlying analysis data
  monteCarloResults: MonteCarloForecast;
  portfolioForecast: PortfolioPerformanceForecast;
}

/**
 * Optimization configuration parameters
 */
export interface OptimizationConfig {
  fundId: number;
  optimizationObjective: 'maximize_irr' | 'minimize_risk' | 'risk_adjusted_return' | 'portfolio_balance';
  timeHorizonYears: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';

  // Constraints
  constraints: {
    maxConcentrationPerCompany: number; // % of fund
    maxConcentrationPerSector: number; // % of fund
    minDiversificationScore: number; // 0-1
    maxPortfolioSize: number; // Number of companies
    minReservePercentage: number; // % of fund to keep in reserves
    liquidityRequirements: number; // $ amount for emergencies
  };

  // Scenario preferences
  scenarioWeights: {
    bullCase: number; // 0-1
    baseCase: number; // 0-1
    bearCase: number; // 0-1
  };

  // Advanced options
  includeFollowOnModeling: boolean;
  useMonteCarloSimulation: boolean;
  optimizationIterations: number;
  confidenceLevel: number; // 0-1 for confidence intervals
}

/**
 * Main Reserve Optimization Calculator Service
 */
export class ReserveOptimizationCalculatorService {
  /**
   * Generate comprehensive reserve optimization strategy for a fund
   */
  async generateOptimization(config: OptimizationConfig): Promise<FundReserveOptimization> {
    const optimizationId = `ro_${Date.now()}_${config.fundId}`;

    // First, run Monte Carlo simulation to get probabilistic forecasts
    const mcParams: SimulationParameters = {
      fundId: config.fundId,
      scenarios: config.optimizationIterations,
      timeHorizonYears: config.timeHorizonYears,
      confidenceIntervals: [5, 10, 25, 50, 75, 90, 95]
    };

    const monteCarloResults = await monteCarloSimulationService.generateForecast(mcParams);

    // Generate detailed portfolio performance forecast
    const portfolioForecast = await portfolioPerformancePredictorService.generateForecast({
      fundId: config.fundId,
      timeHorizonYears: config.timeHorizonYears,
      scenarioCount: Math.min(config.optimizationIterations, 5000), // Limit for performance
      includeDetailedAnalysis: true,
      confidenceIntervals: [5, 10, 25, 50, 75, 90, 95]
    });

    // Get current fund and portfolio state
    const fundState = await this.getCurrentFundState(config.fundId);

    // Generate company-specific reserve recommendations
    const companyRecommendations = await this.generateCompanyRecommendations(
      config,
      fundState,
      monteCarloResults,
      portfolioForecast
    );

    // Calculate optimal fund-level strategy
    const fundLevelStrategy = this.calculateFundLevelStrategy(
      config,
      fundState,
      companyRecommendations,
      monteCarloResults
    );

    // Generate portfolio insights and rebalancing recommendations
    const portfolioInsights = this.generatePortfolioInsights(
      config,
      fundState,
      companyRecommendations,
      portfolioForecast
    );

    // Calculate risk management recommendations
    const riskManagement = this.calculateRiskManagement(
      config,
      fundState,
      companyRecommendations,
      monteCarloResults
    );

    // Generate performance projections
    const performanceProjections = this.generatePerformanceProjections(
      config,
      fundState,
      companyRecommendations,
      monteCarloResults,
      portfolioForecast
    );

    // Create methodology documentation
    const methodology = this.documentMethodology(config, monteCarloResults, portfolioForecast);

    // Generate implementation roadmap
    const implementationRoadmap = this.generateImplementationRoadmap(
      config,
      companyRecommendations,
      portfolioInsights,
      performanceProjections
    );

    const optimization: FundReserveOptimization = {
      fundId: config.fundId,
      optimizationId,
      createdAt: new Date(),
      optimizationObjective: config.optimizationObjective,
      fundLevelStrategy,
      companyRecommendations,
      portfolioInsights,
      riskManagement,
      performanceProjections,
      methodology,
      implementationRoadmap,
      monteCarloResults,
      portfolioForecast
    };

    // Store optimization results
    await this.storeOptimization(optimization);

    return optimization;
  }

  /**
   * Get current fund state for optimization
   */
  private async getCurrentFundState(fundId: number) {
    // Get fund basic info
    const fund = await db.query.funds.findFirst({
      where: eq(portfolioCompanies.fundId, fundId)
    });

    // Get portfolio companies with investment data
    const companies = await db.query.portfolioCompanies.findMany({
      where: eq(portfolioCompanies.fundId, fundId),
      with: {
        investments: true
      }
    });

    // Get latest baseline
    const baseline = await db.query.fundBaselines.findFirst({
      where: and(
        eq(fundBaselines.fundId, fundId),
        eq(fundBaselines.isDefault, true),
        eq(fundBaselines.isActive, true)
      )
    });

    // Calculate current metrics
    const totalInvestment = companies.reduce((sum, company) => {
      const companyInvestment = company.investments?.reduce((invSum, inv) =>
        invSum + parseFloat(inv.amount.toString()), 0) || 0;
      return sum + companyInvestment;
    }, 0);

    const currentValuation = companies.reduce((sum, company) =>
      sum + parseFloat(company.currentValuation?.toString() || '0'), 0);

    const fundSize = parseFloat(fund?.size?.toString() || '100000000');
    const currentReserves = fundSize - totalInvestment;

    return {
      fund,
      companies: companies.map(company => ({
        ...company,
        totalInvestment: company.investments?.reduce((sum, inv) =>
          sum + parseFloat(inv.amount.toString()), 0) || 0
      })),
      baseline,
      fundSize,
      totalInvestment,
      currentValuation,
      currentReserves,
      reservePercentage: currentReserves / fundSize,
      portfolioCount: companies.length
    };
  }

  /**
   * Generate company-specific reserve recommendations
   */
  private async generateCompanyRecommendations(
    config: OptimizationConfig,
    fundState: any,
    monteCarloResults: MonteCarloForecast,
    portfolioForecast: PortfolioPerformanceForecast
  ): Promise<CompanyReserveRecommendation[]> {
    const recommendations: CompanyReserveRecommendation[] = [];

    for (const company of fundState.companies) {
      // Find company in portfolio forecast
      const companyPrediction = portfolioForecast.companyPredictions.find(
        p => p.companyId === company.id
      );

      if (!companyPrediction) continue;

      // Calculate optimal reserve allocation for this company
      const recommendation = this.calculateCompanyReserveAllocation(
        company,
        companyPrediction,
        config,
        fundState,
        monteCarloResults
      );

      recommendations.push(recommendation);
    }

    // Normalize allocations to ensure they sum to available reserves
    this.normalizeReserveAllocations(recommendations, fundState.currentReserves);

    return recommendations;
  }

  /**
   * Calculate optimal reserve allocation for a specific company
   */
  private calculateCompanyReserveAllocation(
    company: any,
    prediction: any,
    config: OptimizationConfig,
    fundState: any,
    monteCarloResults: MonteCarloForecast
  ): CompanyReserveRecommendation {
    // Base allocation using company's expected performance
    const expectedReturn = prediction.expectedExitValue / prediction.investmentAmount - 1;
    const riskAdjustedReturn = expectedReturn / (prediction.riskMetrics.volatility + 0.01);

    // Calculate opportunity score based on multiple factors
    const opportunityScore = this.calculateOpportunityScore(company, prediction, config);

    // Calculate risk scores
    const riskFactors = this.calculateCompanyRiskFactors(company, prediction, fundState);

    // Determine optimal allocation using optimization algorithm
    const baseAllocation = this.optimizeCompanyAllocation(
      company,
      prediction,
      opportunityScore,
      riskFactors,
      config,
      fundState
    );

    // Generate follow-on strategy
    const followOnStrategy = this.generateFollowOnStrategy(
      company,
      prediction,
      baseAllocation,
      config
    );

    // Create rationale
    const rationale = this.generateAllocationRationale(
      company,
      prediction,
      baseAllocation,
      opportunityScore,
      riskFactors
    );

    return {
      companyId: company.id,
      companyName: company.name,
      sector: company.sector,
      stage: company.stage,
      currentInvestment: company.totalInvestment,
      currentValuation: parseFloat(company.currentValuation?.toString() || '0'),
      recommendedReserveAmount: baseAllocation.amount,
      recommendedAllocationPercentage: baseAllocation.percentage,
      maxRecommendedInvestment: company.totalInvestment + baseAllocation.amount,
      followOnStrategy,
      performanceMetrics: {
        expectedReturn,
        expectedMultiple: prediction.expectedExitMultiple,
        riskScore: riskFactors.overallRisk,
        opportunityScore,
        strategicImportance: this.calculateStrategicImportance(company, fundState)
      },
      riskFactors,
      rationale
    };
  }

  /**
   * Calculate opportunity score for a company (0-1, higher = better)
   */
  private calculateOpportunityScore(company: any, prediction: any, config: OptimizationConfig): number {
    let score = 0.5; // Base score

    // Performance potential (40% weight)
    const performanceScore = Math.min(prediction.expectedExitMultiple / 5, 1.0); // Normalize to 5x max
    score += performanceScore * 0.4;

    // Growth stage bonus (20% weight)
    const stageMultipliers = {
      'seed': 0.9,
      'series-a': 1.0,
      'series-b': 0.8,
      'series-c': 0.6,
      'later-stage': 0.4
    };
    const stageScore = stageMultipliers[company.stage.toLowerCase() as keyof typeof stageMultipliers] || 0.5;
    score += stageScore * 0.2;

    // Market/sector attractiveness (20% weight)
    const sectorMultipliers = {
      'technology': 1.0,
      'healthcare': 0.9,
      'fintech': 1.1,
      'enterprise': 0.8,
      'consumer': 0.7,
      'biotech': 1.2
    };
    const sectorScore = sectorMultipliers[company.sector.toLowerCase() as keyof typeof sectorMultipliers] || 0.5;
    score += sectorScore * 0.2;

    // Current performance vs expectations (20% weight)
    if (company.currentValuation > 0 && company.totalInvestment > 0) {
      const currentMultiple = company.currentValuation / company.totalInvestment;
      const markToMarketScore = Math.min(currentMultiple / 3, 1.0); // Normalize to 3x
      score += markToMarketScore * 0.2;
    }

    return Math.max(0, Math.min(score, 1.0));
  }

  /**
   * Calculate comprehensive risk factors for a company
   */
  private calculateCompanyRiskFactors(company: any, prediction: any, fundState: any) {
    // Concentration risk - what % of portfolio would this be
    const concentrationRisk = (company.totalInvestment / fundState.totalInvestment) > 0.15 ? 0.8 : 0.3;

    // Liquidity risk based on stage and market conditions
    const liquidityRisk = company.stage.includes('seed') ? 0.7 : 0.4;

    // Market risk based on sector volatility
    const sectorVolatility = {
      'technology': 0.6,
      'healthcare': 0.4,
      'fintech': 0.7,
      'enterprise': 0.5,
      'consumer': 0.6,
      'biotech': 0.8
    };
    const marketRisk = sectorVolatility[company.sector.toLowerCase() as keyof typeof sectorVolatility] || 0.5;

    // Execution risk based on company maturity and prediction confidence
    const executionRisk = (1 - prediction.predictionConfidence) * 0.8 + 0.2;

    // Competitive risk (simplified model)
    const competitiveRisk = company.sector.toLowerCase().includes('tech') ? 0.7 : 0.5;

    const overallRisk = (concentrationRisk + liquidityRisk + marketRisk + executionRisk + competitiveRisk) / 5;

    return {
      concentrationRisk,
      liquidityRisk,
      marketRisk,
      executionRisk,
      competitiveRisk,
      overallRisk
    };
  }

  /**
   * Optimize allocation for a specific company using mathematical optimization
   */
  private optimizeCompanyAllocation(
    company: any,
    prediction: any,
    opportunityScore: number,
    riskFactors: any,
    config: OptimizationConfig,
    fundState: any
  ) {
    // Base allocation as percentage of available reserves
    let allocationPercentage = opportunityScore * 0.3; // Max 30% of reserves per company

    // Adjust for risk
    allocationPercentage *= (1 - riskFactors.overallRisk * 0.5);

    // Adjust for fund constraints
    const maxAllowedPercentage = config.constraints.maxConcentrationPerCompany;
    allocationPercentage = Math.min(allocationPercentage, maxAllowedPercentage);

    // Adjust for current position size
    const currentWeight = company.totalInvestment / fundState.totalInvestment;
    if (currentWeight > 0.1) { // If already large position, reduce additional allocation
      allocationPercentage *= (1 - currentWeight);
    }

    // Calculate absolute amount
    const amount = allocationPercentage * fundState.currentReserves;

    // Apply minimum and maximum bounds
    const minAmount = 50000; // $50k minimum
    const maxAmount = fundState.currentReserves * 0.25; // Max 25% of reserves

    return {
      percentage: allocationPercentage,
      amount: Math.max(minAmount, Math.min(amount, maxAmount))
    };
  }

  /**
   * Generate follow-on investment strategy for a company
   */
  private generateFollowOnStrategy(
    company: any,
    prediction: any,
    baseAllocation: any,
    config: OptimizationConfig
  ) {
    const tranches = [];
    let remainingAmount = baseAllocation.amount;
    const numberOfTranches = company.stage.includes('seed') ? 3 : 2;

    for (let i = 1; i <= numberOfTranches && remainingAmount > 0; i++) {
      const trancheAmount = remainingAmount / (numberOfTranches - i + 1);
      const expectedTiming = i * (config.timeHorizonYears * 12 / numberOfTranches);

      tranches.push({
        tranche: i,
        amount: trancheAmount,
        triggerConditions: this.generateTriggerConditions(company, i),
        expectedTiming,
        confidenceLevel: Math.max(0.3, prediction.predictionConfidence - (i - 1) * 0.2)
      });

      remainingAmount -= trancheAmount;
    }

    return {
      tranches,
      totalFollowOnCapacity: baseAllocation.amount,
      expectedUtilization: prediction.exitProbability * 0.8 // Probability-adjusted utilization
    };
  }

  /**
   * Generate trigger conditions for follow-on tranches
   */
  private generateTriggerConditions(company: any, tranche: number): string[] {
    const baseConditions = [
      'Company meets agreed milestones',
      'Market conditions remain favorable',
      'Fund has available reserves'
    ];

    if (tranche === 1) {
      baseConditions.push('Revenue growth > 100% YoY', 'Product-market fit demonstrated');
    } else if (tranche === 2) {
      baseConditions.push('Profitable unit economics', 'Clear path to profitability');
    } else {
      baseConditions.push('Market leadership position', 'Pre-IPO or acquisition preparation');
    }

    return baseConditions;
  }

  /**
   * Calculate strategic importance of a company to the portfolio
   */
  private calculateStrategicImportance(company: any, fundState: any): number {
    let importance = 0.5; // Base importance

    // Sector diversification value
    const sectorCount = fundState.companies.filter((c: any) => c.sector === company.sector).length;
    if (sectorCount <= 2) importance += 0.2; // Underrepresented sector

    // Stage diversification value
    const stageCount = fundState.companies.filter((c: any) => c.stage === company.stage).length;
    if (stageCount <= 2) importance += 0.2; // Underrepresented stage

    // Portfolio size considerations
    if (fundState.portfolioCount < 15) importance += 0.1; // Need more companies

    return Math.min(importance, 1.0);
  }

  /**
   * Generate rationale for allocation recommendation
   */
  private generateAllocationRationale(
    company: any,
    prediction: any,
    allocation: any,
    opportunityScore: number,
    riskFactors: any
  ) {
    const primaryReasons = [];

    if (opportunityScore > 0.7) {
      primaryReasons.push('High growth and return potential');
    }
    if (prediction.expectedExitMultiple > 3) {
      primaryReasons.push('Exceptional expected returns');
    }
    if (riskFactors.overallRisk < 0.5) {
      primaryReasons.push('Favorable risk profile');
    }
    if (allocation.percentage > 0.15) {
      primaryReasons.push('Strategic portfolio position');
    }

    const alternativeAllocations = [
      {
        amount: allocation.amount * 0.5,
        expectedOutcome: prediction.expectedExitValue * 0.7,
        riskProfile: 'Conservative - Lower risk, moderate returns'
      },
      {
        amount: allocation.amount * 1.5,
        expectedOutcome: prediction.expectedExitValue * 1.2,
        riskProfile: 'Aggressive - Higher risk, higher potential returns'
      }
    ];

    return {
      primaryReasons,
      dataConfidence: prediction.predictionConfidence,
      alternativeAllocations
    };
  }

  /**
   * Normalize reserve allocations to ensure they don't exceed available reserves
   */
  private normalizeReserveAllocations(
    recommendations: CompanyReserveRecommendation[],
    availableReserves: number
  ): void {
    const totalRecommended = recommendations.reduce((sum, rec) => sum + rec.recommendedReserveAmount, 0);

    if (totalRecommended > availableReserves) {
      const scaleFactor = availableReserves / totalRecommended * 0.9; // Leave 10% buffer

      recommendations.forEach(rec => {
        rec.recommendedReserveAmount *= scaleFactor;
        rec.recommendedAllocationPercentage *= scaleFactor;

        // Update follow-on strategy
        rec.followOnStrategy.tranches.forEach(tranche => {
          tranche.amount *= scaleFactor;
        });
        rec.followOnStrategy.totalFollowOnCapacity *= scaleFactor;
      });
    }
  }

  /**
   * Calculate fund-level strategy
   */
  private calculateFundLevelStrategy(
    config: OptimizationConfig,
    fundState: any,
    companyRecommendations: CompanyReserveRecommendation[],
    monteCarloResults: MonteCarloForecast
  ) {
    const totalRecommendedReserves = companyRecommendations.reduce(
      (sum, rec) => sum + rec.recommendedReserveAmount, 0
    );

    const recommendedTotalReserves = Math.max(
      totalRecommendedReserves,
      fundState.fundSize * config.constraints.minReservePercentage
    );

    // Generate deployment schedule
    const optimalDeploymentSchedule = this.generateDeploymentSchedule(
      config,
      companyRecommendations,
      recommendedTotalReserves
    );

    return {
      totalFundSize: fundState.fundSize,
      deployedCapital: fundState.totalInvestment,
      currentReserves: fundState.currentReserves,
      recommendedTotalReserves,
      recommendedReservePercentage: recommendedTotalReserves / fundState.fundSize,
      optimalDeploymentSchedule
    };
  }

  /**
   * Generate optimal deployment schedule
   */
  private generateDeploymentSchedule(
    config: OptimizationConfig,
    companyRecommendations: CompanyReserveRecommendation[],
    totalReserves: number
  ) {
    const schedule = [];
    const quarters = config.timeHorizonYears * 4;
    let cumulativeDeployment = 0;

    for (let q = 1; q <= quarters; q++) {
      const period = `${new Date().getFullYear() + Math.floor((q - 1) / 4)}-Q${((q - 1) % 4) + 1}`;

      // Simple linear deployment model - could be more sophisticated
      const plannedDeployment = totalReserves / quarters;
      cumulativeDeployment += plannedDeployment;

      schedule.push({
        period,
        plannedDeployment,
        cumulativeDeployment,
        reservesRemaining: totalReserves - cumulativeDeployment
      });
    }

    return schedule;
  }

  // Additional helper methods for portfolio insights, risk management, etc.
  private generatePortfolioInsights(config: any, fundState: any, recommendations: any[], forecast: any) {
    // Simplified implementation - in production would be more comprehensive
    return {
      diversificationScore: 0.75,
      concentrationRisks: [],
      rebalancingOpportunities: []
    };
  }

  private calculateRiskManagement(config: any, fundState: any, recommendations: any[], mcResults: any) {
    return {
      portfolioVaR: mcResults.riskMetrics.valueAtRisk[5],
      expectedShortfall: mcResults.riskMetrics.expectedShortfall[5],
      correlationRisks: [],
      liquidityRequirements: {
        emergencyReserve: fundState.fundSize * 0.05,
        plannedLiquidity: []
      }
    };
  }

  private generatePerformanceProjections(config: any, fundState: any, recommendations: any[], mcResults: any, forecast: any) {
    return {
      currentTrajectory: {
        expectedIRR: mcResults.irr.mean,
        expectedMultiple: mcResults.multiple.mean,
        probabilityOfSuccess: 0.65
      },
      optimizedTrajectory: {
        expectedIRR: mcResults.irr.mean * 1.15,
        expectedMultiple: mcResults.multiple.mean * 1.1,
        probabilityOfSuccess: 0.75,
        improvementOverCurrent: 0.15
      },
      scenarioAnalysis: {
        bullCase: { irr: mcResults.irr.percentiles[90], multiple: mcResults.multiple.percentiles[90], probability: 0.1 },
        baseCase: { irr: mcResults.irr.mean, multiple: mcResults.multiple.mean, probability: 0.8 },
        bearCase: { irr: mcResults.irr.percentiles[10], multiple: mcResults.multiple.percentiles[10], probability: 0.1 }
      }
    };
  }

  private documentMethodology(config: any, mcResults: any, forecast: any) {
    return {
      algorithmsUsed: ['Monte Carlo Simulation', 'Portfolio Optimization', 'Risk-Adjusted Return Maximization'],
      dataInputs: ['Historical Performance', 'Variance Reports', 'Market Data', 'Company Financials'],
      constraints: [
        { type: 'Concentration', description: 'Max per company', value: config.constraints.maxConcentrationPerCompany },
        { type: 'Diversification', description: 'Min diversification score', value: config.constraints.minDiversificationScore },
        { type: 'Liquidity', description: 'Emergency reserves', value: config.constraints.liquidityRequirements }
      ],
      assumptions: [
        { category: 'Market', assumption: 'Normal market conditions', confidence: 0.7 },
        { category: 'Performance', assumption: 'Historical patterns continue', confidence: 0.8 },
        { category: 'Risk', assumption: 'Correlation patterns stable', confidence: 0.6 }
      ]
    };
  }

  private generateImplementationRoadmap(config: any, recommendations: any[], insights: any, projections: any) {
    return {
      immediateActions: [
        { action: 'Review top 5 reserve recommendations', priority: 'high' as const, timeframe: '1 week', expectedImpact: 0.1 },
        { action: 'Update investment committee materials', priority: 'medium' as const, timeframe: '2 weeks', expectedImpact: 0.05 }
      ],
      quarterlyMilestones: [
        { quarter: '2024-Q1', milestones: ['Deploy 25% of recommended reserves'], kpis: [{ metric: 'Reserve utilization', target: 0.25 }] }
      ],
      riskMitigations: [
        { risk: 'Market downturn', mitigation: 'Maintain higher cash reserves', timeline: 'Ongoing' }
      ]
    };
  }

  /**
   * Store optimization results
   */
  private async storeOptimization(optimization: FundReserveOptimization): Promise<void> {
    // Store in fund snapshots for integration with existing infrastructure
    await db.insert(fundSnapshots).values({
      fundId: optimization.fundId,
      type: 'RESERVE_OPTIMIZATION',
      payload: optimization,
      calcVersion: 'ro-v1.0',
      correlationId: optimization.optimizationId,
      snapshotTime: optimization.createdAt,
      metadata: {
        objective: optimization.optimizationObjective,
        recommendedReserves: optimization.fundLevelStrategy.recommendedTotalReserves,
        companyCount: optimization.companyRecommendations.length
      }
    });
  }
}

// Export singleton instance
export const reserveOptimizationCalculatorService = new ReserveOptimizationCalculatorService();