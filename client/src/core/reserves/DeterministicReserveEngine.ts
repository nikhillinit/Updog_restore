/**
 * DeterministicReserveEngine
 * 
 * Implements industry-standard "Exit MOIC on Planned Reserves" allocation algorithm
 * Provides deterministic, repeatable calculations for follow-on investment decisions
 */

import Decimal from 'decimal.js';
import {
  type PortfolioCompany,
  type GraduationMatrix,
  type StageStrategy,
  type ReserveAllocationInput,
  type ReserveAllocationOutput,
  type ReserveCalculationResult,
  type FeatureFlags,
  ReserveCalculationError,
  DEFAULT_STAGE_STRATEGIES,
} from '@shared/schemas/reserves-schemas';
import { logger } from '@/lib/logger';
import { performanceMonitor } from '@/lib/performance-monitor';

// Configuration and constants
const CALCULATION_VERSION = '1.0.0';
const MAX_ITERATIONS = 1000;
const CONVERGENCE_THRESHOLD = 0.001;
const DEFAULT_RISK_FREE_RATE = 0.02; // 2%

interface CalculationContext {
  startTime: number;
  deterministicSeed: string;
  featureFlags: FeatureFlags;
  debugMode: boolean;
}

interface MOICCalculation {
  companyId: string;
  currentMOIC: Decimal;
  projectedMOIC: Decimal;
  graduationProbability: Decimal;
  expectedValue: Decimal;
  riskAdjustedReturn: Decimal;
  allocationScore: Decimal;
}

export class DeterministicReserveEngine {
  private context: CalculationContext | null = null;
  private calculationCache = new Map<string, ReserveCalculationResult>();

  constructor(
    private featureFlags: FeatureFlags = {
      enableNewReserveEngine: true,
      enableParityTesting: true,
      enableRiskAdjustments: true,
      enableScenarioAnalysis: true,
      enableAdvancedDiversification: false,
      enableLiquidationPreferences: true,
      enablePerformanceLogging: true,
      maxCalculationTimeMs: 5000,
    }
  ) {
    // Set high precision for financial calculations
    Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
  }

