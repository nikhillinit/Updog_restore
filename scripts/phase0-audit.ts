#!/usr/bin/env tsx

/**
 * Phase 0 Architecture Audit Script
 * Provides comprehensive analysis of current codebase state
 * Must be run before any architectural decisions
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ArchitectureAudit {
  framework: {
    current: 'express' | 'fastify' | 'mixed' | 'unknown';
    files: string[];
    confidence: 'high' | 'medium' | 'low';
  };
  chartLibraries: {
    nivo: { files: string[]; usage: number };
    recharts: { files: string[]; usage: number };
    recommendation: 'keep-nivo' | 'keep-recharts' | 'gradual-migration';
  };
  buildHealth: {
    typescript: 'green' | 'broken' | 'warnings';
    lint: 'green' | 'broken' | 'warnings';
    tests: 'green' | 'broken' | 'partial';
    errors: string[];
  };
  dependencies: {
    critical: string[];
    security: string[];
    outdated: string[];
  };
  codeQuality: {
    testCoverage: number;
    consoleUsage: number;
    todoCount: number;
    complexity: 'low' | 'medium' | 'high';
  };
  performance: {
    bundleSize: number;
    buildTime: number;
    testTime: number;
  };
}

class ArchitectureAuditor {
  private auditResults: Partial<ArchitectureAudit> = {};

  async runFullAudit(): Promise<ArchitectureAudit> {
    console.log('🔍 Starting comprehensive architecture audit...\n');

    await Promise.all([
      this.auditFramework(),
      this.auditChartLibraries(),
      this.auditBuildHealth(),
      this.auditDependencies(),
      this.auditCodeQuality(),
      this.auditPerformance()
    ]);

    return this.auditResults as ArchitectureAudit;
  }

  private async auditFramework(): Promise<void> {
    console.log('📋 Auditing API framework...');
    
    const serverFiles = this.findFiles('server/', ['.ts', '.js']);
    const expressFiles = [];
    const fastifyFiles = [];

    for (const file of serverFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('express') || content.includes('Express')) {
        expressFiles.push(file);
      }
      if (content.includes('fastify') || content.includes('Fastify')) {
        fastifyFiles.push(file);
      }
    }

    let current: 'express' | 'fastify' | 'mixed' | 'unknown';
    let confidence: 'high' | 'medium' | 'low';

    if (expressFiles.length > 0 && fastifyFiles.length === 0) {
      current = 'express';
      confidence = 'high';
    } else if (fastifyFiles.length > 0 && expressFiles.length === 0) {
      current = 'fastify';
      confidence = 'high';
    } else if (expressFiles.length > 0 && fastifyFiles.length > 0) {
      current = 'mixed';
      confidence = 'high';
    } else {
      current = 'unknown';
      confidence = 'low';
    }

    this.auditResults.framework = {
      current,
      files: [...expressFiles, ...fastifyFiles],
      confidence
    };

    console.log(`   Framework: ${current} (${confidence} confidence)`);
    console.log(`   Express files: ${expressFiles.length}`);
    console.log(`   Fastify files: ${fastifyFiles.length}\n`);
  }

  private async auditChartLibraries(): Promise<void> {
    console.log('📊 Auditing chart libraries...');

    const clientFiles = this.findFiles('client/src/', ['.tsx', '.ts']);
    const nivoFiles = [];
    const rechartsFiles = [];

    for (const file of clientFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('@nivo/') || content.includes('nivo')) {
        nivoFiles.push(file);
      }
      if (content.includes('recharts')) {
        rechartsFiles.push(file);
      }
    }

    const nivoUsage = this.countImportUsage(clientFiles, '@nivo/');
    const rechartsUsage = this.countImportUsage(clientFiles, 'recharts');

    let recommendation: 'keep-nivo' | 'keep-recharts' | 'gradual-migration';
    if (nivoUsage > rechartsUsage * 2) {
      recommendation = 'keep-nivo';
    } else if (rechartsUsage > nivoUsage * 2) {
      recommendation = 'keep-recharts';
    } else {
      recommendation = 'gradual-migration';
    }

    this.auditResults.chartLibraries = {
      nivo: { files: nivoFiles, usage: nivoUsage },
      recharts: { files: rechartsFiles, usage: rechartsUsage },
      recommendation
    };

    console.log(`   Nivo usage: ${nivoUsage} imports in ${nivoFiles.length} files`);
    console.log(`   Recharts usage: ${rechartsUsage} imports in ${rechartsFiles.length} files`);
    console.log(`   Recommendation: ${recommendation}\n`);
  }

  private async auditBuildHealth(): Promise<void> {
    console.log('🏗️ Auditing build health...');

    const errors: string[] = [];
    let typescript: 'green' | 'broken' | 'warnings' = 'green';
    let lint: 'green' | 'broken' | 'warnings' = 'green';
    let tests: 'green' | 'broken' | 'partial' = 'green';

    try {
      const tsOutput = execSync('npm run check', { encoding: 'utf8', stdio: 'pipe' });
      if (tsOutput.includes('error')) {
        typescript = 'broken';
        errors.push('TypeScript compilation errors detected');
      } else if (tsOutput.includes('warning')) {
        typescript = 'warnings';
      }
    } catch (error) {
      typescript = 'broken';
      errors.push(`TypeScript check failed: ${error.message}`);
    }

    try {
      const lintOutput = execSync('npm run lint', { encoding: 'utf8', stdio: 'pipe' });
      if (lintOutput.includes('error')) {
        lint = 'broken';
        errors.push('ESLint errors detected');
      } else if (lintOutput.includes('warning')) {
        lint = 'warnings';
      }
    } catch (error) {
      lint = 'broken';
      errors.push(`Lint check failed: ${error.message}`);
    }

    try {
      const testOutput = execSync('npm run test:unit', { encoding: 'utf8', stdio: 'pipe' });
      if (testOutput.includes('failed')) {
        tests = 'broken';
        errors.push('Unit tests failing');
      } else if (testOutput.includes('skipped')) {
        tests = 'partial';
      }
    } catch (error) {
      tests = 'broken';
      errors.push(`Tests failed: ${error.message}`);
    }

    this.auditResults.buildHealth = {
      typescript,
      lint,
      tests,
      errors
    };

    console.log(`   TypeScript: ${typescript}`);
    console.log(`   Lint: ${lint}`);
    console.log(`   Tests: ${tests}`);
    if (errors.length > 0) {
      console.log(`   Errors: ${errors.length} issues found\n`);
    } else {
      console.log(`   ✅ Build health: All checks passing\n`);
    }
  }

  private async auditDependencies(): Promise<void> {
    console.log('📦 Auditing dependencies...');

    const critical: string[] = [];
    const security: string[] = [];
    const outdated: string[] = [];

    try {
      const auditOutput = execSync('npm audit --json', { encoding: 'utf8' });
      const auditData = JSON.parse(auditOutput);
      
      if (auditData.vulnerabilities) {
        Object.entries(auditData.vulnerabilities).forEach(([pkg, vuln]: [string, any]) => {
          if (vuln.severity === 'critical') {
            critical.push(pkg);
          } else if (vuln.severity === 'high') {
            security.push(pkg);
          }
        });
      }
    } catch (error) {
      console.log(`   Warning: npm audit failed - ${error.message}`);
    }

    try {
      const outdatedOutput = execSync('npm outdated --json', { encoding: 'utf8' });
      const outdatedData = JSON.parse(outdatedOutput);
      outdated.push(...Object.keys(outdatedData));
    } catch (error) {
      // npm outdated returns non-zero exit code when packages are outdated
    }

    this.auditResults.dependencies = {
      critical,
      security,
      outdated
    };

    console.log(`   Critical vulnerabilities: ${critical.length}`);
    console.log(`   Security issues: ${security.length}`);
    console.log(`   Outdated packages: ${outdated.length}\n`);
  }

  private async auditCodeQuality(): Promise<void> {
    console.log('📝 Auditing code quality...');

    const allFiles = this.findFiles('.', ['.ts', '.tsx', '.js', '.jsx']);
    let consoleUsage = 0;
    let todoCount = 0;

    for (const file of allFiles) {
      if (file.includes('node_modules')) continue;
      
      const content = fs.readFileSync(file, 'utf8');
      consoleUsage += (content.match(/console\.(log|warn|error|debug)/g) || []).length;
      todoCount += (content.match(/TODO|FIXME|HACK|BUG/gi) || []).length;
    }

    let testCoverage = 0;
    try {
      const coverageOutput = execSync('npm run test:coverage --silent', { encoding: 'utf8' });
      const coverageMatch = coverageOutput.match(/All files[^\d]*(\d+\.?\d*)/);
      if (coverageMatch) {
        testCoverage = parseFloat(coverageMatch[1]);
      }
    } catch (error) {
      console.log(`   Warning: Coverage check failed - ${error.message}`);
    }

    const complexity = this.calculateComplexity(allFiles);

    this.auditResults.codeQuality = {
      testCoverage,
      consoleUsage,
      todoCount,
      complexity
    };

    console.log(`   Test coverage: ${testCoverage}%`);
    console.log(`   Console statements: ${consoleUsage}`);
    console.log(`   TODO/FIXME items: ${todoCount}`);
    console.log(`   Complexity: ${complexity}\n`);
  }

  private async auditPerformance(): Promise<void> {
    console.log('⚡ Auditing performance...');

    let bundleSize = 0;
    let buildTime = 0;
    let testTime = 0;

    try {
      const buildStart = Date.now();
      execSync('npm run build', { stdio: 'pipe' });
      buildTime = Date.now() - buildStart;

      const distFiles = this.findFiles('dist/', ['.js', '.css']);
      bundleSize = distFiles.reduce((total, file) => {
        return total + fs.statSync(file).size;
      }, 0);
    } catch (error) {
      console.log(`   Warning: Build performance check failed - ${error.message}`);
    }

    try {
      const testStart = Date.now();
      execSync('npm run test:unit', { stdio: 'pipe' });
      testTime = Date.now() - testStart;
    } catch (error) {
      console.log(`   Warning: Test performance check failed - ${error.message}`);
    }

    this.auditResults.performance = {
      bundleSize: Math.round(bundleSize / 1024), // KB
      buildTime,
      testTime
    };

    console.log(`   Bundle size: ${Math.round(bundleSize / 1024)} KB`);
    console.log(`   Build time: ${buildTime}ms`);
    console.log(`   Test time: ${testTime}ms\n`);
  }

  private findFiles(directory: string, extensions: string[]): string[] {
    const files: string[] = [];
    
    try {
      const items = fs.readdirSync(directory);
      
      for (const item of items) {
        const fullPath = path.join(directory, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          files.push(...this.findFiles(fullPath, extensions));
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.log(`Warning: Could not read directory ${directory}`);
    }
    
    return files;
  }

  private countImportUsage(files: string[], pattern: string): number {
    let count = 0;
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        count += (content.match(new RegExp(pattern, 'g')) || []).length;
      } catch (error) {
        // Skip files that can't be read
      }
    }
    return count;
  }

  private calculateComplexity(files: string[]): 'low' | 'medium' | 'high' {
    let totalComplexity = 0;
    let fileCount = 0;

    for (const file of files) {
      if (file.includes('node_modules') || file.includes('.test.') || file.includes('.spec.')) {
        continue;
      }

      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n').length;
        const functions = (content.match(/function|=>/g) || []).length;
        const conditions = (content.match(/if|while|for|switch/g) || []).length;
        
        const fileComplexity = (functions * 2) + conditions + (lines / 10);
        totalComplexity += fileComplexity;
        fileCount++;
      } catch (error) {
        // Skip files that can't be read
      }
    }

    const avgComplexity = fileCount > 0 ? totalComplexity / fileCount : 0;
    
    if (avgComplexity < 20) return 'low';
    if (avgComplexity < 50) return 'medium';
    return 'high';
  }
}

export async function runAudit(): Promise<ArchitectureAudit> {
  const auditor = new ArchitectureAuditor();
  return await auditor.runFullAudit();
}

// CLI execution
if (require.main === module) {
  runAudit().then(results => {
    console.log('📋 AUDIT COMPLETE\n');
    console.log('='.repeat(50));
    console.log(JSON.stringify(results, null, 2));
    
    // Generate recommendations
    console.log('\n🎯 RECOMMENDATIONS\n');
    console.log('='.repeat(50));
    
    if (results.buildHealth.typescript === 'broken') {
      console.log('🚨 CRITICAL: Fix TypeScript errors before proceeding');
    }
    
    if (results.framework.current === 'mixed') {
      console.log('⚠️  WARNING: Mixed framework usage detected - standardize on one');
    }
    
    if (results.codeQuality.consoleUsage > 100) {
      console.log('📝 INFO: High console usage detected - implement proper logging');
    }
    
    if (results.dependencies.critical.length > 0) {
      console.log('🔒 SECURITY: Critical vulnerabilities found - update dependencies');
    }
    
    console.log('\n✅ Phase 0 audit complete - review results before proceeding');
  }).catch(error => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  });
}