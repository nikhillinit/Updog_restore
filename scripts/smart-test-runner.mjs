#!/usr/bin/env node
/**
 * Smart Test Runner
 *
 * Combines intelligent test optimization with automated repair for maximum
 * solo developer productivity. Features:
 * - Automatic failure detection and repair
 * - Smart test prioritization
 * - Performance-aware execution
 * - Comprehensive reporting
 */

import { spawn, execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

class SmartTestRunner {
  constructor() {
    this.cacheDir = join(process.cwd(), '.test-cache');
    this.ensureDirectoryExists(this.cacheDir);

    this.config = {
      maxRetries: 2,
      enableAutoRepair: true,
      failFast: false,
      showProgress: true,
      generateReport: true
    };
  }

  async run(options = {}) {
    console.log('🧠 Smart Test Runner Starting...');

    const startTime = Date.now();
    let testResults = null;
    let repairAttempted = false;

    try {
      // Phase 1: Initial test run with smart selection
      console.log('\n📋 Phase 1: Smart Test Selection');
      const selectedTests = await this.selectTests(options);

      if (selectedTests.length === 0) {
        console.log('✅ No tests need to be run');
        return { success: true, tests: 0, duration: 0 };
      }

      console.log(`   Selected ${selectedTests.length} tests for execution`);

      // Phase 2: Execute tests with optimization
      console.log('\n🏃 Phase 2: Optimized Test Execution');
      testResults = await this.executeTests(selectedTests, options);

      // Phase 3: Auto-repair if failures detected
      if (testResults.failed > 0 && this.config.enableAutoRepair && !repairAttempted) {
        console.log('\n🔧 Phase 3: Automatic Repair');
        repairAttempted = true;

        const repairResults = await this.attemptRepairs(testResults.failures);

        if (repairResults.fixesApplied > 0) {
          console.log(`   ${repairResults.fixesApplied} fixes applied, re-running tests...`);

          // Re-run only the previously failed tests
          const failedTests = testResults.failures.map(f => f.file);
          testResults = await this.executeTests(failedTests, { ...options, retryRun: true });
        }
      }

      // Phase 4: Generate insights and report
      console.log('\n📊 Phase 4: Analysis & Reporting');
      const insights = this.generateInsights(testResults, selectedTests);

      if (this.config.generateReport) {
        this.generateReport(testResults, insights, Date.now() - startTime);
      }

      // Summary
      const duration = Date.now() - startTime;
      console.log(`\n🎯 Smart Test Run Complete!`);
      console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
      console.log(`   Results: ${testResults.passed}/${testResults.total} passed`);

      if (testResults.failed > 0) {
        console.log(`   Failures: ${testResults.failed} (see report for details)`);
      }

      return {
        success: testResults.failed === 0,
        tests: testResults.total,
        passed: testResults.passed,
        failed: testResults.failed,
        duration: duration,
        repairAttempted
      };

    } catch (error) {
      console.error('❌ Smart test runner failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async selectTests(options) {
    // Use existing smart test logic but enhanced
    if (options.pattern) {
      return this.findTestsByPattern(options.pattern);
    }

    if (options.onlyFailed) {
      return this.getRecentlyFailedTests();
    }

    if (options.onlyChanged) {
      return this.getTestsForChangedFiles();
    }

    // Smart selection based on git changes
    const changedFiles = this.getChangedFiles();

    if (changedFiles.length === 0) {
      console.log('   No changes detected, running smoke tests');
      return this.getSmokeTests();
    }

    if (changedFiles.length > 50) {
      console.log('   Large changeset detected, running full suite');
      return this.getAllTests();
    }

    // Intelligent mapping of changed files to relevant tests
    return this.mapChangesToTests(changedFiles);
  }

  async executeTests(testFiles, options = {}) {
    if (testFiles.length === 0) {
      return { total: 0, passed: 0, failed: 0, failures: [] };
    }

    // Run tests with intelligent batching
    const batchSize = Math.min(5, Math.max(1, Math.floor(testFiles.length / 4)));
    const batches = this.createBatches(testFiles, batchSize);

    let totalPassed = 0;
    let totalFailed = 0;
    let allFailures = [];

    console.log(`   Running ${testFiles.length} tests in ${batches.length} batches`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`   📦 Batch ${i + 1}/${batches.length}: ${batch.length} tests`);

      const batchResult = await this.runTestBatch(batch);

      totalPassed += batchResult.passed;
      totalFailed += batchResult.failed;
      allFailures.push(...batchResult.failures);

      // Show progress
      console.log(`      ✅ ${batchResult.passed} passed, ❌ ${batchResult.failed} failed`);

      // Fail fast if enabled and we have failures
      if (this.config.failFast && batchResult.failed > 0) {
        console.log('   💥 Fail-fast enabled, stopping execution');
        break;
      }
    }

    return {
      total: totalPassed + totalFailed,
      passed: totalPassed,
      failed: totalFailed,
      failures: allFailures
    };
  }

  async runTestBatch(testFiles) {
    return new Promise((resolve) => {
      // Build vitest command for this batch
      const args = ['vitest', 'run', '--reporter=json', ...testFiles];
      const process = spawn('npx', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        const result = this.parseTestOutput(stdout, stderr, testFiles);
        resolve(result);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        process.kill();
        resolve({
          passed: 0,
          failed: testFiles.length,
          failures: testFiles.map(file => ({
            file,
            error: 'Test timeout'
          }))
        });
      }, 30000);
    });
  }

  parseTestOutput(stdout, stderr, testFiles) {
    let passed = 0;
    let failed = 0;
    const failures = [];

    try {
      // Try to parse JSON output first
      const jsonMatch = stdout.match(/\{.*"testResults".*\}/s);
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);

        if (results.testResults) {
          for (const result of results.testResults) {
            if (result.status === 'passed') {
              passed++;
            } else {
              failed++;
              failures.push({
                file: result.name,
                error: result.message || 'Test failed'
              });
            }
          }
        }
      }
    } catch (e) {
      // Fallback to text parsing
      const output = stdout + stderr;

      // Count passed/failed from output
      const passedMatch = output.match(/(\d+) passed/);
      const failedMatch = output.match(/(\d+) failed/);

      passed = passedMatch ? parseInt(passedMatch[1]) : 0;
      failed = failedMatch ? parseInt(failedMatch[1]) : 0;

      // Extract failure details
      const errorLines = output.split('\n');
      let currentFile = '';

      for (const line of errorLines) {
        const fileMatch = line.match(/FAIL\s+(.+\.test\.ts)/);
        if (fileMatch) {
          currentFile = fileMatch[1];
        }

        if (line.includes('Error:') && currentFile) {
          failures.push({
            file: currentFile,
            error: line.trim()
          });
        }
      }
    }

    return { passed, failed, failures };
  }

  async attemptRepairs(failures) {
    console.log(`   🔧 Analyzing ${failures.length} failures for auto-repair...`);

    let fixesApplied = 0;
    const processedFiles = new Set();

    for (const failure of failures) {
      if (processedFiles.has(failure.file)) {
        continue;
      }

      const repairResult = await this.repairFailure(failure);
      if (repairResult.success) {
        fixesApplied++;
        processedFiles.add(failure.file);
        console.log(`      ✅ Fixed: ${repairResult.description}`);
      }
    }

    return { fixesApplied };
  }

  async repairFailure(failure) {
    // Common repair patterns
    const repairs = [
      {
        pattern: /Cannot access '(\w+)' before initialization/,
        fix: () => this.fixMockInitialization(failure)
      },
      {
        pattern: /"(\[object Object\])" is not valid JSON/,
        fix: () => this.fixJSONSerialization(failure)
      },
      {
        pattern: /Invalid enum value '(\w+)' for column '(\w+)'/,
        fix: () => this.fixEnumValidation(failure)
      }
    ];

    for (const repair of repairs) {
      if (failure.error.match(repair.pattern)) {
        try {
          return await repair.fix();
        } catch (error) {
          console.log(`      ❌ Repair failed: ${error.message}`);
        }
      }
    }

    return { success: false, description: 'No repair available' };
  }

  async fixMockInitialization(failure) {
    if (!existsSync(failure.file)) {
      return { success: false, description: 'File not found' };
    }

    const content = readFileSync(failure.file, 'utf8');
    let modified = false;

    // Simple pattern replacement for common mock issues
    let newContent = content;

    // Fix "Cannot access 'mockDb' before initialization"
    if (content.includes('const mockDb = createMockDb()')) {
      newContent = newContent.replace(
        'const mockDb = createMockDb()',
        'const mockDb = () => createMockDb()'
      );
      modified = true;
    }

    // Fix vi.mock patterns
    const mockPattern = /vi\.mock\(['"]([^'"]+)['"],\s*\(\)\s*=>\s*(\w+)\)/g;
    if (mockPattern.test(content)) {
      newContent = newContent.replace(mockPattern,
        `vi.mock('$1', () => ({ default: () => $2() }))`
      );
      modified = true;
    }

    if (modified) {
      writeFileSync(failure.file, newContent);
      return { success: true, description: 'Fixed mock initialization' };
    }

    return { success: false, description: 'No patterns matched' };
  }

  async fixJSONSerialization(failure) {
    if (!existsSync(failure.file)) {
      return { success: false, description: 'File not found' };
    }

    const content = readFileSync(failure.file, 'utf8');
    let modified = false;

    // Find object insertions that should be stringified
    let newContent = content.replace(
      /(\w+):\s*(\w+Object|\{[^}]+\})/g,
      (match, property, value) => {
        if (!match.includes('JSON.stringify')) {
          modified = true;
          return `${property}: JSON.stringify(${value})`;
        }
        return match;
      }
    );

    if (modified) {
      writeFileSync(failure.file, newContent);
      return { success: true, description: 'Fixed JSON serialization' };
    }

    return { success: false, description: 'No patterns matched' };
  }

  async fixEnumValidation(failure) {
    const enumMappings = {
      snapshot_type: { 'manual': 'adhoc', 'auto': 'milestone' },
      alert_type: { 'info': 'information', 'warn': 'warning' }
    };

    const match = failure.error.match(/Invalid enum value '(\w+)' for column '(\w+)'/);
    if (!match) return { success: false, description: 'Could not parse enum error' };

    const [, value, column] = match;
    const mapping = enumMappings[column];

    if (!mapping || !mapping[value]) {
      return { success: false, description: 'No mapping available' };
    }

    const content = readFileSync(failure.file, 'utf8');
    const newContent = content.replace(
      new RegExp(`['"]${value}['"]`, 'g'),
      `'${mapping[value]}'`
    );

    if (content !== newContent) {
      writeFileSync(failure.file, newContent);
      return { success: true, description: `Fixed enum value: ${value} → ${mapping[value]}` };
    }

    return { success: false, description: 'No replacements made' };
  }

  generateInsights(testResults, selectedTests) {
    const insights = {
      efficiency: (testResults.passed / testResults.total * 100).toFixed(1),
      coverage: selectedTests.length,
      topFailures: this.groupFailuresByPattern(testResults.failures),
      recommendations: []
    };

    // Generate recommendations
    if (testResults.failed > 5) {
      insights.recommendations.push('Consider breaking down large test files');
    }

    if (testResults.failures.some(f => f.error.includes('timeout'))) {
      insights.recommendations.push('Optimize slow tests or increase timeouts');
    }

    if (testResults.failures.some(f => f.error.includes('Mock'))) {
      insights.recommendations.push('Review mock setup and initialization order');
    }

    return insights;
  }

  groupFailuresByPattern(failures) {
    const patterns = new Map();

    for (const failure of failures) {
      const errorType = this.categorizeError(failure.error);
      const count = patterns.get(errorType) || 0;
      patterns.set(errorType, count + 1);
    }

    return Array.from(patterns.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));
  }

  categorizeError(error) {
    if (error.includes('Cannot access') || error.includes('Mock')) return 'Mock Issues';
    if (error.includes('JSON')) return 'JSON Serialization';
    if (error.includes('enum')) return 'Enum Validation';
    if (error.includes('export')) return 'Import/Export';
    if (error.includes('timeout')) return 'Performance';
    if (error.includes('TypeError')) return 'Type Errors';
    return 'Other';
  }

  generateReport(testResults, insights, duration) {
    const reportPath = join(this.cacheDir, 'smart-test-report.md');

    const report = `# Smart Test Runner Report

Generated: ${new Date().toISOString()}
Duration: ${(duration / 1000).toFixed(2)}s

## Executive Summary
- **Efficiency**: ${insights.efficiency}% tests passed
- **Coverage**: ${insights.coverage} tests selected
- **Performance**: ${(duration / testResults.total).toFixed(0)}ms avg per test

## Results Breakdown
- ✅ **Passed**: ${testResults.passed}
- ❌ **Failed**: ${testResults.failed}
- 📊 **Total**: ${testResults.total}

## Failure Analysis
${insights.topFailures.map(({pattern, count}) =>
  `- **${pattern}**: ${count} occurrences`
).join('\n')}

## Recommendations
${insights.recommendations.map(rec => `- ${rec}`).join('\n')}

${testResults.failures.length > 0 ? `
## Failed Tests
${testResults.failures.map(f => `- ${f.file}: ${f.error.substring(0, 100)}...`).join('\n')}
` : ''}

---
*Generated by Smart Test Runner*
`;

    writeFileSync(reportPath, report);
    console.log(`   📋 Report saved: ${reportPath}`);
  }

  // Utility methods
  getChangedFiles() {
    try {
      const output = execSync('git diff --name-only HEAD~1', { encoding: 'utf8' });
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  mapChangesToTests(changedFiles) {
    const testFiles = [];

    for (const file of changedFiles) {
      // Direct test files
      if (file.includes('.test.ts') || file.includes('.spec.ts')) {
        testFiles.push(file);
        continue;
      }

      // Find related test files
      const baseName = file.replace(/\.(ts|tsx|js|jsx)$/, '');
      const possibleTests = [
        `${baseName}.test.ts`,
        `${baseName}.spec.ts`,
        `tests/unit/${baseName.replace(/^(client|server)\//, '')}.test.ts`,
        `tests/integration/${baseName.replace(/^(client|server)\//, '')}.test.ts`
      ];

      for (const testPath of possibleTests) {
        if (existsSync(testPath)) {
          testFiles.push(testPath);
        }
      }
    }

    // Add smoke tests if we have changes
    if (testFiles.length === 0 && changedFiles.length > 0) {
      return this.getSmokeTests();
    }

    return [...new Set(testFiles)]; // Remove duplicates
  }

  getSmokeTests() {
    return [
      'tests/smoke.test.ts',
      'tests/unit/fund-setup-basic.test.tsx'
    ].filter(existsSync);
  }

  getAllTests() {
    try {
      const output = execSync('find . -name "*.test.ts" -o -name "*.spec.ts"', { encoding: 'utf8' });
      return output.split('\n')
        .filter(Boolean)
        .filter(file => !file.includes('node_modules'))
        .map(file => file.replace('./', ''));
    } catch {
      return [];
    }
  }

  findTestsByPattern(pattern) {
    try {
      const output = execSync(`find . -name "${pattern}"`, { encoding: 'utf8' });
      return output.split('\n')
        .filter(Boolean)
        .filter(file => !file.includes('node_modules'))
        .map(file => file.replace('./', ''));
    } catch {
      return [];
    }
  }

  getRecentlyFailedTests() {
    const historyFile = join(this.cacheDir, 'test-history.json');
    if (!existsSync(historyFile)) return [];

    try {
      const history = JSON.parse(readFileSync(historyFile, 'utf8'));
      return [...new Set(
        history
          .filter(result => result.status === 'failed' && Date.now() - result.timestamp < 24 * 60 * 60 * 1000)
          .map(result => result.file)
      )];
    } catch {
      return [];
    }
  }

  getTestsForChangedFiles() {
    const changed = this.getChangedFiles();
    return this.mapChangesToTests(changed);
  }

  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  ensureDirectoryExists(dir) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// CLI Interface
if (process.argv[1] === new URL(import.meta.url).pathname.replace(/\//g, '\\')) {
  const args = process.argv.slice(2);

  const options = {
    pattern: args.find(arg => arg.startsWith('--pattern='))?.split('=')[1],
    onlyFailed: args.includes('--only-failed'),
    onlyChanged: args.includes('--only-changed'),
    failFast: args.includes('--fail-fast'),
    noRepair: args.includes('--no-repair')
  };

  const runner = new SmartTestRunner();

  if (options.noRepair) {
    runner.config.enableAutoRepair = false;
  }

  if (options.failFast) {
    runner.config.failFast = true;
  }

  runner.run(options)
    .then(result => {
      if (result.success) {
        console.log(`\n🎉 All tests passed! (${result.tests} tests, ${(result.duration / 1000).toFixed(2)}s)`);
        process.exit(0);
      } else {
        console.log(`\n❌ ${result.failed || 'Some'} tests failed`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Smart test runner crashed:', error);
      process.exit(1);
    });
}

export default SmartTestRunner;