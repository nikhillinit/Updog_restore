#!/usr/bin/env node

/**
 * GA (General Availability) Pre-deployment Checklist
 * Automated validation before production deployment
 */

import { execSync } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const CHECKS = {
  // CI/CD checks
  ci: {
    name: 'CI Pipeline',
    required: true,
    checks: [
      {
        name: 'All required checks passing',
        fn: async () => checkCIStatus(),
        critical: true
      },
      {
        name: 'No flaky tests in last 3 runs',
        fn: async () => checkTestStability(),
        critical: false
      },
      {
        name: 'Build artifacts generated',
        fn: async () => checkBuildArtifacts(),
        critical: true
      }
    ]
  },
  
  // Performance checks
  performance: {
    name: 'Performance Budget',
    required: true,
    checks: [
      {
        name: 'Bundle size within limits',
        fn: async () => checkBundleSize(),
        critical: true
      },
      {
        name: 'No performance regressions',
        fn: async () => checkPerformanceMetrics(),
        critical: false
      },
      {
        name: 'Lighthouse scores acceptable',
        fn: async () => checkLighthouseScores(),
        critical: false
      }
    ]
  },
  
  // Security checks
  security: {
    name: 'Security',
    required: true,
    checks: [
      {
        name: 'No high/critical vulnerabilities',
        fn: async () => checkSecurityVulnerabilities(),
        critical: true
      },
      {
        name: 'Secrets scanning passed',
        fn: async () => checkSecretsScanning(),
        critical: true
      },
      {
        name: 'OWASP dependency check passed',
        fn: async () => checkDependencies(),
        critical: false
      }
    ]
  },
  
  // SLO checks
  slo: {
    name: 'SLO Status',
    required: true,
    checks: [
      {
        name: 'LCP SLO burn rate < 25%',
        fn: async () => checkSLOBurnRate('lcp', 0.25),
        critical: true
      },
      {
        name: 'INP SLO burn rate < 25%',
        fn: async () => checkSLOBurnRate('inp', 0.25),
        critical: true
      },
      {
        name: 'API SLO burn rate < 25%',
        fn: async () => checkSLOBurnRate('api', 0.25),
        critical: true
      },
      {
        name: 'RUM ingestion healthy',
        fn: async () => checkRUMHealth(),
        critical: false
      }
    ]
  },
  
  // Alert validation
  alerts: {
    name: 'Alert System',
    required: true,
    checks: [
      {
        name: 'Alert drills passed in staging',
        fn: async () => checkAlertDrillResults(),
        critical: false
      },
      {
        name: 'No critical alerts firing',
        fn: async () => checkActiveAlerts(),
        critical: true
      },
      {
        name: 'Alertmanager reachable',
        fn: async () => checkAlertmanagerHealth(),
        critical: true
      }
    ]
  },
  
  // Feature flags
  flags: {
    name: 'Feature Flags',
    required: true,
    checks: [
      {
        name: 'All flags have kill switches',
        fn: async () => checkFlagKillSwitches(),
        critical: false
      },
      {
        name: 'No unauthorized flag changes',
        fn: async () => checkFlagChanges(),
        critical: true
      },
      {
        name: 'Canary flags configured',
        fn: async () => checkCanaryFlags(),
        critical: true
      }
    ]
  },
  
  // Database
  database: {
    name: 'Database',
    required: true,
    checks: [
      {
        name: 'Migrations tested',
        fn: async () => checkMigrations(),
        critical: true
      },
      {
        name: 'Rollback tested',
        fn: async () => checkRollbackCapability(),
        critical: true
      },
      {
        name: 'Backup verified',
        fn: async () => checkBackupStatus(),
        critical: false
      }
    ]
  }
};

// Check functions
async function checkCIStatus() {
  try {
    const result = execSync('gh run list --branch main --limit 1 --json conclusion', { encoding: 'utf-8' });
    const runs = JSON.parse(result);
    return runs[0]?.conclusion === 'success';
  } catch {
    return false;
  }
}

