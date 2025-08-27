#!/usr/bin/env node

/**
 * Canary Deployment with Feature Flags
 * Gradual rollout with monitoring and automatic rollback
 */

import fetch from 'node-fetch';
import { execSync } from 'child_process';
import fs from 'fs/promises';

const DEPLOYMENT_STAGES = [
  { percentage: 5, duration: 30 * 60 * 1000, name: 'Initial Canary' },      // 5% for 30 min
  { percentage: 10, duration: 60 * 60 * 1000, name: 'Small Canary' },       // 10% for 1 hour
  { percentage: 25, duration: 2 * 60 * 60 * 1000, name: 'Quarter Roll' },   // 25% for 2 hours
  { percentage: 50, duration: 2 * 60 * 60 * 1000, name: 'Half Roll' },      // 50% for 2 hours
  { percentage: 100, duration: 0, name: 'Full Deployment' }                  // 100% complete
];

const MONITORED_METRICS = {
  lcp_p75: { threshold: 2500, unit: 'ms' },
  inp_p75: { threshold: 200, unit: 'ms' },
  api_p95: { threshold: 500, unit: 'ms' },
  error_rate: { threshold: 0.01, unit: 'ratio' },
  rum_reject_ratio: { threshold: 0.01, unit: 'ratio' }
};

class CanaryDeployment {
  constructor(options = {}) {
    this.version = options.version || process.env.npm_package_version;
    this.environment = options.environment || 'production';
    this.dryRun = options.dryRun || false;
    this.autoRollback = options.autoRollback !== false;
    this.prometheusUrl = options.prometheusUrl || process.env.PROMETHEUS_URL || 'http://localhost:9090';
    this.flagsApiUrl = options.flagsApiUrl || process.env.FLAGS_API_URL || 'http://localhost:5000/api/flags';
    
    this.currentStage = 0;
    this.startTime = null;
    this.metrics = [];
    this.alerts = [];
  }
  
  /**
   * Start canary deployment
   */
  async start() {
    console.log('🚀 Starting Canary Deployment');
    console.log(`   Version: ${this.version}`);
    console.log(`   Environment: ${this.environment}`);
    console.log(`   Auto-rollback: ${this.autoRollback}`);
    console.log(`   Dry run: ${this.dryRun}`);
    console.log('');
    
    this.startTime = Date.now();
    
    // Run pre-deployment checks
    const preCheckPassed = await this.runPreChecks();
    if (!preCheckPassed) {
      console.error('❌ Pre-deployment checks failed');
      return false;
    }
    
    // Take baseline metrics
    console.log('📊 Taking baseline metrics...');
    const baseline = await this.getMetrics();
    this.metrics.push({ stage: 'baseline', timestamp: Date.now(), metrics: baseline });
    
    // Start deployment stages
    for (let i = 0; i < DEPLOYMENT_STAGES.length; i++) {
      this.currentStage = i;
      const stage = DEPLOYMENT_STAGES[i];
      
      console.log(`\n${'='.repeat(50)}`);
      console.log(`📌 Stage ${i + 1}: ${stage.name}`);
      console.log(`${'='.repeat(50)}`);
      
      // Update feature flags
      const flagsUpdated = await this.updateFeatureFlags(stage.percentage);
      if (!flagsUpdated) {
        console.error('❌ Failed to update feature flags');
        await this.rollback();
        return false;
      }
      
      // If not the final stage, monitor for duration
      if (stage.duration > 0) {
        const monitoringPassed = await this.monitorStage(stage);
        if (!monitoringPassed) {
          console.error('❌ Stage monitoring failed');
          if (this.autoRollback) {
            await this.rollback();
          }
          return false;
        }
      }
      
      // Record stage completion
      await this.recordStageCompletion(stage);
    }
    
    // Final validation
    const finalValidation = await this.validateDeployment();
    if (!finalValidation) {
      console.error('❌ Final validation failed');
      if (this.autoRollback) {
        await this.rollback();
      }
      return false;
    }
    
    console.log('\n✅ Canary deployment completed successfully!');
    await this.generateReport();
    
    return true;
  }
  
