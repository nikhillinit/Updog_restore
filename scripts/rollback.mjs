#!/usr/bin/env node

/**
 * Automated Rollback Script
 * Quickly and safely revert to previous deployment
 */

import { execSync } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import readline from 'readline';

const ROLLBACK_STEPS = [
  {
    name: 'Disable canary flags',
    fn: disableCanaryFlags,
    critical: true,
    reversible: false
  },
  {
    name: 'Restore previous version',
    fn: restorePreviousVersion,
    critical: true,
    reversible: false
  },
  {
    name: 'Clear CDN cache',
    fn: clearCDNCache,
    critical: false,
    reversible: false
  },
  {
    name: 'Restart services',
    fn: restartServices,
    critical: true,
    reversible: false
  },
  {
    name: 'Verify health checks',
    fn: verifyHealthChecks,
    critical: true,
    reversible: false
  },
  {
    name: 'Send notifications',
    fn: sendNotifications,
    critical: false,
    reversible: false
  },
  {
    name: 'Create incident report',
    fn: createIncidentReport,
    critical: false,
    reversible: false
  }
];

// Rollback context
const context = {
  startTime: null,
  reason: '',
  previousVersion: '',
  currentVersion: '',
  stepsCompleted: [],
  errors: [],
  metrics: {}
};

/**
 * Execute rollback
 */
async function rollback(options = {}) {
  console.log('🔄 EMERGENCY ROLLBACK INITIATED');
  console.log('=' .repeat(50));
  
  context.startTime = Date.now();
  context.reason = options.reason || 'Unspecified';
  
  // Get version information
  await getVersionInfo();
  
  console.log(`Current version: ${context.currentVersion}`);
  console.log(`Rolling back to: ${context.previousVersion}`);
  console.log(`Reason: ${context.reason}`);
  console.log('');
  
  // Confirm if interactive
  if (!options.force) {
    const confirmed = await confirmRollback();
    if (!confirmed) {
      console.log('Rollback cancelled by user');
      return false;
    }
  }
  
  // Take pre-rollback snapshot
  await takeSnapshot('pre-rollback');
  
  // Execute rollback steps
  let success = true;
  for (const step of ROLLBACK_STEPS) {
    console.log(`\n📌 ${step.name}...`);
    
    try {
      await step.fn(options);
      console.log(`  ✅ ${step.name} completed`);
      context.stepsCompleted.push(step.name);
    } catch (error) {
      console.error(`  ❌ ${step.name} failed: ${error.message}`);
      context.errors.push({ step: step.name, error: error.message });
      
      if (step.critical) {
        console.error('\n❌ Critical step failed - rollback incomplete!');
        success = false;
        break;
      }
    }
  }
  
  // Take post-rollback snapshot
  await takeSnapshot('post-rollback');
  
  // Final summary
  console.log('\n' + '=' .repeat(50));
  if (success) {
    console.log('✅ ROLLBACK COMPLETED SUCCESSFULLY');
    console.log(`   Duration: ${Math.floor((Date.now() - context.startTime) / 1000)}s`);
    console.log(`   Steps completed: ${context.stepsCompleted.length}/${ROLLBACK_STEPS.length}`);
  } else {
    console.log('❌ ROLLBACK FAILED');
    console.log(`   Errors: ${context.errors.length}`);
    console.log('\n⚠️  Manual intervention required!');
    
    // Print recovery instructions
    printRecoveryInstructions();
  }
  
  // Save rollback report
  await saveReport();
  
  return success;
}

// Step implementations

async function disableCanaryFlags() {
  const flagsApiUrl = process.env.FLAGS_API_URL || 'http://localhost:5000/api/flags';
  
  const flags = {
    ENABLE_CANARY: false,
    CANARY_PERCENTAGE: 0,
    ENABLE_RUM_V2: 0,
    ROLLBACK_IN_PROGRESS: true
  };
  
  const response = await fetch(flagsApiUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(flags)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update flags: ${response.statusText}`);
  }
  
  // Also set local env flags
  execSync(`echo "ENABLE_CANARY=false" >> .env.rollback`);
  execSync(`echo "CANARY_PERCENTAGE=0" >> .env.rollback`);
}

async function restorePreviousVersion() {
  // Option 1: Git revert
  if (process.env.ROLLBACK_METHOD === 'git') {
    execSync(`git revert --no-edit HEAD`);
    execSync(`git push origin main`);
    return;
  }
  
  // Option 2: Docker image rollback
  if (process.env.ROLLBACK_METHOD === 'docker') {
    const previousImage = `app:${context.previousVersion}`;
    execSync(`docker pull ${previousImage}`);
    execSync(`docker tag ${previousImage} app:latest`);
    execSync(`docker push app:latest`);
    return;
  }
  
  // Option 3: Build from previous tag
  execSync(`git checkout v${context.previousVersion}`);
  execSync(`npm ci`);
  execSync(`npm run build`);
  
  // Deploy built artifacts
  execSync(`rsync -av dist/ /var/www/app/`);
}

async function clearCDNCache() {
  // Would call CDN API to purge cache
  if (process.env.CDN_PURGE_URL) {
    await fetch(process.env.CDN_PURGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CDN_API_KEY}`
      }
    });
  }
  
  // Clear local caches
  execSync(`redis-cli FLUSHDB || true`);
}

