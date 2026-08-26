#!/usr/bin/env node
/**
 * Type Safety Metrics Tracker
 * Monitors and reports on TypeScript type safety improvements
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

class TypeSafetyMetrics {
  constructor() {
    this.metricsDir = path.join(process.cwd(), '.metrics');
    this.metricsFile = path.join(this.metricsDir, 'type-safety.json');
    this.historyFile = path.join(this.metricsDir, 'type-safety-history.json');
    
    // Ensure metrics directory exists
    if (!existsSync(this.metricsDir)) {
      mkdirSync(this.metricsDir, { recursive: true });
    }
    
    // Load historical data
    this.history = this.loadHistory();
  }

  /**
   * Collect all type safety metrics
   */
  async collect() {
    console.log('📊 Collecting type safety metrics...\n');
    
    const metrics = {
      timestamp: new Date().toISOString(),
      anyUsage: await this.countAnyUsage(),
      typeErrors: await this.countTypeErrors(),
      eslintViolations: await this.countEslintViolations(),
      typeAssertions: await this.countTypeAssertions(),
      unsafeOperations: await this.countUnsafeOperations(),
      typeCoverage: await this.calculateTypeCoverage(),
      bmadSuggestions: await this.countBmadSuggestions(),
      improvementRate: this.calculateImprovementRate()
    };
    
    // Save metrics
    this.saveMetrics(metrics);
    
    // Generate report
    this.generateReport(metrics);
    
    return metrics;
  }

  /**
   * Count explicit 'any' usage
   */
  async countAnyUsage() {
    const files = await glob('**/*.{ts,tsx}', {
      ignore: ['node_modules/**', 'dist/**', '*.d.ts', '*.test.ts']
    });
    
    let count = 0;
    let locations = [];
    
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        const matches = line.match(/:\s*any\b/g);
        if (matches) {
          count += matches.length;
          locations.push({
            file: file.replace(process.cwd(), '.'),
            line: index + 1,
            snippet: line.trim().substring(0, 80)
          });
        }
      });
    }
    
    return { count, locations: locations.slice(0, 10) }; // Top 10 locations
  }

  /**
   * Count TypeScript compilation errors
   */
  async countTypeErrors() {
    try {
      // Run TypeScript compiler in check mode
      execSync('npx tsc --noEmit --pretty false 2>&1', { encoding: 'utf8' });
      return { count: 0, errors: [] };
    } catch (error) {
      const output = error.stdout || error.message;
      const errorLines = output.split('\n').filter(line => line.includes('error TS'));
      
      const errors = errorLines.slice(0, 10).map(line => {
        const match = line.match(/(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/);
        if (match) {
          return {
            file: match[1],
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            code: match[4],
            message: match[5]
          };
        }
        return null;
      }).filter(Boolean);
      
      return {
        count: errorLines.length,
        errors
      };
    }
  }

  /**
   * Count ESLint type safety violations
   */
  async countEslintViolations() {
    try {
      const output = execSync('npx eslint . --format json', { encoding: 'utf8' });
      const results = JSON.parse(output);
      
      const typeRules = [
        '@typescript-eslint/no-explicit-any',
        '@typescript-eslint/no-unsafe-assignment',
        '@typescript-eslint/no-unsafe-member-access',
        '@typescript-eslint/no-unsafe-call',
        '@typescript-eslint/no-unsafe-return'
      ];
      
      let violations = 0;
      let byRule = {};
      
      results.forEach(file => {
        file.messages.forEach(message => {
          if (typeRules.includes(message.ruleId)) {
            violations++;
            byRule[message.ruleId] = (byRule[message.ruleId] || 0) + 1;
          }
        });
      });
      
      return {
        count: violations,
        byRule,
        topViolations: Object.entries(byRule)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([rule, count]) => ({ rule, count }))
      };
    } catch {
      return { count: 0, byRule: {}, topViolations: [] };
    }
  }

  /**
   * Count type assertions (as X)
   */
  async countTypeAssertions() {
    const files = await glob('**/*.{ts,tsx}', {
      ignore: ['node_modules/**', 'dist/**', '*.d.ts']
    });
    
    let asUnknown = 0;
    let asAny = 0;
    let asOther = 0;
    
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      
      asUnknown += (content.match(/as\s+unknown/g) || []).length;
      asAny += (content.match(/as\s+any/g) || []).length;
      asOther += (content.match(/as\s+(?!unknown|any)\w+/g) || []).length;
    }
    
    return {
      total: asUnknown + asAny + asOther,
      asUnknown,
      asAny,
      asOther
    };
  }

  /**
   * Count unsafe operations (@ts-ignore, @ts-nocheck)
   */
  async countUnsafeOperations() {
    const files = await glob('**/*.{ts,tsx}', {
      ignore: ['node_modules/**', 'dist/**']
    });
    
    let tsIgnore = 0;
    let tsNocheck = 0;
    let tsExpectError = 0;
    
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      
      tsIgnore += (content.match(/@ts-ignore/g) || []).length;
      tsNocheck += (content.match(/@ts-nocheck/g) || []).length;
      tsExpectError += (content.match(/@ts-expect-error/g) || []).length;
    }
    
    return {
      total: tsIgnore + tsNocheck + tsExpectError,
      tsIgnore,
      tsNocheck,
      tsExpectError
    };
  }

  /**
   * Calculate type coverage percentage
   */
  async calculateTypeCoverage() {
    const files = await glob('**/*.{ts,tsx}', {
      ignore: ['node_modules/**', 'dist/**', '*.d.ts', '*.test.ts']
    });
    
    let totalLines = 0;
    let typedLines = 0;
    
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach(line => {
        if (line.trim() && !line.trim().startsWith('//')) {
          totalLines++;
          
          // Check if line has type annotations
          if (line.includes(':') && !line.includes('://')) {
            // Rough heuristic: has type annotation
            typedLines++;
          }
        }
      });
    }
    
    const coverage = totalLines > 0 ? (typedLines / totalLines) * 100 : 0;
    
    return {
      percentage: parseFloat(coverage.toFixed(2)),
      typedLines,
      totalLines
    };
  }

  /**
   * Count BMAD agent suggestions
   */
  async countBmadSuggestions() {
    // Check if BMAD agent has been run
    const bmadLogFile = path.join(process.cwd(), '.bmad', 'type-safety.log');
    
    if (existsSync(bmadLogFile)) {
      const content = readFileSync(bmadLogFile, 'utf8');
      const suggestions = content.match(/Suggestion:/g) || [];
      const accepted = content.match(/Accepted:/g) || [];
      
      return {
        total: suggestions.length,
        accepted: accepted.length,
        acceptanceRate: suggestions.length > 0 
          ? parseFloat((accepted.length / suggestions.length * 100).toFixed(2))
          : 0
      };
    }
    
    return {
      total: 0,
      accepted: 0,
      acceptanceRate: 0
    };
  }

  /**
   * Calculate improvement rate vs last measurement
   */
  calculateImprovementRate() {
    if (this.history.length < 2) {
      return { message: 'Insufficient history for comparison' };
    }
    
    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];
    
    if (!current || !previous) {
      return { message: 'No previous data' };
    }
    
    const anyReduction = previous.anyUsage?.count 
      ? ((previous.anyUsage.count - (current.anyUsage?.count || 0)) / previous.anyUsage.count * 100)
      : 0;
    
    const errorReduction = previous.typeErrors?.count
      ? ((previous.typeErrors.count - (current.typeErrors?.count || 0)) / previous.typeErrors.count * 100)
      : 0;
    
    const coverageIncrease = (current.typeCoverage?.percentage || 0) - (previous.typeCoverage?.percentage || 0);
    
    return {
      anyReduction: parseFloat(anyReduction.toFixed(2)),
      errorReduction: parseFloat(errorReduction.toFixed(2)),
      coverageIncrease: parseFloat(coverageIncrease.toFixed(2)),
      trend: anyReduction > 0 || errorReduction > 0 || coverageIncrease > 0 ? '📈' : '📉'
    };
  }

  /**
   * Load historical metrics
   */
  loadHistory() {
    if (existsSync(this.historyFile)) {
      const content = readFileSync(this.historyFile, 'utf8');
      return JSON.parse(content);
    }
    return [];
  }

  /**
   * Save metrics
   */
  saveMetrics(metrics) {
    // Save current metrics
    writeFileSync(this.metricsFile, JSON.stringify(metrics, null, 2));
    
    // Update history
    this.history.push(metrics);
    
    // Keep last 30 measurements
    if (this.history.length > 30) {
      this.history = this.history.slice(-30);
    }
    
    writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
  }

  /**
   * Generate human-readable report
   */
  generateReport(metrics) {
    console.log('\n' + '='.repeat(60));
    console.log('                TYPE SAFETY METRICS REPORT');
    console.log('='.repeat(60));
    console.log(`📅 Timestamp: ${metrics.timestamp}`);
    console.log('');
    
    // Any usage
    console.log('🚨 Explicit "any" Usage');
    console.log(`   Total: ${metrics.anyUsage.count}`);
    if (metrics.anyUsage.locations.length > 0) {
      console.log('   Top locations:');
      metrics.anyUsage.locations.slice(0, 3).forEach(loc => {
        console.log(`   - ${loc.file}:${loc.line}`);
        console.log(`     ${loc.snippet}`);
      });
    }
    console.log('');
    
    // Type errors
    console.log('❌ TypeScript Errors');
    console.log(`   Total: ${metrics.typeErrors.count}`);
    if (metrics.typeErrors.errors.length > 0) {
      console.log('   Sample errors:');
      metrics.typeErrors.errors.slice(0, 3).forEach(err => {
        console.log(`   - ${err.code}: ${err.message}`);
      });
    }
    console.log('');
    
    // ESLint violations
    console.log('⚠️  ESLint Type Safety Violations');
    console.log(`   Total: ${metrics.eslintViolations.count}`);
    if (metrics.eslintViolations.topViolations.length > 0) {
      console.log('   By rule:');
      metrics.eslintViolations.topViolations.forEach(v => {
        console.log(`   - ${v.rule}: ${v.count}`);
      });
    }
    console.log('');
    
    // Type assertions
    console.log('🔄 Type Assertions');
    console.log(`   Total: ${metrics.typeAssertions.total}`);
    console.log(`   - as unknown: ${metrics.typeAssertions.asUnknown}`);
    console.log(`   - as any: ${metrics.typeAssertions.asAny}`);
    console.log(`   - as <Type>: ${metrics.typeAssertions.asOther}`);
    console.log('');
    
    // Unsafe operations
    console.log('⚠️  Unsafe Operations');
    console.log(`   Total: ${metrics.unsafeOperations.total}`);
    console.log(`   - @ts-ignore: ${metrics.unsafeOperations.tsIgnore}`);
    console.log(`   - @ts-nocheck: ${metrics.unsafeOperations.tsNocheck}`);
    console.log(`   - @ts-expect-error: ${metrics.unsafeOperations.tsExpectError}`);
    console.log('');
    
    // Type coverage
    console.log('📊 Type Coverage');
    console.log(`   Coverage: ${metrics.typeCoverage.percentage}%`);
    console.log(`   Typed lines: ${metrics.typeCoverage.typedLines}`);
    console.log(`   Total lines: ${metrics.typeCoverage.totalLines}`);
    console.log('');
    
    // BMAD suggestions
    if (metrics.bmadSuggestions.total > 0) {
      console.log('🤖 BMAD Agent');
      console.log(`   Suggestions: ${metrics.bmadSuggestions.total}`);
      console.log(`   Accepted: ${metrics.bmadSuggestions.accepted}`);
      console.log(`   Acceptance rate: ${metrics.bmadSuggestions.acceptanceRate}%`);
      console.log('');
    }
    
    // Improvement trend
    if (metrics.improvementRate.trend) {
      console.log(`${metrics.improvementRate.trend} Improvement Trend`);
      console.log(`   Any reduction: ${metrics.improvementRate.anyReduction}%`);
      console.log(`   Error reduction: ${metrics.improvementRate.errorReduction}%`);
      console.log(`   Coverage increase: ${metrics.improvementRate.coverageIncrease}%`);
    } else {
      console.log(metrics.improvementRate.message);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Save report to file
    const reportFile = path.join(this.metricsDir, `report-${Date.now()}.txt`);
    const reportContent = this.formatReportForFile(metrics);
    writeFileSync(reportFile, reportContent);
    console.log(`\n📄 Full report saved to: ${reportFile}`);
  }

  /**
   * Format report for file output
   */
  formatReportForFile(metrics) {
    return `TYPE SAFETY METRICS REPORT
Generated: ${metrics.timestamp}

SUMMARY
=======
Explicit "any" usage: ${metrics.anyUsage.count}
TypeScript errors: ${metrics.typeErrors.count}
ESLint violations: ${metrics.eslintViolations.count}
Type assertions: ${metrics.typeAssertions.total}
Unsafe operations: ${metrics.unsafeOperations.total}
Type coverage: ${metrics.typeCoverage.percentage}%

DETAILS
=======
${JSON.stringify(metrics, null, 2)}

RECOMMENDATIONS
==============
${this.generateRecommendations(metrics).join('\n')}
`;
  }

  /**
   * Generate recommendations based on metrics
   */
  generateRecommendations(metrics) {
    const recommendations = [];
    
    if (metrics.anyUsage.count > 50) {
      recommendations.push('• HIGH PRIORITY: Run BMAD type safety agent to reduce "any" usage');
    }
    
    if (metrics.typeErrors.count > 0) {
      recommendations.push('• Fix TypeScript compilation errors before next deployment');
    }
    
    if (metrics.typeCoverage.percentage < 70) {
      recommendations.push('• Increase type coverage by adding type annotations to function parameters');
    }
    
    if (metrics.typeAssertions.asAny > 0) {
      recommendations.push('• Replace "as any" with "as unknown" or proper type assertions');
    }
    
    if (metrics.unsafeOperations.total > 10) {
      recommendations.push('• Review and remove @ts-ignore directives');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ Type safety metrics look good! Keep up the good work.');
    }
    
    return recommendations;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const metrics = new TypeSafetyMetrics();
  
  metrics.collect()
    .then(() => {
      console.log('\n✅ Metrics collection complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error collecting metrics:', error);
      process.exit(1);
    });
}

export { TypeSafetyMetrics };