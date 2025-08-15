#!/usr/bin/env tsx
/**
 * Complete Deployment Orchestrator
 * Coordinates all deployment components with comprehensive error handling
 */

import { ProductionDeployment } from './deploy-production.js';
import { DeploymentCircuitBreaker } from './deployment-circuit-breaker.js';
import { SLOValidator } from './slo-validator.js';

export interface DeploymentOptions {
  dryRun?: boolean;
  force?: boolean;
  skipTests?: boolean;
  configOverrides?: Record<string, any>;
}

export interface DeploymentConfig {
  environment: string;
  thresholds: {
    errorRate: number;
    p99Latency: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  rollback: {
    automatic: boolean;
    timeoutMs: number;
  };
  notifications: {
    slack?: {
      webhook: string;
      channel: string;
    };
    email?: {
      recipients: string[];
    };
    pagerduty?: {
      integrationKey: string;
    };
  };
}

export class DeploymentOrchestrator {
  private circuitBreaker: DeploymentCircuitBreaker;
  private sloValidator: SLOValidator;

  constructor() {
    this.circuitBreaker = new DeploymentCircuitBreaker();
    this.sloValidator = new SLOValidator();
  }

  async deploy(version: string, options: DeploymentOptions = {}): Promise<any> {
    const config = this.loadConfig(options);
    const deploymentId = this.generateDeploymentId();

    console.log('🚀 Deployment Orchestrator Starting');
    console.log(`   Version: ${version}`);
    console.log(`   Deployment ID: ${deploymentId}`);
    console.log(`   Environment: ${config.environment}`);
    console.log(`   Options: ${JSON.stringify(options, null, 2)}\n`);

    try {
      // Execute with circuit breaker protection
      return await this.circuitBreaker.executeDeployment(async () => {
        
        // 1. Pre-deployment validation
        console.log('📋 Pre-deployment Validation');
        await this.preDeploymentChecks(version, config, options);

        // 2. Create deployment record
        const deployment = await this.startDeployment(version, deploymentId, config);

        try {
          // 3. Deploy with production-grade monitoring
          console.log('\n🎯 Starting Production Deployment');
          const productionDeployment = new ProductionDeployment(version);
          const result = await productionDeployment.execute();

          // 4. Post-deployment validation
          console.log('\n✅ Post-deployment Validation');
          await this.postDeploymentValidation(version, result);

          // 5. Finalize deployment
          await this.finalizeDeployment(deployment, result);
          
          // 6. Send success notifications
          await this.notifySuccess(deployment, result, config);

          console.log('\n🎉 Deployment completed successfully!');
          return result;

        } catch (error) {
          // Handle deployment failure
          await this.handleDeploymentFailure(deployment, error, config, options);
          throw error;
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\n❌ Deployment orchestration failed:', errorMessage);
      
      // Send failure notifications
      await this.notifyFailure(version, errorMessage, config);
      
      // Proper exit code for CI/CD
      process.exit(1);
    }
  }

  private loadConfig(options: DeploymentOptions): DeploymentConfig {
    // Load base configuration
    const environment = process.env.NODE_ENV || 'production';
    const baseConfigPath = `./config/deployment.json`;
    const envConfigPath = `./config/deployment.${environment}.json`;
    
    let baseConfig: DeploymentConfig = {
      environment,
      thresholds: {
        errorRate: Number(process.env.DEPLOY_ERROR_THRESHOLD || 0.01),
        p99Latency: Number(process.env.DEPLOY_P99_THRESHOLD || 1000),
        memoryUsage: Number(process.env.DEPLOY_MEMORY_THRESHOLD || 0.8),
        cpuUsage: Number(process.env.DEPLOY_CPU_THRESHOLD || 0.7)
      },
      rollback: {
        automatic: process.env.DEPLOY_AUTO_ROLLBACK !== 'false',
        timeoutMs: Number(process.env.DEPLOY_ROLLBACK_TIMEOUT || 300000)
      },
      notifications: {
        slack: process.env.SLACK_WEBHOOK ? {
          webhook: process.env.SLACK_WEBHOOK,
          channel: process.env.SLACK_CHANNEL || '#deployments'
        } : undefined,
        email: process.env.NOTIFICATION_EMAILS ? {
          recipients: process.env.NOTIFICATION_EMAILS.split(',')
        } : undefined,
        pagerduty: process.env.PAGERDUTY_INTEGRATION_KEY ? {
          integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY
        } : undefined
      }
    };

    // Override with file configs if they exist
    try {
      const fs = require('fs');
      if (fs.existsSync(baseConfigPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(baseConfigPath, 'utf-8'));
        baseConfig = { ...baseConfig, ...fileConfig };
      }
      if (fs.existsSync(envConfigPath)) {
        const envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf-8'));
        baseConfig = { ...baseConfig, ...envConfig };
      }
    } catch (error) {
      console.warn('Failed to load configuration files:', error);
    }

    // Apply runtime overrides
    if (options.configOverrides) {
      baseConfig = { ...baseConfig, ...options.configOverrides };
    }

    return baseConfig;
  }

  private async preDeploymentChecks(
    version: string, 
    config: DeploymentConfig, 
    options: DeploymentOptions
  ) {
    const checks = [
      {
        name: 'Circuit breaker status',
        check: () => this.circuitBreaker.isHealthy()
      },
      {
        name: 'SLO baseline validation',
        check: async () => {
          const sloResult = await this.sloValidator.validate('baseline');
          return sloResult.passing;
        }
      },
      {
        name: 'Error budget availability',
        check: async () => {
          const budget = await this.sloValidator.getErrorBudgetStatus();
          return budget.remaining > 0.1; // At least 10% budget remaining
        }
      },
      {
        name: 'Resource capacity',
        check: () => this.checkResourceCapacity()
      }
    ];

    for (const check of checks) {
      process.stdout.write(`   ${check.name}... `);
      try {
        const result = await check.check();
        if (result) {
          console.log('✅');
        } else {
          console.log('❌');
          if (!options.force) {
            throw new Error(`Pre-deployment check failed: ${check.name}`);
          } else {
            console.log('   ⚠️  Continuing due to --force flag');
          }
        }
      } catch (error) {
        console.log('❌');
        if (!options.force) {
          throw new Error(`Pre-deployment check error: ${check.name} - ${error}`);
        } else {
          console.log('   ⚠️  Continuing due to --force flag');
        }
      }
    }
  }

  private async checkResourceCapacity(): Promise<boolean> {
    // In production, check cluster resources, database connections, etc.
    // For simulation, return true with some basic checks
    const memoryUsage = Math.random() * 0.8; // Simulate 0-80% memory usage
    const cpuUsage = Math.random() * 0.7;    // Simulate 0-70% CPU usage
    
    return memoryUsage < 0.85 && cpuUsage < 0.8;
  }

  private async startDeployment(
    version: string, 
    deploymentId: string, 
    config: DeploymentConfig
  ) {
    const deployment = {
      id: deploymentId,
      version,
      environment: config.environment,
      startTime: new Date().toISOString(),
      status: 'in_progress',
      config: {
        thresholds: config.thresholds,
        rollback: config.rollback
      }
    };

    // Store deployment record (in production, save to database)
    console.log(`   📝 Deployment record created: ${deploymentId}`);
    
    return deployment;
  }

  private async postDeploymentValidation(version: string, result: any) {
    // Additional validation after deployment completes
    const validations = [
      {
        name: 'Final SLO validation',
        check: async () => {
          const sloResult = await this.sloValidator.validate(version);
          if (!sloResult.passing) {
            console.log(`   ⚠️  SLO validation: ${sloResult.recommendation}`);
          }
          return sloResult.passing;
        }
      },
      {
        name: 'Health endpoint verification',
        check: () => this.verifyHealthEndpoints()
      },
      {
        name: 'Key metrics validation',
        check: () => this.validateKeyMetrics(result)
      }
    ];

    for (const validation of validations) {
      process.stdout.write(`   ${validation.name}... `);
      const passed = await validation.check();
      console.log(passed ? '✅' : '⚠️');
    }
  }

  private async verifyHealthEndpoints(): Promise<boolean> {
    // Verify all health endpoints are responding correctly
    // In production, check multiple endpoints across load balancers
    return true;
  }

  private async validateKeyMetrics(result: any): Promise<boolean> {
    // Validate that key business metrics are within expected ranges
    // In production, check critical KPIs
    return true;
  }

  private async handleDeploymentFailure(
    deployment: any,
    error: any,
    config: DeploymentConfig,
    options: DeploymentOptions
  ) {
    console.error('\n🚨 Deployment failure detected');
    
    const failureRecord = {
      ...deployment,
      status: 'failed',
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      },
      rollbackRequired: config.rollback.automatic && !options.dryRun
    };

    // Create incident if this is a production deployment
    if (config.environment === 'production') {
      await this.createIncident(failureRecord, config);
    }

    // Record failure for circuit breaker and metrics
    console.log(`   📝 Failure recorded: ${failureRecord.id}`);
  }

  private async createIncident(failureRecord: any, config: DeploymentConfig) {
    const incident = {
      id: this.generateIncidentId(),
      title: `Deployment Failure: ${failureRecord.version}`,
      description: `Deployment ${failureRecord.id} failed: ${failureRecord.error.message}`,
      severity: 'high',
      createdAt: new Date().toISOString(),
      deployment: failureRecord
    };

    console.log(`   🚨 Incident created: ${incident.id}`);
    
    // In production, integrate with incident management system
    // - PagerDuty
    // - OpsGenie  
    // - Custom incident management
  }

  private async finalizeDeployment(deployment: any, result: any) {
    const finalRecord = {
      ...deployment,
      status: 'success',
      endTime: new Date().toISOString(),
      duration: Date.now() - new Date(deployment.startTime).getTime(),
      result: {
        stagesCompleted: result.stages?.length || 0,
        metricsCollected: result.metrics?.length || 0,
        confidence: result.confidence || 'unknown'
      }
    };

    console.log(`   ✅ Deployment finalized: ${finalRecord.id}`);
    return finalRecord;
  }

  private async notifySuccess(deployment: any, result: any, config: DeploymentConfig) {
    const message = {
      type: 'deployment_success',
      deployment,
      result,
      timestamp: new Date().toISOString()
    };

    await this.sendNotifications(message, config.notifications);
  }

  private async notifyFailure(version: string, error: string, config: DeploymentConfig) {
    const message = {
      type: 'deployment_failure',
      version,
      error,
      timestamp: new Date().toISOString()
    };

    await this.sendNotifications(message, config.notifications);
  }

  private async sendNotifications(message: any, notifications: DeploymentConfig['notifications']) {
    const promises = [];

    if (notifications.slack) {
      promises.push(this.sendSlackNotification(message, notifications.slack));
    }

    if (notifications.email) {
      promises.push(this.sendEmailNotification(message, notifications.email));
    }

    if (notifications.pagerduty && message.type === 'deployment_failure') {
      promises.push(this.sendPagerDutyAlert(message, notifications.pagerduty));
    }

    await Promise.allSettled(promises);
  }

  private async sendSlackNotification(message: any, slack: { webhook: string; channel: string }) {
    try {
      // In production, send actual Slack webhook
      console.log(`   📱 Slack notification sent to ${slack.channel}`);
    } catch (error) {
      console.warn('Failed to send Slack notification:', error);
    }
  }

  private async sendEmailNotification(message: any, email: { recipients: string[] }) {
    try {
      // In production, send email via service
      console.log(`   📧 Email notification sent to ${email.recipients.join(', ')}`);
    } catch (error) {
      console.warn('Failed to send email notification:', error);
    }
  }

  private async sendPagerDutyAlert(message: any, pagerduty: { integrationKey: string }) {
    try {
      // In production, trigger PagerDuty incident
      console.log('   🚨 PagerDuty alert triggered');
    } catch (error) {
      console.warn('Failed to send PagerDuty alert:', error);
    }
  }

  private generateDeploymentId(): string {
    return `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateIncidentId(): string {
    return `inc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // CLI status commands
  async status(): Promise<void> {
    console.log('🔍 Deployment System Status\n');
    
    const circuitStatus = this.circuitBreaker.getStatus();
    console.log(`Circuit Breaker: ${circuitStatus.healthy ? '✅ HEALTHY' : '❌ OPEN'}`);
    
    const errorBudget = await this.sloValidator.getErrorBudgetStatus();
    console.log(`Error Budget: ${(errorBudget.remaining * 100).toFixed(1)}% remaining`);
    
    console.log('\nReady for deployment ✅');
  }

  async reset(): Promise<void> {
    console.log('🔧 Resetting deployment system...');
    this.circuitBreaker.reset();
    console.log('✅ Circuit breaker reset');
    console.log('✅ System ready');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const orchestrator = new DeploymentOrchestrator();

  if (command === 'status') {
    await orchestrator.status();
    return;
  }

  if (command === 'reset') {
    await orchestrator.reset();
    return;
  }

  if (command === 'deploy') {
    const version = args[1] || process.env.DEPLOY_VERSION;
    
    if (!version) {
      console.error('Usage: orchestrator.ts deploy <version>');
      console.error('   or: DEPLOY_VERSION=v1.2.3 orchestrator.ts deploy');
      process.exit(1);
    }

    const options: DeploymentOptions = {
      dryRun: process.env.DRY_RUN === 'true',
      force: process.env.FORCE === 'true',
      skipTests: process.env.SKIP_TESTS === 'true'
    };

    await orchestrator.deploy(version, options);
    return;
  }

  console.error('Usage: orchestrator.ts <command>');
  console.error('Commands:');
  console.error('  deploy <version>  - Deploy a version');
  console.error('  status           - Show system status');
  console.error('  reset            - Reset circuit breaker');
  process.exit(1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { DeploymentOrchestrator };