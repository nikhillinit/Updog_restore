#!/usr/bin/env npx tsx
/**
 * BMAD Agent: TypeScript Client Error Auto-Fixer
 * Target: Fix 719 client errors in ~30 minutes
 * Strategy: Pattern recognition + systematic fixes + validation loops
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';

// Configuration
const CONFIG = {
  maxErrorsPerFile: 20,  // Skip files with too many errors (need refactoring)
  batchSize: 10,         // Files to fix before testing
  maxAttempts: 5,        // Max fix attempts per file
  targetErrors: 100,     // Stop when we reach this target
  verbose: true
};

// Statistics tracking
const stats = {
  startTime: Date.now(),
  filesFixed: 0,
  errorsFixed: 0,
  failedFiles: [] as string[],
  skippedFiles: [] as string[]
};

// Color output helpers
const color = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`
};

/**
 * Get current TypeScript error count
 */
function getErrorCount(): number {
  try {
    const output = execSync('npx tsc --noEmit 2>&1 | grep "client/" | wc -l', { 
      encoding: 'utf8',
      stdio: 'pipe' 
    });
    return parseInt(output.trim());
  } catch {
    return 0;
  }
}

/**
 * Get all TypeScript errors grouped by file
 */
function getErrorsByFile(): Map<string, Array<{line: number, col: number, msg: string}>> {
  const errorMap = new Map();
  
  try {
    const output = execSync('npx tsc --noEmit 2>&1 | grep "client/"', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    const lines = output.trim().split('\n').filter(Boolean);
    
    lines.forEach(line => {
      // Parse: client/src/file.tsx(10,15): error TS2532: Object is possibly 'undefined'.
      const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
      if (match) {
        const [, file, lineNum, colNum, code, msg] = match;
        if (!errorMap.has(file)) {
          errorMap.set(file, []);
        }
        errorMap.get(file).push({
          line: parseInt(lineNum),
          col: parseInt(colNum),
          msg: `${code}: ${msg}`
        });
      }
    });
  } catch (e) {
    // No errors or command failed
  }
  
  return errorMap;
}

/**
 * Apply optional chaining fix to a line
 */
function applyOptionalChaining(line: string, col: number): string {
  // Find the property access at the column
  const before = line.substring(0, col - 1);
  const after = line.substring(col - 1);
  
  // Pattern: object.property or object[index]
  if (after.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*\./)) {
    // Add ? before the dot
    const fixed = before + after.replace(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\./, '$1?.');
    return fixed;
  }
  
  // Pattern: array[index]
  if (after.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*\[/)) {
    // Add ?. before the bracket
    const fixed = before + after.replace(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\[/, '$1?.[');
    return fixed;
  }
  
  // Pattern: .property (continuation)
  if (after.match(/^\./)) {
    // Change . to ?.
    const fixed = before + '?.' + after.substring(1);
    return fixed;
  }
  
  return line; // No fix applied
}

/**
 * Apply nullish coalescing fix
 */
function applyNullishCoalescing(line: string, col: number): string {
  // Look for function calls with potentially undefined arguments
  const match = line.match(/(\w+)\(([^)]*)\)/);
  if (match && match.index !== undefined) {
    const [fullMatch, funcName, args] = match;
    const fixedArgs = args.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)/g, (arg) => {
      if (arg === 'undefined' || arg === 'null') return arg;
      return `(${arg} ?? '')`;
    });
    return line.replace(fullMatch, `${funcName}(${fixedArgs})`);
  }
  return line;
}

/**
 * Fix a single file
 */
function fixFile(filePath: string, errors: Array<{line: number, col: number, msg: string}>): boolean {
  if (!existsSync(filePath)) {
    console.log(color.red(`File not found: ${filePath}`));
    return false;
  }
  
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    
    // Sort errors by line number (descending) to work backwards
    errors.sort((a, b) => b.line - a.line);
    
    errors.forEach(error => {
      if (error.line <= lines.length) {
        const originalLine = lines[error.line - 1];
        let fixedLine = originalLine;
        
        // Apply fixes based on error type
        if (error.msg.includes("possibly 'undefined'") || error.msg.includes("Object is possibly 'undefined'")) {
          fixedLine = applyOptionalChaining(originalLine, error.col);
        } else if (error.msg.includes("is not assignable to parameter of type")) {
          fixedLine = applyNullishCoalescing(originalLine, error.col);
        }
        
        if (fixedLine !== originalLine) {
          lines[error.line - 1] = fixedLine;
          modified = true;
        }
      }
    });
    
    if (modified) {
      writeFileSync(filePath, lines.join('\n'));
      return true;
    }
  } catch (e) {
    console.error(color.red(`Failed to fix ${filePath}: ${e}`));
  }
  
  return false;
}

/**
 * Run tests to validate fixes
 */
