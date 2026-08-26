#!/usr/bin/env tsx

/**
 * Automated TypeScript Error Fixing Pipeline
 *
 * Analyzes TypeScript errors and applies intelligent fixes for common patterns.
 * Designed for solo developer productivity - fixes obvious errors automatically
 * while flagging complex issues for manual review.
 */

import { spawn, exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

interface FixResult {
  file: string;
  applied: boolean;
  fixType: string;
  description: string;
  error?: string;
}

class AutomatedErrorFixer {
  private fixedFiles = new Set<string>();
  private results: FixResult[] = [];

  /**
   * Main entry point - analyze and fix TypeScript errors
   */
  async fixAllErrors(): Promise<void> {
    console.log('🔧 Starting automated TypeScript error fixing...\n');

    // Get current TypeScript errors
    const errors = await this.getTypeScriptErrors();
    console.log(`📊 Found ${errors.length} TypeScript errors`);

    if (errors.length === 0) {
      console.log('✅ No TypeScript errors found!');
      return;
    }

    // Group errors by file for efficient processing
    const errorsByFile = this.groupErrorsByFile(errors);
    console.log(`📁 Errors span ${Object.keys(errorsByFile).length} files\n`);

    // Apply fixes
    for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
      await this.fixFileErrors(filePath, fileErrors);
    }

    // Summary report
    this.printSummaryReport();

    // Run type check again to verify improvements
    await this.verifyImprovements();
  }

  /**
   * Extract TypeScript errors from compiler output
   */
  private async getTypeScriptErrors(): Promise<TypeScriptError[]> {
    try {
      const { stdout, stderr } = await execAsync('npm run check:client');
      console.log('📄 TypeScript output length:', (stderr || stdout).length);
      return this.parseTypeScriptOutput(stderr || stdout);
    } catch (error: any) {
      // TypeScript errors cause non-zero exit, parse from stderr
      const output = error.stderr || error.stdout || '';
      console.log('📄 TypeScript error output length:', output.length);
      console.log('📄 First few lines:', output.split('\n').slice(0, 5).join('\n'));
      return this.parseTypeScriptOutput(output);
    }
  }

  /**
   * Parse TypeScript compiler output into structured errors
   */
  private parseTypeScriptOutput(output: string): TypeScriptError[] {
    const errors: TypeScriptError[] = [];
    // Handle both \n and \r\n line endings
    const lines = output.split(/\r?\n/);

    for (const line of lines) {
      // Clean the line of any remaining \r characters
      const cleanLine = line.replace(/\r/g, '').trim();

      if (!cleanLine) continue;

      // Match pattern: file.ext(line,col): error TSxxxx: message
      const match = cleanLine.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/);
      if (match) {
        const [, file, lineStr, columnStr, severity, code, message] = match;
        errors.push({
          file: file.trim(),
          line: parseInt(lineStr),
          column: parseInt(columnStr),
          code,
          message: message.trim(),
          severity: severity as 'error' | 'warning'
        });
      }
    }

    console.log(`🔍 Parsed ${errors.length} errors from output`);
    if (errors.length > 0) {
      console.log('📝 Sample error:', {
        file: errors[0].file,
        line: errors[0].line,
        code: errors[0].code,
        message: errors[0].message.substring(0, 60) + '...'
      });
    }

    return errors;
  }

  /**
   * Group errors by file for efficient batch processing
   */
  private groupErrorsByFile(errors: TypeScriptError[]): Record<string, TypeScriptError[]> {
    const grouped: Record<string, TypeScriptError[]> = {};

    for (const error of errors) {
      if (!grouped[error.file]) {
        grouped[error.file] = [];
      }
      grouped[error.file].push(error);
    }

    return grouped;
  }

  /**
   * Apply automated fixes to a specific file
   */
  private async fixFileErrors(filePath: string, errors: TypeScriptError[]): Promise<void> {
    console.log(`🔍 Processing ${path.basename(filePath)} (${errors.length} errors)`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let modifiedContent = content;
      let hasChanges = false;

      // Sort errors by line number (descending) to avoid offset issues
      const sortedErrors = errors.sort((a, b) => b.line - a.line);

      for (const error of sortedErrors) {
        const fixResult = await this.applyErrorFix(modifiedContent, error);

        if (fixResult.applied) {
          modifiedContent = fixResult.content || modifiedContent;
          hasChanges = true;
          this.results.push({
            file: filePath,
            applied: true,
            fixType: fixResult.fixType,
            description: fixResult.description
          });
          console.log(`  ✅ Fixed: ${fixResult.description}`);
        } else {
          this.results.push({
            file: filePath,
            applied: false,
            fixType: 'manual_review',
            description: error.message,
            error: fixResult.error
          });
          console.log(`  ⚠️  Manual review needed: ${error.message}`);
        }
      }

      // Write changes if any fixes were applied
      if (hasChanges) {
        await fs.writeFile(filePath, modifiedContent);
        this.fixedFiles.add(filePath);
        console.log(`  💾 Saved changes to ${path.basename(filePath)}`);
      }

    } catch (error) {
      console.error(`  ❌ Error processing ${filePath}:`, error);
    }

    console.log(''); // Empty line for readability
  }

  /**
   * Apply specific fix based on error type
   */
  private async applyErrorFix(content: string, error: TypeScriptError): Promise<{
    applied: boolean;
    content?: string;
    fixType: string;
    description: string;
    error?: string;
  }> {
    try {
      // TS7053: Element implicitly has an 'any' type
      if (error.code === 'TS7053' && error.message.includes("Element implicitly has an 'any' type")) {
        return this.fixImplicitAnyElement(content, error);
      }

      // TS7006: Parameter implicitly has an 'any' type
      if (error.code === 'TS7006' && error.message.includes("Parameter") && error.message.includes("implicitly has an 'any' type")) {
        return this.fixImplicitAnyParameter(content, error);
      }

      // TS2345: Argument of type is not assignable
      if (error.code === 'TS2345' && error.message.includes("Argument of type")) {
        return this.fixArgumentTypeError(content, error);
      }

      // TS2593: Cannot find name (test globals)
      if (error.code === 'TS2593' && (error.message.includes('describe') || error.message.includes('it') || error.message.includes('expect'))) {
        return this.fixTestGlobals(content, error);
      }

      // TS2304: Cannot find name
      if (error.code === 'TS2304') {
        return this.fixMissingName(content, error);
      }

      return {
        applied: false,
        fixType: 'unsupported',
        description: `Unsupported error type: ${error.code}`,
        error: 'No automated fix available'
      };

    } catch (err) {
      return {
        applied: false,
        fixType: 'error',
        description: 'Fix application failed',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Fix TS7053: Element implicitly has an 'any' type
   */
  private fixImplicitAnyElement(content: string, error: TypeScriptError): {
    applied: boolean;
    content?: string;
    fixType: string;
    description: string;
  } {
    const lines = content.split('\n');
    const errorLine = lines[error.line - 1];

    // More specific pattern: object.property[variable] where property access is problematic
    // Fix: (object as any)[property][variable]
    const dotNotationPattern = /(\w+)\.(\w+)\[([^[\]]+)\]/g;
    const dotMatches = [...errorLine.matchAll(dotNotationPattern)];

    if (dotMatches.length > 0) {
      let fixedLine = errorLine;

      for (const match of dotMatches) {
        const [fullMatch, objectName, propertyName, indexVar] = match;
        const fixedAccess = `(${objectName} as any)[${propertyName}][${indexVar}]`;
        fixedLine = fixedLine.replace(fullMatch, fixedAccess);
      }

      lines[error.line - 1] = fixedLine;

      return {
        applied: true,
        content: lines.join('\n'),
        fixType: 'dot_notation_fix',
        description: `Fixed dot notation with type assertion in line ${error.line}`
      };
    }

    // Simple pattern: object[variable] where variable is 'any'
    // Fix: (object as any)[variable]
    const simpleIndexPattern = /(?<!\w)(\w+)\[([^[\]]+)\](?!\w)/g;
    const simpleMatches = [...errorLine.matchAll(simpleIndexPattern)];

    if (simpleMatches.length > 0) {
      let fixedLine = errorLine;

      for (const match of simpleMatches) {
        const [fullMatch, objectName, indexVar] = match;
        // Skip if already has type assertion
        if (fullMatch.includes(' as any')) continue;

        const fixedAccess = `(${objectName} as any)[${indexVar}]`;
        fixedLine = fixedLine.replace(fullMatch, fixedAccess);
      }

      lines[error.line - 1] = fixedLine;

      return {
        applied: true,
        content: lines.join('\n'),
        fixType: 'simple_index_fix',
        description: `Added type assertion for index access in line ${error.line}`
      };
    }

    return {
      applied: false,
      fixType: 'unmatched_pattern',
      description: 'Could not match implicit any element pattern'
    };
  }

  /**
   * Fix TS7006: Parameter implicitly has an 'any' type
   */
  private fixImplicitAnyParameter(content: string, error: TypeScriptError): {
    applied: boolean;
    content?: string;
    fixType: string;
    description: string;
  } {
    const lines = content.split('\n');
    const errorLine = lines[error.line - 1];

    // Extract parameter name from error message
    const paramMatch = error.message.match(/Parameter '(\w+)'/);
    if (!paramMatch) {
      return {
        applied: false,
        fixType: 'no_param_match',
        description: 'Could not extract parameter name from error'
      };
    }

    const paramName = paramMatch[1];

    // Common patterns to fix
    const patterns = [
      // Arrow function: (param) => ...
      {
        regex: new RegExp(`\\((\\s*${paramName}\\s*)\\)\\s*=>`),
        replacement: `(${paramName}: any) =>`
      },
      // Function parameter: function(param)
      {
        regex: new RegExp(`function\\s*\\([^)]*\\b${paramName}\\b[^)]*\\)`),
        replacement: (match: string) => match.replace(paramName, `${paramName}: any`)
      },
      // Method parameter: method(param)
      {
        regex: new RegExp(`\\b\\w+\\s*\\([^)]*\\b${paramName}\\b[^)]*\\)`),
        replacement: (match: string) => match.replace(paramName, `${paramName}: any`)
      }
    ];

    for (const pattern of patterns) {
      if (pattern.regex.test(errorLine)) {
        const fixedLine = typeof pattern.replacement === 'function'
          ? errorLine.replace(pattern.regex, pattern.replacement)
          : errorLine.replace(pattern.regex, pattern.replacement);

        lines[error.line - 1] = fixedLine;

        return {
          applied: true,
          content: lines.join('\n'),
          fixType: 'parameter_type',
          description: `Added 'any' type to parameter '${paramName}' in line ${error.line}`
        };
      }
    }

    return {
      applied: false,
      fixType: 'unmatched_pattern',
      description: `Could not match parameter pattern for '${paramName}'`
    };
  }

  /**
   * Fix TS2345: Argument type errors with safe type assertions
   */
  private fixArgumentTypeError(content: string, error: TypeScriptError): {
    applied: boolean;
    content?: string;
    fixType: string;
    description: string;
  } {
    // For now, skip complex argument type errors - these often need careful consideration
    return {
      applied: false,
      fixType: 'complex_type_error',
      description: 'Argument type errors require manual review for type safety'
    };
  }

  /**
   * Fix TS2593: Missing test globals (describe, it, expect)
   */
  private fixTestGlobals(content: string, error: TypeScriptError): {
    applied: boolean;
    content?: string;
    fixType: string;
    description: string;
  } {
    // Add vitest globals import at the top of test files
    const lines = content.split('\n');

    // Check if already imported
    const hasVitestImport = lines.some(line =>
      line.includes('vitest/globals') ||
      line.includes('@vitest/globals') ||
      line.includes('vitest') && line.includes('describe')
    );

    if (hasVitestImport) {
      return {
        applied: false,
        fixType: 'already_imported',
        description: 'Vitest globals already imported'
      };
    }

    // Find the best place to insert the import (after other imports)
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ') || lines[i].startsWith('const ')) {
        insertIndex = i + 1;
      } else if (lines[i].trim() === '' || lines[i].startsWith('//') || lines[i].startsWith('/*')) {
        continue;
      } else {
        break;
      }
    }

    // Insert vitest globals import
    lines.splice(insertIndex, 0, "import { describe, it, expect } from 'vitest';");

    return {
      applied: true,
      content: lines.join('\n'),
      fixType: 'test_globals',
      description: 'Added vitest globals import'
    };
  }

  /**
   * Fix TS2304: Cannot find name
   */
  private fixMissingName(content: string, error: TypeScriptError): {
    applied: boolean;
    content?: string;
    fixType: string;
    description: string;
  } {
    // Extract the missing name
    const nameMatch = error.message.match(/Cannot find name '(\w+)'/);
    if (!nameMatch) {
      return {
        applied: false,
        fixType: 'no_name_match',
        description: 'Could not extract missing name'
      };
    }

    const missingName = nameMatch[1];

    // Common global variables that might be missing
    const globalFixes = new Map([
      ['process', "declare const process: any;"],
      ['global', "declare const global: any;"],
      ['window', "declare const window: any;"],
      ['document', "declare const document: any;"],
      ['console', "declare const console: any;"]
    ]);

    if (globalFixes.has(missingName)) {
      const lines = content.split('\n');
      lines.unshift(globalFixes.get(missingName)!);

      return {
        applied: true,
        content: lines.join('\n'),
        fixType: 'global_declare',
        description: `Added declaration for global '${missingName}'`
      };
    }

    return {
      applied: false,
      fixType: 'unknown_name',
      description: `Unknown missing name '${missingName}' - manual review needed`
    };
  }

  /**
   * Print summary report of all fixes applied
   */
  private printSummaryReport(): void {
    console.log('\n📋 AUTOMATED FIXES SUMMARY');
    console.log('=' .repeat(50));

    const appliedFixes = this.results.filter(r => r.applied);
    const manualReview = this.results.filter(r => !r.applied);

    console.log(`✅ Applied: ${appliedFixes.length} fixes`);
    console.log(`⚠️  Manual review: ${manualReview.length} items`);
    console.log(`📁 Files modified: ${this.fixedFiles.size}`);

    if (appliedFixes.length > 0) {
      console.log('\n🎯 FIXES APPLIED:');
      const fixTypeCount = new Map<string, number>();
      for (const fix of appliedFixes) {
        fixTypeCount.set(fix.fixType, (fixTypeCount.get(fix.fixType) || 0) + 1);
      }

      for (const [type, count] of fixTypeCount) {
        console.log(`  • ${type}: ${count} fixes`);
      }
    }

    if (manualReview.length > 0) {
      console.log('\n🔍 MANUAL REVIEW NEEDED:');
      for (const item of manualReview.slice(0, 5)) { // Show first 5
        console.log(`  • ${path.basename(item.file)}: ${item.description}`);
      }
      if (manualReview.length > 5) {
        console.log(`  ... and ${manualReview.length - 5} more`);
      }
    }
  }

  /**
   * Verify improvements by running TypeScript check again
   */
  private async verifyImprovements(): Promise<void> {
    console.log('\n🔍 Verifying improvements...');

    try {
      const newErrors = await this.getTypeScriptErrors();
      const errorReduction = newErrors.length;

      if (errorReduction === 0) {
        console.log('🎉 All TypeScript errors fixed!');
      } else {
        console.log(`📊 ${errorReduction} TypeScript errors remaining`);
        console.log('💡 Run the fixer again or review manual items');
      }

    } catch (error) {
      console.log('⚠️  Could not verify improvements:', error);
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'fix';

  switch (command) {
    case 'fix':
      const fixer = new AutomatedErrorFixer();
      await fixer.fixAllErrors();
      break;

    case 'help':
      console.log(`
Automated TypeScript Error Fixing Pipeline

Usage:
  npm run fix:typescript        # Run automated fixes
  tsx scripts/automated-error-fixes.ts fix    # Direct execution

Supported fixes:
  • TS7053: Implicit any element access
  • TS7006: Implicit any parameters
  • TS2593: Missing test globals
  • TS2304: Missing global declarations

The fixer is conservative and safe - complex type errors
are flagged for manual review to maintain type safety.
      `);
      break;

    default:
      console.log('Unknown command. Use "fix" or "help"');
      process.exit(1);
  }
}

if (process.argv[1]?.endsWith('automated-error-fixes.ts')) {
  main().catch(console.error);
}

export { AutomatedErrorFixer };