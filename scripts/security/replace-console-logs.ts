#!/usr/bin/env tsx
/**
 * Security Script: Replace Console.log Statements
 *
 * Automatically replaces console.log statements with structured Winston logging
 * for production security compliance.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { scanDirectory, ConsoleLogOccurrence } from './find-console-logs.js';

interface ReplacementRule {
  pattern: RegExp;
  replacement: string;
  needsImport: boolean;
  importStatement: string;
}

const REPLACEMENT_RULES: ReplacementRule[] = [
  // Monte Carlo specific replacements
  {
    pattern: /console\.log\(['"`]Running Monte Carlo simulation\.\.\.['"`]\);?/g,
    replacement: "logMonteCarloOperation('Starting simulation', fundId, { runs, timeHorizonYears });",
    needsImport: true,
    importStatement: "import { logMonteCarloOperation, logMonteCarloError, PerformanceMonitor } from '../utils/logger.js';"
  },
  {
    pattern: /console\.log\(['"`]Simulation completed in.*['"`]\);?/g,
    replacement: "logMonteCarloOperation('Simulation completed', fundId, { executionTimeMs, simulationId });",
    needsImport: true,
    importStatement: "import { logMonteCarloOperation } from '../utils/logger.js';"
  },

  // Generic console.error replacements
  {
    pattern: /console\.error\(['"`]([^'"`]+)['"`],?\s*([^)]*)\);?/g,
    replacement: "logger.error('$1', { error: $2 });",
    needsImport: true,
    importStatement: "import logger from '../utils/logger.js';"
  },
  {
    pattern: /console\.error\(['"`]([^'"`]+)['"`]\);?/g,
    replacement: "logger.error('$1');",
    needsImport: true,
    importStatement: "import logger from '../utils/logger.js';"
  },

  // Generic console.warn replacements
  {
    pattern: /console\.warn\(['"`]([^'"`]+)['"`],?\s*([^)]*)\);?/g,
    replacement: "logger.warn('$1', { data: $2 });",
    needsImport: true,
    importStatement: "import logger from '../utils/logger.js';"
  },
  {
    pattern: /console\.warn\(['"`]([^'"`]+)['"`]\);?/g,
    replacement: "logger.warn('$1');",
    needsImport: true,
    importStatement: "import logger from '../utils/logger.js';"
  },

  // Generic console.info replacements
  {
    pattern: /console\.info\(['"`]([^'"`]+)['"`],?\s*([^)]*)\);?/g,
    replacement: "logger.info('$1', { data: $2 });",
    needsImport: true,
    importStatement: "import logger from '../utils/logger.js';"
  },
  {
    pattern: /console\.info\(['"`]([^'"`]+)['"`]\);?/g,
    replacement: "logger.info('$1');",
    needsImport: true,
    importStatement: "import logger from '../utils/logger.js';"
  },

  // Generic console.log replacements (most common)
  {
    pattern: /console\.log\(['"`]([^'"`]+)['"`],?\s*([^)]*)\);?/g,
    replacement: "logger.info('$1', { data: $2 });",
    needsImport: true,
    importStatement: "import logger from '../utils/logger.js';"
  },
  {
    pattern: /console\.log\(['"`]([^'"`]+)['"`]\);?/g,
    replacement: "logger.info('$1');",
    needsImport: true,
    importStatement: "import logger from '../utils/logger.js';"
  },

  // Complex console.log with variables
  {
    pattern: /console\.log\(([^)]+)\);?/g,
    replacement: "logger.info('Debug output', { data: $1 });",
    needsImport: true,
    importStatement: "import logger from '../utils/logger.js';"
  }
];

const EXCLUDED_FILES = [
  'find-console-logs.ts',
  'replace-console-logs.ts',
  'package.json',
  '.env.example'
];

interface ReplacementResult {
  file: string;
  originalLines: number;
  replacedLines: number;
  replacements: Array<{
    line: number;
    original: string;
    replacement: string;
  }>;
  needsImport: boolean;
  importAdded: boolean;
  errors: string[];
}

function determineLoggerImportPath(filePath: string): string {
  const relativePath = relative(filePath, join(process.cwd(), 'server/utils/logger.js'));

  // Count directory levels to determine relative path
  const levels = filePath.split(/[/\\]/).length - process.cwd().split(/[/\\]/).length - 1;
  const prefix = '../'.repeat(Math.max(levels - 1, 1));

  if (filePath.includes('server/')) {
    return `${prefix}utils/logger.js`;
  } else if (filePath.includes('client/')) {
    return `${prefix}../server/utils/logger.js`;
  } else {
    return './server/utils/logger.js';
  }
}

function replaceConsoleLogsInFile(filePath: string): ReplacementResult {
  const result: ReplacementResult = {
    file: filePath,
    originalLines: 0,
    replacedLines: 0,
    replacements: [],
    needsImport: false,
    importAdded: false,
    errors: []
  };

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    result.originalLines = lines.length;

    let modifiedContent = content;
    let needsImport = false;

    // Apply replacement rules
    for (const rule of REPLACEMENT_RULES) {
      const matches = [...modifiedContent.matchAll(rule.pattern)];

      if (matches.length > 0) {
        needsImport = needsImport || rule.needsImport;

        for (const match of matches) {
          result.replacements.push({
            line: content.substring(0, match.index).split('\n').length,
            original: match[0],
            replacement: rule.replacement
          });
        }

        modifiedContent = modifiedContent.replace(rule.pattern, rule.replacement);
      }
    }

    // Add import statement if needed
    if (needsImport && !modifiedContent.includes('import logger') &&
        !modifiedContent.includes('logMonteCarloOperation')) {

      const importPath = determineLoggerImportPath(filePath);
      const importStatement = `import logger from '${importPath}';\n`;

      // Find where to insert import (after existing imports)
      const importLines = modifiedContent.split('\n');
      let insertIndex = 0;

      for (let i = 0; i < importLines.length; i++) {
        if (importLines[i].startsWith('import ') || importLines[i].startsWith('const ')) {
          insertIndex = i + 1;
        } else if (importLines[i].trim() === '') {
          continue;
        } else {
          break;
        }
      }

      importLines.splice(insertIndex, 0, importStatement);
      modifiedContent = importLines.join('\n');
      result.importAdded = true;
    }

    result.needsImport = needsImport;
    result.replacedLines = modifiedContent.split('\n').length;

    // Only write if content changed
    if (modifiedContent !== content) {
      writeFileSync(filePath, modifiedContent, 'utf-8');
    }

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

function processDirectory(dir: string): ReplacementResult[] {
  const results: ReplacementResult[] = [];

  function processFile(filePath: string): void {
    const ext = extname(filePath);
    const fileName = filePath.split(/[/\\]/).pop() || '';

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext) &&
        !EXCLUDED_FILES.includes(fileName) &&
        !filePath.includes('node_modules') &&
        !filePath.includes('.git') &&
        !filePath.includes('dist') &&
        !filePath.includes('build')) {

      const result = replaceConsoleLogsInFile(filePath);
      if (result.replacements.length > 0 || result.errors.length > 0) {
        results.push(result);
      }
    }
  }

  function traverse(currentDir: string): void {
    try {
      const items = readdirSync(currentDir);

      for (const item of items) {
        const itemPath = join(currentDir, item);
        const stat = statSync(itemPath);

        if (stat.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(item)) {
            traverse(itemPath);
          }
        } else if (stat.isFile()) {
          processFile(itemPath);
        }
      }
    } catch (error) {
      console.error(`Error traversing directory ${currentDir}:`, error);
    }
  }

  traverse(dir);
  return results;
}

function generateReport(results: ReplacementResult[]): void {
  const totalReplacements = results.reduce((sum, r) => sum + r.replacements.length, 0);
  const filesModified = results.filter(r => r.replacements.length > 0).length;
  const filesWithErrors = results.filter(r => r.errors.length > 0).length;
  const importsAdded = results.filter(r => r.importAdded).length;

  console.log('='.repeat(80));
  console.log('CONSOLE.LOG REPLACEMENT REPORT');
  console.log('='.repeat(80));
  console.log();

  console.log(`📊 SUMMARY:`);
  console.log(`   Files scanned: ${results.length}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Total replacements: ${totalReplacements}`);
  console.log(`   Logger imports added: ${importsAdded}`);
  console.log(`   Files with errors: ${filesWithErrors}`);
  console.log();

  if (filesModified > 0) {
    console.log('✅ SUCCESSFUL REPLACEMENTS:');
    console.log('-'.repeat(50));

    results
      .filter(r => r.replacements.length > 0)
      .forEach(result => {
        console.log(`📁 ${relative(process.cwd(), result.file)}`);
        console.log(`   Replacements: ${result.replacements.length}`);
        if (result.importAdded) {
          console.log(`   ✅ Logger import added`);
        }

        // Show first few replacements
        result.replacements.slice(0, 3).forEach(replacement => {
          console.log(`   Line ${replacement.line}: ${replacement.original.trim()}`);
          console.log(`   →  ${replacement.replacement}`);
        });

        if (result.replacements.length > 3) {
          console.log(`   ... and ${result.replacements.length - 3} more replacements`);
        }
        console.log();
      });
  }

  if (filesWithErrors > 0) {
    console.log('❌ ERRORS:');
    console.log('-'.repeat(50));

    results
      .filter(r => r.errors.length > 0)
      .forEach(result => {
        console.log(`📁 ${relative(process.cwd(), result.file)}`);
        result.errors.forEach(error => {
          console.log(`   ❌ ${error}`);
        });
        console.log();
      });
  }

  console.log('🔧 NEXT STEPS:');
  console.log('-'.repeat(50));
  console.log('1. Review the automated replacements');
  console.log('2. Test the application to ensure logging works correctly');
  console.log('3. Run: npm run security:console-logs (to verify all console.logs are replaced)');
  console.log('4. Manually review any complex console.log statements that may need custom handling');
  console.log('5. Update any remaining console.log in test files if needed');
  console.log();

  if (totalReplacements > 0) {
    console.log('✅ CONSOLE.LOG REPLACEMENT COMPLETED');
    console.log(`   ${totalReplacements} console.log statements replaced with structured logging`);
  } else {
    console.log('ℹ️  NO CONSOLE.LOG STATEMENTS FOUND TO REPLACE');
  }
}

function main(): void {
  console.log('🔄 Starting automated console.log replacement...');
  console.log();

  // First, scan for console.logs to get baseline
  const projectRoot = process.cwd();
  const occurrences = scanDirectory(projectRoot);

  console.log(`Found ${occurrences.length} console.log occurrences to process`);
  console.log();

  // Process replacements
  const results = processDirectory(projectRoot);

  // Generate report
  generateReport(results);

  // Run scan again to see remaining issues
  console.log();
  console.log('🔍 Scanning for remaining console.log statements...');
  const remainingOccurrences = scanDirectory(projectRoot);

  if (remainingOccurrences.length > 0) {
    console.log(`⚠️  ${remainingOccurrences.length} console.log statements still remain`);
    console.log('   These may require manual review and replacement');
  } else {
    console.log('✅ All console.log statements have been replaced!');
  }
}

// Run main function if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { replaceConsoleLogsInFile, processDirectory, ReplacementResult };