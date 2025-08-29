/**
 * Feature-Flagged Reserve Engine Adapter
 * Orchestrates ML and rules engines with comprehensive logging and fallback
 */

import { eq, and } from 'drizzle-orm';
import { reserveDecisions } from '../../db/schema/reserves.js';
import { db } from '../../db/client.js';
import { 
  ReserveEnginePort, 
  PortfolioCompany, 
  MarketConditions, 
  ReserveDecision,
  ReserveEngineOptions,
  PredictionExplanation 
} from './ports.js';
import { DeterministicReserveEngine } from '../../../client/src/core/reserves/DeterministicReserveEngine.js';
import { ConstrainedReserveEngine } from '../../../client/src/core/reserves/ConstrainedReserveEngine.js';
import { MlClient } from './mlClient.js';
import { logger } from '../../lib/logger.js';
import { nanoid } from 'nanoid';
import { performanceMonitor } from '../../../client/src/lib/performance-monitor.js';

export interface FeatureFlagConfig {
  useMl: boolean;
  mode: 'ml' | 'rules' | 'hybrid';
  mlWeight: number; // 0-1, weight of ML vs rules in hybrid mode
  enableABTest: boolean;
  abTestPercentage: number; // 0-100, percentage of requests to route to ML
  fallbackOnError: boolean;
  logAllDecisions: boolean;
}

export interface EngineMetrics {
  totalRequests: number;
  mlRequests: number;
  rulesRequests: number;
  hybridRequests: number;
  fallbackCount: number;
  avgLatencyMs: number;
  errorRate: number;
}

export class FeatureFlaggedReserveEngine implements ReserveEnginePort {
  private metrics: EngineMetrics = {
    totalRequests: 0,
    mlRequests: 0,
    rulesRequests: 0,
    hybridRequests: 0,
    fallbackCount: 0,
    avgLatencyMs: 0,
    errorRate: 0,
  };

  constructor(
    private deterministicEngine: DeterministicReserveEngine,
    private constrainedEngine: ConstrainedReserveEngine,
    private mlClient: MlClient,
    private config: FeatureFlagConfig
  ) {}

  async compute(
    company: PortfolioCompany, 
    market: MarketConditions, 
    opts: ReserveEngineOptions = {}
  ): Promise<ReserveDecision> {
    const startTime = Date.now();
    const requestId = opts.requestId ?? nanoid();
    
    this.metrics.totalRequests++;

    // Determine engine mode based on feature flags and A/B testing
    const engineMode = this.determineEngineMode(company, opts);
    
    let decision: ReserveDecision;
    let fallbackUsed = false;

    try {
      switch (engineMode) {
        case 'ml':
          decision = await this.runMlEngine(company, market, opts);
          this.metrics.mlRequests++;
          break;
          
        case 'hybrid':
          decision = await this.runHybridEngine(company, market, opts);
          this.metrics.hybridRequests++;
          break;
          
        case 'rules':
        default:
          decision = await this.runRulesEngine(company, market, opts);
          this.metrics.rulesRequests++;
          break;
      }
    } catch (error) {
      logger.warn('Primary engine failed, falling back to rules', {
        companyId: company.id,
        engineMode,
        error: error instanceof Error ? error.message : String(error),
      });

      if (this.config.fallbackOnError) {
        decision = await this.runRulesEngine(company, market, opts);
        fallbackUsed = true;
        this.metrics.fallbackCount++;
      } else {
        throw error;
      }
    }

    // Update decision metadata
    decision.latencyMs = Date.now() - startTime;
    decision.metadata = {
      ...decision.metadata,
      requestId,
      engineMode,
      fallbackUsed,
      abTestBucket: this.getABTestBucket(company.id),
    };

    // Log decision to database if enabled
    if (this.config.logAllDecisions) {
      await this.logDecision(company, market, decision, opts).catch(error => {
        logger.error('Failed to log reserve decision', { 
          companyId: company.id, 
          error: error instanceof Error ? error.message : String(error) 
        });
      });
    }

    // Update performance metrics
    this.updateMetrics(decision.latencyMs!, fallbackUsed ? 1 : 0);

    // Record performance monitoring
    if (performanceMonitor) {
      performanceMonitor.recordCalculationPerformance(
        decision.latencyMs!,
        1, // company count
        !fallbackUsed
      );
    }

    return decision;
  }