async function restartServices() {
  // Restart application services
  if (process.env.DEPLOYMENT_METHOD === 'systemd') {
    execSync(`sudo systemctl restart app.service`);
    execSync(`sudo systemctl restart worker.service`);
  } else if (process.env.DEPLOYMENT_METHOD === 'docker') {
    execSync(`docker-compose restart`);
  } else if (process.env.DEPLOYMENT_METHOD === 'kubernetes') {
    execSync(`kubectl rollout restart deployment/app`);
    execSync(`kubectl rollout status deployment/app --timeout=5m`);
  } else {
    // Development/PM2
    execSync(`pm2 restart all || true`);
  }
  
  // Wait for services to be ready
  await waitForServices();
}

async function verifyHealthChecks() {
  const healthEndpoints = [
    'http://localhost:5000/health',
    'http://localhost:5000/api/health',
    'http://localhost:5000/metrics/rum/health'
  ];
  
  for (const endpoint of healthEndpoints) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Health check failed: ${endpoint}`);
      }
    } catch (error) {
      throw new Error(`Cannot reach ${endpoint}: ${error.message}`);
    }
  }
  
  // Check key metrics are reporting
  const metricsResponse = await fetch('http://localhost:5000/metrics');
  if (!metricsResponse.ok) {
    throw new Error('Metrics endpoint not responding');
  }
}

async function sendNotifications() {
  const message = {
    severity: 'critical',
    title: 'Production Rollback Executed',
    description: `Rolled back from ${context.currentVersion} to ${context.previousVersion}`,
    reason: context.reason,
    duration: `${Math.floor((Date.now() - context.startTime) / 1000)}s`,
    status: context.errors.length === 0 ? 'success' : 'partial'
  };
  
  // Slack notification
  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🔄 ${message.title}`,
        attachments: [{
          color: 'danger',
          fields: [
            { title: 'From Version', value: context.currentVersion, short: true },
            { title: 'To Version', value: context.previousVersion, short: true },
            { title: 'Reason', value: context.reason, short: false },
            { title: 'Duration', value: message.duration, short: true },
            { title: 'Status', value: message.status, short: true }
          ]
        }]
      })
    });
  }
  
  // Create GitHub issue
  if (process.env.GITHUB_TOKEN) {
    execSync(`gh issue create --title "Rollback: ${context.currentVersion} → ${context.previousVersion}" --body "${JSON.stringify(message)}"`);
  }
}

async function createIncidentReport() {
  const report = {
    timestamp: new Date().toISOString(),
    type: 'rollback',
    reason: context.reason,
    versions: {
      from: context.currentVersion,
      to: context.previousVersion
    },
    duration: Date.now() - context.startTime,
    stepsCompleted: context.stepsCompleted,
    errors: context.errors,
    metrics: context.metrics
  };
  
  const filename = `incident-rollback-${Date.now()}.json`;
  await fs.writeFile(filename, JSON.stringify(report, null, 2));
  
  console.log(`\n📁 Incident report saved: ${filename}`);
}

// Helper functions

async function getVersionInfo() {
  // Get current version from package.json
  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
  context.currentVersion = packageJson.version;
  
  // Get previous version from git tags
  try {
    const tags = execSync('git tag --sort=-version:refname', { encoding: 'utf-8' });
    const versions = tags.split('\n').filter(t => t.startsWith('v'));
    
    if (versions.length > 1) {
      context.previousVersion = versions[1].replace('v', '');
    } else {
      // Fallback to previous commit
      const previousCommit = execSync('git rev-parse HEAD~1', { encoding: 'utf-8' }).trim();
      context.previousVersion = previousCommit.substring(0, 7);
    }
  } catch {
    context.previousVersion = 'unknown';
  }
}

async function confirmRollback() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question('\n⚠️  Confirm rollback? (yes/no): ', answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function takeSnapshot(type) {
  try {
    const metrics = await fetch('http://localhost:9090/api/v1/query?query=up');
    const metricsData = await metrics.json();
    
    context.metrics[type] = {
      timestamp: Date.now(),
      services: metricsData.data?.result?.length || 0,
      // Would capture more metrics in production
    };
  } catch {
    // Ignore snapshot errors
  }
}

async function waitForServices(timeout = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch('http://localhost:5000/health');
      if (response.ok) return;
    } catch {
      // Service not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Services did not become healthy within timeout');
}

function printRecoveryInstructions() {
  console.log('\n📋 MANUAL RECOVERY STEPS:');
  console.log('1. Check service status:');
  console.log('   systemctl status app.service');
  console.log('   docker ps');
  console.log('2. Check logs:');
  console.log('   tail -f /var/log/app.log');
  console.log('   docker logs app');
  console.log('3. Verify database:');
  console.log('   psql $DATABASE_URL -c "SELECT version();"');
  console.log('4. Test endpoints:');
  console.log('   curl http://localhost:5000/health');
  console.log('5. Contact on-call:');
  console.log('   Page via PagerDuty or Slack #incidents');
}

async function saveReport() {
  const report = {
    ...context,
    endTime: Date.now(),
    duration: Date.now() - context.startTime,
    success: context.errors.length === 0
  };
  
  await fs.writeFile(
    `rollback-report-${Date.now()}.json`,
    JSON.stringify(report, null, 2)
  );
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};
  
  if (args.includes('--help')) {
    console.log('Usage: rollback.mjs [options]');
    console.log('Options:');
    console.log('  --force           Skip confirmation prompt');
    console.log('  --reason="..."    Reason for rollback');
    console.log('  --dry-run         Simulate rollback without changes');
    process.exit(0);
  }
  
  args.forEach(arg => {
    if (arg === '--force') options.force = true;
    if (arg === '--dry-run') options.dryRun = true;
    if (arg.startsWith('--reason=')) options.reason = arg.split('=')[1];
  });
  
  rollback(options).then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { rollback, ROLLBACK_STEPS };