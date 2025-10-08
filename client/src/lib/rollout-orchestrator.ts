/**
 * Automated Rollout Orchestrator
 * Handles progressive deployment with automatic gate progression
 */

import { setFlag } from '@/lib/feature-flags';
import { metrics } from '@/metrics/reserves-metrics';

interface RolloutStage {
  name: string;
  percent: number;
  duration: number; // milliseconds
  criteria: {
    maxErrorRate: number;
    maxP95: number;
    minConservationRate: number;
    maxDivergenceRate?: number;
  };
  userGroups?: string[]; // Optional specific user targeting
}

interface RolloutMetrics {
  errorRate: number;
  p95Latency: number;
  p99Latency: number;
  conservationRate: number;
  divergenceRate: number;
  sampleSize: number;
  timestamp: Date;
}

export class AutomatedRolloutOrchestrator {
  private readonly stages: RolloutStage[] = [
    {
      name: 'Internal Testing',
      percent: 0.1,
      duration: 4 * 60 * 60 * 1000, // 4 hours
      criteria: {
        maxErrorRate: 0,
        maxP95: 50,
        minConservationRate: 1.0,
        maxDivergenceRate: 0
      },
      userGroups: ['internal-team']
    },
    {
      name: 'Canary',
      percent: 1,
      duration: 24 * 60 * 60 * 1000, // 24 hours
      criteria: {
        maxErrorRate: 0.001,
        maxP95: 100,
        minConservationRate: 0.999,
        maxDivergenceRate: 0.01
      }
    },
    {
      name: 'Early Adopters',
      percent: 10,
      duration: 24 * 60 * 60 * 1000, // 24 hours
      criteria: {
        maxErrorRate: 0.01,
        maxP95: 150,
        minConservationRate: 0.99,
        maxDivergenceRate: 0.05
      }
    },
    {
      name: 'Broad Rollout',
      percent: 50,
      duration: 12 * 60 * 60 * 1000, // 12 hours
      criteria: {
        maxErrorRate: 0.01,
        maxP95: 200,
        minConservationRate: 0.99,
        maxDivergenceRate: 0.05
      }
    },
    {
      name: 'Full Deployment',
      percent: 100,
      duration: 0, // Immediate
      criteria: {
        maxErrorRate: 0.01,
        maxP95: 300,
        minConservationRate: 0.99,
        maxDivergenceRate: 0.05
      }
    }
  ];
  
  private currentStage = -1;
  private rolloutStartTime?: Date;
  private stageStartTime?: Date;
  private abortSignal = false;
  private metrics: RolloutMetrics[] = [];
  
  // Configuration
  private readonly METRIC_POLL_INTERVAL = 60 * 1000; // 1 minute
  private readonly STABILITY_THRESHOLD = 0.95; // 95% stable metrics required
  
  async orchestrate(flagName: string = 'reserves_v11'): Promise<void> {
    console.log('🚀 Starting automated rollout orchestration');
    this.rolloutStartTime = new Date();
    
    try {
      for (let i = 0; i < this.stages.length; i++) {
        if (this.abortSignal) {
          console.log('⛔ Rollout aborted by signal');
          break;
        }
        
        const stage = this.stages[i];
        if (!stage) continue;

        this.currentStage = i;
        this.stageStartTime = new Date();

        console.log(`\n📊 Stage ${i + 1}/${this.stages.length}: ${stage.name}`);
        console.log(`   Target: ${stage.percent}% | Duration: ${stage.duration / 1000}s`);

        // Enable for percentage
        await this.enableStage(flagName, stage);

        // Skip monitoring for immediate stages
        if (stage.duration === 0) {
          console.log('   ✅ Immediate stage - no monitoring required');
          continue;
        }

        // Monitor for duration
        const success = await this.monitorStage(stage);

        if (success) {
          console.log(`   ✅ Stage ${stage.name} completed successfully`);
          await this.recordStageSuccess(stage);
        } else {
          console.log(`   ❌ Stage ${stage.name} failed criteria`);
          await this.handleStageFailure(stage, i);
          break;
        }
      }
      
      // Final report
      await this.generateFinalReport();
      
    } catch (error) {
      console.error('Orchestration error:', error);
      await this.emergencyRollback();
      throw error;
    }
  }
  
  private async enableStage(flagName: string, stage: RolloutStage): Promise<void> {
    // Set feature flag percentage
    setFlag(flagName as any, true);
    
    // Configure rollout
    const config = {
      percent: stage.percent,
      userGroups: stage.userGroups,
      shadowMode: stage.percent < 10 // Keep shadow mode for early stages
    };
    
    // Apply configuration
    await this.applyRolloutConfig(flagName, config);
    
    // Log activation
    metrics.recordRolloutStage(stage.name, stage.percent);
  }
  
