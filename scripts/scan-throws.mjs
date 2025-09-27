#!/usr/bin/env node
/**
 * TypeScript throw safety scanner
 * Detects unsafe throw patterns and suggests using asError utility
 * Exit codes: 0=safe, 1=unsafe patterns found
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// Patterns to scan
const UNSAFE_THROW_PATTERNS = [
  // throw "string"
  /throw\s+["'`][^"'`]*["'`]/g,
  // throw variable (not Error)
  /throw\s+(?!new\s+\w*Error)[a-zA-Z_$][\w$]*/g,
  // throw object literal
  /throw\s+\{[^}]*\}/g,
  // throw without new Error() or Error subclass
  /throw\s+(?!new\s+(\w*Error|\w*Exception))[^;\n]*/g
];

// Allowed error constructors (won't be flagged)
const ALLOWED_ERROR_TYPES = [
  'Error',
  'TypeError',
  'ReferenceError', 
  'SyntaxError',
  'RangeError',
  'EvalError',
  'URIError',
  'CustomError',
  'ValidationError',
  'NotFoundError',
  'UnauthorizedError',
  'ForbiddenError'
];

// Create allowlist regex
const ALLOWED_PATTERN = new RegExp(
  `throw\\s+new\\s+(${ALLOWED_ERROR_TYPES.join('|')})\\b`,
  'gi'
);

console.log('🔍 Scanning TypeScript files for unsafe throw patterns...');

async function scanFiles() {
  // Find all TypeScript files
  const files = await glob('**/*.{ts,tsx}', {
    ignore: ['node_modules/**', 'dist/**', '*.d.ts', 'coverage/**'],
    cwd: process.cwd()
  });

  console.log(`📄 Scanning ${files.length} TypeScript files`);

  let totalIssues = 0;
  const issueFiles = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const fileIssues = [];

    // Check each line for unsafe patterns
    lines.forEach((line, lineIndex) => {
      const trimmedLine = line.trim();
      
      // Skip comments and imports
      if (trimmedLine.startsWith('//') || 
          trimmedLine.startsWith('/*') ||
          trimmedLine.startsWith('*') ||
          trimmedLine.includes('import ')) {
        return;
      }

      // Check for throw statements
      if (trimmedLine.includes('throw ')) {
        // Skip if it's an allowed Error constructor
        if (ALLOWED_PATTERN.test(trimmedLine)) {
          return;
        }

        // Check for various unsafe patterns
        let hasUnsafePattern = false;
        let matchedPattern = '';

        // Check string throws
        if (/throw\s+["'`]/.test(trimmedLine)) {
          hasUnsafePattern = true;
          matchedPattern = 'string literal';
        }
        // Check object literal throws
        else if (/throw\s+\{/.test(trimmedLine)) {
          hasUnsafePattern = true;
          matchedPattern = 'object literal';
        }
        // Check variable throws (exclude Error constructors)
        else if (/throw\s+(?!new\s+\w*Error)[a-zA-Z_$][\w$]*/.test(trimmedLine)) {
          hasUnsafePattern = true;
          matchedPattern = 'variable';
        }

        if (hasUnsafePattern) {
          fileIssues.push({
            line: lineIndex + 1,
            content: trimmedLine,
            pattern: matchedPattern
          });
        }
      }
    });

    if (fileIssues.length > 0) {
      issueFiles.push({
        file: filePath,
        issues: fileIssues
      });
      totalIssues += fileIssues.length;
    }
  }

  // Report results
  if (totalIssues === 0) {
    console.log('✅ No unsafe throw patterns detected');
    return 0;
  }

  console.log(`🚨 Found ${totalIssues} unsafe throw patterns in ${issueFiles.length} files:`);
  console.log();

  issueFiles.forEach(({ file, issues }) => {
    console.log(`📄 ${file}:`);
    issues.forEach(({ line, content, pattern }) => {
      console.log(`   Line ${line}: ${content}`);
      console.log(`   └─ Issue: unsafe ${pattern} throw`);
      console.log(`   └─ Fix: use asError() utility or throw new Error()`);
      console.log();
    });
  });

  console.log('💡 Recommendations:');
  console.log('   1. Use throw new Error("message") instead of throw "message"');
  console.log('   2. Use asError(value) utility for variable throws');
  console.log('   3. Replace object throws with proper Error instances');
  console.log();

  return 1;
}

// Run the scanner
scanFiles()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('❌ Scanner failed:', error);
    process.exit(1);
  });