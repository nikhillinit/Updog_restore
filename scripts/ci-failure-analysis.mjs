#!/usr/bin/env node

/**
 * CI Failure Analysis Script
 * Categorizes and prioritizes CI failures by impact
 */

import { execSync } from 'child_process';
import fs from 'fs';

class CIFailureAnalyzer {
  constructor() {
    this.failures = {
      blocking: [],      // Failures that block other checks
      critical: [],      // Security, build, core tests
      important: [],     // Feature tests, performance
      minor: []         // Linting, formatting, optional checks
    };
    
    // Define dependency chains
    this.dependencies = {
      'build': ['test', 'bundle-size', 'deploy'],
      'typecheck': ['build', 'test'],
      'security-scan': ['deploy'],
      'unit-tests': ['integration-tests', 'e2e-tests']
    };
  }

  /**
   * Analyze PR checks via GitHub CLI
   */
  async analyzePRChecks(prNumber) {
    console.log(`🔍 Analyzing CI failures for PR #${prNumber || 'current'}...`);
    
    try {
      // Get check runs from GitHub
      const checkRuns = execSync(
        prNumber 
          ? `gh pr checks ${prNumber} --json name,status,conclusion`
          : `gh pr checks --json name,status,conclusion`,
        { encoding: 'utf8' }
      );
      
      const checks = JSON.parse(checkRuns || '[]');
      
      // Categorize failures
      checks.forEach(check => {
        if (check.conclusion === 'failure' || check.status === 'failure') {
          this.categorizeFailure(check.name);
        }
      });
      
      return this.generateReport();
    } catch (error) {
      console.error('Error analyzing PR checks:', error.message);
      return this.analyzeLocalFailures();
    }
  }

  /**
   * Categorize failure by impact
   */
  categorizeFailure(checkName) {
    const name = checkName.toLowerCase();
    
    // Check if this failure blocks others
    const blocksOthers = Object.keys(this.dependencies).some(key => 
      name.includes(key) && this.dependencies[key].length > 0
    );
    
    if (blocksOthers) {
      this.failures.blocking.push({
        name: checkName,
        blocks: this.dependencies[name] || []
      });
    } else if (name.includes('security') || name.includes('build') || name.includes('typecheck')) {
      this.failures.critical.push(checkName);
    } else if (name.includes('test') || name.includes('perf') || name.includes('bundle')) {
      this.failures.important.push(checkName);
    } else {
      this.failures.minor.push(checkName);
    }
  }

  /**
   * Analyze local failures as fallback
   */
  analyzeLocalFailures() {
    console.log('📊 Analyzing local CI state...');
    
    // Check TypeScript
    try {
      execSync('npm run check', { encoding: 'utf8' });
    } catch (error) {
      this.failures.blocking.push({
        name: 'TypeScript Check',
        blocks: ['build', 'tests']
      });
    }
    
    // Check tests
    try {
      execSync('npm test', { encoding: 'utf8', timeout: 30000 });
    } catch (error) {
      this.failures.critical.push('Unit Tests');
    }
    
    // Check build
    try {
      const buildOutput = execSync('npm run build 2>&1', { encoding: 'utf8' });
      const sizeMatch = buildOutput.match(/(\d+\.?\d*)\s*kB/g);
      if (sizeMatch) {
        const maxSize = Math.max(...sizeMatch.map(s => parseFloat(s)));
        if (maxSize > 390) {
          this.failures.critical.push(`Bundle Size (${maxSize}KB > 390KB limit)`);
        }
      }
    } catch (error) {
      this.failures.blocking.push({
        name: 'Build',
        blocks: ['deploy', 'bundle-size', 'e2e-tests']
      });
    }
    
    return this.generateReport();
  }

  /**
   * Generate prioritized fix report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.failures.blocking.length + 
               this.failures.critical.length + 
               this.failures.important.length + 
               this.failures.minor.length,
        blocking: this.failures.blocking.length,
        critical: this.failures.critical.length,
        important: this.failures.important.length,
        minor: this.failures.minor.length
      },
      prioritizedFixes: [],
      failures: this.failures
    };
    
    // Generate fix priority order
    if (this.failures.blocking.length > 0) {
      report.prioritizedFixes.push({
        priority: 1,
        category: 'BLOCKING - Fix First',
        items: this.failures.blocking,
        reason: 'These failures prevent other checks from running'
      });
    }
    
    if (this.failures.critical.length > 0) {
      report.prioritizedFixes.push({
        priority: 2,
        category: 'CRITICAL - Fix Second',
        items: this.failures.critical,
        reason: 'Core functionality and security'
      });
    }
    
    if (this.failures.important.length > 0) {
      report.prioritizedFixes.push({
        priority: 3,
        category: 'IMPORTANT - Fix Third',
        items: this.failures.important,
        reason: 'Feature functionality and performance'
      });
    }
    
    if (this.failures.minor.length > 0) {
      report.prioritizedFixes.push({
        priority: 4,
        category: 'MINOR - Fix Last',
        items: this.failures.minor,
        reason: 'Code quality and optional checks'
      });
    }
    
    // Save report
    fs.writeFileSync('ci-failure-analysis.json', JSON.stringify(report, null, 2));
    
    // Print summary
    console.log('\n📊 CI Failure Analysis Report');
    console.log('==============================');
    console.log(`Total Failures: ${report.summary.total}`);
    console.log(`  🚨 Blocking: ${report.summary.blocking}`);
    console.log(`  ❌ Critical: ${report.summary.critical}`);
    console.log(`  ⚠️  Important: ${report.summary.important}`);
    console.log(`  ℹ️  Minor: ${report.summary.minor}`);
    
    console.log('\n🎯 Prioritized Fix Order:');
    report.prioritizedFixes.forEach(category => {
      console.log(`\n${category.priority}. ${category.category}`);
      console.log(`   Reason: ${category.reason}`);
      category.items.forEach(item => {
        if (typeof item === 'object') {
          console.log(`   - ${item.name} (blocks: ${item.blocks.join(', ')})`);
        } else {
          console.log(`   - ${item}`);
        }
      });
    });
    
    console.log('\n✅ Report saved to: ci-failure-analysis.json');
    
    return report;
  }
}

// Run the analysis
const analyzer = new CIFailureAnalyzer();
const prNumber = process.argv[2];

analyzer.analyzePRChecks(prNumber)
  .then(report => {
    // Exit with error if blocking failures exist
    if (report.summary.blocking > 0) {
      console.log('\n⚠️  Fix blocking failures first to unblock other work!');
      process.exit(1);
    }
  })
  .catch(console.error);