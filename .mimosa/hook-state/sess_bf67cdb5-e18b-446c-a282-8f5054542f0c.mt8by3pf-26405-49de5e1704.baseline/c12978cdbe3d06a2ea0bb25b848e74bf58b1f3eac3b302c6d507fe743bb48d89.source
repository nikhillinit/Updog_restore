#!/usr/bin/env node

/**
 * Alert Verification Script
 * Checks if specified alerts are firing in Prometheus/Alertmanager
 */

import fetch from 'node-fetch';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const ALERTMANAGER_URL = process.env.ALERTMANAGER_URL || 'http://localhost:9093';
const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3000';

// Check Prometheus for alert rules
async function checkPrometheusAlerts(alertNames) {
  console.log('📊 Checking Prometheus alert rules...');
  
  try {
    const response = await fetch(`${PROMETHEUS_URL}/api/v1/rules`);
    const data = await response.json();
    
    if (data.status !== 'success') {
      throw new Error('Failed to fetch Prometheus rules');
    }
    
    const results = {};
    const allRules = [];
    
    // Flatten all rule groups
    data.data.groups.forEach(group => {
      group.rules.forEach(rule => {
        if (rule.type === 'alerting') {
          allRules.push({
            name: rule.name,
            state: rule.state,
            health: rule.health,
            query: rule.query,
            duration: rule.duration,
            labels: rule.labels,
            annotations: rule.annotations
          });
        }
      });
    });
    
    // Check each requested alert
    alertNames.forEach(alertName => {
      const rule = allRules.find(r => r.name === alertName);
      if (rule) {
        results[alertName] = {
          found: true,
          state: rule.state,
          health: rule.health,
          query: rule.query
        };
        
        console.log(`  ✅ ${alertName}: ${rule.state.toUpperCase()}`);
        if (rule.state === 'firing') {
          console.log(`     Duration: ${rule.duration}`);
        }
      } else {
        results[alertName] = { found: false };
        console.log(`  ❌ ${alertName}: NOT FOUND`);
      }
    });
    
    return results;
  } catch (error) {
    console.error('Error checking Prometheus:', error.message);
    return {};
  }
}

// Check Alertmanager for active alerts
async function checkAlertmanager(alertNames) {
  console.log('\n🔔 Checking Alertmanager...');
  
  try {
    const response = await fetch(`${ALERTMANAGER_URL}/api/v2/alerts`);
    const alerts = await response.json();
    
    const results = {};
    
    alertNames.forEach(alertName => {
      const matchingAlerts = alerts.filter(alert => 
        alert.labels.alertname === alertName
      );
      
      if (matchingAlerts.length > 0) {
        const activeAlerts = matchingAlerts.filter(a => 
          a.status.state === 'active'
        );
        
        results[alertName] = {
          found: true,
          total: matchingAlerts.length,
          active: activeAlerts.length,
          alerts: activeAlerts.map(a => ({
            severity: a.labels.severity,
            team: a.labels.team,
            startsAt: a.startsAt,
            summary: a.annotations?.summary
          }))
        };
        
        console.log(`  ✅ ${alertName}: ${activeAlerts.length} ACTIVE`);
        activeAlerts.forEach(a => {
          console.log(`     - ${a.annotations?.summary || 'No summary'}`);
        });
      } else {
        results[alertName] = { found: false };
        console.log(`  ❌ ${alertName}: NO ACTIVE ALERTS`);
      }
    });
    
    return results;
  } catch (error) {
    console.error('Error checking Alertmanager:', error.message);
    return {};
  }
}

// Query Prometheus for SLO burn rates
async function checkSLOBurnRates() {
  console.log('\n📈 Checking SLO burn rates...');
  
  const sloQueries = {
    'LCP p75': 'histogram_quantile(0.75, sum by (le) (rate(web_vitals_lcp_bucket[5m])))',
    'INP p75': 'histogram_quantile(0.75, sum by (le) (rate(web_vitals_inp_bucket[5m])))',
    'API p95': 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
    'RUM reject %': 'rate(rum_ingest_rejected_total[5m]) / (rate(rum_ingest_total[5m]) + rate(rum_ingest_rejected_total[5m])) * 100'
  };
  
  const results = {};
  
  for (const [name, query] of Object.entries(sloQueries)) {
    try {
      const response = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (data.status === 'success' && data.data.result.length > 0) {
        const value = parseFloat(data.data.result[0].value[1]);
        results[name] = value;
        
        // Determine if breaching
        let status = '✅';
        if (name === 'LCP p75' && value > 2500) status = '⚠️';
        if (name === 'INP p75' && value > 200) status = '⚠️';
        if (name === 'API p95' && value > 500) status = '⚠️';
        if (name === 'RUM reject %' && value > 1) status = '⚠️';
        
        console.log(`  ${status} ${name}: ${value.toFixed(2)}`);
      } else {
        console.log(`  ❓ ${name}: No data`);
      }
    } catch (error) {
      console.log(`  ❌ ${name}: Query failed`);
    }
  }
  
  return results;
}

