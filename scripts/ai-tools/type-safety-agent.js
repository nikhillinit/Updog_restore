#!/usr/bin/env node
/**
 * BMAD Type Safety Agent
 * Automated workflow for detecting and fixing TypeScript type safety issues
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { execSync } from 'child_process';
import path from 'path';
import { logger } from '../../lib/logger.js';

class TypeSafetyAgent {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.maxFixes = options.maxFixes || 10;
    this.confidence = options.confidence || 0.8;
    this.stats = {
      filesScanned: 0,
      anyUsageFound: 0,
      fixesApplied: 0,
      fixesSkipped: 0,
      errors: 0
    };
  }

  /**
   * Main workflow: scan → analyze → suggest → apply
   */
  async run() {
    logger.info('🤖 Type Safety Agent starting...');
    
    // Phase 1: Scan for type issues
    const issues = await this.scanForTypeIssues();
    
    // Phase 2: Analyze and categorize
    const categorized = this.categorizeIssues(issues);
    
    // Phase 3: Generate fixes
    const fixes = await this.generateFixes(categorized);
    
    // Phase 4: Apply fixes (if not dry run)
    if (!this.dryRun) {
      await this.applyFixes(fixes);
    }
    
    // Phase 5: Report results
    this.reportResults();
    
    return this.stats;
  }

  /**
   * Scan codebase for type safety issues
   */
  async scanForTypeIssues() {
    const issues = [];
    
    // Pattern 1: Explicit 'any' usage
    const anyPattern = /:\s*any\b/g;
    
    // Pattern 2: Type assertions to 'any'
    const asAnyPattern = /as\s+any\b/g;
    
    // Pattern 3: Missing type annotations
    const missingTypePattern = /function\s+\w+\s*\([^)]*\)\s*(?!:)/g;
    
    // Pattern 4: Unsafe operations
    const unsafePattern = /@ts-ignore|@ts-nocheck/g;
    
    const files = await glob('**/*.{ts,tsx}', {
      ignore: [
        'node_modules/**',
        'dist/**',
        '*.test.ts',
        '*.spec.ts',
        '*.d.ts'
      ]
    });
    
    for (const file of files) {
      this.stats.filesScanned++;
      
      try {
        const content = readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          // Check for 'any' usage
          if (anyPattern.test(line)) {
            issues.push({
              file,
              line: index + 1,
              type: 'explicit-any',
              code: line.trim(),
              confidence: this.calculateConfidence(line, 'any')
            });
            this.stats.anyUsageFound++;
          }
          
          // Check for 'as any' assertions
          if (asAnyPattern.test(line)) {
            issues.push({
              file,
              line: index + 1,
              type: 'as-any',
              code: line.trim(),
              confidence: this.calculateConfidence(line, 'as-any')
            });
          }
          
          // Check for unsafe operations
          if (unsafePattern.test(line)) {
            issues.push({
              file,
              line: index + 1,
              type: 'unsafe-operation',
              code: line.trim(),
              confidence: 0.9 // High confidence these should be fixed
            });
          }
        });
      } catch (error) {
        logger.error(`Error scanning ${file}:`, error);
        this.stats.errors++;
      }
    }
    
    return issues;
  }

  /**
   * Categorize issues by type and risk level
   */
  categorizeIssues(issues) {
    return {
      critical: issues.filter(i => 
        i.type === 'unsafe-operation' || 
        (i.type === 'explicit-any' && i.file.includes('/server/'))
      ),
      high: issues.filter(i => 
        i.type === 'as-any' || 
        (i.type === 'explicit-any' && i.confidence > 0.8)
      ),
      medium: issues.filter(i => 
        i.type === 'explicit-any' && 
        i.confidence > 0.5 && 
        i.confidence <= 0.8
      ),
      low: issues.filter(i => i.confidence <= 0.5)
    };
  }

  /**
   * Generate type-safe fixes for issues
   */
  async generateFixes(categorized) {
    const fixes = [];
    
    // Focus on critical and high priority issues first
    const priorityIssues = [
      ...categorized.critical,
      ...categorized.high
    ].slice(0, this.maxFixes);
    
    for (const issue of priorityIssues) {
      const fix = await this.generateFix(issue);
      if (fix) {
        fixes.push(fix);
      }
    }
    
    return fixes;
  }

  /**
   * Generate a specific fix for an issue
   */
  async generateFix(issue) {
    switch (issue.type) {
      case 'explicit-any':
        return this.fixExplicitAny(issue);
      
      case 'as-any':
        return this.fixAsAny(issue);
      
      case 'unsafe-operation':
        return this.fixUnsafeOperation(issue);
      
      default:
        return null;
    }
  }

  /**
   * Fix explicit 'any' usage
   */
  fixExplicitAny(issue) {
    const { code, file, line } = issue;
    
    // Common patterns and their replacements
    const replacements = {
      'any[]': 'unknown[]',
      'any)': 'unknown)',
      ': any': ': unknown',
      'Record<string, any>': 'Record<string, unknown>',
      'Promise<any>': 'Promise<unknown>'
    };
    
    // Try to infer better types based on context
    const context = this.getFileContext(file, line);
    
    // Check if it's a request/response type
    if (context.includes('Request') || context.includes('req')) {
      return {
        file,
        line,
        original: code,
        replacement: code.replace(/:\s*any/, ': Request'),
        confidence: 0.7,
        requiresImport: 'import { Request } from "express";'
      };
    }
    
    // Check if it's Fastify related
    if (context.includes('fastify')) {
      return {
        file,
        line,
        original: code,
        replacement: code.replace(/:\s*any/, ': FastifyInstance'),
        confidence: 0.8,
        requiresImport: 'import type { FastifyInstance } from "fastify";'
      };
    }
    
    // Default to unknown for safety
    return {
      file,
      line,
      original: code,
      replacement: code.replace(/:\s*any/, ': unknown'),
      confidence: 0.9
    };
  }

  /**
   * Fix 'as any' type assertions
   */
  fixAsAny(issue) {
    const { code, file, line } = issue;
    
    // Replace with 'as unknown' as intermediate step
    return {
      file,
      line,
      original: code,
      replacement: code.replace(/as\s+any/, 'as unknown'),
      confidence: 0.95,
      note: 'Consider adding proper type assertion after unknown'
    };
  }

  /**
   * Fix unsafe operations (@ts-ignore, @ts-nocheck)
   */
  fixUnsafeOperation(issue) {
    const { code, file, line } = issue;
    
    return {
      file,
      line,
      original: code,
      replacement: '', // Remove the unsafe directive
      confidence: 0.8,
      note: 'Unsafe directive removed - fix underlying type issue'
    };
  }

  /**
   * Apply fixes to files
   */
  async applyFixes(fixes) {
    const fileGroups = {};
    
    // Group fixes by file
    fixes.forEach(fix => {
      if (!fileGroups[fix.file]) {
        fileGroups[fix.file] = [];
      }
      fileGroups[fix.file].push(fix);
    });
    
    // Apply fixes file by file
    for (const [file, fileFixes] of Object.entries(fileGroups)) {
      try {
        let content = readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        // Sort fixes by line number (descending) to avoid offset issues
        fileFixes.sort((a, b) => b.line - a.line);
        
        // Apply each fix
        fileFixes.forEach(fix => {
          if (fix.confidence >= this.confidence) {
            lines[fix.line - 1] = fix.replacement;
            this.stats.fixesApplied++;
            logger.info(`✅ Fixed ${fix.file}:${fix.line}`);
          } else {
            this.stats.fixesSkipped++;
            logger.warn(`⚠️ Skipped low confidence fix in ${fix.file}:${fix.line}`);
          }
        });
        
        // Write back to file
        writeFileSync(file, lines.join('\n'));
        
        // Add required imports if needed
        this.addRequiredImports(file, fileFixes);
        
      } catch (error) {
        logger.error(`Error applying fixes to ${file}:`, error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Add required imports for fixes
   */
  addRequiredImports(file, fixes) {
    const imports = new Set();
    
    fixes.forEach(fix => {
      if (fix.requiresImport) {
        imports.add(fix.requiresImport);
      }
    });
    
    if (imports.size > 0) {
      let content = readFileSync(file, 'utf8');
      const importStatements = Array.from(imports).join('\n');
      
      // Add imports after existing imports or at the beginning
      if (content.includes('import ')) {
        const lastImportIndex = content.lastIndexOf('import ');
        const endOfLine = content.indexOf('\n', lastImportIndex);
        content = content.slice(0, endOfLine + 1) + 
                  importStatements + '\n' + 
                  content.slice(endOfLine + 1);
      } else {
        content = importStatements + '\n\n' + content;
      }
      
      writeFileSync(file, content);
    }
  }

  /**
   * Get context around a line for better type inference
   */
  getFileContext(file, lineNumber, contextLines = 5) {
    try {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      const start = Math.max(0, lineNumber - contextLines);
      const end = Math.min(lines.length, lineNumber + contextLines);
      
      return lines.slice(start, end).join('\n');
    } catch {
      return '';
    }
  }

  /**
   * Calculate confidence for a fix
   */
  calculateConfidence(line, type) {
    let confidence = 0.5;
    
    // Higher confidence for simple cases
    if (type === 'any') {
      if (line.includes('any[]')) confidence = 0.9;
      if (line.includes('Record<string, any>')) confidence = 0.85;
      if (line.includes('Promise<any>')) confidence = 0.85;
      if (line.includes('(req: any')) confidence = 0.7;
      if (line.includes('fastify: any')) confidence = 0.8;
    }
    
    if (type === 'as-any') {
      confidence = 0.95; // High confidence for replacing with 'as unknown'
    }
    
    return confidence;
  }

  /**
   * Generate report of results
   */
  reportResults() {
    console.log('\n📊 Type Safety Agent Report');
    console.log('━'.repeat(40));
    console.log(`Files scanned: ${this.stats.filesScanned}`);
    console.log(`'any' usage found: ${this.stats.anyUsageFound}`);
    console.log(`Fixes applied: ${this.stats.fixesApplied}`);
    console.log(`Fixes skipped: ${this.stats.fixesSkipped}`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log('━'.repeat(40));
    
    // Run type check to verify fixes
    if (this.stats.fixesApplied > 0) {
      console.log('\n🔍 Running type check...');
      try {
        execSync('npm run check:fast', { stdio: 'inherit' });
        console.log('✅ Type check passed!');
      } catch {
        console.log('⚠️ Type check failed - manual review needed');
      }
    }
    
    return this.stats;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    maxFixes: parseInt(args.find(a => a.startsWith('--max-fixes='))?.split('=')[1] || '10'),
    confidence: parseFloat(args.find(a => a.startsWith('--confidence='))?.split('=')[1] || '0.8')
  };
  
  if (args.includes('--help')) {
    console.log(`
Type Safety Agent - Automated TypeScript type safety improvements

Usage:
  node scripts/ai-tools/type-safety-agent.js [options]

Options:
  --dry-run           Scan and suggest without applying fixes
  --max-fixes=N       Maximum number of fixes to apply (default: 10)
  --confidence=N      Minimum confidence threshold (0-1, default: 0.8)
  --help              Show this help message

Examples:
  npm run ai:type-safety                    # Run with defaults
  npm run ai:type-safety -- --dry-run       # Preview changes
  npm run ai:type-safety -- --max-fixes=50  # Fix more issues
`);
    process.exit(0);
  }
  
  const agent = new TypeSafetyAgent(options);
  agent.run()
    .then(stats => {
      process.exit(stats.errors > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Agent failed:', error);
      process.exit(1);
    });
}

export { TypeSafetyAgent };