  /**
   * Run pre-deployment checks
   */
  async runPreChecks() {
    console.log('🔍 Running pre-deployment checks...');
    
    const checks = [
      { name: 'GA checklist', fn: () => this.checkGAChecklist() },
      { name: 'No active incidents', fn: () => this.checkActiveIncidents() },
      { name: 'Feature flags healthy', fn: () => this.checkFeatureFlagsHealth() },
      { name: 'Rollback script ready', fn: () => this.checkRollbackReady() }
    ];
    
    let allPassed = true;
    
    for (const check of checks) {
      process.stdout.write(`  ${check.name}...`);
      const result = await check.fn();
      console.log(result ? ' ✅' : ' ❌');
      if (!result) allPassed = false;
    }
    
    return allPassed;
  }
  
  /**
   * Update feature flags for canary percentage
   */
  async updateFeatureFlags(percentage) {
    console.log(`🎚️  Setting canary to ${percentage}%...`);
    
    if (this.dryRun) {
      console.log('  [DRY RUN] Would update flags');
      return true;
    }
    
    const flags = {
      ENABLE_CANARY: true,
      CANARY_PERCENTAGE: percentage,
      CANARY_VERSION: this.version,
      ENABLE_RUM_V2: percentage > 0 ? 1 : 0,
      ROLLBACK_READY: true
    };
    
    try {
      const response = await fetch(this.flagsApiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flags)
      });
      
      if (!response.ok) {
        throw new Error(`Flag update failed: ${response.statusText}`);
      }
      
