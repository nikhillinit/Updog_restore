/**
 * LP Reporting Business Metrics
 * Translates technical metrics into business intelligence
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { Histogram, Counter, Gauge } from 'prom-client';

// Create LP-specific metrics
const lpEngagementScore = new Histogram({
  name: 'lp_engagement_score',
  help: 'LP engagement score',
  labelNames: ['action', 'lpId'],
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
});

const lowEngagementAlerts = new Counter({
  name: 'low_engagement_alerts',
  help: 'Count of low engagement alerts',
  labelNames: ['lpId']
});

const lpNps = new Gauge({
  name: 'lp_nps',
  help: 'LP Net Promoter Score',
  labelNames: ['lpId']
});

const dealVelocity = new Histogram({
  name: 'deal_velocity_days',
  help: 'Time from deal sourcing to close in days',
  labelNames: ['fund'],
  buckets: [7, 14, 30, 60, 90, 120, 180]
});

// Additional metrics for LP reporting
const reportGenerationCost = new Gauge({
  name: 'report_generation_cost_dollars',
  help: 'Estimated cost of report generation in dollars',
  labelNames: ['fundId', 'complexity']
});

const operationDurationByTier = new Histogram({
  name: 'operation_duration_by_tier',
  help: 'Operation duration by customer tier',
  labelNames: ['tier', 'operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

const enterpriseRevenueAtRisk = new Gauge({
  name: 'enterprise_revenue_at_risk',
  help: 'Enterprise revenue at risk',
  labelNames: ['customerId', 'reason']
});

const endpointDuration = new Histogram({
  name: 'endpoint_duration',
  help: 'Endpoint duration by tier',
  labelNames: ['tier', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const enterpriseSloViolations = new Counter({
  name: 'enterprise_slo_violations',
  help: 'Count of enterprise SLO violations',
  labelNames: ['customerId']
});

const sloViolationRevenueImpact = new Gauge({
  name: 'slo_violation_revenue_impact',
  help: 'Revenue impact of SLO violations',
  labelNames: ['customerId']
});

const reportStageMetrics = new Histogram({
  name: 'report_stage_duration_ms',
  help: 'Report generation stage duration',
  labelNames: ['stage', 'reportId'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000]
});

const reportBottlenecks = new Counter({
  name: 'report_bottlenecks',
  help: 'Count of report generation bottlenecks',
  labelNames: ['stage', 'fundId']
});

const dataIntegrityRisks = new Counter({
  name: 'data_integrity_risks',
  help: 'Count of data integrity risks',
  labelNames: ['fundId', 'severity']
});

const customerHealthScore = new Gauge({
  name: 'customer_health_score',
  help: 'Customer health score',
  labelNames: ['lpId', 'riskLevel']
});

export interface BusinessContext {
  userId: string;
  orgTier: 'enterprise' | 'growth' | 'startup';
  fundSize: number;
  operationType: 'report_gen' | 'simulation' | 'data_entry' | 'lp_management';
  estimatedValue: number;
}

export class LPBusinessMetrics {
  // Customer success indicators
  static async recordLPEngagement(lpId: string, action: string) {
    const engagement = await this.calculateEngagementScore(lpId);
    
    lpEngagementScore.observe({ action, lpId }, engagement);
    
    // Alert if engagement drops
    if (engagement < 0.3) {
      lowEngagementAlerts.inc({ lpId });
    }
  }
  
  // Revenue correlation metrics
  static recordReportComplexity(params: {
    fundId: number;
    reportType: string;
    lpCount: number;
    dataPoints: number;
  }) {
    const complexityScore = params.lpCount * params.dataPoints;
    const estimatedCost = this.calculateComputeCost(complexityScore);
    
    reportGenerationCost['set']({
      fundId: params.fundId.toString(),
      complexity: this.getComplexityTier(complexityScore)
    }, estimatedCost);
    
    return { complexityScore, estimatedCost };
  }
  
  // Operational intelligence
  static recordOperationalMetrics(context: BusinessContext) {
    // Record operation with full business context
    operationDurationByTier.observe({
      tier: context.orgTier,
      operation: context.operationType
    }, Date.now());
    
    // Track revenue at risk
    if (context.orgTier === 'enterprise') {
      enterpriseRevenueAtRisk['set']({
        customerId: context.userId,
        reason: context.operationType
      }, context.estimatedValue);
    }
    
    // Customer success correlation
    this.updateCustomerHealthScore(context);
  }
  
  // Performance by customer tier
  static async recordTieredPerformance(endpoint: string, duration: number, tier: string) {
    // Different SLOs for different tiers
    const slos = {
      enterprise: 200,
      growth: 400,
      startup: 1000
    };
    
    const sloTarget = slos[tier] || 1000;
    const sloViolation = duration > sloTarget;
    
    endpointDuration.observe({
      tier,
      endpoint
    }, duration / 1000); // Convert to seconds
    
    if (sloViolation && tier === 'enterprise') {
      enterpriseSloViolations.inc({
        customerId: endpoint // Using endpoint as a proxy for customer context
      });
      
      // Calculate revenue impact
      const revenueImpact = await this.calculateRevenueImpact(tier, duration - sloTarget);
      sloViolationRevenueImpact['set']({
        customerId: endpoint
      }, revenueImpact);
    }
  }
  
  // Support efficiency metrics
  static async traceReportGeneration(reportId: string, startTime: number) {
    const stages = {
      dataFetch: 0,
      processing: 0,
      rendering: 0,
      storage: 0
    };
    
    // Record stage timings
    const recordStage = (stage: keyof typeof stages, duration: number) => {
      stages[stage] = duration;
      reportStageMetrics.observe({ stage, reportId }, duration);
    };
    
    return {
      recordStage,
      complete: () => {
        const totalTime = Object.values(stages).reduce((a: any, b: any) => a + b, 0);
        
        reportStageMetrics.observe({ stage: 'total', reportId }, totalTime);
        
        // Identify bottlenecks
        const bottleneck = Object.entries(stages).reduce((a: any, b: any) => 
          b[1]! > a[1]! ? b : a
        );
        
        if (bottleneck[1]! > totalTime * 0.5) {
          reportBottlenecks.inc({
            stage: bottleneck[0]!,
            fundId: reportId // Using reportId as a proxy for fundId
          });
        }
      }
    };
  }
  
  // Risk monitoring
  static monitorDataIntegrity(operation: string, params: any) {
    const risks = [];
    
    // Check for temporal inconsistencies
    if (params.asOfDate && new Date(params.asOfDate) > new Date()) {
      risks.push('future_date');
    }
    
    // Check for data completeness
    if (params.missingData && params.missingData.length > 0) {
      risks.push('incomplete_data');
    }
    
    // Check for unusual patterns
    if (params.lpCount > 100) {
      risks.push('high_volume');
    }
    
    if (risks.length > 0) {
      dataIntegrityRisks.inc({
        fundId: operation, // Using operation as a proxy for context
        severity: risks.length > 2 ? 'high' : 'medium'
      });
    }
    
    return risks;
  }
  
  // Helper methods
  private static async calculateEngagementScore(lpId: string): Promise<number> {
    // Calculate based on recent activity
    const result = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT DATE(created_at)) as active_days,
        COUNT(*) as total_actions
      FROM communications
      WHERE to_lp_id = ${lpId}
        AND created_at > NOW() - INTERVAL '30 days'
    `);
    
    const { active_days, total_actions } = result.rows[0]! as { active_days: number; total_actions: number };
    return Math.min(1, (active_days * 0.1 + total_actions * 0.01));
  }
  
  private static calculateComputeCost(complexity: number): number {
    // Rough estimate: $0.0001 per complexity unit
    return complexity * 0.0001;
  }
  
  private static getComplexityTier(score: number): string {
    if (score < 100) return 'simple';
    if (score < 1000) return 'moderate';
    if (score < 10000) return 'complex';
    return 'very_complex';
  }
  
  private static getFundSizeTier(size: number): string {
    if (size < 10_000_000) return 'micro';
    if (size < 50_000_000) return 'small';
    if (size < 250_000_000) return 'medium';
    if (size < 1_000_000_000) return 'large';
    return 'mega';
  }
  
  private static async calculateRevenueImpact(tier: string, overage: number): Promise<number> {
    const impactRates = {
      enterprise: 100, // $100 per second of SLO violation
      growth: 10,      // $10 per second
      startup: 1       // $1 per second
    };
    
    return (overage / 1000) * (impactRates[tier] || 1);
  }
  
  private static updateCustomerHealthScore(context: BusinessContext) {
    // Composite health score based on multiple factors
    const healthFactors = {
      performance: context.operationType === 'report_gen' ? 0.4 : 0.2,
      engagement: 0.3,
      dataQuality: 0.2,
      supportTickets: 0.1
    };
    
    const healthScore = Object.values(healthFactors).reduce((a: any, b: any) => a + b, 0);
    customerHealthScore['set'](
      {
        lpId: context.userId,
        riskLevel: healthScore < 0.5 ? 'high' : healthScore < 0.8 ? 'medium' : 'low'
      },
      healthScore
    );
  }
}

// Export convenience functions
export const lpMetrics = {
  engagement: LPBusinessMetrics.recordLPEngagement.bind(LPBusinessMetrics),
  complexity: LPBusinessMetrics.recordReportComplexity.bind(LPBusinessMetrics),
  operational: LPBusinessMetrics.recordOperationalMetrics.bind(LPBusinessMetrics),
  performance: LPBusinessMetrics.recordTieredPerformance.bind(LPBusinessMetrics),
  trace: LPBusinessMetrics.traceReportGeneration.bind(LPBusinessMetrics),
  risk: LPBusinessMetrics.monitorDataIntegrity.bind(LPBusinessMetrics)
};