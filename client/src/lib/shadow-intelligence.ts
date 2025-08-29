/**
 * Intelligent Shadow Comparison Framework
 * Provides context-aware divergence analysis with business impact assessment
 */

import { metrics } from '@/metrics/reserves-metrics';
import type { ReservesResult } from '@shared/types/reserves-v11';

export type DivergenceType = 'rounding' | 'logic' | 'data' | 'error' | 'improvement';
export type Severity = 'critical' | 'warning' | 'info';

export interface DivergenceAnalysis {
  match: boolean;
  divergenceType: DivergenceType;
  severity: Severity;
  businessImpact: number; // Dollar amount of difference
  affectedCompanies: string[];
  conservationViolation: boolean;
  
  // Intelligent categorization
  isExpectedDivergence: boolean;
  requiresInvestigation: boolean;
  autoApprove: boolean;
  
  // Detailed breakdown
  details: {
    totalDifference: number;
    percentDifference: number;
    largestCompanyDiff: { id: string; amount: number };
    pattern: string; // e.g., "consistent_underallocation"
  };
}

export class ShadowIntelligence {
  private readonly ROUNDING_TOLERANCE = 1; // 1 cent
  private readonly CRITICAL_IMPACT_THRESHOLD = 1000; // $10
  private readonly WARNING_IMPACT_THRESHOLD = 100; // $1
  private readonly AUTO_APPROVE_THRESHOLD = 0.01; // 1 cent
  
  private patterns = new Map<string, number>();
  
  async analyzeDivergence(
    v1Result: ReservesResult,
    v11Result: ReservesResult
  ): Promise<DivergenceAnalysis> {
    const startTime = performance.now();
    
    try {
      // Quick match check
      if (this.exactMatch(v1Result, v11Result)) {
        return this.createMatchResult();
      }
      
      // Calculate business impact
      const impact = this.calculateBusinessImpact(v1Result, v11Result);
      
      // Determine divergence type
      const divergenceType = this.categorizeDivergence(v1Result, v11Result, impact);
      
      // Assess severity
      const severity = this.assessSeverity(impact, divergenceType);
      
      // Check conservation
      const conservationViolation = this.checkConservationViolation(v11Result);
      
      // Build analysis
      const analysis: DivergenceAnalysis = {
        match: false,
        divergenceType,
        severity,
        businessImpact: impact.totalDifference / 100, // Convert to dollars
        affectedCompanies: impact.affectedCompanies,
        conservationViolation,
        
        // Intelligent flags
        isExpectedDivergence: this.isExpectedImprovement(divergenceType, impact),
        requiresInvestigation: severity === 'critical' || conservationViolation,
        autoApprove: this.canAutoApprove(impact, divergenceType),
        
        details: {
          totalDifference: impact.totalDifference,
          percentDifference: impact.percentDifference,
          largestCompanyDiff: impact.largestDiff,
          pattern: this.detectPattern(v1Result, v11Result)
        }
      };
      
      // Record metrics
      this.recordAnalysis(analysis);
      
      // Alert if critical
      if (analysis.requiresInvestigation) {
        await this.triggerInvestigation(analysis);
      }
      
      return analysis;
      
    } finally {
      metrics.recordDuration('shadow.analysis', performance.now() - startTime);
    }
  }
  
  private exactMatch(v1: ReservesResult, v11: ReservesResult): boolean {
    if (!v1.ok || !v11.ok) return v1.ok === v11.ok;
    if (!v1.data || !v11.data) return false;
    
    // Check totals
    if (Math.abs(v1.data.remaining_cents - v11.data.remaining_cents) > this.ROUNDING_TOLERANCE) {
      return false;
    }
    
    // Check allocations
    const v1Map = new Map(v1.data.allocations.map(a => [a.company_id, a.planned_cents]));
    const v11Map = new Map(v11.data.allocations.map(a => [a.company_id, a.planned_cents]));
    
    if (v1Map.size !== v11Map.size) return false;
    
    for (const [id, v1Amount] of v1Map) {
      const v11Amount = v11Map.get(id);
      if (!v11Amount || Math.abs(v1Amount - v11Amount) > this.ROUNDING_TOLERANCE) {
        return false;
      }
    }
    
    return true;
  }
  
  private calculateBusinessImpact(v1: ReservesResult, v11: ReservesResult) {
    const v1Allocations = v1.data?.allocations || [];
    const v11Allocations = v11.data?.allocations || [];
    
    const v1Map = new Map(v1Allocations.map(a => [a.company_id, a.planned_cents]));
    const v11Map = new Map(v11Allocations.map(a => [a.company_id, a.planned_cents]));
    
    let totalDifference = 0;
    const affectedCompanies: string[] = [];
    let largestDiff = { id: '', amount: 0 };
    
    // Check all companies
    const allCompanies = new Set([...v1Map.keys(), ...v11Map.keys()]);
    
    for (const companyId of allCompanies) {
      const v1Amount = v1Map.get(companyId) || 0;
      const v11Amount = v11Map.get(companyId) || 0;
      const diff = Math.abs(v11Amount - v1Amount);
      
      if (diff > this.ROUNDING_TOLERANCE) {
        totalDifference += diff;
        affectedCompanies.push(companyId);
        
        if (diff > largestDiff.amount) {
          largestDiff = { id: companyId, amount: diff };
        }
      }
    }
    
    const totalAllocated = v11.data?.metadata.total_allocated_cents || 1;
    const percentDifference = (totalDifference / totalAllocated) * 100;
    
    return {
      totalDifference,
      percentDifference,
      affectedCompanies,
      largestDiff
    };
  }
  