      console.log(`  ✅ Flags updated: ${percentage}% of traffic on canary`);
      return true;
    } catch (error) {
      console.error(`  ❌ Flag update error: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Monitor stage for issues
   */
  async monitorStage(stage) {
    console.log(`⏱️  Monitoring for ${stage.duration / 60000} minutes...`);
    
    const checkInterval = 30000; // Check every 30 seconds
    const checks = Math.floor(stage.duration / checkInterval);
    const startTime = Date.now();
    
    for (let i = 0; i < checks; i++) {
      await this.sleep(checkInterval);
      
      const elapsed = Math.floor((Date.now() - startTime) / 60000);
      process.stdout.write(`\r  Progress: ${elapsed} minutes elapsed...`);
      
      // Check metrics
      const metricsOk = await this.checkMetrics();
      if (!metricsOk) {
        console.log('\n  ❌ Metrics breach detected');
        return false;
      }
      
      // Check for alerts
      const alertsOk = await this.checkAlerts();
      if (!alertsOk) {
        console.log('\n  ❌ Critical alert firing');
        return false;
      }
      
      // Check error logs
      const errorsOk = await this.checkErrorRate();
      if (!errorsOk) {
        console.log('\n  ❌ Error rate exceeded threshold');
        return false;
      }
    }
    
    console.log(`\n  ✅ Stage completed successfully`);
    return true;
  }
  
  /**
   * Check current metrics against thresholds
   */
  async checkMetrics() {
    const metrics = await this.getMetrics();
    
    for (const [metric, config] of Object.entries(MONITORED_METRICS)) {
      if (metrics[metric] > config.threshold) {
        this.alerts.push({
          timestamp: Date.now(),
          metric,
          value: metrics[metric],
          threshold: config.threshold,
          stage: this.currentStage
        });
        
        console.log(`\n  ⚠️  Metric breach: ${metric} = ${metrics[metric]}${config.unit} (threshold: ${config.threshold}${config.unit})`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Get current metrics from Prometheus
   */
  async getMetrics() {
    const queries = {
      lcp_p75: 'histogram_quantile(0.75, sum by (le) (rate(web_vitals_lcp_bucket[5m])))',
      inp_p75: 'histogram_quantile(0.75, sum by (le) (rate(web_vitals_inp_bucket[5m])))',
      api_p95: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
      error_rate: 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))',
      rum_reject_ratio: 'rate(rum_ingest_rejected_total[5m]) / (rate(rum_ingest_total[5m]) + rate(rum_ingest_rejected_total[5m]))'
    };
    
    const metrics = {};
    
    for (const [name, query] of Object.entries(queries)) {
      try {
        const response = await fetch(
          `${this.prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        
        if (data.status === 'success' && data.data.result.length > 0) {
          metrics[name] = parseFloat(data.data.result[0].value[1]);
        } else {
          metrics[name] = 0;
        }
      } catch (error) {
        console.error(`Failed to fetch metric ${name}:`, error.message);
        metrics[name] = 0;
      }
    }
    
    return metrics;
  }
  
  /**
   * Check for active alerts
   */
  async checkAlerts() {
    const alertmanagerUrl = process.env.ALERTMANAGER_URL || 'http://localhost:9093';
    
    try {
      const response = await fetch(`${alertmanagerUrl}/api/v2/alerts`);
      const alerts = await response.json();
      
      const criticalAlerts = alerts.filter(a => 
        a.labels.severity === 'critical' && 
        a.status.state === 'active'
      );
      
      return criticalAlerts.length === 0;
    } catch {
      return true; // Assume ok if can't reach alertmanager
    }
  }
  
  /**
   * Check error rate in logs
   */
  async checkErrorRate() {
    // Simplified - would check actual log aggregation system
    try {
      const logs = execSync('tail -n 1000 /var/log/app.log 2>/dev/null | grep -c ERROR || true', { encoding: 'utf-8' });
      const errorCount = parseInt(logs) || 0;
      return errorCount < 10; // Less than 10 errors in last 1000 lines
    } catch {
      return true;
    }
  }
  
  /**
   * Rollback deployment
   */
  async rollback() {
    console.log('\n🔄 Initiating rollback...');
    
    if (this.dryRun) {
      console.log('  [DRY RUN] Would rollback');
      return true;
    }
    
    // Reset feature flags
    await this.updateFeatureFlags(0);
    
    // Run rollback script
    try {
      execSync('npm run rollback', { stdio: 'inherit' });
      console.log('✅ Rollback completed');
    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
    }
    
    // Send alert
    await this.sendAlert('Canary deployment rolled back', 'critical');
  }
  
  /**
   * Record stage completion
   */
  async recordStageCompletion(stage) {
    const metrics = await this.getMetrics();
    this.metrics.push({
      stage: stage.name,
      percentage: stage.percentage,
      timestamp: Date.now(),
      metrics
    });
  }
  
  /**
   * Validate final deployment
   */
  async validateDeployment() {
    console.log('\n🔍 Running final validation...');
    
    // Compare baseline to final metrics
    const baseline = this.metrics[0].metrics;
    const final = await this.getMetrics();
    
    console.log('\n📊 Metrics comparison:');
    for (const [metric, config] of Object.entries(MONITORED_METRICS)) {
      const change = ((final[metric] - baseline[metric]) / baseline[metric] * 100).toFixed(2);
      const trend = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      
      console.log(`  ${metric}: ${baseline[metric].toFixed(2)} → ${final[metric].toFixed(2)} (${trend} ${change}%)`);
      
      // Fail if metric degraded by more than 10%
      if (final[metric] > baseline[metric] * 1.1) {
        console.log(`    ❌ Degraded by more than 10%`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Generate deployment report
   */
  async generateReport() {
    const report = {
      version: this.version,
      environment: this.environment,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      stages: this.metrics,
      alerts: this.alerts,
      success: true
    };
    
    await fs.writeFile(
      `canary-report-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
    
    console.log('\n📁 Deployment report saved');
  }
  
  // Helper functions
  async checkGAChecklist() {
    try {
      const result = JSON.parse(await fs.readFile('ga-checklist-results.json', 'utf-8'));
      return result.passed;
    } catch {
      return false;
    }
  }
  
  async checkActiveIncidents() {
    // Would check incident management system
    return true;
  }
  
  async checkFeatureFlagsHealth() {
    try {
      const response = await fetch(`${this.flagsApiUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
  
  async checkRollbackReady() {
    try {
      await fs.stat('scripts/rollback.mjs');
      return true;
    } catch {
      return false;
    }
  }
  
  async sendAlert(message, severity = 'warning') {
    // Would integrate with actual alerting system
    console.log(`[ALERT] ${severity.toUpperCase()}: ${message}`);
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};
  
  args.forEach(arg => {
    if (arg === '--dry-run') options.dryRun = true;
    if (arg === '--no-rollback') options.autoRollback = false;
    if (arg.startsWith('--env=')) options.environment = arg.split('=')[1];
    if (arg.startsWith('--version=')) options.version = arg.split('=')[1];
  });
  
  if (args.includes('--help')) {
    console.log('Usage: canary-deploy.mjs [options]');
    console.log('Options:');
    console.log('  --dry-run         Simulate deployment without making changes');
    console.log('  --no-rollback     Disable automatic rollback on failure');
    console.log('  --env=ENV         Set environment (staging, production)');
    console.log('  --version=VER     Set version to deploy');
    process.exit(0);
  }
  
  const deployment = new CanaryDeployment(options);
  deployment.start().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { CanaryDeployment, DEPLOYMENT_STAGES, MONITORED_METRICS };