  private async monitorStage(stage: RolloutStage): Promise<boolean> {
    const endTime = Date.now() + stage.duration;
    const metricsBuffer: RolloutMetrics[] = [];
    
    while (Date.now() < endTime) {
      if (this.abortSignal) return false;
      
      // Collect metrics
      const currentMetrics = await this.collectMetrics();
      metricsBuffer.push(currentMetrics);
      this.metrics.push(currentMetrics);
      
      // Check criteria continuously
      const meetsGateCriteria = this.evaluateCriteria(currentMetrics, stage.criteria);
      
      if (!meetsGateCriteria) {
        console.log(`   ⚠️ Criteria violation detected at ${new Date().toISOString()}`);
        console.log(`      Error Rate: ${currentMetrics.errorRate} (max: ${stage.criteria.maxErrorRate})`);
        console.log(`      P95 Latency: ${currentMetrics.p95Latency}ms (max: ${stage.criteria.maxP95}ms)`);
        
        // Check if it's a transient issue
        const isTransient = await this.checkTransientIssue(metricsBuffer);
        
        if (!isTransient) {
          return false; // Fail the stage
        }
      }
      
      // Progress indicator
      const progress = ((Date.now() - (this.stageStartTime?.getTime() || 0)) / stage.duration) * 100;
      if (progress % 25 < 1) {
        console.log(`   📈 Progress: ${Math.floor(progress)}%`);
      }
      
      // Wait before next poll
      await this.sleep(this.METRIC_POLL_INTERVAL);
    }
    
    // Final stability check
    return this.evaluateStageStability(metricsBuffer, stage.criteria);
  }
  
  private async collectMetrics(): Promise<RolloutMetrics> {
    // In production, this would query your metrics backend
    // For now, return simulated metrics
    
    const response = await fetch('/api/metrics/reserves/current');
    const data = await response.json();
    
    return {
      errorRate: data.errorRate || 0,
      p95Latency: data.p95Latency || 0,
      p99Latency: data.p99Latency || 0,
      conservationRate: data.conservationRate || 1,
      divergenceRate: data.divergenceRate || 0,
      sampleSize: data.sampleSize || 0,
      timestamp: new Date()
    };
  }
  
  private evaluateCriteria(metrics: RolloutMetrics, criteria: any): boolean {
    if (metrics.errorRate > criteria.maxErrorRate) return false;
    if (metrics.p95Latency > criteria.maxP95) return false;
    if (metrics.conservationRate < criteria.minConservationRate) return false;
    if (criteria.maxDivergenceRate && metrics.divergenceRate > criteria.maxDivergenceRate) return false;
    
    return true;
  }
  
  private async checkTransientIssue(buffer: RolloutMetrics[]): Promise<boolean> {
    // Look at last 5 metrics to determine if issue is transient
    const recent = buffer.slice(-5);
    if (recent.length < 3) return true; // Not enough data, assume transient
    
    // Count violations
    const violations = recent.filter(m => 
      m.errorRate > 0.01 || m.p95Latency > 500
    ).length;
    
    // If most recent metrics are good, it was transient
    return violations <= 1;
  }
  
  private evaluateStageStability(buffer: RolloutMetrics[], criteria: any): boolean {
    if (buffer.length === 0) return false;
    
    // Calculate percentage of metrics that meet criteria
    const meetsCriteria = buffer.filter(m => 
      this.evaluateCriteria(m, criteria)
    ).length;
    
    const stabilityRate = meetsCriteria / buffer.length;
    
    return stabilityRate >= this.STABILITY_THRESHOLD;
  }
  
  private async handleStageFailure(stage: RolloutStage, stageIndex: number): Promise<void> {
    console.log(`\n🔄 Initiating rollback for stage: ${stage.name}`);
    
    // Determine rollback target
    const prevStage = stageIndex > 0 ? this.stages[stageIndex - 1] : null;
    const rollbackTarget = prevStage
      ? prevStage.percent / 2  // Roll back to half of previous stage
      : 0; // Complete rollback

    // Intelligent rollback based on severity
    const lastMetrics = this.metrics[this.metrics.length - 1];

    if (lastMetrics && lastMetrics.errorRate > stage.criteria.maxErrorRate * 10) {
      // Critical failure - immediate full rollback
      console.log('   🚨 Critical failure detected - emergency rollback');
      await this.emergencyRollback();
    } else {
      // Staged rollback
      console.log(`   📉 Rolling back to ${rollbackTarget}%`);
      await this.stagedRollback(rollbackTarget);
    }
    
    // Generate failure report
    await this.generateFailureReport(stage, lastMetrics);
  }
  
