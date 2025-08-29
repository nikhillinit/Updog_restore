/**
 * LP Reporting Business Metrics
 * Translates technical metrics into business intelligence
 */

import { metrics } from '../../lib/metrics';
import { db } from '../db';
import { sql } from 'drizzle-orm';

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
    
    metrics.histogram('lp_engagement_score', engagement, {
      action,
      lpId
    });
    
    // Alert if engagement drops
    if (engagement < 0.3) {
      metrics.counter('low_engagement_alerts', 1, { lpId });
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
    
    metrics.gauge('report_generation_cost_dollars', estimatedCost, {
      reportType: params.reportType,
      fundId: params.fundId.toString(),
      complexity: this.getComplexityTier(complexityScore)
    });
    
    return { complexityScore, estimatedCost };
  }
  
  // Operational intelligence
  static recordOperationalMetrics(context: BusinessContext) {
    // Record operation with full business context
    metrics.histogram('operation_duration_by_tier', Date.now(), {
      orgTier: context.orgTier,
      operationType: context.operationType,
      fundSize: this.getFundSizeTier(context.fundSize)
    });
    
    // Track revenue at risk
    if (context.orgTier === 'enterprise') {
      metrics.gauge('enterprise_revenue_at_risk', context.estimatedValue, {
        userId: context.userId,
        operationType: context.operationType
      });
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
    
    metrics.histogram(`endpoint_duration_${tier}`, duration, {
      endpoint,
      sloViolation: sloViolation.toString()
    });
    
    if (sloViolation && tier === 'enterprise') {
      metrics.counter('enterprise_slo_violations', 1, {
        endpoint,
        overage: (duration - sloTarget).toString()
      });
      
      // Calculate revenue impact
      const revenueImpact = await this.calculateRevenueImpact(tier, duration - sloTarget);
      metrics.gauge('slo_violation_revenue_impact', revenueImpact, {
        tier,
        endpoint
      });
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
      metrics.histogram(`report_stage_${stage}_ms`, duration, { reportId });
    };
    
    return {
      recordStage,
      complete: () => {
        const totalTime = Object.values(stages).reduce((a, b) => a + b, 0);
        
        metrics.histogram('report_generation_total_ms', totalTime, {
          reportId,
          dataFetchPct: ((stages.dataFetch / totalTime) * 100).toFixed(1),
          processingPct: ((stages.processing / totalTime) * 100).toFixed(1),
          renderingPct: ((stages.rendering / totalTime) * 100).toFixed(1)
        });
        
        // Identify bottlenecks
        const bottleneck = Object.entries(stages).reduce((a, b) => 
          b[1] > a[1] ? b : a
        );
        
        if (bottleneck[1] > totalTime * 0.5) {
          metrics.counter('report_bottlenecks', 1, {
            stage: bottleneck[0],
            reportId
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
      metrics.counter('data_integrity_risks', risks.length, {
        operation,
        risks: risks.join(',')
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
    
    const { active_days, total_actions } = result.rows[0];
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
    
    metrics.gauge('customer_health_score', 
      Object.values(healthFactors).reduce((a, b) => a + b, 0), 
      {
        userId: context.userId,
        orgTier: context.orgTier
      }
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