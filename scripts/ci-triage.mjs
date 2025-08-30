#!/usr/bin/env node
/**
 * CI Triage: Categorizes CI failures by priority
 */

import { execSync } from 'node:child_process';

const CI_CATEGORIES = {
  critical: [
    'Type Check',
    'build-test',
    'test (20.x)',
    'Smart Tests',
    'Test & Lint'
  ],
  important: [
    'integration',
    'api-performance',
    'security',
    'contract'
  ],
  cosmetic: [
    'CodeQL',
    'Trivy',
    'license-check',
    'dependency-check',
    'sbom'
  ]
};

function getFailedChecks() {
  try {
    const output = execSync('gh pr checks 84 --json name,state', { encoding: 'utf8' });
    const checks = JSON.parse(output);
    return checks.filter(c => c.state === 'failure' || c.state === 'error');
  } catch (error) {
    console.error('Failed to fetch PR checks. Make sure gh CLI is configured.');
    return [];
  }
}

function categorizeChecks(failedChecks) {
  const categorized = {
    critical: [],
    important: [],
    cosmetic: [],
    unknown: []
  };
  
  for (const check of failedChecks) {
    let found = false;
    
    for (const [category, patterns] of Object.entries(CI_CATEGORIES)) {
      if (patterns.some(pattern => check.name.includes(pattern))) {
        categorized[category].push(check.name);
        found = true;
        break;
      }
    }
    
    if (!found) {
      categorized.unknown.push(check.name);
    }
  }
  
  return categorized;
}

function main() {
  console.log('🔍 CI Failure Triage\n');
  
  const failed = getFailedChecks();
  
  if (failed.length === 0) {
    console.log('✅ All CI checks passing!');
    return;
  }
  
  const categorized = categorizeChecks(failed);
  
  console.log(`Total failures: ${failed.length}\n`);
  
  if (categorized.critical.length > 0) {
    console.log('🔴 CRITICAL (must fix):');
    categorized.critical.forEach(name => console.log(`  - ${name}`));
  }
  
  if (categorized.important.length > 0) {
    console.log('\n🟡 IMPORTANT (should fix):');
    categorized.important.forEach(name => console.log(`  - ${name}`));
  }
  
  if (categorized.cosmetic.length > 0) {
    console.log('\n🟢 COSMETIC (can defer):');
    categorized.cosmetic.forEach(name => console.log(`  - ${name}`));
  }
  
  if (categorized.unknown.length > 0) {
    console.log('\n⚪ UNKNOWN (review needed):');
    categorized.unknown.forEach(name => console.log(`  - ${name}`));
  }
  
  console.log('\n📋 Recommendation:');
  if (categorized.critical.length > 0) {
    console.log('  ❌ Not ready to merge - fix critical issues first');
  } else if (categorized.important.length > 0) {
    console.log('  ⚠️  Consider fixing important issues before merge');
  } else {
    console.log('  ✅ Only cosmetic issues remain - safe to merge');
  }
}

main();