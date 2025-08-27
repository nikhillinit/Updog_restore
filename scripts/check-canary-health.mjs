#!/usr/bin/env node

import https from 'node:https';
import http from 'node:http';

const PROM_BASE_URL = process.env.PROM_BASE_URL || 'http://localhost:9090';
const LCP_P75_MAX = Number(process.env.LCP_P75_MAX || '2500');
const INP_P75_MAX = Number(process.env.INP_P75_MAX || '200');
const CLS_P95_MAX = Number(process.env.CLS_P95_MAX || '0.1');
const ERROR_RATE_MAX = Number(process.env.ERROR_RATE_MAX || '0.01');
const MIN_SAMPLE_SIZE = Number(process.env.MIN_SAMPLE_SIZE || '100');

// Query Prometheus
async function promQuery(query) {
  const url = new URL('/api/v1/query', PROM_BASE_URL);
  url.searchParams.set('query', query);
  
  return new Promise((resolve, reject) => {
    const protocol = url.protocol === 'https:' ? https : http;
    
    protocol.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success') {
            resolve(json.data.result);
          } else {
            reject(new Error(`Prometheus error: ${json.error}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Check a specific metric against threshold
async function checkMetric(name, query, threshold, operator = '>') {
  try {
    const result = await promQuery(query);
    
    if (!result || result.length === 0) {
      return {
        name,
        status: 'no_data',
        message: 'No data available',
        value: null,
        threshold,
      };
    }
    
    const value = parseFloat(result[0].value[1]);
    let breached = false;
    
    if (operator === '>') {
      breached = value > threshold;
    } else if (operator === '<') {
      breached = value < threshold;
    }
    
    return {
      name,
      status: breached ? 'breach' : 'ok',
      message: breached ? `${name} exceeded threshold` : `${name} within limits`,
      value,
      threshold,
      operator,
    };
  } catch (error) {
    return {
      name,
      status: 'error',
      message: error.message,
      value: null,
      threshold,
    };
  }
}

// Main health check
async function checkCanaryHealth() {
  console.log('🏥 Canary Health Check');
  console.log('======================');
  console.log(`Prometheus: ${PROM_BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');
  
  const checks = [
    // Web Vitals checks (p75 for LCP and INP, p95 for CLS)
    {
      name: 'LCP p75',
      query: `histogram_quantile(0.75, sum(rate(web_vitals_lcp_bucket{cohort="canary"}[15m])) by (le))`,
      threshold: LCP_P75_MAX,
      operator: '>',
    },
    {
      name: 'INP p75',
      query: `histogram_quantile(0.75, sum(rate(web_vitals_inp_bucket{cohort="canary"}[15m])) by (le))`,
      threshold: INP_P75_MAX,
      operator: '>',
    },
    {
      name: 'CLS p95',
      query: `histogram_quantile(0.95, sum(rate(web_vitals_cls_bucket{cohort="canary"}[15m])) by (le))`,
      threshold: CLS_P95_MAX,
      operator: '>',
    },
    
    // Error rate check
    {
      name: 'Error Rate',
      query: `rate(http_requests_total{status=~"5..",cohort="canary"}[5m]) / rate(http_requests_total{cohort="canary"}[5m])`,
      threshold: ERROR_RATE_MAX,
      operator: '>',
    },
    
    // API latency check (p99)
    {
      name: 'API p99 Latency',
      query: `histogram_quantile(0.99, sum(rate(http_request_duration_ms_bucket{cohort="canary"}[10m])) by (le))`,
      threshold: 5000, // 5 seconds
      operator: '>',
    },
    
    // Memory usage check
    {
      name: 'Memory Usage',
      query: `process_resident_memory_bytes{job="api",cohort="canary"} / (1024 * 1024 * 1024)`,
      threshold: 2, // 2GB
      operator: '>',
    },
    
    // CPU usage check
    {
      name: 'CPU Usage',
      query: `rate(process_cpu_seconds_total{job="api",cohort="canary"}[5m]) * 100`,
      threshold: 80, // 80%
      operator: '>',
    },
  ];
  
  // Check sample size first
  console.log('Checking sample size...');
  const sampleSizeQuery = `sum(increase(web_vitals_lcp_count{cohort="canary"}[15m]))`;
  const sampleResult = await promQuery(sampleSizeQuery);
  const sampleSize = sampleResult && sampleResult[0] ? parseFloat(sampleResult[0].value[1]) : 0;
  
  if (sampleSize < MIN_SAMPLE_SIZE) {
    console.log(`⚠️  Insufficient sample size: ${Math.floor(sampleSize)} < ${MIN_SAMPLE_SIZE}`);
    console.log('Skipping threshold checks due to low sample size');
    process.exit(0);
  }
  
  console.log(`✅ Sample size: ${Math.floor(sampleSize)} (minimum: ${MIN_SAMPLE_SIZE})`);
  console.log('');
  
  // Run all checks
  console.log('Running health checks...');
  const results = await Promise.all(
    checks.map(check => checkMetric(check.name, check.query, check.threshold, check.operator))
  );
  
  // Print results
  console.log('');
  console.log('Results:');
  console.log('--------');
  
  let hasBreaches = false;
  let hasErrors = false;
  
  results.forEach(result => {
    const icon = result.status === 'ok' ? '✅' : 
                 result.status === 'breach' ? '❌' : 
                 result.status === 'no_data' ? '⚠️' : '❓';
    
    const valueStr = result.value !== null ? 
      result.value.toFixed(2) : 
      'N/A';
    
    console.log(`${icon} ${result.name}: ${valueStr} (threshold: ${result.operator} ${result.threshold})`);
    
    if (result.status === 'breach') hasBreaches = true;
    if (result.status === 'error') hasErrors = true;
  });
  
  // Generate alert commands if needed
  if (hasBreaches) {
    console.log('');
    console.log('🚨 ALERT: Canary health checks failed!');
    console.log('');
    console.log('Recommended actions:');
    console.log('1. Pause canary rollout: npm run canary:pause');
    console.log('2. Review metrics dashboard');
    console.log('3. Check application logs');
    console.log('4. Consider rollback if issues persist');
    
    // Write halt signal file for CI
    const fs = await import('fs/promises');
    await fs.writeFile('.canary-halt', JSON.stringify({
      timestamp: new Date().toISOString(),
      breaches: results.filter(r => r.status === 'breach'),
    }, null, 2));
    
    process.exit(2);
  }
  
  if (hasErrors) {
    console.log('');
    console.log('⚠️  Warning: Some checks encountered errors');
    console.log('This may indicate Prometheus connectivity issues');
    process.exit(1);
  }
  
  console.log('');
  console.log('✅ All canary health checks passed');
  process.exit(0);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkCanaryHealth().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { checkCanaryHealth, checkMetric, promQuery };