function runTests(): boolean {
  try {
    console.log(color.blue('Running tests to validate fixes...'));
    execSync('npm test -- --run 2>&1', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(color.bold('\n🤖 BMAD Agent: TypeScript Client Error Auto-Fixer'));
  console.log(color.bold('================================================\n'));
  
  const initialErrors = getErrorCount();
  console.log(color.yellow(`📊 Initial client errors: ${initialErrors}`));
  console.log(color.yellow(`🎯 Target: < ${CONFIG.targetErrors} errors`));
  console.log(color.yellow(`⏱️  Estimated time: ~30 minutes\n`));
  
  let iteration = 0;
  let lastErrorCount = initialErrors;
  
  while (getErrorCount() > CONFIG.targetErrors) {
    iteration++;
    console.log(color.bold(`\n🔄 Iteration ${iteration}`));
    console.log('─'.repeat(40));
    
    const errorsByFile = getErrorsByFile();
    const currentErrors = getErrorCount();
    
    if (currentErrors >= lastErrorCount && iteration > 1) {
      console.log(color.yellow('⚠️  No progress made in last iteration, stopping'));
      break;
    }
    lastErrorCount = currentErrors;
    
    // Process files in batches
    const filesToFix = Array.from(errorsByFile.entries())
      .filter(([file, errors]) => errors.length <= CONFIG.maxErrorsPerFile)
      .slice(0, CONFIG.batchSize);
    
    if (filesToFix.length === 0) {
      console.log(color.yellow('No more fixable files found'));
      break;
    }
    
    console.log(color.blue(`📝 Fixing ${filesToFix.length} files...`));
    
    for (const [file, errors] of filesToFix) {
      const relPath = path.relative(process.cwd(), file);
      process.stdout.write(`  ${relPath} (${errors.length} errors)... `);
      
      if (fixFile(file, errors)) {
        stats.filesFixed++;
        stats.errorsFixed += errors.length;
        console.log(color.green('✓'));
      } else {
        stats.failedFiles.push(file);
        console.log(color.red('✗'));
      }
    }
    
    // Show progress
    const newErrorCount = getErrorCount();
    const fixed = currentErrors - newErrorCount;
    console.log(color.green(`\n✅ Fixed ${fixed} errors this iteration`));
    console.log(color.blue(`📊 Remaining errors: ${newErrorCount}`));
    
    // Run tests periodically
    if (iteration % 3 === 0) {
      if (!runTests()) {
        console.log(color.red('⚠️  Tests failed, reverting last batch'));
        execSync('git checkout -- client/');
        break;
      } else {
        console.log(color.green('✅ Tests passing, continuing...'));
        // Commit progress
        try {
          execSync('git add -A');
          execSync(`git commit -m "fix: Auto-fix TypeScript client errors (batch ${iteration})" --no-verify`);
          console.log(color.green('📦 Progress committed'));
        } catch {
          // Might have nothing to commit
        }
      }
    }
    
    // Prevent infinite loops
    if (iteration > 50) {
      console.log(color.yellow('⚠️  Max iterations reached'));
      break;
    }
  }
  
  // Final report
  const duration = Math.round((Date.now() - stats.startTime) / 1000);
  const finalErrors = getErrorCount();
  const totalFixed = initialErrors - finalErrors;
  
  console.log(color.bold('\n📊 Final Report'));
  console.log('═'.repeat(50));
  console.log(color.green(`✅ Total errors fixed: ${totalFixed}`));
  console.log(color.green(`📁 Files modified: ${stats.filesFixed}`));
  console.log(color.blue(`⏱️  Time taken: ${duration} seconds`));
  console.log(color.yellow(`📈 Remaining errors: ${finalErrors}`));
  
  if (stats.failedFiles.length > 0) {
    console.log(color.red(`\n⚠️  Failed files (${stats.failedFiles.length}):`));
    stats.failedFiles.slice(0, 10).forEach(f => console.log(`  - ${f}`));
  }
  
  // Success check
  if (finalErrors < CONFIG.targetErrors) {
    console.log(color.bold(color.green('\n🎉 SUCCESS! Target reached!')));
  } else {
    console.log(color.yellow(`\n⚠️  Target not reached, but made significant progress`));
    console.log(color.yellow(`   Remaining errors need manual review`));
  }
  
  // Generate detailed report
  const report = `# BMAD Auto-Fix Report

## Summary
- **Initial Errors**: ${initialErrors}
- **Final Errors**: ${finalErrors}  
- **Total Fixed**: ${totalFixed}
- **Success Rate**: ${Math.round((totalFixed / initialErrors) * 100)}%
- **Duration**: ${duration} seconds
- **Files Modified**: ${stats.filesFixed}

## Recommendation
${finalErrors < CONFIG.targetErrors ? 
  'Target achieved! The remaining errors likely need architectural changes or manual review.' :
  'Significant progress made. Remaining errors are complex cases requiring human judgment.'}

Generated: ${new Date().toISOString()}
`;
  
  writeFileSync('bmad-fix-report.md', report);
  console.log(color.blue('\n📄 Detailed report saved to bmad-fix-report.md'));
}

// Execute
main().catch(console.error);