  private determineEngineMode(company: PortfolioCompany, opts: ReserveEngineOptions): 'ml' | 'rules' | 'hybrid' {
    // Check if ML is disabled globally
    if (!this.config.useMl) return 'rules';

    // Check explicit mode override in options
    if (opts.flags?.engineMode) {
      return opts.flags.engineMode as 'ml' | 'rules' | 'hybrid';
    }

    // A/B testing logic
    if (this.config.enableABTest) {
      const bucket = this.getABTestBucket(company.id);
      if (bucket > this.config.abTestPercentage) {
        return 'rules';
      }
    }

    return this.config.mode;
  }

  private getABTestBucket(companyId: string): number {
    // Simple hash-based bucketing for consistent A/B assignment
    let hash = 0;
    for (let i = 0; i < companyId.length; i++) {
      const char = companyId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 100;
  }

  private async runMlEngine(
    company: PortfolioCompany, 
    market: MarketConditions, 
    opts: ReserveEngineOptions
  ): Promise<ReserveDecision> {
    const decision = await this.mlClient.predict(company, market, opts);
    
    // Enhance decision with additional context
    decision.prediction.notes = [
      ...(decision.prediction.notes || []),
      `ML prediction based on ${decision.engineVersion}`,
      `Market score: ${market.marketScore?.toFixed(3) || 'N/A'}`,
    ];

    return decision;
  }

  private async runRulesEngine(
    company: PortfolioCompany, 
    market: MarketConditions, 
    opts: ReserveEngineOptions
  ): Promise<ReserveDecision> {
    // Convert to format expected by existing engines
    const reserveInput = this.convertToReserveInput(company, market);
    
    // Use DeterministicReserveEngine for sophisticated calculations
    const result = await this.deterministicEngine.calculateOptimalReserveAllocation(reserveInput);
    
    // Convert back to our standardized format
    const decision: ReserveDecision = {
      prediction: {
        recommendedReserve: result.inputSummary.totalAllocated,
        notes: [
          `Rules-based allocation using ${result.algorithmVersion}`,
          `Conservation check: ${result.validationResults.conservationValid ? 'PASS' : 'FAIL'}`,
        ],
        confidence: {
          low: result.inputSummary.totalAllocated * 0.9,
          high: result.inputSummary.totalAllocated * 1.1,
          level: 0.9,
        },
      },
      explanation: {
        method: 'rules',
        details: {
          allocationLogic: result.allocationResults.allocationReasoning,
          riskFactors: result.riskAnalysis?.factors || [],
          stagePolicies: result.inputSummary.stagePoliciesApplied,
        },
        rulesFired: result.allocationResults.allocationReasoning?.map(r => r.description) || [],
      },
      engineType: 'rules',
      engineVersion: result.algorithmVersion,
    };

    return decision;
  }

  private async runHybridEngine(
    company: PortfolioCompany, 
    market: MarketConditions, 
    opts: ReserveEngineOptions
  ): Promise<ReserveDecision> {
    // Run both engines in parallel
    const [rulesDecision, mlDecision] = await Promise.allSettled([
      this.runRulesEngine(company, market, opts),
      this.runMlEngine(company, market, opts),
    ]);

    // Handle engine results
    const rules = rulesDecision.status === 'fulfilled' ? rulesDecision.value : null;
    const ml = mlDecision.status === 'fulfilled' ? mlDecision.value : null;

    if (!rules && !ml) {
      throw new Error('Both rules and ML engines failed');
    }

    if (!ml) {
      return { ...rules!, engineType: 'hybrid', engineVersion: 'hybrid-rules-fallback-v1' };
    }

    if (!rules) {
      return { ...ml, engineType: 'hybrid', engineVersion: 'hybrid-ml-only-v1' };
    }

    // Combine predictions using weighted average
    const mlWeight = this.config.mlWeight;
    const rulesWeight = 1 - mlWeight;
    
    const combinedReserve = 
      (ml.prediction.recommendedReserve * mlWeight) + 
      (rules.prediction.recommendedReserve * rulesWeight);

    const combinedExplanation: PredictionExplanation = {
      method: 'hybrid',
      details: {
        mlPrediction: ml.prediction.recommendedReserve,
        rulesPrediction: rules.prediction.recommendedReserve,
        mlWeight,
        rulesWeight,
        combinedLogic: 'Weighted average of ML and rules predictions',
        mlExplanation: ml.explanation?.details,
        rulesExplanation: rules.explanation?.details,
      },
      topFactors: [
        ...(ml.explanation?.topFactors || []).map(f => ({ ...f, source: 'ml' as const })),
        ...(rules.explanation?.topFactors || []).map(f => ({ ...f, source: 'rules' as const })),
      ].slice(0, 8),
    };

    const hybridDecision: ReserveDecision = {
      prediction: {
        recommendedReserve: Math.max(0, combinedReserve),
        perRound: ml.prediction.perRound || rules.prediction.perRound,
        confidence: {
          low: Math.min(
            ml.prediction.confidence?.low || combinedReserve,
            rules.prediction.confidence?.low || combinedReserve
          ),
          high: Math.max(
            ml.prediction.confidence?.high || combinedReserve,
            rules.prediction.confidence?.high || combinedReserve
          ),
          level: 0.8,
        },
        notes: [
          `Hybrid prediction: ${(mlWeight * 100).toFixed(0)}% ML, ${(rulesWeight * 100).toFixed(0)}% Rules`,
          `ML: ${ml.prediction.recommendedReserve.toLocaleString()}`,
          `Rules: ${rules.prediction.recommendedReserve.toLocaleString()}`,
          ...ml.prediction.notes || [],
          ...rules.prediction.notes || [],
        ],
      },
      explanation: combinedExplanation,
      engineType: 'hybrid',
      engineVersion: `hybrid-v1-ml${mlWeight}-rules${rulesWeight}`,
    };

    return hybridDecision;
  }

  private convertToReserveInput(company: PortfolioCompany, market: MarketConditions): any {
    // Convert our standardized format to what DeterministicReserveEngine expects
    return {
      portfolio: [company],
      availableReserves: company.invested * 2, // Example: 2x initial investment
      totalFundSize: company.invested * 10, // Example: company is 10% of fund
      marketConditions: market,
      scenarioType: 'base' as const,
      constraints: {
        maxPerCompany: company.invested * 3,
        maxPerStage: company.invested * 5,
        minCheck: 50000,
      },
    };
  }

  private async logDecision(
    company: PortfolioCompany,
    market: MarketConditions,
    decision: ReserveDecision,
    opts: ReserveEngineOptions
  ): Promise<void> {
    const periodStart = opts.periodStart || market.asOfDate;
    const periodEnd = opts.periodEnd || market.asOfDate;

    await db.insert(reserveDecisions).values({
      fundId: company.fundId,
      companyId: company.id,
      decisionTs: new Date(),
      periodStart,
      periodEnd,
      engineType: decision.engineType,
      engineVersion: decision.engineVersion,
      requestId: opts.requestId || null,
      featureFlags: {
        ...opts.flags,
        useMl: this.config.useMl,
        mode: this.config.mode,
        mlWeight: this.config.mlWeight,
      },
      inputs: { company, market, opts },
      prediction: decision.prediction,
      explanation: decision.explanation || null,
      latencyMs: decision.latencyMs || null,
      userId: opts.userId || null,
    });
  }

  private updateMetrics(latencyMs: number, _errors: number): void {
    // Update rolling average latency
    const totalLatency = this.metrics.avgLatencyMs * (this.metrics.totalRequests - 1) + latencyMs;
    this.metrics.avgLatencyMs = totalLatency / this.metrics.totalRequests;

    // Update error rate (simplified)
    this.metrics.errorRate = (this.metrics.fallbackCount / this.metrics.totalRequests) * 100;
  }

  public getMetrics(): EngineMetrics {
    return { ...this.metrics };
  }

  public resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      mlRequests: 0,
      rulesRequests: 0,
      hybridRequests: 0,
      fallbackCount: 0,
      avgLatencyMs: 0,
      errorRate: 0,
    };
  }
}