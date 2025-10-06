#!/usr/bin/env node

/**
 * Feature Flags Guard - Analyzes flag changes and enforces governance
 * Requires approval labels for sensitive changes
 */

import fs from 'fs/promises';
import path from 'path';
import {
  assertValidGitRef,
  safeGitDiff,
  safeGitDiffFiles,
  safeGitDiffFile,
} from './lib/git-security.mjs';

// Sensitive flag patterns that require approval
const SENSITIVE_FLAGS = [
  /payment/i,
  /billing/i,
  /auth/i,
  /security/i,
  /admin/i,
  /delete/i,
  /production/i,
  /rollout/i,
  /kill.*switch/i,
  /emergency/i
];

// Get diff between branches (SAFE - uses validated refs)
function getDiff(baseBranch = 'main') {
  try {
    // Validate branch name before using
    const validBranch = assertValidGitRef(baseBranch);
    const files = safeGitDiffFiles(validBranch, 'HEAD');
    return files;
  } catch (error) {
    console.error('Error getting diff:', error.message);
    return [];
  }
}

// Get file changes (SAFE - uses validated refs and file paths)
function getFileChanges(file, baseBranch = 'main') {
  try {
    const validBranch = assertValidGitRef(baseBranch);
    const diff = safeGitDiffFile(validBranch, 'HEAD', file);
    return diff;
  } catch (error) {
    return '';
  }
}

// Parse flag changes from diff
function parseFlagChanges(diff) {
  const changes = {
    added: [],
    removed: [],
    modified: [],
    exposureChanges: [],
    audienceChanges: [],
    killSwitchChanges: []
  };
  
  const lines = diff.split('\n');
  let currentFlag = null;
  
  lines.forEach(line => {
    // New flag added
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const flagMatch = line.match(/["']([^"']+)["']\s*:\s*\{/);
      if (flagMatch) {
        currentFlag = flagMatch[1];
        changes.added.push(currentFlag);
      }
      
      // Check for exposure changes
      if (currentFlag && line.includes('enabled:') || line.includes('exposure:')) {
        const wasEnabled = line.includes('false') && line.includes('-');
        const nowEnabled = line.includes('true') && line.includes('+');
        
        if (wasEnabled && nowEnabled) {
          changes.exposureChanges.push({
            flag: currentFlag,
            change: 'enabled',
            from: false,
            to: true
          });
        }
      }
      
      // Check for audience changes
      if (currentFlag && (line.includes('percentage:') || line.includes('audience:'))) {
        const percentMatch = line.match(/percentage:\s*(\d+)/);
        if (percentMatch) {
          const percent = parseInt(percentMatch[1]);
          const isIncrease = line.startsWith('+');
          
          if (Math.abs(percent) > 10) {
            changes.audienceChanges.push({
              flag: currentFlag,
              change: isIncrease ? 'increase' : 'decrease',
              amount: percent
            });
          }
        }
      }
      
      // Check for kill switch removal
      if (line.includes('killSwitch:') || line.includes('emergency:')) {
        if (line.startsWith('-') && line.includes('true')) {
          changes.killSwitchChanges.push({
            flag: currentFlag,
            change: 'removed',
            critical: true
          });
        }
      }
    }
    
    // Flag removed
    if (line.startsWith('-') && !line.startsWith('---')) {
      const flagMatch = line.match(/["']([^"']+)["']\s*:\s*\{/);
      if (flagMatch) {
        changes.removed.push(flagMatch[1]);
      }
    }
  });
  
  return changes;
}

// Analyze flag sensitivity
function analyzeSensitivity(flagName, changes) {
  const issues = [];
  
  // Check if flag name matches sensitive patterns
  const isSensitive = SENSITIVE_FLAGS.some(pattern => pattern.test(flagName));
  
  if (isSensitive) {
    issues.push({
      type: 'sensitive_flag',
      flag: flagName,
      severity: 'high',
      message: `Flag '${flagName}' matches sensitive pattern`
    });
  }
  
  // Check exposure changes
  const exposureChange = changes.exposureChanges.find(c => c.flag === flagName);
  if (exposureChange && exposureChange.to === true) {
    issues.push({
      type: 'exposure_enabled',
      flag: flagName,
      severity: 'medium',
      message: `Flag '${flagName}' is being enabled/exposed`
    });
  }
  
  // Check audience changes
  const audienceChange = changes.audienceChanges.find(c => c.flag === flagName);
  if (audienceChange && audienceChange.amount > 10) {
    issues.push({
      type: 'audience_change',
      flag: flagName,
      severity: 'medium',
      message: `Flag '${flagName}' audience changed by ${audienceChange.amount}%`
    });
  }
  
  // Check kill switch removal
  const killSwitchChange = changes.killSwitchChanges.find(c => c.flag === flagName);
  if (killSwitchChange && killSwitchChange.change === 'removed') {
    issues.push({
      type: 'kill_switch_removed',
      flag: flagName,
      severity: 'critical',
      message: `Kill switch removed from flag '${flagName}'`
    });
  }
  
  return issues;
}

// Check if PR has required labels
async function checkPRLabels() {
  try {
    // Get PR labels from GitHub context
    const prLabelsJson = process.env.PR_LABELS || '[]';
    const labels = JSON.parse(prLabelsJson);
    
    return {
      hasProductSignoff: labels.includes('product-signoff'),
      hasFlagsApproval: labels.includes('approved:flags-change'),
      hasEmergencyOverride: labels.includes('emergency-override')
    };
  } catch (error) {
    // If not in PR context, assume no labels
    return {
      hasProductSignoff: false,
      hasFlagsApproval: false,
      hasEmergencyOverride: false
    };
  }
}

// Generate guard report
function generateReport(changes, issues, labels) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      flagsAdded: changes.added.length,
      flagsRemoved: changes.removed.length,
      flagsModified: changes.modified.length,
      exposureChanges: changes.exposureChanges.length,
      audienceChanges: changes.audienceChanges.length,
      killSwitchChanges: changes.killSwitchChanges.length
    },
    issues: issues,
    labels: labels,
    requiresApproval: false,
    blocked: false,
    details: []
  };
  
  // Check if approval required
  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const highIssues = issues.filter(i => i.severity === 'high');
  const mediumIssues = issues.filter(i => i.severity === 'medium');
  
  if (criticalIssues.length > 0) {
    report.requiresApproval = true;
    report.blocked = !labels.hasEmergencyOverride;
    report.details.push('❌ CRITICAL: Kill switch or emergency flag changes detected');
  }
  
  if (highIssues.length > 0) {
    report.requiresApproval = true;
    report.blocked = !labels.hasFlagsApproval;
    report.details.push('⚠️  HIGH: Sensitive flag changes detected');
  }
  
  if (mediumIssues.length > 0 && !labels.hasProductSignoff) {
    report.requiresApproval = true;
    report.blocked = true;
    report.details.push('⚠️  MEDIUM: Flag exposure/audience changes need product signoff');
  }
  
  return report;
}

