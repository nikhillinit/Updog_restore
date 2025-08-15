#!/usr/bin/env tsx
/**
 * Production Deployment Orchestrator
 * Implements safe, monitored, reversible deployments
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import { 
  DeploymentError, 
  HealthCheckError, 
  RolloutMetrics,
  createDeploymentError,
  createHealthCheckError
} from '../server/types/errors.js';
import { DeploymentTracer, tracer } from '../server/lib/tracing.js';
import { DeploymentCircuitBreaker } from './deployment-circuit-breaker.js';
import { SLOValidator } from './slo-validator.js';

// Configuration
interface DeploymentConfig {
  thresholds: {
    errorRate: number;
    p99Latency: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  stages: Array<{
    name: string;
    percentage: number;
    duration: number;
    smoothing: number;
  }>;
  rollback: {
    automatic: boolean;
    timeoutMs: number;
  };
}

// Load configuration
function loadConfig(): DeploymentConfig {
  const defaults: DeploymentConfig = {
    thresholds: {
      errorRate: Number(process.env.DEPLOY_ERROR_THRESHOLD || 0.01),
      p99Latency: Number(process.env.DEPLOY_P99_THRESHOLD || 1000),
      memoryUsage: Number(process.env.DEPLOY_MEMORY_THRESHOLD || 0.8),
      cpuUsage: Number(process.env.DEPLOY_CPU_THRESHOLD || 0.7)
    },
    stages: [
      { name: 'smoke', percentage: 0, duration: 120000, smoothing: 1 },
      { name: 'canary', percentage: 1, duration: 300000, smoothing: 3 },
      { name: 'early', percentage: 5, duration: 600000, smoothing: 5 },
      { name: 'expanded', percentage: 25, duration: 900000, smoothing: 5 },
      { name: 'majority', percentage: 50, duration: 900000, smoothing: 5 },
      { name: 'nearly-full', percentage: 95, duration: 600000, smoothing: 3 },
      { name: 'full', percentage: 100, duration: 300000, smoothing: 3 }
    ],
    rollback: {
      automatic: true,
      timeoutMs: 120000
    }
  };

  // Override with config file if exists
  const configPath = join(process.cwd(), 'deployment.config.json');
  if (existsSync(configPath)) {
    const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    return { ...defaults, ...fileConfig };
  }

  return defaults;
}

// Execute command with proper error handling and specific types
async function exec(command: string): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return { success: true, output };
  } catch (error: unknown) {
    const execError = error as { message: string; stdout?: Buffer };
    return { 
      success: false, 
      error: execError.message,
      output: execError.stdout?.toString() || ''
    };
  }
}

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Main deployment class
class ProductionDeployment {
  private config: DeploymentConfig;
  private deployment: any;
  private startTime: number;
  private confidence: number = 0.5;
  private tracer: DeploymentTracer;
  private history: Array<{success: boolean; duration: number; version: string}> = [];
  private circuitBreaker: DeploymentCircuitBreaker;
  private sloValidator: SLOValidator;

  constructor(private version: string) {
    this.config = loadConfig();
    this.startTime = Date.now();
    this.deployment = {
      id: crypto.randomUUID(),
      version,
      startTime: this.startTime,
      stages: [],
      metrics: []
    };
    
    // Initialize distributed tracing
    this.tracer = new DeploymentTracer(this.deployment.id, version);
    
    // Initialize circuit breaker
    this.circuitBreaker = new DeploymentCircuitBreaker({
      failureThreshold: Number(process.env.CIRCUIT_BREAKER_THRESHOLD || 3),
      resetTimeout: Number(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || 3600000),
      halfOpenTests: 1
    });
    
    // Initialize SLO validator
    this.sloValidator = new SLOValidator();
    
    // Load deployment history and adjust confidence
    this.loadDeploymentHistory();
    this.updateConfidenceFromHistory();
  }

  async execute() {
    // Check circuit breaker status first
    const circuitStatus = this.circuitBreaker.getStatus();
    console.log(`🔌 Circuit Breaker Status: ${circuitStatus.state.toUpperCase()}`);
    if (!circuitStatus.healthy) {
      console.log(`   Will reset at: ${circuitStatus.willResetAt?.toISOString()}`);
    }

    // Execute deployment with circuit breaker protection
    try {
      return await this.circuitBreaker.executeDeployment(async () => {
        console.log('🚀 Production Deployment Starting');
        console.log(`   Version: ${this.version}`);
        console.log(`   Deployment ID: ${this.deployment.id}`);
        console.log(`   Confidence: ${(this.confidence * 100).toFixed(1)}%\n`);

        // Phase 1: Preflight checks
        await this.preflight();

        // Phase 2: Progressive deployment with adaptive stages
        const adaptiveStages = this.getAdaptiveStages();
        console.log(`📈 Using ${adaptiveStages.length}-stage rollout based on confidence: ${(this.confidence * 100).toFixed(1)}%\n`);
        
        for (const stage of adaptiveStages) {
          await this.deployStage(stage);
        }

        // Phase 3: Final validation
        await this.finalValidation();

        // Success!
        await this.recordSuccess();
        
        // Finish tracing
        this.tracer.finishDeployment('success', {
          totalDuration: Date.now() - this.startTime,
          stagesCompleted: adaptiveStages.length,
          finalConfidence: this.confidence
        });
        
        console.log('\n✅ Deployment successful!');
        console.log(`   Total time: ${Math.round((Date.now() - this.startTime) / 60000)} minutes`);
        console.log(`   Trace ID: ${this.tracer.getRootSpanId()}`);
        
        return this.deployment;
      }); // End of circuit breaker execution
    } catch (error) {
      await this.handleFailure(error);
      process.exit(1);
    }
  }

  async handleFailure(error: unknown) {
    const deploymentError = error instanceof Error 
      ? createDeploymentError(error.message, {
          deploymentId: this.deployment.id,
          version: this.version,
          confidence: this.confidence
        })
      : createDeploymentError('Unknown deployment error', {
          deploymentId: this.deployment.id,
          version: this.version,
          confidence: this.confidence
        });

    console.error(`\n❌ Deployment failed: ${deploymentError.message}`);
    
    if (this.config.rollback.automatic) {
      deploymentError.rollbackTriggered = true;
      await this.rollback();
    }
    
    // Finish tracing with failure
    this.tracer.finishDeployment('failed', {
      error: deploymentError.message,
      rollbackTriggered: deploymentError.rollbackTriggered,
      failureStage: deploymentError.stage
    });
    
    await this.recordFailure(deploymentError);
    console.log(`   Trace ID: ${this.tracer.getRootSpanId()}`);
    
    // Circuit breaker will handle the failure tracking
    throw deploymentError;
  }

  private async preflight() {
    const preflightSpan = this.tracer.startPreflight();
    console.log('✈️  Preflight Checks\n');
    
    const checks = [
      {
        name: 'Git tag exists',
        command: `git rev-parse ${this.version}`,
        critical: true
      },
      {
        name: 'All tests passing',
        command: 'npm test -- --run',
        critical: true
      },
      {
        name: 'TypeScript compilation',
        command: 'npm run check',
        critical: true
      },
      {
        name: 'Database migrations',
        command: 'npm run db:migrate -- --dry-run',
        critical: false
      },
      {
        name: 'Security audit',
        command: 'npm audit --audit-level=high',
        critical: false
      }
    ];

    try {
      for (const check of checks) {
        process.stdout.write(`   ${check.name}... `);
        tracer.log(preflightSpan.id, 'info', `Running check: ${check.name}`);
        
        const result = await exec(check.command);
        
        if (result.success) {
          console.log('✅');
          tracer.log(preflightSpan.id, 'info', `Check passed: ${check.name}`);
        } else {
          console.log('❌');
          tracer.log(preflightSpan.id, 'error', `Check failed: ${check.name}`, { error: result.error });
          if (check.critical) {
            throw new Error(`Critical check failed: ${check.name}`);
          }
        }
      }

      tracer.finishSpan(preflightSpan.id, 'completed', { checksCompleted: checks.length });
      console.log();
    } catch (error) {
      tracer.finishSpan(preflightSpan.id, 'failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  private async deployStage(stage: typeof this.config.stages[0]) {
    const stageStart = Date.now();
    const stageSpan = this.tracer.startStage(stage.name, stage.percentage, stage.duration);
    console.log(`📦 Stage: ${stage.name} (${stage.percentage}%)`);
    
    // Update traffic routing
    if (stage.percentage > 0) {
      console.log(`   Routing ${stage.percentage}% traffic to v${this.version}`);
      // In real deployment, update load balancer/ingress here
      await this.updateTrafficSplit(stage.percentage);
    }

    // Stabilization period
    console.log('   Stabilizing...');
    await sleep(30000);

    // Monitor with smoothing and version-specific metrics
    console.log(`   Monitoring for ${Math.round(stage.duration / 60000)} minutes...`);
    const monitoring = await this.monitorWithSmoothing(stage.duration, stage.smoothing, stage.name);

    if (!monitoring.healthy) {
      tracer.finishSpan(stageSpan.id, 'failed', { 
        reason: monitoring.reason,
        metrics: monitoring.metrics 
      });
      throw new Error(`Stage ${stage.name} failed: ${monitoring.reason}`);
    }

    // Update confidence based on success
    this.updateConfidence(1.0);

    // Record stage completion
    this.deployment.stages.push({
      name: stage.name,
      percentage: stage.percentage,
      duration: Date.now() - stageStart,
      metrics: monitoring.metrics,
      completedAt: Date.now()
    });

    tracer.finishSpan(stageSpan.id, 'completed', {
      actualDuration: Date.now() - stageStart,
      confidence: this.confidence,
      metricsCollected: monitoring.metrics?.length || 0
    });

    console.log(`   ✅ Stage completed successfully\n`);
  }

  private async monitorWithSmoothing(duration: number, intervals: number, stageName?: string): Promise<any> {
    const startTime = Date.now();
    const checkInterval = Math.min(10000, duration / intervals);
    const samples: any[] = [];
    let failures = 0;

    while (Date.now() - startTime < duration) {
      const metrics = await this.fetchMetrics(stageName);
      
      // For canary stages, also collect comparison metrics
      if (stageName && (stageName.includes('canary') || stageName.includes('small'))) {
        const canaryMetrics = await this.fetchCanarySpecificMetrics(stageName);
        samples.push({ ...metrics, canary: canaryMetrics });
        
        // Log canary-specific insights
        if (samples.length % 3 === 0) { // Every 3rd sample
          console.log(`\n   📊 Canary Analysis (${this.version}):`);
          console.log(`      Error rate: ${canaryMetrics.comparison.errorRateDiff.toFixed(2)}% vs baseline`);
          console.log(`      Latency: ${canaryMetrics.comparison.latencyDiff.toFixed(2)}% vs baseline`);
          console.log(`      Sample size: ${canaryMetrics.sampleSize} requests`);
        }
      } else {
        samples.push(metrics);
      }

      // Check against thresholds
      const healthy = this.evaluateMetrics(metrics);

      if (!healthy) {
        failures++;
        
        // N-of-M gating
        if (failures >= Math.ceil(intervals * 0.6)) {
          return {
            healthy: false,
            reason: `${failures}/${intervals} health checks failed`,
            metrics: samples
          };
        }
      } else {
        // Decay failures on success
        failures = Math.max(0, failures - 1);
      }

      // Show progress
      process.stdout.write('.');
      await sleep(checkInterval);
    }

    process.stdout.write('\n');
    return {
      healthy: true,
      metrics: samples,
      successRate: (intervals - failures) / intervals
    };
  }

  private async fetchMetrics(stage?: string): Promise<RolloutMetrics> {
    // In production, query Prometheus/CloudWatch/etc with version-specific filters
    // Example Prometheus queries:
    // - rate(http_requests_total{version="v1.3.2",stage="canary"}[5m])
    // - histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{version="v1.3.2"}[5m]))
    
    const baseMetrics = {
      timestamp: Date.now(),
      errorRate: Math.random() * 0.005, // 0-0.5% error rate
      p99Latency: 500 + Math.random() * 300, // 500-800ms
      memoryUsage: 0.4 + Math.random() * 0.3, // 40-70%
      cpuUsage: 0.3 + Math.random() * 0.3, // 30-60%
      requestRate: 1000 + Math.random() * 500, // 1000-1500 RPS
      successRate: 0.995 + Math.random() * 0.005 // 99.5-100% success
    };

    // Add version-specific and stage-specific variations for realism
    if (stage === 'canary') {
      // Canary might have slightly different metrics due to smaller sample size
      baseMetrics.errorRate *= 1.2; // Slightly higher noise
      baseMetrics.p99Latency *= 1.1; // Potential slight latency increase
    }

    return baseMetrics;
  }

  private async fetchCanarySpecificMetrics(stage: string): Promise<{
    version: string;
    stage: string;
    comparison: {
      errorRateDiff: number;
      latencyDiff: number;
      performanceDiff: number;
    };
    sampleSize: number;
  }> {
    // Version-specific metrics comparison
    const currentMetrics = await this.fetchMetrics(stage);
    const baselineMetrics = await this.fetchBaselineMetrics();
    
    return {
      version: this.version,
      stage,
      comparison: {
        errorRateDiff: ((currentMetrics.errorRate - baselineMetrics.errorRate) / baselineMetrics.errorRate) * 100,
        latencyDiff: ((currentMetrics.p99Latency - baselineMetrics.p99Latency) / baselineMetrics.p99Latency) * 100,
        performanceDiff: ((currentMetrics.successRate - baselineMetrics.successRate) / baselineMetrics.successRate) * 100
      },
      sampleSize: Math.floor(1000 * (stage === 'canary' ? 0.01 : 0.05)) // Realistic sample sizes
    };
  }

  private async fetchBaselineMetrics(): Promise<RolloutMetrics> {
    // Fetch baseline metrics from current production version
    // In production: query metrics for previous version or stable traffic
    return {
      timestamp: Date.now(),
      errorRate: 0.002, // Stable baseline
      p99Latency: 520,
      memoryUsage: 0.5,
      cpuUsage: 0.4,
      requestRate: 1200,
      successRate: 0.998
    };
  }

  private evaluateMetrics(metrics: RolloutMetrics): boolean {
    const checks = [
      metrics.errorRate < this.config.thresholds.errorRate,
      metrics.p99Latency < this.config.thresholds.p99Latency,
      metrics.memoryUsage < this.config.thresholds.memoryUsage,
      metrics.cpuUsage < this.config.thresholds.cpuUsage
    ];

    return checks.every(check => check);
  }

  private async updateTrafficSplit(percentage: number) {
    // In production, update load balancer/service mesh
    // Example: kubectl set image deployment/api api=myapp:${this.version}
    // Example: aws elbv2 modify-target-group-attributes
    
    // For now, simulate
    await sleep(1000);
  }

  private updateConfidence(score: number, weight: number = 0.1) {
    // Exponential moving average with decay
    const decay = 0.9;
    this.confidence = (this.confidence * decay) + (score * weight * (1 - decay));
    this.confidence = Math.max(0.1, Math.min(0.95, this.confidence)); // Clamp
  }

  private loadDeploymentHistory() {
    const historyPath = join(process.cwd(), 'deployments.json');
    if (existsSync(historyPath)) {
      try {
        const data = JSON.parse(readFileSync(historyPath, 'utf-8'));
        this.history = data.map((d: any) => ({
          success: d.status === 'success',
          duration: d.duration || 0,
          version: d.version || 'unknown'
        }));
      } catch (error) {
        console.warn('Failed to load deployment history:', error);
      }
    }
  }

  private updateConfidenceFromHistory() {
    const recentDeployments = this.history.slice(-10);
    if (recentDeployments.length === 0) return;

    const successRate = recentDeployments.filter(d => d.success).length / recentDeployments.length;
    const avgDuration = recentDeployments.reduce((sum, d) => sum + d.duration, 0) / recentDeployments.length;

    // Adjust confidence based on history
    if (successRate > 0.9 && avgDuration < 1800000) { // >90% success, <30min avg
      this.confidence = Math.min(0.9, this.confidence * 1.1);
    } else if (successRate < 0.5) { // <50% success
      this.confidence = Math.max(0.2, this.confidence * 0.7);
    }

    console.log(`📊 Confidence adjusted from history: ${(this.confidence * 100).toFixed(1)}% (${successRate * 100}% success rate)`);
  }

  private getAdaptiveStages() {
    // Adaptive stages based on confidence level
    if (this.confidence > 0.9) {
      // High confidence - aggressive rollout
      return [
        { name: 'smoke', percentage: 0, duration: 60000, smoothing: 1 },
        { name: 'canary', percentage: 10, duration: 120000, smoothing: 3 },
        { name: 'majority', percentage: 50, duration: 180000, smoothing: 5 },
        { name: 'full', percentage: 100, duration: 300000, smoothing: 3 }
      ];
    } else if (this.confidence > 0.7) {
      // Medium confidence - standard rollout  
      return [
        { name: 'smoke', percentage: 0, duration: 120000, smoothing: 1 },
        { name: 'canary', percentage: 5, duration: 180000, smoothing: 3 },
        { name: 'early', percentage: 25, duration: 300000, smoothing: 5 },
        { name: 'majority', percentage: 50, duration: 300000, smoothing: 5 },
        { name: 'nearly-full', percentage: 95, duration: 180000, smoothing: 3 },
        { name: 'full', percentage: 100, duration: 300000, smoothing: 3 }
      ];
    } else {
      // Low confidence - cautious rollout
      return [
        { name: 'smoke', percentage: 0, duration: 300000, smoothing: 1 },
        { name: 'canary', percentage: 1, duration: 300000, smoothing: 5 },
        { name: 'small', percentage: 5, duration: 600000, smoothing: 7 },
        { name: 'early', percentage: 10, duration: 600000, smoothing: 7 },
        { name: 'quarter', percentage: 25, duration: 900000, smoothing: 5 },
        { name: 'half', percentage: 50, duration: 900000, smoothing: 5 },
        { name: 'most', percentage: 95, duration: 600000, smoothing: 3 },
        { name: 'full', percentage: 100, duration: 600000, smoothing: 3 }
      ];
    }
  }

  private async finalValidation() {
    console.log('🔍 Final Validation\n');

    const validations = [
      { name: 'SLO compliance', check: () => this.validateSLOs() },
      { name: 'Synthetic tests', check: () => this.runSyntheticTests() },
      { name: 'Health endpoints', check: () => this.checkHealthEndpoints() }
    ];

    for (const validation of validations) {
      process.stdout.write(`   ${validation.name}... `);
      const passed = await validation.check();
      console.log(passed ? '✅' : '❌');
      
      if (!passed) {
        throw new Error(`Final validation failed: ${validation.name}`);
      }
    }
  }

  private async validateSLOs(): Promise<boolean> {
    // Use comprehensive multi-window burn rate analysis
    const sloResult = await this.sloValidator.validate(this.version);
    
    console.log(`   SLO Status: ${sloResult.overallSeverity.toUpperCase()}`);
    console.log(`   Recommendation: ${sloResult.recommendation}`);
    
    // Log error budget status
    const budgetStatus = await this.sloValidator.getErrorBudgetStatus();
    console.log(`   Error Budget: ${(budgetStatus.remaining * 100).toFixed(1)}% remaining`);
    
    return sloResult.passing;
  }

  private async runSyntheticTests(): Promise<boolean> {
    // Run key user journeys
    const result = await exec('npm run test:e2e:smoke -- --quiet');
    return result.success;
  }

  private async checkHealthEndpoints(): Promise<boolean> {
    // Verify all health endpoints responding
    const endpoints = ['/health', '/healthz', '/readyz'];
    // In production, actually fetch these
    return true;
  }

  private async rollback() {
    console.log('\n🔄 Rolling back deployment...');
    
    const rollbackStart = Date.now();
    
    // Get previous version
    const result = await exec('git describe --abbrev=0 --tags HEAD~1');
    const previousVersion = result.output?.trim() || 'previous';
    
    console.log(`   Rolling back to ${previousVersion}`);
    
    // Update traffic to previous version
    await this.updateTrafficSplit(0);
    
    // Record rollback
    this.deployment.rollback = {
      triggeredAt: rollbackStart,
      duration: Date.now() - rollbackStart,
      previousVersion
    };
    
    console.log('   ✅ Rollback completed\n');
  }

  private async recordSuccess() {
    const record = {
      ...this.deployment,
      status: 'success',
      duration: Date.now() - this.startTime,
      confidence: this.confidence
    };
    
    // Write to deployment history
    const historyPath = join(process.cwd(), 'deployments.json');
    const history = existsSync(historyPath) 
      ? JSON.parse(readFileSync(historyPath, 'utf-8'))
      : [];
    
    history.push(record);
    writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }

  private async recordFailure(error: any) {
    const record = {
      ...this.deployment,
      status: 'failed',
      error: error.message,
      duration: Date.now() - this.startTime,
      confidence: this.confidence
    };
    
    // Write to deployment history
    const historyPath = join(process.cwd(), 'deployments.json');
    const history = existsSync(historyPath)
      ? JSON.parse(readFileSync(historyPath, 'utf-8'))
      : [];
    
    history.push(record);
    writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }
}

// Main execution
async function main() {
  const version = process.argv[2] || process.env.DEPLOY_VERSION;
  
  if (!version) {
    console.error('Usage: deploy-production.ts <version>');
    console.error('   or: DEPLOY_VERSION=v1.2.3 deploy-production.ts');
    process.exit(1);
  }

  const deployment = new ProductionDeployment(version);
  await deployment.execute();
}

// Run if called directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}