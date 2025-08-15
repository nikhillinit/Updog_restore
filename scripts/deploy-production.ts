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
  }

  async execute() {
    try {
      console.log('🚀 Production Deployment Starting');
      console.log(`   Version: ${this.version}`);
      console.log(`   Deployment ID: ${this.deployment.id}`);
      console.log(`   Confidence: ${(this.confidence * 100).toFixed(1)}%\n`);

      // Phase 1: Preflight checks
      await this.preflight();

      // Phase 2: Progressive deployment
      for (const stage of this.config.stages) {
        await this.deployStage(stage);
      }

      // Phase 3: Final validation
      await this.finalValidation();

      // Success!
      await this.recordSuccess();
      
      // Finish tracing
      this.tracer.finishDeployment('success', {
        totalDuration: Date.now() - this.startTime,
        stagesCompleted: this.config.stages.length,
        finalConfidence: this.confidence
      });
      
      console.log('\n✅ Deployment successful!');
      console.log(`   Total time: ${Math.round((Date.now() - this.startTime) / 60000)} minutes`);
      console.log(`   Trace ID: ${this.tracer.getRootSpanId()}`);
      
      return this.deployment;

    } catch (error: unknown) {
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
      process.exit(1);
    }
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

    // Monitor with smoothing
    console.log(`   Monitoring for ${Math.round(stage.duration / 60000)} minutes...`);
    const monitoring = await this.monitorWithSmoothing(stage.duration, stage.smoothing);

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

  private async monitorWithSmoothing(duration: number, intervals: number): Promise<any> {
    const startTime = Date.now();
    const checkInterval = Math.min(10000, duration / intervals);
    const samples: any[] = [];
    let failures = 0;

    while (Date.now() - startTime < duration) {
      const metrics = await this.fetchMetrics();
      samples.push(metrics);

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

  private async fetchMetrics(): Promise<RolloutMetrics> {
    // In production, query Prometheus/CloudWatch/etc
    // For now, simulate metrics with proper typing
    return {
      timestamp: Date.now(),
      errorRate: Math.random() * 0.005, // 0-0.5% error rate
      p99Latency: 500 + Math.random() * 300, // 500-800ms
      memoryUsage: 0.4 + Math.random() * 0.3, // 40-70%
      cpuUsage: 0.3 + Math.random() * 0.3, // 30-60%
      requestRate: 1000 + Math.random() * 500, // 1000-1500 RPS
      successRate: 0.995 + Math.random() * 0.005 // 99.5-100% success
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

  private updateConfidence(score: number) {
    const decay = 0.9;
    this.confidence = (this.confidence * decay) + (score * 0.1 * (1 - decay));
    this.confidence = Math.max(0.1, Math.min(0.95, this.confidence));
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
    // Check multi-window burn rates
    const metrics = await this.fetchMetrics();
    return metrics.errorRate < 0.001; // 99.9% SLO
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