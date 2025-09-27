#!/usr/bin/env tsx
/**
 * Security Script: Find Console.log Statements
 *
 * Scans the codebase for console.log statements that should be replaced
 * with structured Winston logging for production security compliance.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

interface ConsoleLogOccurrence {
  file: string;
  line: number;
  column: number;
  content: string;
  severity: 'error' | 'warning' | 'info';
  recommendation: string;
}

const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.vercel',
  'logs'
];

const EXCLUDED_FILES = [
  'find-console-logs.ts',
  'replace-console-logs.ts',
  'package.json', // Contains console.log in scripts
  'vite.config.ts', // May contain console.log for dev purposes
];

const SENSITIVE_PATTERNS = [
  /console\.log.*password/i,
  /console\.log.*token/i,
  /console\.log.*secret/i,
  /console\.log.*key/i,
  /console\.log.*credential/i,
  /console\.log.*auth/i,
  /console\.log.*session/i,
  /console\.log.*cookie/i,
];

const PRODUCTION_FILES = [
  /server\//,
  /api\//,
  /middleware\//,
  /services\//,
  /utils\//,
  /lib\//,
];

function scanDirectory(dir: string): ConsoleLogOccurrence[] {
  const results: ConsoleLogOccurrence[] = [];

  function scanFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, lineIndex) => {
        const matches = line.matchAll(/console\.(log|info|warn|error|debug)/g);

        for (const match of matches) {
          if (!match.index) continue;

          const occurrence: ConsoleLogOccurrence = {
            file: filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            content: line.trim(),
            severity: determineSeverity(line, filePath),
            recommendation: getRecommendation(line, filePath)
          };

          results.push(occurrence);
        }
      });
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
    }
  }

  function traverse(currentDir: string): void {
    try {
      const items = readdirSync(currentDir);

      for (const item of items) {
        const itemPath = join(currentDir, item);
        const stat = statSync(itemPath);

        if (stat.isDirectory()) {
          if (!EXCLUDED_DIRS.includes(item)) {
            traverse(itemPath);
          }
        } else if (stat.isFile()) {
          const ext = extname(item);
          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext) &&
              !EXCLUDED_FILES.includes(item)) {
            scanFile(itemPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error traversing directory ${currentDir}:`, error);
    }
  }

  traverse(dir);
  return results;
}

function determineSeverity(line: string, filePath: string): 'error' | 'warning' | 'info' {
  // Critical: Potential sensitive data exposure
  if (SENSITIVE_PATTERNS.some(pattern => pattern.test(line))) {
    return 'error';
  }

  // High: Production code with console logs
  if (PRODUCTION_FILES.some(pattern => pattern.test(filePath))) {
    return 'error';
  }

  // Medium: Console logs in client code or test files
  if (filePath.includes('client/') || filePath.includes('test')) {
    return 'warning';
  }

  return 'info';
}

function getRecommendation(line: string, filePath: string): string {
  if (SENSITIVE_PATTERNS.some(pattern => pattern.test(line))) {
    return 'CRITICAL: Remove immediately - potential sensitive data exposure';
  }

  if (line.includes('console.error')) {
    return 'Replace with logger.error() for structured error logging';
  }

  if (line.includes('console.warn')) {
    return 'Replace with logger.warn() for structured warning logging';
  }

  if (line.includes('console.info')) {
    return 'Replace with logger.info() for structured info logging';
  }

  if (line.includes('console.debug')) {
    return 'Replace with logger.debug() for structured debug logging';
  }

  if (PRODUCTION_FILES.some(pattern => pattern.test(filePath))) {
    return 'Replace with appropriate logger method (logger.info/warn/error)';
  }

  return 'Consider replacing with structured logging for consistency';
}

function generateReport(occurrences: ConsoleLogOccurrence[]): void {
  const errorCount = occurrences.filter(o => o.severity === 'error').length;
  const warningCount = occurrences.filter(o => o.severity === 'warning').length;
  const infoCount = occurrences.filter(o => o.severity === 'info').length;

  console.log('='.repeat(80));
  console.log('CONSOLE.LOG SECURITY AUDIT REPORT');
  console.log('='.repeat(80));
  console.log();

  console.log(`Total occurrences found: ${occurrences.length}`);
  console.log(`❌ Critical/High Risk: ${errorCount}`);
  console.log(`⚠️  Medium Risk: ${warningCount}`);
  console.log(`ℹ️  Low Risk: ${infoCount}`);
  console.log();

  if (errorCount > 0) {
    console.log('🚨 CRITICAL/HIGH RISK OCCURRENCES:');
    console.log('-'.repeat(50));

    occurrences
      .filter(o => o.severity === 'error')
      .forEach(occurrence => {
        console.log(`📁 ${occurrence.file}:${occurrence.line}:${occurrence.column}`);
        console.log(`📝 ${occurrence.content}`);
        console.log(`💡 ${occurrence.recommendation}`);
        console.log();
      });
  }

  if (warningCount > 0) {
    console.log('⚠️  MEDIUM RISK OCCURRENCES:');
    console.log('-'.repeat(50));

    occurrences
      .filter(o => o.severity === 'warning')
      .slice(0, 10) // Show first 10 to avoid spam
      .forEach(occurrence => {
        console.log(`📁 ${occurrence.file}:${occurrence.line}`);
        console.log(`📝 ${occurrence.content}`);
        console.log();
      });

    if (warningCount > 10) {
      console.log(`... and ${warningCount - 10} more warning occurrences`);
      console.log();
    }
  }

  // File summary
  const fileGroups = occurrences.reduce((groups, occurrence) => {
    const relativePath = occurrence.file.replace(process.cwd(), '');
    groups[relativePath] = (groups[relativePath] || 0) + 1;
    return groups;
  }, {} as Record<string, number>);

  console.log('📊 FILES WITH MOST CONSOLE LOGS:');
  console.log('-'.repeat(50));

  Object.entries(fileGroups)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([file, count]) => {
      console.log(`${count.toString().padStart(3)} - ${file}`);
    });

  console.log();
  console.log('🔧 NEXT STEPS:');
  console.log('-'.repeat(50));
  console.log('1. Run: npm run security:fix-logs (to auto-replace simple cases)');
  console.log('2. Manually review and fix critical/high risk occurrences');
  console.log('3. Import and use structured logging:');
  console.log('   import logger from "../utils/logger.js"');
  console.log('   logger.info("message", { context })');
  console.log();

  // Exit with error code if critical issues found
  if (errorCount > 0) {
    console.log('❌ AUDIT FAILED: Critical console.log statements found');
    process.exit(1);
  } else if (warningCount > 0) {
    console.log('⚠️  AUDIT WARNING: Console.log statements should be addressed');
    process.exit(0);
  } else {
    console.log('✅ AUDIT PASSED: No console.log statements found');
    process.exit(0);
  }
}

// Main execution
function main(): void {
  const projectRoot = process.cwd();
  console.log(`Scanning for console.log statements in: ${projectRoot}`);
  console.log();

  const occurrences = scanDirectory(projectRoot);
  generateReport(occurrences);
}

// Run main function if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { scanDirectory, ConsoleLogOccurrence };