  private async emergencyRollback(): Promise<void> {
    // Kill switch
    setFlag('reserves_v11' as any, false);
    setFlag('shadow_compare' as any, false);
    
    // Alert
    await this.sendAlert('EMERGENCY_ROLLBACK', 'Critical failure in reserves v1.1 rollout');
    
    // Record
    metrics.recordRollback('emergency', String(this.currentStage), '0');
  }
  
  private async stagedRollback(targetPercent: number): Promise<void> {
    // Gradual rollback
    setFlag('reserves_v11' as any, true);
    await this.applyRolloutConfig('reserves_v11', { percent: targetPercent });
    
    // Record
    metrics.recordRollback('staged', String(this.currentStage), String(targetPercent));
  }
  
  private async applyRolloutConfig(flagName: string, config: any): Promise<void> {
    // In production, this would update your feature flag service
    const payload = {
      flag: flagName,
      ...config,
      timestamp: new Date().toISOString()
    };
    
    await fetch('/api/features/rollout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  
  private async recordStageSuccess(stage: RolloutStage): Promise<void> {
    const duration = Date.now() - (this.stageStartTime?.getTime() || 0);
    
    const record = {
      stage: stage.name,
      percent: stage.percent,
      duration,
      metrics: this.metrics.slice(-10), // Last 10 metrics
      timestamp: new Date().toISOString()
    };
    
    // Store for analysis
    localStorage.setItem(`rollout_stage_${stage.name}`, JSON.stringify(record));
  }
  
  private async generateFinalReport(): Promise<void> {
    const totalDuration = Date.now() - (this.rolloutStartTime?.getTime() || 0);
    
    const report = {
      success: this.currentStage === this.stages.length - 1,
      stages: this.stages.map((s: any, i: any) => ({
        ...s,
        completed: i <= this.currentStage
      })),
      totalDuration,
      metrics: {
        avgErrorRate: this.calculateAverage(this.metrics, 'errorRate'),
        avgP95: this.calculateAverage(this.metrics, 'p95Latency'),
        minConservationRate: Math.min(...this.metrics.map(m => m.conservationRate))
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('\n📊 Rollout Complete!');
    console.log('Final Report:', report);
    
    // Store report
    localStorage.setItem('rollout_final_report', JSON.stringify(report));
  }
  
  private async generateFailureReport(stage: RolloutStage, metrics: RolloutMetrics): Promise<void> {
    const report = {
      stage: stage.name,
      failureMetrics: metrics,
      criteria: stage.criteria,
      violations: this.identifyViolations(metrics, stage.criteria),
      timestamp: new Date().toISOString()
    };
    
    console.error('Rollout Failure Report:', report);
    
    // Send alert
    await this.sendAlert('ROLLOUT_FAILURE', JSON.stringify(report));
  }
  
  private identifyViolations(metrics: RolloutMetrics, criteria: any): string[] {
    const violations = [];
    
    if (metrics.errorRate > criteria.maxErrorRate) {
      violations.push(`Error rate ${metrics.errorRate} > ${criteria.maxErrorRate}`);
    }
    if (metrics.p95Latency > criteria.maxP95) {
      violations.push(`P95 latency ${metrics.p95Latency}ms > ${criteria.maxP95}ms`);
    }
    if (metrics.conservationRate < criteria.minConservationRate) {
      violations.push(`Conservation rate ${metrics.conservationRate} < ${criteria.minConservationRate}`);
    }
    
    return violations;
  }
  
  private calculateAverage(metrics: RolloutMetrics[], field: keyof RolloutMetrics): number {
    if (metrics.length === 0) return 0;
    const sum = metrics.reduce((acc: any, m: any) => acc + (m[field] as number), 0);
    return sum / metrics.length;
  }
  
  private async sendAlert(type: string, message: string): Promise<void> {
    // Send to alerting system
    const alert = {
      type,
      message,
      severity: 'critical',
      timestamp: new Date().toISOString()
    };
    
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const alertUrl = '/api/alerts';
      navigator.sendBeacon(alertUrl, JSON.stringify(alert));
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Control methods
  abort(): void {
    this.abortSignal = true;
  }
  
  getCurrentStage(): string {
    return this.currentStage >= 0 ? (this.stages[this.currentStage]?.name ?? 'Unknown') : 'Not started';
  }
  
  getMetrics(): RolloutMetrics[] {
    return [...this.metrics];
  }
}

// Export singleton
export const rolloutOrchestrator = new AutomatedRolloutOrchestrator();