// Check Grafana dashboard annotations
async function checkGrafanaAnnotations() {
  console.log('\n📊 Checking Grafana annotations...');
  
  try {
    const response = await fetch(`${GRAFANA_URL}/api/annotations?type=alert&limit=10`, {
      headers: {
        'Authorization': `Bearer ${process.env.GRAFANA_API_KEY || ''}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Grafana returned ${response.status}`);
    }
    
    const annotations = await response.json();
    
    console.log(`  Found ${annotations.length} recent alert annotations`);
    
    annotations.slice(0, 5).forEach(ann => {
      const time = new Date(ann.time).toLocaleString();
      console.log(`  - [${time}] ${ann.text}`);
    });
    
    return annotations;
  } catch (error) {
    console.log(`  ⚠️ Could not fetch Grafana annotations: ${error.message}`);
    return [];
  }
}

// Main verification function
async function verifyAlerts(alertNames) {
  console.log('🔍 Alert Verification Tool');
  console.log('=' .repeat(50));
  
  // Parse alert names from arguments
  const alerts = alertNames.split(',').map(a => a.trim());
  
  console.log(`Checking alerts: ${alerts.join(', ')}`);
  console.log('');
  
  // Run all checks
  const prometheusResults = await checkPrometheusAlerts(alerts);
  const alertmanagerResults = await checkAlertmanager(alerts);
  const sloResults = await checkSLOBurnRates();
  const grafanaResults = await checkGrafanaAnnotations();
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 VERIFICATION SUMMARY');
  console.log('='.repeat(50));
  
  let allPassed = true;
  
  alerts.forEach(alertName => {
    const promResult = prometheusResults[alertName];
    const amResult = alertmanagerResults[alertName];
    
    const isFiring = promResult?.state === 'firing' || amResult?.active > 0;
    const status = isFiring ? '🔥 FIRING' : '✅ OK';
    
    console.log(`${alertName}: ${status}`);
    
    if (!isFiring && process.env.REQUIRE_FIRING === 'true') {
      allPassed = false;
    }
  });
  
  // Save detailed results
  const fs = await import('fs/promises');
  const results = {
    timestamp: new Date().toISOString(),
    alerts: {
      prometheus: prometheusResults,
      alertmanager: alertmanagerResults
    },
    slo: sloResults,
    grafana: grafanaResults.length
  };
  
  await fs.writeFile(
    'alert-verification-results.json',
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n📁 Detailed results saved to alert-verification-results.json');
  
  // Exit with error if required alerts not firing
  if (!allPassed) {
    console.error('\n❌ Some required alerts are not firing!');
    process.exit(1);
  }
  
  console.log('\n✅ Alert verification complete');
}

// Parse arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log('Usage: node verify-alerts.js --alerts <alert1,alert2,...>');
  console.log('\nOptions:');
  console.log('  --alerts    Comma-separated list of alert names to verify');
  console.log('  --env       Environment (local, staging, production)');
  console.log('  --require   Exit with error if alerts not firing');
  console.log('\nExample:');
  console.log('  node verify-alerts.js --alerts LCPBudgetFastBurn,INPBudgetFastBurn');
  process.exit(0);
}

// Get alert names from arguments
const alertsIndex = args.indexOf('--alerts');
if (alertsIndex === -1 || alertsIndex === args.length - 1) {
  console.error('Error: --alerts parameter required');
  process.exit(1);
}

const alertNames = args[alertsIndex + 1];

// Set environment if specified
if (args.includes('--env')) {
  const envIndex = args.indexOf('--env');
  const env = args[envIndex + 1];
  
  if (env === 'staging') {
    process.env.PROMETHEUS_URL = 'https://prometheus-staging.example.com';
    process.env.ALERTMANAGER_URL = 'https://alertmanager-staging.example.com';
    process.env.GRAFANA_URL = 'https://grafana-staging.example.com';
  }
}

// Set requirement flag
if (args.includes('--require')) {
  process.env.REQUIRE_FIRING = 'true';
}

// Run verification
verifyAlerts(alertNames).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});