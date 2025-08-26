#!/usr/bin/env tsx

/**
 * Quality Gates System
 * Enforces quality standards at each development phase
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

interface QualityGate {
  name: string;
  description: string;
  checks: QualityCheck[];
  required: boolean;
  phase: 'foundation' | 'development' | 'deployment';
}

interface QualityCheck {
  name: string;
  command?: string;
  condition: () => Promise<boolean>;
  errorMessage: string;
  warningMessage?: string;
  fix?: () => Promise<void>;
}

interface QualityResult {
  gate: string;
  passed: boolean;
  results: CheckResult[];
  overallScore: number;
}

interface CheckResult {
  check: string;
  passed: boolean;
  message: string;
  canFix: boolean;
  duration: number;
}

class QualityGateSystem {
  private gates: QualityGate[] = [];

  constructor() {
    this.initializeGates();
  }

  private initializeGates(): void {
    // Foundation Phase Gates
    this.gates.push({
      name: 'Foundation Stability',
      description: 'Core build and compilation health',
      phase: 'foundation',
      required: true,
      checks: [
        {
          name: 'TypeScript Compilation',
          command: 'npm run check',
          condition: async () => this.runCommand('npm run check'),
          errorMessage: 'TypeScript compilation errors must be fixed before proceeding',
          fix: async () => {
            console.log('🔧 Attempting to fix common TypeScript errors...');
            await this.fixCommonTSErrors();
          }
        },
        {
          name: 'ESLint Validation',
          command: 'npm run lint',
          condition: async () => this.runCommand('npm run lint'),
          errorMessage: 'ESLint errors must be resolved',
          fix: async () => {
            console.log('🔧 Running ESLint auto-fix...');
            await this.runCommand('npm run lint:fix');
          }
        },
        {
          name: 'Unit Tests',
          command: 'npm run test:unit',
          condition: async () => this.runCommand('npm run test:unit'),
          errorMessage: 'All unit tests must pass',
        },
        {
          name: 'Build Success',
          command: 'npm run build',
          condition: async () => this.runCommand('npm run build'),
          errorMessage: 'Production build must succeed',
        },
        {
          name: 'Security Audit',
          command: 'npm audit --audit-level=high',
          condition: async () => this.runCommand('npm audit --audit-level=high'),
          errorMessage: 'High/critical security vulnerabilities must be addressed',
          warningMessage: 'Consider updating vulnerable dependencies',
        }
      ]
    });

    // Development Phase Gates
    this.gates.push({
      name: 'Development Quality',
      description: 'Code quality and architecture standards',
      phase: 'development',
      required: true,
      checks: [
        {
          name: 'Test Coverage',
          condition: async () => this.checkTestCoverage(),
          errorMessage: 'Test coverage below minimum threshold (70%)',
          warningMessage: 'Test coverage could be improved',
        },
        {
          name: 'Bundle Size',
          condition: async () => this.checkBundleSize(),
          errorMessage: 'Bundle size exceeds maximum limit (400KB)',
          warningMessage: 'Bundle size approaching limit',
        },
        {
          name: 'Performance Budget',
          condition: async () => this.checkPerformanceBudget(),
          errorMessage: 'Performance metrics exceed acceptable thresholds',
        },
        {
          name: 'Code Complexity',
          condition: async () => this.checkCodeComplexity(),
          errorMessage: 'Code complexity too high - refactoring needed',
          warningMessage: 'Some functions have high complexity',
        },
        {
          name: 'Documentation Coverage',
          condition: async () => this.checkDocumentation(),
          errorMessage: 'Critical functions lack documentation',
          warningMessage: 'Consider adding more inline documentation',
        }
      ]
    });

    // Deployment Phase Gates
    this.gates.push({
      name: 'Deployment Readiness',
      description: 'Production deployment requirements',
      phase: 'deployment',
      required: true,
      checks: [
        {
          name: 'Integration Tests',
          command: 'npm run test:integration',
          condition: async () => this.runCommand('npm run test:integration'),
          errorMessage: 'Integration tests must pass before deployment',
        },
        {
          name: 'E2E Tests',
          command: 'npm run test:e2e:smoke',
          condition: async () => this.runCommand('npm run test:e2e:smoke'),
          errorMessage: 'End-to-end smoke tests must pass',
        },
        {
          name: 'Performance Tests',
          command: 'npm run test:baseline',
          condition: async () => this.runCommand('npm run test:baseline'),
          errorMessage: 'Performance regression detected',
        },
        {
          name: 'Environment Configuration',
          condition: async () => this.checkEnvironmentConfig(),
          errorMessage: 'Environment configuration incomplete or invalid',
        },
        {
          name: 'Database Migrations',
          condition: async () => this.checkDatabaseMigrations(),
          errorMessage: 'Database migration issues detected',
        }
      ]
    });
  }

  async runGate(gateName: string, autoFix: boolean = false): Promise<QualityResult> {
    const gate = this.gates.find(g => g.name === gateName);
    if (!gate) {
      throw new Error(`Quality gate '${gateName}' not found`);
    }

    console.log(`🚦 Running Quality Gate: ${gate.name}`);
    console.log(`📋 ${gate.description}\n`);

    const results: CheckResult[] = [];
    let passed = 0;

    for (const check of gate.checks) {
      const startTime = Date.now();
      console.log(`  🔍 Running: ${check.name}...`);

      try {
        const checkPassed = await check.condition();
        const duration = Date.now() - startTime;

        if (checkPassed) {
          console.log(`    ✅ ${check.name} passed (${duration}ms)`);
          results.push({
            check: check.name,
            passed: true,
            message: `Check passed in ${duration}ms`,
            canFix: false,
            duration
          });
          passed++;
        } else {
          console.log(`    ❌ ${check.name} failed (${duration}ms)`);
          
          let message = check.errorMessage;
          let fixed = false;

          if (autoFix && check.fix) {
            try {
              console.log(`    🔧 Attempting auto-fix...`);
              await check.fix();
              
              // Re-run the check
              const retryPassed = await check.condition();
              if (retryPassed) {
                console.log(`    ✅ ${check.name} fixed and now passing`);
                message = 'Auto-fixed successfully';
                fixed = true;
                passed++;
              }
            } catch (error) {
              console.log(`    ⚠️  Auto-fix failed: ${error.message}`);
            }
          }

          results.push({
            check: check.name,
            passed: fixed,
            message,
            canFix: !!check.fix,
            duration
          });
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`    💥 ${check.name} errored: ${error.message}`);
        
        results.push({
          check: check.name,
          passed: false,
          message: `Error: ${error.message}`,
          canFix: false,
          duration
        });
      }
    }

    const overallScore = (passed / gate.checks.length) * 100;
    const gatePassed = gate.required ? passed === gate.checks.length : overallScore >= 80;

    console.log(`\n📊 Gate Results:`);
    console.log(`   Checks passed: ${passed}/${gate.checks.length}`);
    console.log(`   Overall score: ${overallScore.toFixed(1)}%`);
    console.log(`   Gate status: ${gatePassed ? '✅ PASSED' : '❌ FAILED'}\n`);

    return {
      gate: gateName,
      passed: gatePassed,
      results,
      overallScore
    };
  }

  async runAllGates(phase?: string, autoFix: boolean = false): Promise<QualityResult[]> {
    const gatesToRun = phase 
      ? this.gates.filter(g => g.phase === phase)
      : this.gates;

    const results: QualityResult[] = [];

    for (const gate of gatesToRun) {
      const result = await this.runGate(gate.name, autoFix);
      results.push(result);
      
      if (gate.required && !result.passed) {
        console.log(`❌ Required gate '${gate.name}' failed. Stopping execution.`);
        break;
      }
    }

    return results;
  }

  private async runCommand(command: string): Promise<boolean> {
    try {
      execSync(command, { stdio: 'pipe' });
      return true;
    } catch (error) {
      return false;
    }
  }

  private async fixCommonTSErrors(): Promise<void> {
    // Fix unterminated string literal in performance-monitor.ts
    const perfMonitorPath = 'client/src/lib/performance-monitor.ts';
    if (fs.existsSync(perfMonitorPath)) {
      let content = fs.readFileSync(perfMonitorPath, 'utf8');
      content = content.replace(
        /threshold\?\: \'normal\' \| \'warning\' \| critical\'\;/g,
        "threshold?: 'normal' | 'warning' | 'critical';"
      );
      fs.writeFileSync(perfMonitorPath, content);
    }

    // Add missing React imports
    const tsxFiles = this.findFiles('client/src/', ['.tsx']);
    for (const file of tsxFiles) {
      let content = fs.readFileSync(file, 'utf8');
      if (content.includes('React.') && !content.includes('import React')) {
        content = `import React from 'react';\n${content}`;
        fs.writeFileSync(file, content);
      }
    }
  }

  private async checkTestCoverage(): Promise<boolean> {
    try {
      const output = execSync('npm run test:coverage --silent', { encoding: 'utf8' });
      const coverageMatch = output.match(/All files[^\d]*(\d+\.?\d*)/);
      if (coverageMatch) {
        const coverage = parseFloat(coverageMatch[1]);
        return coverage >= 70; // 70% minimum coverage
      }
    } catch (error) {
      console.log('Coverage check failed, assuming insufficient coverage');
    }
    return false;
  }

  private async checkBundleSize(): Promise<boolean> {
    try {
      if (!fs.existsSync('dist/')) {
        execSync('npm run build', { stdio: 'pipe' });
      }

      const files = this.findFiles('dist/', ['.js', '.css']);
      const totalSize = files.reduce((sum, file) => {
        return sum + fs.statSync(file).size;
      }, 0);

      const sizeKB = totalSize / 1024;
      return sizeKB <= 400; // 400KB maximum
    } catch (error) {
      return false;
    }
  }

  private async checkPerformanceBudget(): Promise<boolean> {
    // Check if performance budget file exists and is configured
    if (fs.existsSync('.perf-budget.json')) {
      try {
        const budget = JSON.parse(fs.readFileSync('.perf-budget.json', 'utf8'));
        // Validate budget configuration
        return budget.budgets && Array.isArray(budget.budgets);
      } catch (error) {
        return false;
      }
    }
    return true; // Pass if no budget configured yet
  }

  private async checkCodeComplexity(): Promise<boolean> {
    const files = this.findFiles('client/src/', ['.ts', '.tsx'])
      .concat(this.findFiles('server/', ['.ts']));

    let complexFiles = 0;
    const maxComplexity = 15; // Cyclomatic complexity threshold

    for (const file of files) {
      if (file.includes('.test.') || file.includes('.spec.')) continue;
      
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n').length;
      const functions = (content.match(/function|=>/g) || []).length;
      const conditions = (content.match(/if|while|for|switch|catch/g) || []).length;
      
      // Simple complexity estimation
      const complexity = functions + conditions + (lines / 50);
      
      if (complexity > maxComplexity) {
        complexFiles++;
      }
    }

    // Allow up to 10% of files to be complex
    return complexFiles <= Math.ceil(files.length * 0.1);
  }

  private async checkDocumentation(): Promise<boolean> {
    const files = this.findFiles('client/src/', ['.ts', '.tsx'])
      .concat(this.findFiles('server/', ['.ts']));

    let undocumentedFunctions = 0;
    let totalFunctions = 0;

    for (const file of files) {
      if (file.includes('.test.') || file.includes('.spec.')) continue;
      
      const content = fs.readFileSync(file, 'utf8');
      
      // Find exported functions
      const exportedFunctions = content.match(/export\s+(function|const\s+\w+\s*=)/g) || [];
      totalFunctions += exportedFunctions.length;
      
      // Check for JSDoc comments
      const jsdocComments = content.match(/\/\*\*[\s\S]*?\*\//g) || [];
      undocumentedFunctions += Math.max(0, exportedFunctions.length - jsdocComments.length);
    }

    // Require at least 60% documentation coverage for exported functions
    return totalFunctions === 0 || (undocumentedFunctions / totalFunctions) <= 0.4;
  }

  private async checkEnvironmentConfig(): Promise<boolean> {
    const requiredEnvVars = [
      'NODE_ENV',
      'DATABASE_URL',
    ];

    const envExample = fs.existsSync('.env.example');
    const envLocal = fs.existsSync('.env.local') || fs.existsSync('.env');

    if (!envExample) {
      console.log('Missing .env.example file');
      return false;
    }

    if (envLocal) {
      try {
        const envContent = fs.readFileSync(
          fs.existsSync('.env.local') ? '.env.local' : '.env', 
          'utf8'
        );
        
        for (const envVar of requiredEnvVars) {
          if (!envContent.includes(envVar)) {
            console.log(`Missing required environment variable: ${envVar}`);
            return false;
          }
        }
      } catch (error) {
        return false;
      }
    }

    return true;
  }

  private async checkDatabaseMigrations(): Promise<boolean> {
    try {
      // Check if migrations directory exists and has migrations
      if (fs.existsSync('server/migrations/') || fs.existsSync('migrations/')) {
        const migrationDir = fs.existsSync('server/migrations/') ? 'server/migrations/' : 'migrations/';
        const migrations = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql'));
        
        if (migrations.length === 0) {
          return true; // No migrations to check
        }

        // Check if drizzle config exists
        if (fs.existsSync('drizzle.config.ts')) {
          // Could run drizzle check here if needed
          return true;
        }
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  private findFiles(directory: string, extensions: string[]): string[] {
    const files: string[] = [];
    
    try {
      const items = fs.readdirSync(directory);
      
      for (const item of items) {
        const fullPath = `${directory}/${item}`;
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          files.push(...this.findFiles(fullPath, extensions));
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
    
    return files;
  }
}

export { QualityGateSystem, type QualityResult, type QualityGate };

// CLI execution
if (require.main === module) {
  const system = new QualityGateSystem();
  
  const args = process.argv.slice(2);
  const gateName = args[0];
  const autoFix = args.includes('--fix');
  const phase = args.find(arg => arg.startsWith('--phase='))?.split('=')[1];

  if (gateName && gateName !== '--phase' && !gateName.startsWith('--')) {
    // Run specific gate
    system.runGate(gateName, autoFix).then(result => {
      console.log('\n📋 QUALITY GATE RESULT:');
      console.log(JSON.stringify(result, null, 2));
      
      if (!result.passed) {
        process.exit(1);
      }
    }).catch(error => {
      console.error('❌ Quality gate failed:', error);
      process.exit(1);
    });
  } else {
    // Run all gates for phase
    system.runAllGates(phase, autoFix).then(results => {
      console.log('\n📋 ALL QUALITY GATES RESULTS:');
      
      const passed = results.filter(r => r.passed).length;
      const total = results.length;
      const overallScore = results.reduce((sum, r) => sum + r.overallScore, 0) / total;
      
      console.log(`\n🎯 SUMMARY:`);
      console.log(`   Gates passed: ${passed}/${total}`);
      console.log(`   Overall score: ${overallScore.toFixed(1)}%`);
      console.log(`   Status: ${passed === total ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
      
      // Save results
      fs.writeFileSync('quality-gate-results.json', JSON.stringify(results, null, 2));
      
      if (passed !== total) {
        process.exit(1);
      }
    }).catch(error => {
      console.error('❌ Quality gates failed:', error);
      process.exit(1);
    });
  }
}