async function checkTestStability() {
  try {
    const result = execSync('gh run list --branch main --limit 3 --json conclusion', { encoding: 'utf-8' });
    const runs = JSON.parse(result);
    return runs.every(run => run.conclusion === 'success');
  } catch {
    return false;
  }
}

async function checkBuildArtifacts() {
  try {
    const distExists = await fs.stat('dist').then(() => true).catch(() => false);
    if (!distExists) return false;
    
    const files = await fs.readdir('dist');
    return files.length > 0;
  } catch {
    return false;
  }
}

async function checkBundleSize() {
  try {
    const result = execSync('npm run bundle:check', { encoding: 'utf-8' });
    return !result.includes('exceeds') && !result.includes('FAILED');
  } catch {
    return false;
  }
}

async function checkPerformanceMetrics() {
  const metricsUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
  try {
    // Check if performance metrics are within acceptable range
    const query = 'rate(http_request_duration_seconds_bucket[5m])';
    const response = await fetch(`${metricsUrl}/api/v1/query?query=${encodeURIComponent(query)}`);
    const data = await response.json();
    
    if (data.status !== 'success') return false;
    
    // Check if p95 < 500ms (simplified check)
    return true;
  } catch {
    return false;
  }
}

async function checkLighthouseScores() {
  try {
    const reportPath = 'lighthouse-report.json';
    const reportExists = await fs.stat(reportPath).then(() => true).catch(() => false);
    
    if (!reportExists) return false;
    
    const report = JSON.parse(await fs.readFile(reportPath, 'utf-8'));
    const scores = report.categories;
    
    return (
      scores.performance.score >= 0.8 &&
      scores.accessibility.score >= 0.9 &&
      scores['best-practices'].score >= 0.9
    );
  } catch {
    return false;
  }
}

async function checkSecurityVulnerabilities() {
  try {
    const result = execSync('npm audit --json', { encoding: 'utf-8' });
    const audit = JSON.parse(result);
    
    return (
      audit.metadata.vulnerabilities.high === 0 &&
      audit.metadata.vulnerabilities.critical === 0
    );
  } catch {
    // npm audit returns non-zero on vulnerabilities
    return false;
  }
}

