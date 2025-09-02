#!/usr/bin/env node
/**
 * Cross-platform health monitoring with auto-rollback capability
 * Pure Node.js implementation - no bash/jq/bc dependencies
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const DURATION = parseInt(args[0] || '30'); // Default 30 minutes
const ERROR_THRESHOLD = parseFloat(args[1] || '0.5'); // Default 0.5% error rate
const PROD_HOST = process.env.PROD_HOST || 'http://localhost:5000';
const CONFIG_PATH = process.env.CONFIG_PATH || './public/runtime-config.json';

// ANSI colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const color = {
    info: colors.cyan,
    success: colors.green,
    warn: colors.yellow,
    error: colors.red
  }[level] || colors.reset;
  
  console.log(`[${timestamp}] ${color}${message}${colors.reset}`);
}

async function fetchJson(url) {
  try {
    const response = execSync(`curl -s ${url}`, { encoding: 'utf8', timeout: 5000 });
    return JSON.parse(response);
  } catch (error) {
    return null;
  }
}

async function checkHealth() {
  try {
    const statusCode = execSync(
      `curl -s -o nul -w "%{http_code}" ${PROD_HOST}/healthz`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    
    return statusCode === '200';
  } catch {
    return false;
  }
}

async function checkErrorRate() {
  try {
    const metrics = execSync(`curl -s ${PROD_HOST}/metrics`, { encoding: 'utf8', timeout: 5000 });
    
    // Parse Prometheus metrics for fund_create metrics
    const errorMatch = metrics.match(/fund_create_failure\s+(\d+)/);
    const successMatch = metrics.match(/fund_create_success\s+(\d+)/);
    
    if (!errorMatch || !successMatch) {
      return { rate: 0, healthy: true, message: 'No metrics available yet' };
    }
    
    const errors = parseInt(errorMatch[1]);
    const successes = parseInt(successMatch[1]);
    const total = errors + successes;
    
    if (total === 0) {
      return { rate: 0, healthy: true, message: 'No traffic yet' };
    }
    
    const errorRate = (errors / total) * 100;
    const healthy = errorRate <= ERROR_THRESHOLD;
    
    return { 
      rate: errorRate.toFixed(2), 
      healthy,
      errors,
      successes,
      total
    };
  } catch (error) {
    // If metrics endpoint fails, check basic health
    const healthOk = await checkHealth();
    return { 
      healthy: healthOk, 
      message: healthOk ? 'Metrics unavailable, health OK' : 'Service unhealthy' 
    };
  }
}

async function rollback(reason) {
  log(`🚨 Triggering rollback: ${reason}`, 'error');
  
  // Update runtime config to 0% rollout
  try {
    const configPath = path.resolve(CONFIG_PATH);
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.flags = config.flags || {};
      config.flags.useFundStore = config.flags.useFundStore || {};
      config.flags.useFundStore.rollout = 0;
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      log('✅ Rollout set to 0% in runtime config', 'success');
    }
  } catch (error) {
    log(`Failed to update config: ${error.message}`, 'error');
  }
  
  // Log incident
  const incident = {
    timestamp: new Date().toISOString(),
    action: 'auto_rollback',
    reason,
    error_threshold: ERROR_THRESHOLD
  };
  
  fs.appendFileSync('rollback.log', JSON.stringify(incident) + '\n');
  
  process.exit(1);
}

async function monitorHealth() {
  const startTime = Date.now();
  const endTime = startTime + (DURATION * 60 * 1000);
  let errorCount = 0;
  let checkCount = 0;
  
  log('🔍 Starting health monitoring', 'info');
  log(`Duration: ${DURATION} minutes`);
  log(`Error threshold: ${ERROR_THRESHOLD}%`);
  log(`Target: ${PROD_HOST}`);
  console.log('═══════════════════════════════');
  
  while (Date.now() < endTime) {
    checkCount++;
    
    // Check basic health
    const healthOk = await checkHealth();
    
    if (!healthOk) {
      log(`⚠️  Health check failed`, 'warn');
      errorCount++;
      
      if (errorCount >= 3) {
        log('❌ 3 consecutive health check failures', 'error');
        await rollback('health_check_failure');
      }
    } else {
      // Health is OK, check error rate
      const metrics = await checkErrorRate();
      
      if (!metrics.healthy) {
        log(`⚠️  Error rate ${metrics.rate}% exceeds threshold ${ERROR_THRESHOLD}%`, 'warn');
        errorCount++;
        
        if (errorCount >= 2) {
          log('❌ Error rate exceeded threshold for 2 consecutive checks', 'error');
          await rollback(`error_rate_${metrics.rate}%`);
        }
      } else {
        errorCount = 0; // Reset on success
        
        if (metrics.rate !== undefined) {
          log(`✅ Check #${checkCount}: Healthy (errors: ${metrics.rate}%)`, 'success');
        } else {
          log(`✅ Check #${checkCount}: ${metrics.message}`, 'success');
        }
      }
    }
    
    // Wait 60 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
  
  const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
  log(`🎉 Monitoring complete after ${elapsedSeconds} seconds`, 'success');
  log('All health checks passed!');
  
  // Generate success report
  const report = {
    timestamp: new Date().toISOString(),
    status: 'success',
    duration_seconds: elapsedSeconds,
    checks_performed: checkCount
  };
  
  fs.writeFileSync('monitoring-success.json', JSON.stringify(report, null, 2));
  
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('\n⚠️  Monitoring interrupted', 'warn');
  process.exit(0);
});

// Execute
monitorHealth().catch(error => {
  log(`\n❌ Monitoring failed: ${error.message}`, 'error');
  process.exit(1);
});