#!/usr/bin/env node

/**
 * Alert Drill Runner - Automated validation of monitoring alerts
 * Simulates conditions that should trigger alerts and verifies they fire
 */

import fetch from 'node-fetch';
import { spawn } from 'child_process';
import playwright from 'playwright';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const ALERTMANAGER_URL = process.env.ALERTMANAGER_URL || 'http://localhost:9093';

// Alert drill scenarios
const drills = {
  // LCP breach - inject delay into page load
  lcpBreach: async () => {
    console.log('🎯 Simulating LCP p75 breach...');
    const promises = [];
    
    // Generate slow page loads for 2 minutes
    const endTime = Date.now() + 120000; // 2 minutes
    while (Date.now() < endTime) {
      promises.push(
        fetch(`${STAGING_URL}/slow-page?delay=3000`, {
          headers: { 'X-Synthetic-Source': 'alert-drill' }
        }).catch(() => {})
      );
      
      // Send 10 requests per second
      if (promises.length >= 10) {
        await Promise.all(promises);
        promises.length = 0;
        await sleep(1000);
      }
    }
    
    console.log('✅ LCP breach simulation complete');
    return 'LCPBudgetFastBurn';
  },
  
  // INP breach - simulate slow interactions
  inpBreach: async () => {
    console.log('🎯 Simulating INP p75 breach...');
    
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
      await page.goto(STAGING_URL);
      
      // Inject slow interaction handler
      await page.evaluate(() => {
        document.addEventListener('click', (e) => {
          const start = Date.now();
          // Block main thread for 300ms
          while (Date.now() - start < 300) {
            // Busy wait
          }
        });
      });
      
      // Simulate interactions for 2 minutes
      const endTime = Date.now() + 120000;
      while (Date.now() < endTime) {
        // Click random elements
        const buttons = await page.$$('button, a, [role="button"]');
        if (buttons.length > 0) {
          const randomButton = buttons[Math.floor(Math.random() * buttons.length)];
          await randomButton.click().catch(() => {});
        }
        await sleep(500);
      }
    } finally {
      await browser.close();
    }
    
    console.log('✅ INP breach simulation complete');
    return 'INPBudgetFastBurn';
  },
  
  // RUM rejection - send invalid beacons
  rumRejectHigh: async () => {
    console.log('🎯 Simulating high RUM rejection rate...');
    
    const invalidPayloads = [
      { /* missing name */ value: 100 },
      { name: 'LCP', /* invalid value */ value: 'not-a-number' },
      { name: 'INP', value: 100, timestamp: Date.now() - 3600000 }, // Stale
      { name: 'CLS', value: -1 }, // Invalid negative value
    ];
    
    // Send invalid beacons for 2 minutes
    const endTime = Date.now() + 120000;
    while (Date.now() < endTime) {
      const promises = invalidPayloads.map(payload =>
        fetch(`${STAGING_URL}/metrics/rum`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://evil.com', // Invalid origin
          },
          body: JSON.stringify(payload)
        }).catch(() => {})
      );
      
      await Promise.all(promises);
      await sleep(1000);
    }
    
    console.log('✅ RUM rejection simulation complete');
    return 'RUMIngestRejectRatioHigh';
  },
  
  // API latency breach
  apiLatencyBreach: async () => {
    console.log('🎯 Simulating API p95 latency breach...');
    
    // Add artificial delay to API endpoints
    const delayEndpoint = `${STAGING_URL}/admin/inject-delay`;
    await fetch(delayEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delay: 600, duration: 120 }) // 600ms delay for 2 min
    }).catch(() => {});
    
    // Generate API traffic
    const endTime = Date.now() + 120000;
    while (Date.now() < endTime) {
      const promises = Array(20).fill(0).map(() =>
        fetch(`${STAGING_URL}/api/health`).catch(() => {})
      );
      await Promise.all(promises);
      await sleep(1000);
    }
    
    console.log('✅ API latency breach simulation complete');
    return 'APISLOFastBurn';
  }
};