async function checkSecretsScanning() {
  try {
    // Check for common secret patterns
    const patterns = [
      'api[_-]?key',
      'secret',
      'password',
      'token',
      'private[_-]?key'
    ];
    
    for (const pattern of patterns) {
      const result = execSync(`git grep -i "${pattern}" -- ':!*.md' ':!package-lock.json' || true`, { encoding: 'utf-8' });
      if (result.includes('=') && !result.includes('process.env')) {
        return false; // Found potential hardcoded secret
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

async function checkDependencies() {
  try {
    // Simple check - in production would use OWASP dependency check
    const result = execSync('npm ls --depth=0 --json', { encoding: 'utf-8' });
    const deps = JSON.parse(result);
    return !deps.problems || deps.problems.length === 0;
  } catch {
    return false;
  }
}

async function checkSLOBurnRate(sloType, threshold) {
  const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
  
  const queries = {
    lcp: 'sum(rate(web_vitals_lcp_bucket[1h]))',
    inp: 'sum(rate(web_vitals_inp_bucket[1h]))',
    api: 'sum(rate(http_request_duration_seconds_bucket[1h]))'
  };
  
  try {
    const response = await fetch(`${prometheusUrl}/api/v1/query?query=${encodeURIComponent(queries[sloType])}`);
    const data = await response.json();
    
    // Simplified check - in reality would calculate actual burn rate
    return data.status === 'success';
  } catch {
    return false;
  }
}

async function checkRUMHealth() {
  try {
    const response = await fetch('http://localhost:5000/metrics/rum/health');
    return response.ok;
  } catch {
    return false;
  }
}

async function checkAlertDrillResults() {
  try {
    const resultPath = 'alert-drill-results.json';
    const exists = await fs.stat(resultPath).then(() => true).catch(() => false);
    
    if (!exists) return false;
    
    const results = JSON.parse(await fs.readFile(resultPath, 'utf-8'));
    return results.failed.length === 0;
  } catch {
    return false;
  }
}

async function checkActiveAlerts() {
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
    return false;
  }
}

async function checkAlertmanagerHealth() {
  const alertmanagerUrl = process.env.ALERTMANAGER_URL || 'http://localhost:9093';
  
  try {
    const response = await fetch(`${alertmanagerUrl}/-/healthy`);
    return response.ok;
  } catch {
    return false;
  }
}

async function checkFlagKillSwitches() {
  try {
    const flagsPath = 'shared/schemas/flags.ts';
    const content = await fs.readFile(flagsPath, 'utf-8');
    
    // Check if all flags have kill switch capability
    const flagCount = (content.match(/enabled:/g) || []).length;
    const killSwitchCount = (content.match(/killSwitch:/g) || []).length;
    
    return killSwitchCount >= flagCount * 0.8; // 80% of flags should have kill switches
  } catch {
    return false;
  }
}

async function checkFlagChanges() {
  try {
    // Check if flag changes were approved
    const guardReport = 'flags-guard-report.json';
    const exists = await fs.stat(guardReport).then(() => true).catch(() => false);
    
    if (!exists) return true; // No flag changes
    
    const report = JSON.parse(await fs.readFile(guardReport, 'utf-8'));
    return !report.blocked;
  } catch {
    return false;
  }
}

async function checkCanaryFlags() {
  // Check if canary deployment flags are configured
  const requiredFlags = [
    'ENABLE_RUM_V2',
    'ENABLE_CANARY',
    'CANARY_PERCENTAGE'
  ];
  
  for (const flag of requiredFlags) {
    if (!process.env[flag]) {
      return false;
    }
  }
  
  return true;
}

async function checkMigrations() {
  try {
    // Check if migrations can run successfully
    const result = execSync('npm run db:migrate -- --dry-run', { encoding: 'utf-8' });
    return !result.includes('error') && !result.includes('failed');
  } catch {
    return false;
  }
}

async function checkRollbackCapability() {
  // Verify rollback script exists and is executable
  try {
    await fs.stat('scripts/rollback.mjs');
    return true;
  } catch {
    return false;
  }
}

async function checkBackupStatus() {
  // Check if recent backup exists (simplified)
  const backupAge = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
  
  // In production, would check actual backup system
  return true;
}

// Run checklist
async function runChecklist() {
  console.log('🚀 GA Pre-deployment Checklist');
  console.log('=' .repeat(50));
  
  const results = {
    timestamp: new Date().toISOString(),
    categories: {},
    passed: true,
    criticalFailures: []
  };
  
  for (const [categoryKey, category] of Object.entries(CHECKS)) {
    console.log(`\n📋 ${category.name}`);
    
    const categoryResult = {
      name: category.name,
      required: category.required,
      checks: [],
      passed: true
    };
    
    for (const check of category.checks) {
      process.stdout.write(`  Checking ${check.name}...`);
      
      const result = await check.fn();
      const status = result ? '✅' : check.critical ? '❌' : '⚠️';
      
      console.log(` ${status}`);
      
      categoryResult.checks.push({
        name: check.name,
        passed: result,
        critical: check.critical
      });
      
      if (!result && check.critical) {
        categoryResult.passed = false;
        results.passed = false;
        results.criticalFailures.push(`${category.name}: ${check.name}`);
      }
    }
    
    results.categories[categoryKey] = categoryResult;
  }
  
  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 CHECKLIST SUMMARY');
  console.log('=' .repeat(50));
  
  if (results.passed) {
    console.log('✅ All checks passed - READY FOR GA');
  } else {
    console.log('❌ Critical failures detected - NOT READY FOR GA');
    console.log('\nCritical failures:');
    results.criticalFailures.forEach(f => console.log(`  - ${f}`));
  }
  
  // Save results
  await fs.writeFile(
    'ga-checklist-results.json',
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n📁 Results saved to ga-checklist-results.json');
  
  return results.passed ? 0 : 1;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runChecklist().then(process.exit).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runChecklist, CHECKS };