// Main guard function
async function guardFlags() {
  console.log('🚨 Feature Flags Guard');
  console.log('=' .repeat(50));
  
  // Get changed files
  const changedFiles = getDiff();
  const flagFiles = changedFiles.filter(f => 
    f.includes('flags') || 
    f.includes('feature') || 
    f.endsWith('.flags.json') ||
    f.endsWith('.flags.ts') ||
    f.endsWith('.flags.js')
  );
  
  if (flagFiles.length === 0) {
    console.log('✅ No flag files changed');
    return 0;
  }
  
  console.log(`\n📁 Flag files changed: ${flagFiles.length}`);
  flagFiles.forEach(f => console.log(`  - ${f}`));
  
  // Analyze each file
  let allChanges = {
    added: [],
    removed: [],
    modified: [],
    exposureChanges: [],
    audienceChanges: [],
    killSwitchChanges: []
  };
  
  let allIssues = [];
  
  for (const file of flagFiles) {
    console.log(`\n🔍 Analyzing ${file}...`);
    
    const diff = getFileChanges(file);
    const changes = parseFlagChanges(diff);
    
    // Merge changes
    Object.keys(changes).forEach(key => {
      if (Array.isArray(changes[key])) {
        allChanges[key].push(...changes[key]);
      }
    });
    
    // Analyze each flag
    const flagsToAnalyze = [...new Set([
      ...changes.added,
      ...changes.modified,
      ...changes.exposureChanges.map(c => c.flag),
      ...changes.audienceChanges.map(c => c.flag),
      ...changes.killSwitchChanges.map(c => c.flag)
    ])];
    
    flagsToAnalyze.forEach(flag => {
      const issues = analyzeSensitivity(flag, changes);
      allIssues.push(...issues);
    });
  }
  
  // Check PR labels
  const labels = await checkPRLabels();
  
  // Generate report
  const report = generateReport(allChanges, allIssues, labels);
  
  // Display results
  console.log('\n' + '=' .repeat(50));
  console.log('📊 GUARD REPORT');
  console.log('=' .repeat(50));
  
  console.log('\n📈 Changes Summary:');
  Object.entries(report.summary).forEach(([key, value]) => {
    if (value > 0) {
      console.log(`  ${key}: ${value}`);
    }
  });
  
  if (allIssues.length > 0) {
    console.log('\n⚠️  Issues Found:');
    allIssues.forEach(issue => {
      const icon = issue.severity === 'critical' ? '❌' : 
                   issue.severity === 'high' ? '🔴' : '🟡';
      console.log(`  ${icon} [${issue.severity.toUpperCase()}] ${issue.message}`);
    });
  }
  
  console.log('\n🏷️  PR Labels:');
  console.log(`  Product Signoff: ${labels.hasProductSignoff ? '✅' : '❌'}`);
  console.log(`  Flags Approval: ${labels.hasFlagsApproval ? '✅' : '❌'}`);
  console.log(`  Emergency Override: ${labels.hasEmergencyOverride ? '✅' : '❌'}`);
  
  // Save report
  await fs.writeFile(
    'flags-guard-report.json',
    JSON.stringify(report, null, 2)
  );
  
  console.log('\n📁 Detailed report saved to flags-guard-report.json');
  
  // Final verdict
  console.log('\n' + '=' .repeat(50));
  if (report.blocked) {
    console.error('❌ FLAG CHANGES BLOCKED');
    console.error('\nRequired labels missing:');
    
    if (report.details.length > 0) {
      report.details.forEach(detail => console.error(`  ${detail}`));
    }
    
    console.error('\nTo proceed, add the following labels to your PR:');
    if (!labels.hasProductSignoff) console.error('  - product-signoff');
    if (!labels.hasFlagsApproval) console.error('  - approved:flags-change');
    
    return 1;
  } else {
    console.log('✅ FLAG CHANGES APPROVED');
    if (report.requiresApproval) {
      console.log('   (Approval labels present)');
    }
    return 0;
  }
}

// Run guard
guardFlags().then(exitCode => {
  process.exit(exitCode);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});