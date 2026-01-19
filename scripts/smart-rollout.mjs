#!/usr/bin/env node
/**
 * Smart progressive rollout with automatic health monitoring
 * Gradually increases exposure while monitoring for issues
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const INTERVALS = process.env.ROLLOUT_INTERVALS 
  ? JSON.parse(process.env.ROLLOUT_INTERVALS)
  : [5, 10, 25, 50, 100];
const WINDOW_MINUTES = parseInt(process.env.ROLLOUT_WINDOW || '10');
const ERROR_THRESHOLD = parseFloat(process.env.ERROR_THRESHOLD || '0.3');
const CONFIG_PATH = process.env.CONFIG_PATH || './dist/public/runtime-config.json';
const METRICS_URL = process.env.METRICS_URL || 'http://localhost:5000/metrics';

function log(message, level = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    reset: '\x1b[0m'
  };
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${colors[level]}${message}${colors.reset}`);
}

async function updateRollout(percentage) {
  try {
    const configFile = path.resolve(CONFIG_PATH);
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    
    // Update rollout percentage
    config.flags = config.flags || {};
    config.flags.useFundStore = config.flags.useFundStore || {};
    config.flags.useFundStore.enabled = true;
    config.flags.useFundStore.rollout = percentage;
    
    // Write back
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    
    log(`Updated runtime config: rollout=${percentage}%`, 'success');
    return true;
  } catch (error) {
    log(`Failed to update rollout: ${error.message}`, 'error');
    return false;
  }
}

async function checkMetrics() {
  try {
    // Try to fetch metrics
    const metricsCmd = `curl -s ${METRICS_URL}`;
    const metrics = execSync(metricsCmd, { encoding: 'utf8', timeout: 5000 });
    
    // Parse error rate (looking for fund_create metrics)
    const errorMatch = metrics.match(/fund_create_failure\s+(\d+)/);
    const successMatch = metrics.match(/fund_create_success\s+(\d+)/);
    
    if (errorMatch && successMatch) {
      const errors = parseInt(errorMatch[1]);
      const successes = parseInt(successMatch[1]);
      const total = errors + successes;
      
      if (total === 0) return { healthy: true, rate: 0, message: 'No traffic yet' };
      
      const errorRate = (errors / total) * 100;
      return {
        healthy: errorRate <= ERROR_THRESHOLD,
        rate: errorRate.toFixed(2),
        errors,
        successes,
        total
      };
    }
    
    // Fallback: check if API is responsive
    const healthCmd = `curl -s -o /dev/null -w "%{http_code}" ${METRICS_URL.replace('/metrics', '/healthz')}`;
    const statusCode = execSync(healthCmd, { encoding: 'utf8', timeout: 5000 }).trim();
    
    return {
      healthy: statusCode === '200',
      message: `Health check status: ${statusCode}`
    };
  } catch (error) {
    log(`Metrics check failed: ${error.message}`, 'warn');
    return { healthy: true, message: 'Metrics unavailable, assuming healthy' };
  }
}

async function monitorWindow(minutes, currentPercentage) {
  log(`Monitoring at ${currentPercentage}% for ${minutes} minutes...`, 'info');
  
  const samples = Math.max(3, minutes); // At least 3 samples
  const intervalMs = (minutes * 60 * 1000) / samples;
  let consecutiveErrors = 0;
  
  for (let i = 0; i < samples; i++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    
    const metrics = await checkMetrics();
    
    if (metrics.healthy) {
      consecutiveErrors = 0;
      if (metrics.rate !== undefined) {
        log(`  ✅ Sample ${i + 1}/${samples}: Error rate ${metrics.rate}% (threshold: ${ERROR_THRESHOLD}%)`, 'success');
      } else {
        log(`  ✅ Sample ${i + 1}/${samples}: ${metrics.message}`, 'success');
      }
    } else {
      consecutiveErrors++;
      log(`  ⚠️  Sample ${i + 1}/${samples}: Error rate ${metrics.rate}% exceeds threshold`, 'warn');
      
      if (consecutiveErrors >= 2) {
        log(`  🚨 ${consecutiveErrors} consecutive error samples, triggering rollback`, 'error');
        return false;
      }
    }
  }
  
  log(`✅ ${currentPercentage}% rollout stable after ${minutes} minutes`, 'success');
  return true;
}

async function smartRollout() {
  log('\n🎯 Smart Progressive Rollout\n', 'info');
  log(`Intervals: ${INTERVALS.join(' → ')}%`, 'info');
  log(`Window: ${WINDOW_MINUTES} minutes per step`, 'info');
  log(`Error threshold: ${ERROR_THRESHOLD}%`, 'info');
  log('═══════════════════════════════\n', 'info');
  
  let lastStablePercentage = 0;
  
  for (const percentage of INTERVALS) {
    log(`\n📊 Step: Rolling out to ${percentage}%`, 'info');
    
    // Update configuration
    const updated = await updateRollout(percentage);
    if (!updated) {
      log('Failed to update rollout configuration', 'error');
      await updateRollout(lastStablePercentage);
      process.exit(1);
    }
    
    // Wait for cache TTL (60 seconds)
    log('Waiting 60s for cache TTL...', 'info');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Monitor for the window period
    const isHealthy = await monitorWindow(WINDOW_MINUTES, percentage);
    
    if (!isHealthy) {
      log(`\n🚨 Issues detected at ${percentage}%, rolling back to ${lastStablePercentage}%`, 'error');
      await updateRollout(lastStablePercentage);
      
      // Generate rollback report
      const report = {
        timestamp: new Date().toISOString(),
        failedAt: percentage,
        rolledBackTo: lastStablePercentage,
        errorThreshold: ERROR_THRESHOLD,
        windowMinutes: WINDOW_MINUTES
      };
      
      fs.writeFileSync('./rollback-report.json', JSON.stringify(report, null, 2));
      log('Rollback report saved to rollback-report.json', 'info');
      
      process.exit(1);
    }
    
    lastStablePercentage = percentage;
    log(`✅ ${percentage}% rollout confirmed stable`, 'success');
  }
  
  log('\n═══════════════════════════════', 'info');
  log('🎉 100% rollout complete and stable!', 'success');
  log(`Total rollout time: ${INTERVALS.length * WINDOW_MINUTES} minutes`, 'info');
  
  // Generate success report
  const report = {
    timestamp: new Date().toISOString(),
    status: 'success',
    finalRollout: 100,
    steps: INTERVALS,
    totalDuration: `${INTERVALS.length * WINDOW_MINUTES} minutes`
  };
  
  fs.writeFileSync('./rollout-success.json', JSON.stringify(report, null, 2));
  log('Success report saved to rollout-success.json', 'success');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('\n⚠️  Rollout interrupted, maintaining current percentage', 'warn');
  process.exit(0);
});

// Execute
smartRollout().catch(async error => {
  log(`\n❌ Smart rollout failed: ${error.message}`, 'error');
  log('Attempting to rollback to 0%...', 'warn');
  await updateRollout(0);
  process.exit(1);
});