// Verify alert is firing
async function verifyAlert(alertName, maxWaitMinutes = 10) {
  console.log(`⏳ Waiting for alert '${alertName}' to fire (max ${maxWaitMinutes} min)...`);
  
  const endTime = Date.now() + (maxWaitMinutes * 60000);
  
  while (Date.now() < endTime) {
    try {
      // Query Alertmanager for active alerts
      const response = await fetch(`${ALERTMANAGER_URL}/api/v1/alerts`);
      const data = await response.json();
      
      const activeAlerts = data.data || [];
      const matchingAlert = activeAlerts.find(alert => 
        alert.labels.alertname === alertName && 
        alert.status.state === 'active'
      );
      
      if (matchingAlert) {
        console.log(`✅ Alert '${alertName}' is FIRING!`);
        console.log(`   Severity: ${matchingAlert.labels.severity}`);
        console.log(`   Summary: ${matchingAlert.annotations.summary}`);
        return true;
      }
    } catch (error) {
      console.error('Error checking alerts:', error.message);
    }
    
    // Check every 30 seconds
    await sleep(30000);
  }
  
  console.error(`❌ Alert '${alertName}' did not fire within ${maxWaitMinutes} minutes`);
  return false;
}

// Run all drills
async function runDrills(selectedDrills = Object.keys(drills)) {
  console.log('🚀 Starting Alert Drill Runner');
  console.log(`   Staging: ${STAGING_URL}`);
  console.log(`   Prometheus: ${PROMETHEUS_URL}`);
  console.log(`   Alertmanager: ${ALERTMANAGER_URL}`);
  console.log('');
  
  const results = {
    passed: [],
    failed: [],
    startTime: new Date().toISOString()
  };
  
  for (const drillName of selectedDrills) {
    if (!drills[drillName]) {
      console.error(`Unknown drill: ${drillName}`);
      continue;
    }
    
    console.log(`\n📋 Running drill: ${drillName}`);
    console.log('=' .repeat(50));
    
    try {
      // Run the drill
      const expectedAlert = await drills[drillName]();
      
      // Wait a bit for metrics to propagate
      console.log('⏱️  Waiting 30s for metrics to propagate...');
      await sleep(30000);
      
      // Verify the alert fired
      const alertFired = await verifyAlert(expectedAlert);
      
      if (alertFired) {
        results.passed.push({ drill: drillName, alert: expectedAlert });
      } else {
        results.failed.push({ drill: drillName, alert: expectedAlert });
      }
    } catch (error) {
      console.error(`❌ Drill failed with error: ${error.message}`);
      results.failed.push({ drill: drillName, error: error.message });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 DRILL RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed drills:');
    results.failed.forEach(f => {
      console.log(`  - ${f.drill}: ${f.alert || f.error}`);
    });
  }
  
  // Save results
  const fs = await import('fs/promises');
  await fs.writeFile(
    'alert-drill-results.json',
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n📁 Results saved to alert-drill-results.json');
  
  // Exit with error if any drills failed
  if (results.failed.length > 0) {
    process.exit(1);
  }
}

// Helper function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse CLI arguments
const args = process.argv.slice(2);
const selectedDrills = args.length > 0 ? args : undefined;

// Handle different execution modes
if (args.includes('--help')) {
  console.log('Usage: node alert-drill-runner.js [drill1] [drill2] ...');
  console.log('\nAvailable drills:');
  Object.keys(drills).forEach(name => {
    console.log(`  - ${name}`);
  });
  process.exit(0);
}

if (args.includes('--env')) {
  const envIndex = args.indexOf('--env');
  const env = args[envIndex + 1];
  
  if (env === 'staging') {
    process.env.STAGING_URL = 'https://staging.example.com';
    process.env.PROMETHEUS_URL = 'https://prometheus-staging.example.com';
    process.env.ALERTMANAGER_URL = 'https://alertmanager-staging.example.com';
  }
}

// Run drills
runDrills(selectedDrills).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});