  /**
   * Main entry point for reserve allocation calculation
   * Implements Exit MOIC on Planned Reserves ranking algorithm
   */
  async calculateOptimalReserveAllocation(
    input: ReserveAllocationInput
  ): Promise<ReserveCalculationResult> {
    const startTime = Date.now();
    
    // Initialize calculation context
    this.context = {
      startTime,
      deterministicSeed: this.generateDeterministicHash(input),
      featureFlags: this.featureFlags,
      debugMode: process.env['NODE_ENV'] === 'development',
    };

    try {
      // Check cache first (for deterministic results)
      const cacheKey = this.context.deterministicSeed;
      if (this.calculationCache.has(cacheKey)) {
        const cached = this.calculationCache.get(cacheKey)!;
        logger.debug('Returning cached reserve calculation', { cacheKey });
        return cached;
      }

      // Validate inputs
      this.validateInputs(input);

      // Track performance
      if (this.featureFlags.enablePerformanceLogging) {
        performanceMonitor.recordMetric(
          'reserve_calculation_start',
          input.portfolio.length,
          'companies'
        );
      }

      // Core calculation steps
      const moicCalculations = await this.calculateMOICForAllCompanies(input);
      const rankedAllocations = await this.rankByExitMOICOnPlannedReserves(
        moicCalculations,
        input
      );
      const optimizedAllocations = await this.optimizePortfolioAllocation(
        rankedAllocations,
        input
      );
      const riskAdjustedAllocations = await this.applyRiskAdjustments(
        optimizedAllocations,
        input
      );
      const finalAllocations = await this.applyConstraints(
        riskAdjustedAllocations,
        input
      );

      // Generate result
      const result = await this.generateCalculationResult(
        finalAllocations,
        input,
        moicCalculations
      );

      // Cache result for consistency
      this.calculationCache.set(cacheKey, result);

      // Performance tracking
      const duration = Date.now() - startTime;
      if (this.featureFlags.enablePerformanceLogging) {
        performanceMonitor.recordCalculationPerformance(
          duration,
          input.portfolio.length,
          true
        );
      }

      logger.info('Reserve calculation completed', {
        duration,
        companiesAnalyzed: input.portfolio.length,
        allocationsGenerated: finalAllocations.length,
        totalAllocated: result.inputSummary.totalAllocated,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (this.featureFlags.enablePerformanceLogging) {
        performanceMonitor.recordCalculationPerformance(
          duration,
          input.portfolio.length,
          false
        );
      }

      const errorDetails = {
        errorMessage: error instanceof Error ? error.message : String(error),
        duration,
        input: this.sanitizeForLogging(input),
      };
      logger.error('Reserve calculation failed', new Error(errorDetails.errorMessage));

      throw new ReserveCalculationError(
        `Reserve calculation failed: ${error instanceof Error ? error.message : String(error)}`,
        'CALCULATION_ERROR',
        { originalError: error, duration }
      );
    } finally {
      this.context = null;
    }
  }

  /**
   * Calculate MOIC (Multiple of Invested Capital) for all portfolio companies
   * This is the foundation for the Exit MOIC on Planned Reserves algorithm
   */
  private async calculateMOICForAllCompanies(
    input: ReserveAllocationInput
  ): Promise<MOICCalculation[]> {
    const calculations: MOICCalculation[] = [];

    for (const company of input.portfolio) {
      if (!company.isActive) continue;

      const currentMOIC = this.calculateCurrentMOIC(company);
      const projectedMOIC = await this.calculateProjectedMOIC(
        company,
        input.graduationMatrix,
        input.stageStrategies
      );
      const graduationProbability = this.calculateGraduationProbability(
        company,
        input.graduationMatrix
      );
      const expectedValue = this.calculateExpectedValue(
        company,
        projectedMOIC,
        graduationProbability
      );
      const riskAdjustedReturn = this.calculateRiskAdjustedReturn(
        expectedValue,
        company,
        input.stageStrategies
      );
      const allocationScore = this.calculateAllocationScore(
        projectedMOIC,
        graduationProbability,
        riskAdjustedReturn,
        company
      );

      calculations.push({
        companyId: company.id,
        currentMOIC,
        projectedMOIC,
        graduationProbability,
        expectedValue,
        riskAdjustedReturn,
        allocationScore,
      });

      if (this.context?.debugMode) {
        logger.debug('MOIC calculation for company', {
          companyId: company.id,
          companyName: company.name,
          currentMOIC: currentMOIC.toNumber(),
          projectedMOIC: projectedMOIC.toNumber(),
          allocationScore: allocationScore.toNumber(),
        });
      }
    }

    return calculations;
  }

  /**
   * Rank companies by Exit MOIC on Planned Reserves
   * This is the core industry-standard algorithm for follow-on decisions
   */
  private async rankByExitMOICOnPlannedReserves(
    calculations: MOICCalculation[],
    input: ReserveAllocationInput
  ): Promise<ReserveAllocationOutput[]> {
    // Sort by allocation score (highest first)
    const sorted = [...calculations].sort((a, b) => 
      b.allocationScore.comparedTo(a.allocationScore)
    );

    const allocations: ReserveAllocationOutput[] = [];
    let remainingReserves = new Decimal(input.availableReserves);

    for (let i = 0; i < sorted.length; i++) {
      const calc = sorted[i];
      const company = input.portfolio.find(c => c.id === calc.companyId)!;
      const stageStrategy = this.findStageStrategy(company.currentStage, input.stageStrategies);

      if (remainingReserves.lte(input.minAllocationThreshold)) {
        break; // Not enough reserves left
      }

      // Calculate recommended allocation
      const maxAllocation = this.calculateMaxAllocation(
        company,
        stageStrategy,
        input
      );
      const optimalAllocation = this.calculateOptimalAllocation(
        calc,
        maxAllocation,
        remainingReserves,
        input
      );

      if (optimalAllocation.gt(input.minAllocationThreshold)) {
        const allocation = this.createAllocationOutput(
          company,
          calc,
          optimalAllocation,
          i + 1, // priority
          stageStrategy,
          input
        );

        allocations.push(allocation);
        remainingReserves = remainingReserves.minus(optimalAllocation);
      }
    }

    return allocations;
  }

  /**
   * Optimize portfolio allocation for diversification and risk management
   */
  private async optimizePortfolioAllocation(
    allocations: ReserveAllocationOutput[],
    input: ReserveAllocationInput
  ): Promise<ReserveAllocationOutput[]> {
    if (!input.enableDiversification) {
      return allocations;
    }

    // Calculate current portfolio concentrations
    const totalFundSize = new Decimal(input.totalFundSize);
    const optimized = [...allocations];

    // Apply concentration limits
    for (const allocation of optimized) {
      const company = input.portfolio.find(c => c.id === allocation.companyId)!;
      const totalInvestment = new Decimal(company.totalInvested).plus(allocation.recommendedAllocation);
      const concentrationRatio = totalInvestment.div(totalFundSize);

      if (concentrationRatio.gt(input.maxPortfolioConcentration)) {
        // Reduce allocation to meet concentration limit
        const maxAdditional = totalFundSize
          .mul(input.maxPortfolioConcentration)
          .minus(company.totalInvested);
        
        allocation.recommendedAllocation = Math.max(
          maxAdditional.toNumber(),
          0
        );
        allocation.concentrationRisk = 'high';
        allocation.riskFactors.push('Portfolio concentration limit applied');
      }
    }

    // Apply diversification bonuses
    if (this.featureFlags.enableAdvancedDiversification) {
      this.applyDiversificationBonuses(optimized, input);
    }

    return optimized;
  }

  /**
   * Apply risk adjustments based on company and portfolio characteristics
   */
  private async applyRiskAdjustments(
    allocations: ReserveAllocationOutput[],
    input: ReserveAllocationInput
  ): Promise<ReserveAllocationOutput[]> {
    if (!input.enableRiskAdjustment) {
      return allocations;
    }

    const adjusted = [...allocations];

    for (const allocation of adjusted) {
      const company = input.portfolio.find(c => c.id === allocation.companyId)!;
      
      // Apply risk adjustments
      const riskMultiplier = this.calculateRiskMultiplier(company, input);
      const adjustedAllocation = new Decimal(allocation.recommendedAllocation)
        .mul(riskMultiplier);

      allocation.recommendedAllocation = adjustedAllocation.toNumber();
      allocation.riskAdjustedReturn = allocation.riskAdjustedReturn * riskMultiplier.toNumber();

      // Update risk factors
      if (riskMultiplier.lt(1)) {
        allocation.riskFactors.push('Risk adjustment applied due to company factors');
      }

      // Recalculate portfolio impact
      allocation.portfolioWeight = adjustedAllocation
        .div(input.totalFundSize)
        .toNumber();
    }

    return adjusted;
  }

  /**
   * Apply final constraints and validation
   */
  private async applyConstraints(
    allocations: ReserveAllocationOutput[],
    input: ReserveAllocationInput
  ): Promise<ReserveAllocationOutput[]> {
    const constrained = [...allocations];

    // Remove allocations below minimum threshold
    const filtered = constrained.filter(
      a => a.recommendedAllocation >= input.minAllocationThreshold
    );

    // Apply maximum single allocation constraint
    if (input.maxSingleAllocation) {
      for (const allocation of filtered) {
        if (allocation.recommendedAllocation > input.maxSingleAllocation) {
          allocation.recommendedAllocation = input.maxSingleAllocation;
          allocation.riskFactors.push('Maximum single allocation limit applied');
        }
      }
    }

    // Ensure total doesn't exceed available reserves
    const totalAllocated = filtered.reduce(
      (sum, a) => sum + a.recommendedAllocation,
      0
    );

    if (totalAllocated > input.availableReserves) {
      // Proportionally reduce allocations
      const reductionFactor = input.availableReserves / totalAllocated;
      for (const allocation of filtered) {
        allocation.recommendedAllocation *= reductionFactor;
        allocation.riskFactors.push('Proportional reduction applied to fit available reserves');
      }
    }

    return filtered;
  }

  /**
   * Generate final calculation result with comprehensive metrics
   */
  private async generateCalculationResult(
    allocations: ReserveAllocationOutput[],
    input: ReserveAllocationInput,
    moicCalculations: MOICCalculation[]
  ): Promise<ReserveCalculationResult> {
    const totalAllocated = allocations.reduce(
      (sum, a) => sum + a.recommendedAllocation,
      0
    );
    const unallocatedReserves = input.availableReserves - totalAllocated;

    // Calculate portfolio metrics
    const expectedPortfolioValue = allocations.reduce(
      (sum, a) => sum + a.expectedValue,
      0
    );
    const expectedPortfolioMOIC = expectedPortfolioValue / totalAllocated || 0;

    // Calculate risk metrics
    const riskAnalysis = this.calculateRiskAnalysis(allocations, input);
    const scenarioResults = await this.calculateScenarioAnalysis(allocations, input);

    const result: ReserveCalculationResult = {
      inputSummary: {
        totalPortfolioCompanies: input.portfolio.length,
        availableReserves: input.availableReserves,
        totalAllocated,
        allocationEfficiency: totalAllocated / input.availableReserves,
      },
      allocations,
      unallocatedReserves,
      portfolioMetrics: {
        expectedPortfolioMOIC,
        expectedPortfolioValue,
        portfolioDiversification: this.calculateDiversificationIndex(allocations),
        concentrationRisk: this.assessConcentrationRisk(allocations, input),
        averageTimeToExit: this.calculateAverageTimeToExit(allocations),
      },
      riskAnalysis,
      scenarioResults,
      metadata: {
        calculationDate: new Date(),
        calculationDuration: Date.now() - this.context!.startTime,
        modelVersion: CALCULATION_VERSION,
        deterministicHash: this.context!.deterministicSeed,
        assumptions: this.getCalculationAssumptions(),
        limitations: this.getCalculationLimitations(),
      },
    };

    return result;
  }

  // Helper methods for calculations
  private calculateCurrentMOIC(company: PortfolioCompany): Decimal {
    return new Decimal(company.currentValuation).div(company.totalInvested);
  }

  private async calculateProjectedMOIC(
    company: PortfolioCompany,
    graduationMatrix: GraduationMatrix,
    stageStrategies: StageStrategy[]
  ): Promise<Decimal> {
    const stageStrategy = this.findStageStrategy(company.currentStage, stageStrategies);
    if (!stageStrategy) {
      return new Decimal(company.currentMOIC || 1);
    }

    // Find graduation path
    const graduationRate = graduationMatrix.rates.find(
      rate => rate.fromStage === company.currentStage
    );

    if (!graduationRate) {
      return new Decimal(stageStrategy.expectedMOIC);
    }

    // Calculate projected MOIC based on graduation probability and valuation multiple
    const currentMOIC = this.calculateCurrentMOIC(company);
    const projectedMultiple = new Decimal(graduationRate.valuationMultiple);
    const graduationBonus = new Decimal(graduationRate.probability);

    return currentMOIC
      .mul(projectedMultiple)
      .mul(graduationBonus.plus(1));
  }

  private calculateGraduationProbability(
    company: PortfolioCompany,
    graduationMatrix: GraduationMatrix
  ): Decimal {
    const graduationRate = graduationMatrix.rates.find(
      rate => rate.fromStage === company.currentStage
    );

    return new Decimal(graduationRate?.probability || 0.5);
  }

  private calculateExpectedValue(
    company: PortfolioCompany,
    projectedMOIC: Decimal,
    graduationProbability: Decimal
  ): Decimal {
    return new Decimal(company.totalInvested)
      .mul(projectedMOIC)
      .mul(graduationProbability);
  }

  private calculateRiskAdjustedReturn(
    expectedValue: Decimal,
    company: PortfolioCompany,
    stageStrategies: StageStrategy[]
  ): Decimal {
    const stageStrategy = this.findStageStrategy(company.currentStage, stageStrategies);
    if (!stageStrategy) {
      return expectedValue;
    }

    const riskAdjustment = new Decimal(1).minus(stageStrategy.failureRate);
    return expectedValue.mul(riskAdjustment);
  }

  private calculateAllocationScore(
    projectedMOIC: Decimal,
    graduationProbability: Decimal,
    riskAdjustedReturn: Decimal,
    company: PortfolioCompany
  ): Decimal {
    // Exit MOIC on Planned Reserves calculation
    // Score = (Projected MOIC * Graduation Probability * Risk Adjustment) / Current Valuation
    return projectedMOIC
      .mul(graduationProbability)
      .mul(riskAdjustedReturn)
      .div(company.currentValuation);
  }

  private findStageStrategy(
    stage: string,
    stageStrategies: StageStrategy[]
  ): StageStrategy | undefined {
    return stageStrategies.find(s => s.stage === stage) || 
           DEFAULT_STAGE_STRATEGIES.find(s => s.stage === stage);
  }

  private calculateMaxAllocation(
    company: PortfolioCompany,
    stageStrategy: StageStrategy | undefined,
    input: ReserveAllocationInput
  ): Decimal {
    if (!stageStrategy) {
      return new Decimal(input.availableReserves * 0.1); // Default 10% max
    }

    const maxByStrategy = new Decimal(stageStrategy.maxInvestment);
    const maxByReserves = new Decimal(input.availableReserves * 0.3); // Max 30% of reserves
    const maxByConcentration = new Decimal(input.totalFundSize)
      .mul(input.maxPortfolioConcentration)
      .minus(company.totalInvested);

    return Decimal.min(maxByStrategy, maxByReserves, maxByConcentration);
  }

  private calculateOptimalAllocation(
    calc: MOICCalculation,
    maxAllocation: Decimal,
    remainingReserves: Decimal,
    input: ReserveAllocationInput
  ): Decimal {
    // Use allocation score to determine optimal amount within constraints
    const scoreBasedAllocation = calc.allocationScore
      .mul(remainingReserves)
      .div(100); // Normalize score

    return Decimal.min(
      scoreBasedAllocation,
      maxAllocation,
      remainingReserves,
      new Decimal(input.maxSingleAllocation || Infinity)
    );
  }

  private createAllocationOutput(
    company: PortfolioCompany,
    calc: MOICCalculation,
    allocation: Decimal,
    priority: number,
    stageStrategy: StageStrategy | undefined,
    input: ReserveAllocationInput
  ): ReserveAllocationOutput {
    const newOwnership = new Decimal(company.ownershipPercentage)
      .plus(allocation.div(company.currentValuation));

    return {
      companyId: company.id,
      companyName: company.name,
      recommendedAllocation: allocation.toNumber(),
      allocationRationale: this.generateAllocationRationale(calc, stageStrategy),
      priority,
      expectedMOIC: calc.projectedMOIC.toNumber(),
      expectedValue: calc.expectedValue.toNumber(),
      riskAdjustedReturn: calc.riskAdjustedReturn.toNumber(),
      newOwnership: Math.min(newOwnership.toNumber(), 1),
      portfolioWeight: allocation.div(input.totalFundSize).toNumber(),
      concentrationRisk: this.assessConcentrationRisk([{ 
        recommendedAllocation: allocation.toNumber(),
        companyId: company.id 
      } as ReserveAllocationOutput], input),
      recommendedStage: company.currentStage,
      timeToDeployment: 6, // Default 6 months
      followOnPotential: stageStrategy?.followOnProbability || 0.5,
      riskFactors: [],
      mitigationStrategies: [],
      calculationMetadata: {
        graduationProbability: calc.graduationProbability.toNumber(),
        expectedExitMultiple: calc.projectedMOIC.toNumber(),
        timeToExit: stageStrategy?.expectedTimeToExit || 84,
        diversificationBonus: 0,
        liquidationPrefImpact: 0,
      },
    };
  }

  // Utility methods
  private validateInputs(input: ReserveAllocationInput): void {
    if (input.portfolio.length === 0) {
      throw new ReserveCalculationError(
        'Portfolio cannot be empty',
        'INVALID_INPUT'
      );
    }

    if (input.availableReserves <= 0) {
      throw new ReserveCalculationError(
        'Available reserves must be positive',
        'INVALID_INPUT'
      );
    }

    if (input.totalFundSize <= 0) {
      throw new ReserveCalculationError(
        'Total fund size must be positive',
        'INVALID_INPUT'
      );
    }
  }

  private generateDeterministicHash(input: ReserveAllocationInput): string {
    // Create deterministic hash for caching and verification
    const hashInput = {
      portfolioCount: input.portfolio.length,
      availableReserves: input.availableReserves,
      totalFundSize: input.totalFundSize,
      scenarioType: input.scenarioType,
      timeHorizon: input.timeHorizon,
    };

    return Buffer.from(JSON.stringify(hashInput)).toString('base64');
  }

  private sanitizeForLogging(input: ReserveAllocationInput): any {
    return {
      portfolioCompanies: input.portfolio.length,
      availableReserves: input.availableReserves,
      totalFundSize: input.totalFundSize,
      scenarioType: input.scenarioType,
    };
  }

  private generateAllocationRationale(
    calc: MOICCalculation,
    stageStrategy: StageStrategy | undefined
  ): string {
    return `High allocation score (${calc.allocationScore.toFixed(2)}) based on projected MOIC of ${calc.projectedMOIC.toFixed(1)}x with ${(calc.graduationProbability.toNumber() * 100).toFixed(0)}% graduation probability.`;
  }

  private calculateRiskMultiplier(
    company: PortfolioCompany,
    input: ReserveAllocationInput
  ): Decimal {
    let multiplier = new Decimal(1);

    // Adjust for company age
    const ageMonths = (Date.now() - company.investmentDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths > 60) { // Over 5 years
      multiplier = multiplier.mul(0.9);
    }

    // Adjust for performance
    if (company.currentMOIC && company.currentMOIC < 1) {
      multiplier = multiplier.mul(0.8);
    }

    return multiplier;
  }

  private applyDiversificationBonuses(
    allocations: ReserveAllocationOutput[],
    input: ReserveAllocationInput
  ): void {
    // Apply bonuses for sector diversification
    const sectorCounts = new Map<string, number>();
    for (const allocation of allocations) {
      const company = input.portfolio.find(c => c.id === allocation.companyId)!;
      sectorCounts.set(company.sector, (sectorCounts.get(company.sector) || 0) + 1);
    }

    for (const allocation of allocations) {
      const company = input.portfolio.find(c => c.id === allocation.companyId)!;
      const sectorCount = sectorCounts.get(company.sector) || 1;
      
      if (sectorCount === 1) {
        // Bonus for unique sector
        allocation.recommendedAllocation *= 1.1;
        allocation.calculationMetadata.diversificationBonus = 0.1;
      }
    }
  }

  private calculateDiversificationIndex(allocations: ReserveAllocationOutput[]): number {
    // Calculate Herfindahl-Hirschman Index (HHI) for diversification
    const total = allocations.reduce((sum, a) => sum + a.recommendedAllocation, 0);
    if (total === 0) return 1;

    const hhi = allocations.reduce((sum, a) => {
      const share = a.recommendedAllocation / total;
      return sum + (share * share);
    }, 0);

    // Return diversification index (1 - HHI)
    return Math.max(0, 1 - hhi);
  }

  private assessConcentrationRisk(
    allocations: ReserveAllocationOutput[],
    input: ReserveAllocationInput
  ): 'low' | 'medium' | 'high' {
    const maxConcentration = Math.max(
      ...allocations.map(a => a.portfolioWeight || 0)
    );

    if (maxConcentration > input.maxPortfolioConcentration * 0.8) {
      return 'high';
    } else if (maxConcentration > input.maxPortfolioConcentration * 0.5) {
      return 'medium';
    }
    return 'low';
  }

  private calculateAverageTimeToExit(allocations: ReserveAllocationOutput[]): number {
    if (allocations.length === 0) return 84; // Default 7 years

    const totalWeighted = allocations.reduce(
      (sum, a) => sum + (a.calculationMetadata.timeToExit * a.recommendedAllocation),
      0
    );
    const totalAllocation = allocations.reduce(
      (sum, a) => sum + a.recommendedAllocation,
      0
    );

    return totalAllocation > 0 ? totalWeighted / totalAllocation : 84;
  }

  private calculateRiskAnalysis(
    allocations: ReserveAllocationOutput[],
    input: ReserveAllocationInput
  ): ReserveCalculationResult['riskAnalysis'] {
    // Simplified risk analysis
    const avgRiskAdjustedReturn = allocations.reduce(
      (sum, a) => sum + a.riskAdjustedReturn,
      0
    ) / allocations.length;

    return {
      portfolioRisk: avgRiskAdjustedReturn > 10000000 ? 'high' : 'medium',
      keyRiskFactors: ['Market concentration', 'Stage concentration', 'Sector concentration'],
      riskMitigationActions: ['Diversification', 'Staged deployment', 'Risk monitoring'],
      stressTestResults: {
        downside10: avgRiskAdjustedReturn * 0.3,
        upside90: avgRiskAdjustedReturn * 2.5,
        expectedValue: avgRiskAdjustedReturn,
      },
    };
  }

  private async calculateScenarioAnalysis(
    allocations: ReserveAllocationOutput[],
    input: ReserveAllocationInput
  ): Promise<ReserveCalculationResult['scenarioResults']> {
    const baseValue = allocations.reduce((sum, a) => sum + a.expectedValue, 0);

    return {
      conservative: {
        totalValue: baseValue * 0.7,
        portfolioMOIC: 2.5,
        probability: 0.2,
      },
      base: {
        totalValue: baseValue,
        portfolioMOIC: 5.0,
        probability: 0.6,
      },
      optimistic: {
        totalValue: baseValue * 1.8,
        portfolioMOIC: 12.0,
        probability: 0.2,
      },
    };
  }

  private getCalculationAssumptions(): string[] {
    return [
      'Industry-standard graduation rates applied',
      'Market conditions remain stable',
      'Company performance projections based on historical data',
      'No major economic disruptions assumed',
    ];
  }

  private getCalculationLimitations(): string[] {
    return [
      'Projections based on historical patterns',
      'Market timing not considered',
      'Individual company risk factors simplified',
      'Regulatory changes not factored',
    ];
  }
}