  private categorizeDivergence(
    v1: ReservesResult,
    v11: ReservesResult,
    impact: any
  ): DivergenceType {
    // Rounding differences
    if (impact.totalDifference <= this.ROUNDING_TOLERANCE * impact.affectedCompanies.length) {
      return 'rounding';
    }
    
    // Error in one engine
    if (v1.ok !== v11.ok) {
      return 'error';
    }
    
    // Data differences (different company counts)
    if (v1.data?.allocations.length !== v11.data?.allocations.length) {
      return 'data';
    }
    
    // Check if v11 is consistently better (improvement)
    if (this.isConsistentImprovement(v1, v11)) {
      return 'improvement';
    }
    
    // Logic differences
    return 'logic';
  }
  
  private assessSeverity(impact: any, type: DivergenceType): Severity {
    // Critical: Large business impact or errors
    if (impact.totalDifference > this.CRITICAL_IMPACT_THRESHOLD * 100 || type === 'error') {
      return 'critical';
    }
    
    // Warning: Medium impact or data differences
    if (impact.totalDifference > this.WARNING_IMPACT_THRESHOLD * 100 || type === 'data') {
      return 'warning';
    }
    
    // Info: Small impact, rounding, or improvements
    return 'info';
  }
  
  private checkConservationViolation(result: ReservesResult): boolean {
    if (!result.ok || !result.data) return false;
    return !result.data.metadata.conservation_check;
  }
  
  private isExpectedImprovement(type: DivergenceType, impact: any): boolean {
    // Improvements are expected
    if (type === 'improvement') return true;
    
    // Small rounding differences are expected
    if (type === 'rounding' && impact.totalDifference < 10) return true;
    
    return false;
  }
  
  private canAutoApprove(impact: any, type: DivergenceType): boolean {
    // Auto-approve tiny differences
    if (impact.totalDifference <= this.AUTO_APPROVE_THRESHOLD) return true;
    
    // Auto-approve known improvements
    if (type === 'improvement' && impact.totalDifference < this.WARNING_IMPACT_THRESHOLD) {
      return true;
    }
    
    // Auto-approve rounding differences
    if (type === 'rounding' && impact.percentDifference < 0.01) {
      return true;
    }
    
    return false;
  }
  
  private isConsistentImprovement(v1: ReservesResult, v11: ReservesResult): boolean {
    if (!v1.data || !v11.data) return false;
    
    // Check if v11 has better utilization
    const v1Utilization = v1.data.metadata.total_allocated_cents / v1.data.metadata.total_available_cents;
    const v11Utilization = v11.data.metadata.total_allocated_cents / v11.data.metadata.total_available_cents;
    
    return v11Utilization > v1Utilization && v11.data.metadata.conservation_check;
  }
  
  private detectPattern(v1: ReservesResult, v11: ReservesResult): string {
    // Detect common patterns
    if (!v1.data || !v11.data) return 'error_pattern';
    
    const v1Total = v1.data.metadata.total_allocated_cents;
    const v11Total = v11.data.metadata.total_allocated_cents;
    
    if (v11Total > v1Total) return 'increased_allocation';
    if (v11Total < v1Total) return 'decreased_allocation';
    if (v11.data.allocations.length > v1.data.allocations.length) return 'morecompanies_funded';
    if (v11.data.allocations.length < v1.data.allocations.length) return 'fewercompanies_funded';
    
    return 'rebalanced_allocation';
  }
  
  private createMatchResult(): DivergenceAnalysis {
    return {
      match: true,
      divergenceType: 'rounding',
      severity: 'info',
      businessImpact: 0,
      affectedCompanies: [],
      conservationViolation: false,
      isExpectedDivergence: false,
      requiresInvestigation: false,
      autoApprove: true,
      details: {
        totalDifference: 0,
        percentDifference: 0,
        largestCompanyDiff: { id: '', amount: 0 },
        pattern: 'exact_match'
      }
    };
  }
  
  private recordAnalysis(analysis: DivergenceAnalysis): void {
    // Record pattern frequency
    const pattern = analysis.details.pattern;
    this.patterns.set(pattern, (this.patterns.get(pattern) || 0) + 1);
    
    // Record metrics
    metrics.recordDivergence(analysis.divergenceType, analysis.severity);
    
    // Log for analysis
    if (analysis.severity !== 'info') {
      console.log('Shadow divergence detected:', analysis);
    }
  }
  
  private async triggerInvestigation(analysis: DivergenceAnalysis): Promise<void> {
    // Send alert
    const alert = {
      type: 'shadow_divergence',
      severity: analysis.severity,
      businessImpact: analysis.businessImpact,
      pattern: analysis.details.pattern,
      requiresAction: analysis.requiresInvestigation,
      timestamp: new Date().toISOString()
    };
    
    // Send to monitoring
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const alertUrl = document.querySelector('meta[name="alert-url"]')?.getAttribute('content');
      if (alertUrl) {
        navigator.sendBeacon(alertUrl, JSON.stringify(alert));
      }
    }
  }
  
  // Get pattern insights
  getPatternInsights(): Map<string, number> {
    return new Map(this.patterns);
  }
  
  // Clear pattern history
  clearPatterns(): void {
    this.patterns.clear();
  }
}

// Export singleton
export const shadowIntelligence = new ShadowIntelligence();