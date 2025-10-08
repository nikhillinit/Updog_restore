/**
 * Portfolio Performance Predictor
 *
 * Leverages Monte Carlo simulations and historical variance data to generate
 * detailed portfolio performance forecasts with company-level predictions.
 */

import { db } from '../db';
import {
  portfolioCompanies
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import { monteCarloSimulationService, type SimulationParameters, type MonteCarloForecast } from './monte-carlo-simulation';
import { SafeArithmetic, toSafeNumber } from '@shared/type-safety-utils';

/**
 * Company-level performance prediction
 */
export interface CompanyPerformancePrediction {
  companyId: number;
  companyName: string;
  sector: string;
  stage: string;
  currentValuation: number;
  investmentAmount: number;

  // Predicted outcomes
  exitProbability: number; // 0-1 probability of exit within timeframe
  expectedExitMultiple: number;
  expectedExitValue: number;
  timeToExit: number; // years

  // Performance scenarios
  scenarios: {
    bullCase: { multiple: number; value: number; probability: number };
    baseCase: { multiple: number; value: number; probability: number };
    bearCase: { multiple: number; value: number; probability: number };
  };

  // Risk metrics
  riskMetrics: {
    volatility: number;
    probabilityOfLoss: number;
    valueAtRisk: number; // 5% VaR
    beta: number; // correlation with portfolio
  };

  // Confidence and data quality
  predictionConfidence: number; // 0-1 confidence in prediction
  dataQualityScore: number; // 0-1 score based on available data
}

/**
 * Sector-level performance aggregation
 */
export interface SectorPerformancePrediction {
  sector: string;
  companyCount: number;
  totalInvestment: number;
  currentValue: number;

  // Aggregate predictions
  expectedReturn: number;
  expectedVolatility: number;
  expectedExitCount: number;
  expectedExitValue: number;

  // Sector-specific insights
  marketTrends: {
    growthTrend: 'accelerating' | 'stable' | 'declining';
    valuationTrend: 'expanding' | 'stable' | 'contracting';
    exitActivity: 'active' | 'moderate' | 'limited';
  };

  // Performance distribution
  performanceDistribution: Array<{
    returnRange: string;
    probability: number;
    companyCount: number;
  }>;
}

/**
 * Complete portfolio performance forecast
 */
export interface PortfolioPerformanceForecast {
  fundId: number;
  forecastId: string;
  createdAt: Date;
  timeHorizonYears: number;

  // Portfolio-level predictions
  portfolioSummary: {
    totalCompanies: number;
    totalInvestment: number;
    currentValue: number;
    expectedValue: number;
    expectedReturn: number;
    expectedVolatility: number;
  };

  // Company-level predictions
  companyPredictions: CompanyPerformancePrediction[];

  // Sector analysis
  sectorPredictions: SectorPerformancePrediction[];

  // Stage analysis
  stagePredictions: Record<string, {
    expectedReturn: number;
    expectedVolatility: number;
    exitProbability: number;
    averageTimeToExit: number;
  }>;

  // Portfolio construction insights
  constructionInsights: {
    diversificationScore: number; // 0-1 how well diversified
    concentrationRisk: Array<{
      type: 'sector' | 'stage' | 'vintage';
      category: string;
      concentration: number; // % of portfolio
      riskLevel: 'low' | 'medium' | 'high';
    }>;
    optimizationSuggestions: Array<{
      type: 'rebalance' | 'divest' | 'reserve_allocation';
      description: string;
      impact: number; // expected improvement in risk-adjusted return
      priority: 'high' | 'medium' | 'low';
    }>;
  };

  // Underlying Monte Carlo data
  monteCarloForecast: MonteCarloForecast;
}

/**
 * Performance predictor configuration
 */
export interface PredictorConfig {
  fundId: number;
  timeHorizonYears: number;
  scenarioCount: number;
  includeDetailedAnalysis: boolean;
  baselineId?: string;
  confidenceIntervals: number[];
}

/**
 * Main Portfolio Performance Predictor Service
 */
export class PortfolioPerformancePredictorService {
  /**
   * Generate comprehensive portfolio performance forecast
   */
  async generateForecast(config: PredictorConfig): Promise<PortfolioPerformanceForecast> {
    const forecastId = `ppp_${Date.now()}_${config.fundId}`;

    // First run Monte Carlo simulation for baseline forecast
    const mcParams: SimulationParameters = {
      fundId: config.fundId,
      scenarios: config.scenarioCount,
      timeHorizonYears: config.timeHorizonYears,
      confidenceIntervals: config.confidenceIntervals,
      baselineId: config.baselineId
    };

    const monteCarloForecast = await monteCarloSimulationService.generateForecast(mcParams);

    // Get portfolio companies and their data
    const companies = await this.getPortfolioCompanies(config.fundId);

    // Generate company-level predictions
    const companyPredictions = await this.generateCompanyPredictions(companies, monteCarloForecast, config);

    // Generate sector-level predictions
    const sectorPredictions = await this.generateSectorPredictions(companies, companyPredictions, config);

    // Generate stage-level predictions
    const stagePredictions = await this.generateStagePredictions(companies, companyPredictions);

    // Calculate portfolio summary
    const portfolioSummary = this.calculatePortfolioSummary(companies, companyPredictions);

    // Generate construction insights
    const constructionInsights = await this.generateConstructionInsights(companies, companyPredictions, config);

    const forecast: PortfolioPerformanceForecast = {
      fundId: config.fundId,
      forecastId,
      createdAt: new Date(),
      timeHorizonYears: config.timeHorizonYears,
      portfolioSummary,
      companyPredictions,
      sectorPredictions,
      stagePredictions,
      constructionInsights,
      monteCarloForecast
    };

    return forecast;
  }

  /**
   * Get portfolio companies with historical performance data
   */
  private async getPortfolioCompanies(fundId: number) {
    const companies = await db.query.portfolioCompanies.findMany({
      where: eq(portfolioCompanies.fundId, fundId),
      with: {
        investments: true
      }
    });

    return companies.map((company: any) => ({
      ...company,
      totalInvestment: company.investments?.reduce((sum: any, inv: any) =>
        sum + parseFloat(inv.amount.toString()), 0) || 0,
      currentValuation: company.currentValuation ?
        parseFloat(company.currentValuation.toString()) : 0
    }));
  }

  /**
   * Generate company-level performance predictions
   */
  private async generateCompanyPredictions(
    companies: any[],
    monteCarloForecast: MonteCarloForecast,
    config: PredictorConfig
  ): Promise<CompanyPerformancePrediction[]> {
    const predictions: CompanyPerformancePrediction[] = [];

    for (const company of companies) {
      // Get historical performance patterns for this company type
      const historicalPatterns = await this.getCompanyHistoricalPatterns(company);

      // Calculate exit probability based on stage and age
      const exitProbability = this.calculateExitProbability(company, config.timeHorizonYears);

      // Predict exit multiple using sector/stage benchmarks
      const expectedExitMultiple = this.predictExitMultiple(company, historicalPatterns, monteCarloForecast);

      // Calculate expected exit value
      const expectedExitValue = company.totalInvestment * expectedExitMultiple * exitProbability;

      // Generate scenario analysis
      const scenarios = this.generateCompanyScenarios(company, historicalPatterns, expectedExitMultiple);

      // Calculate risk metrics
      const riskMetrics = this.calculateCompanyRiskMetrics(company, historicalPatterns, monteCarloForecast);

      // Assess prediction confidence and data quality
      const predictionConfidence = this.assessPredictionConfidence(company, historicalPatterns);
      const dataQualityScore = this.calculateDataQualityScore(company);

      // Estimate time to exit
      const timeToExit = this.estimateTimeToExit(company, historicalPatterns);

      predictions.push({
        companyId: company.id,
        companyName: company.name,
        sector: company.sector,
        stage: company.stage,
        currentValuation: company.currentValuation,
        investmentAmount: company.totalInvestment,
        exitProbability,
        expectedExitMultiple,
        expectedExitValue,
        timeToExit,
        scenarios,
        riskMetrics,
        predictionConfidence,
        dataQualityScore
      });
    }

    return predictions;
  }

  /**
   * Generate sector-level performance predictions
   */
  private async generateSectorPredictions(
    companies: any[],
    companyPredictions: CompanyPerformancePrediction[],
    config: PredictorConfig
  ): Promise<SectorPerformancePrediction[]> {
    const sectors = [...new Set(companies.map(c => c.sector))];
    const sectorPredictions: SectorPerformancePrediction[] = [];

    for (const sector of sectors) {
      const sectorCompanies = companies.filter(c => c.sector === sector);
      const sectorPredictionsData = companyPredictions.filter(p => p.sector === sector);

      // Aggregate sector metrics
      const totalInvestment = sectorCompanies.reduce((sum: any, c: any) => sum + c.totalInvestment, 0);
      const currentValue = sectorCompanies.reduce((sum: any, c: any) => sum + c.currentValuation, 0);
      const expectedExitValue = sectorPredictionsData.reduce((sum: any, p: any) => sum + p.expectedExitValue, 0);
      const expectedExitCount = sectorPredictionsData.reduce((sum: any, p: any) => sum + p.exitProbability, 0);

      // Calculate sector-level returns and volatility
      const expectedReturn = totalInvestment > 0 ? (expectedExitValue - totalInvestment) / totalInvestment : 0;
      const expectedVolatility = this.calculateSectorVolatility(sectorPredictionsData);

      // Analyze market trends
      const marketTrends = await this.analyzeSectorMarketTrends(sector);

      // Generate performance distribution
      const performanceDistribution = this.generateSectorPerformanceDistribution(sectorPredictionsData);

      sectorPredictions.push({
        sector,
        companyCount: sectorCompanies.length,
        totalInvestment,
        currentValue,
        expectedReturn,
        expectedVolatility,
        expectedExitCount,
        expectedExitValue,
        marketTrends,
        performanceDistribution
      });
    }

    return sectorPredictions;
  }

  /**
   * Generate stage-level performance predictions
   */
  private generateStagePredictions(
    companies: any[],
    companyPredictions: CompanyPerformancePrediction[]
  ): Record<string, any> {
    const stages = [...new Set(companies.map(c => c.stage))];
    const stagePredictions: Record<string, any> = {};

    for (const stage of stages) {
      const stagePredictionsData = companyPredictions.filter(p => p.stage === stage);

      if (stagePredictionsData.length > 0) {
        const expectedReturn = stagePredictionsData.reduce((sum: any, p: any) =>
          sum + (p.expectedExitValue - p.investmentAmount), 0) / stagePredictionsData.length;

        const expectedVolatility = stagePredictionsData.reduce((sum: any, p: any) =>
          sum + p.riskMetrics.volatility, 0) / stagePredictionsData.length;

        const exitProbability = stagePredictionsData.reduce((sum: any, p: any) =>
          sum + p.exitProbability, 0) / stagePredictionsData.length;

        const averageTimeToExit = stagePredictionsData.reduce((sum: any, p: any) =>
          sum + p.timeToExit, 0) / stagePredictionsData.length;

        stagePredictions[stage] = {
          expectedReturn,
          expectedVolatility,
          exitProbability,
          averageTimeToExit
        };
      }
    }

    return stagePredictions;
  }

  /**
   * Calculate portfolio-level summary metrics
   */
  private calculatePortfolioSummary(
    companies: any[],
    companyPredictions: CompanyPerformancePrediction[]
  ) {
    const totalInvestment = companies.reduce((sum: any, c: any) => sum + c.totalInvestment, 0);
    const currentValue = companies.reduce((sum: any, c: any) => sum + c.currentValuation, 0);
    const expectedValue = companyPredictions.reduce((sum: any, p: any) => sum + p.expectedExitValue, 0);

    const expectedReturn = totalInvestment > 0 ? (expectedValue - totalInvestment) / totalInvestment : 0;

    // Portfolio volatility (weighted average with correlation effects)
    const expectedVolatility = this.calculatePortfolioVolatility(companyPredictions);

    return {
      totalCompanies: companies.length,
      totalInvestment,
      currentValue,
      expectedValue,
      expectedReturn,
      expectedVolatility
    };
  }

  /**
   * Generate portfolio construction insights and optimization suggestions
   */
  private async generateConstructionInsights(
    companies: any[],
    companyPredictions: CompanyPerformancePrediction[],
    config: PredictorConfig
  ) {
    // Calculate diversification score
    const diversificationScore = this.calculateDiversificationScore(companies);

    // Identify concentration risks
    const concentrationRisk = this.identifyConcentrationRisks(companies);

    // Generate optimization suggestions
    const optimizationSuggestions = this.generateOptimizationSuggestions(
      companies,
      companyPredictions,
      diversificationScore,
      concentrationRisk
    );

    return {
      diversificationScore,
      concentrationRisk,
      optimizationSuggestions
    };
  }

  // Helper methods for company-level analysis

  private async getCompanyHistoricalPatterns(company: any) {
    // Simplified pattern analysis - in production, this would involve
    // extensive market data analysis
    const sectorMultiples: Record<string, number> = {
      'technology': 3.2,
      'healthcare': 2.8,
      'fintech': 3.5,
      'enterprise': 2.9,
      'consumer': 2.4,
      'biotech': 4.1
    };

    const stageVolatility: Record<string, number> = {
      'seed': 0.8,
      'series-a': 0.6,
      'series-b': 0.5,
      'series-c': 0.4,
      'later-stage': 0.3
    };

    return {
      typicalMultiple: sectorMultiples[company.sector.toLowerCase()] || 2.5,
      volatility: stageVolatility[company.stage.toLowerCase()] || 0.5,
      exitProbability: company.stage.includes('seed') ? 0.2 : 0.35,
      timeToExit: company.stage.includes('seed') ? 7 : 4
    };
  }

  private calculateExitProbability(company: any, timeHorizon: number): number {
    // Base exit probability by stage
    const baseProbabilities: Record<string, number> = {
      'seed': 0.15,
      'series-a': 0.25,
      'series-b': 0.35,
      'series-c': 0.45,
      'later-stage': 0.55
    };

    const baseProb = baseProbabilities[company.stage.toLowerCase()] || 0.3;

    // Adjust for time horizon (longer horizon = higher probability)
    const timeAdjustment = Math.min(timeHorizon / 5, 1.2); // Max 20% bonus for longer horizons

    // Adjust for company age (older companies more likely to exit soon)
    const currentYear = new Date().getFullYear();
    const companyAge = company.foundedYear ? currentYear - company.foundedYear : 3;
    const ageAdjustment = Math.min(companyAge / 10, 1.1); // Max 10% bonus for age

    return Math.min(baseProb * timeAdjustment * ageAdjustment, 0.8); // Cap at 80%
  }

  private predictExitMultiple(company: any, patterns: any, mcForecast: MonteCarloForecast): number {
    // Base multiple from patterns
    let expectedMultiple = patterns.typicalMultiple;

    // Adjust based on current performance vs investment
    if (company.currentValuation > 0 && company.totalInvestment > 0) {
      const currentMultiple = company.currentValuation / company.totalInvestment;
      const markToMarketAdjustment = Math.log(currentMultiple + 1) * 0.3;
      expectedMultiple += markToMarketAdjustment;
    }

    // Adjust based on portfolio-level forecast
    const portfolioMultiple = mcForecast.multiple.mean;
    const marketAdjustment = (portfolioMultiple - 2.0) * 0.5; // Adjust based on market conditions
    expectedMultiple += marketAdjustment;

    return Math.max(expectedMultiple, 0.5); // Minimum 0.5x multiple
  }

  private generateCompanyScenarios(company: any, patterns: any, expectedMultiple: number) {
    return {
      bullCase: {
        multiple: expectedMultiple * 1.8,
        value: company.totalInvestment * expectedMultiple * 1.8,
        probability: 0.15
      },
      baseCase: {
        multiple: expectedMultiple,
        value: company.totalInvestment * expectedMultiple,
        probability: 0.70
      },
      bearCase: {
        multiple: expectedMultiple * 0.4,
        value: company.totalInvestment * expectedMultiple * 0.4,
        probability: 0.15
      }
    };
  }

  private calculateCompanyRiskMetrics(company: any, patterns: any, mcForecast: MonteCarloForecast) {
    const volatility = patterns.volatility;
    const probabilityOfLoss = company.stage.includes('seed') ? 0.6 : 0.4;
    const valueAtRisk = company.totalInvestment * 0.8; // 80% potential loss
    const beta = this.calculateCompanyBeta(company, mcForecast); // Correlation with portfolio

    return {
      volatility,
      probabilityOfLoss,
      valueAtRisk,
      beta
    };
  }

  private calculateCompanyBeta(company: any, mcForecast: MonteCarloForecast): number {
    // Simplified beta calculation based on sector and stage
    const sectorBetas: Record<string, number> = {
      'technology': 1.2,
      'healthcare': 0.9,
      'fintech': 1.3,
      'enterprise': 1.0,
      'consumer': 1.1,
      'biotech': 1.4
    };

    return sectorBetas[company.sector.toLowerCase()] || 1.0;
  }

  private assessPredictionConfidence(company: any, patterns: any): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence for later-stage companies
    if (company.stage.includes('series-c') || company.stage.includes('later')) {
      confidence += 0.2;
    }

    // Higher confidence with valuation data
    if (company.currentValuation > 0) {
      confidence += 0.15;
    }

    // Higher confidence for established sectors
    const establishedSectors = ['technology', 'healthcare', 'enterprise'];
    if (establishedSectors.includes(company.sector.toLowerCase())) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.95);
  }

  private calculateDataQualityScore(company: any): number {
    let score = 0.3; // Base score

    // Score based on available data fields
    if (company.currentValuation > 0) score += 0.25;
    if (company.foundedYear) score += 0.15;
    if (company.description) score += 0.1;
    if (company.totalInvestment > 0) score += 0.2;

    return Math.min(score, 1.0);
  }

  private estimateTimeToExit(company: any, patterns: any): number {
    return patterns.timeToExit + (Math.random() - 0.5) * 2; // Add some randomness
  }

  // Portfolio-level analysis helpers

  private calculateSectorVolatility(sectorPredictions: CompanyPerformancePrediction[]): number {
    if (sectorPredictions.length === 0) return 0;

    const volatilities = sectorPredictions.map(p => p.riskMetrics.volatility);
    const avgVolatility = volatilities.reduce((sum: any, v: any) => sum + v, 0) / volatilities.length;

    // Add diversification benefit
    const diversificationFactor = Math.max(0.7, 1 - (sectorPredictions.length * 0.05));

    return avgVolatility * diversificationFactor;
  }

  private async analyzeSectorMarketTrends(sector: string) {
    // Simplified trend analysis - in production would use market data
    const trends = {
      technology: { growthTrend: 'accelerating' as const, valuationTrend: 'stable' as const, exitActivity: 'active' as const },
      healthcare: { growthTrend: 'stable' as const, valuationTrend: 'expanding' as const, exitActivity: 'moderate' as const },
      fintech: { growthTrend: 'stable' as const, valuationTrend: 'contracting' as const, exitActivity: 'moderate' as const }
    };

    return trends[sector.toLowerCase() as keyof typeof trends] ||
           { growthTrend: 'stable' as const, valuationTrend: 'stable' as const, exitActivity: 'moderate' as const };
  }

  private generateSectorPerformanceDistribution(sectorPredictions: CompanyPerformancePrediction[]) {
    // Simplified distribution - group predictions into return ranges
    const ranges = [
      { range: '<0x', min: -Infinity, max: 0 },
      { range: '0-1x', min: 0, max: 1 },
      { range: '1-3x', min: 1, max: 3 },
      { range: '3-5x', min: 3, max: 5 },
      { range: '5x+', min: 5, max: Infinity }
    ];

    return ranges.map(range => {
      const companiesInRange = sectorPredictions.filter(p =>
        p.expectedExitMultiple > range.min && p.expectedExitMultiple <= range.max
      );

      return {
        returnRange: range.range,
        probability: companiesInRange.length / sectorPredictions.length,
        companyCount: companiesInRange.length
      };
    });
  }

  private calculatePortfolioVolatility(companyPredictions: CompanyPerformancePrediction[]): number {
    if (companyPredictions.length === 0) return 0;

    // Weighted average volatility with diversification benefits
    const totalInvestment = companyPredictions.reduce((sum: any, p: any) => sum + p.investmentAmount, 0);

    let weightedVolatility = 0;
    for (const prediction of companyPredictions) {
      const weight = prediction.investmentAmount / totalInvestment;
      weightedVolatility += weight * prediction.riskMetrics.volatility;
    }

    // Apply diversification benefits
    const diversificationFactor = Math.max(0.6, 1 - (companyPredictions.length * 0.02));

    return weightedVolatility * diversificationFactor;
  }

  private calculateDiversificationScore(companies: any[]): number {
    // Simple diversification score based on sector and stage distribution
    const sectorCounts = companies.reduce((acc: any, c: any) => {
      acc[c.sector] = (acc[c.sector] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const stageCounts = companies.reduce((acc: any, c: any) => {
      acc[c.stage] = (acc[c.stage] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate Herfindahl index (lower = more diversified)
    const sectorHHI = Object.values(sectorCounts).reduce((sum: any, count: any) => {
      const safeCount = toSafeNumber(count);
      const share = companies.length > 0 ? SafeArithmetic.divide(safeCount, companies.length) : 0;
      return SafeArithmetic.add(sum, SafeArithmetic.multiply(share, share));
    }, 0);

    const stageHHI = Object.values(stageCounts).reduce((sum: any, count: any) => {
      const safeCount = toSafeNumber(count);
      const share = companies.length > 0 ? SafeArithmetic.divide(safeCount, companies.length) : 0;
      return SafeArithmetic.add(sum, SafeArithmetic.multiply(share, share));
    }, 0);

    // Convert to diversification score (0-1, higher = more diversified)
    const sectorDiv = SafeArithmetic.subtract(1, sectorHHI);
    const stageDiv = SafeArithmetic.subtract(1, stageHHI);

    return SafeArithmetic.divide(SafeArithmetic.add(sectorDiv, stageDiv), 2);
  }

  private identifyConcentrationRisks(companies: any[]) {
    const risks = [];
    const totalInvestment = companies.reduce((sum: any, c: any) => sum + c.totalInvestment, 0);

    // Sector concentration
    const sectorConcentration = companies.reduce((acc: any, c: any) => {
      acc[c.sector] = (acc[c.sector] || 0) + c.totalInvestment;
      return acc;
    }, {} as Record<string, number>);

    for (const [sector, investment] of Object.entries(sectorConcentration)) {
      const safeInvestment = toSafeNumber(investment);
      const concentration = SafeArithmetic.divide(safeInvestment, totalInvestment);
      if (concentration > 0.4) {
        risks.push({
          type: 'sector' as const,
          category: sector,
          concentration,
          riskLevel: concentration > 0.6 ? 'high' as const : 'medium' as const
        });
      }
    }

    // Stage concentration
    const stageConcentration = companies.reduce((acc: any, c: any) => {
      acc[c.stage] = (acc[c.stage] || 0) + c.totalInvestment;
      return acc;
    }, {} as Record<string, number>);

    for (const [stage, investment] of Object.entries(stageConcentration)) {
      const safeInvestment = toSafeNumber(investment);
      const concentration = SafeArithmetic.divide(safeInvestment, totalInvestment);
      if (concentration > 0.5) {
        risks.push({
          type: 'stage' as const,
          category: stage,
          concentration,
          riskLevel: concentration > 0.7 ? 'high' as const : 'medium' as const
        });
      }
    }

    return risks;
  }

  private generateOptimizationSuggestions(
    companies: any[],
    companyPredictions: CompanyPerformancePrediction[],
    diversificationScore: number,
    concentrationRisk: any[]
  ) {
    const suggestions = [];

    // Diversification suggestions
    if (diversificationScore < 0.6) {
      suggestions.push({
        type: 'rebalance' as const,
        description: 'Increase portfolio diversification across sectors and stages',
        impact: (0.8 - diversificationScore) * 0.15, // Potential improvement in risk-adjusted return
        priority: 'high' as const
      });
    }

    // Concentration risk mitigation
    for (const risk of concentrationRisk) {
      if (risk.riskLevel === 'high') {
        suggestions.push({
          type: 'rebalance' as const,
          description: `Reduce concentration in ${risk.category} (currently ${(risk.concentration * 100).toFixed(1)}%)`,
          impact: risk.concentration * 0.1,
          priority: 'high' as const
        });
      }
    }

    // Identify underperforming companies for potential divestment
    const underperformers = companyPredictions.filter(p =>
      p.expectedExitMultiple < 1.0 && p.predictionConfidence > 0.7
    );

    if (underperformers.length > 0) {
      suggestions.push({
        type: 'divest' as const,
        description: `Consider divesting from ${underperformers.length} underperforming companies`,
        impact: 0.05,
        priority: 'medium' as const
      });
    }

    // Reserve allocation optimization
    suggestions.push({
      type: 'reserve_allocation' as const,
      description: 'Optimize reserve allocation based on follow-on opportunities',
      impact: 0.08,
      priority: 'medium' as const
    });

    return suggestions;
  }
}

// Export singleton instance
export const portfolioPerformancePredictorService = new PortfolioPerformancePredictorService();