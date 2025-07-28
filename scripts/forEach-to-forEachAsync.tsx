#!/usr/bin/env tsx

/**
 * Codemod: forEach-to-forEachAsync
 * 
 * Transforms problematic array.forEach(async ...) patterns to use forEachAsync utility
 * 
 * This script:
 * 1. Scans all .ts/.tsx files for array.forEach(async (…) => …) patterns
 * 2. Injects import { forEachAsync } from 'utils/async-iteration' when missing
 * 3. Replaces each await array.forEach(async (item, i) => …) with await forEachAsync(array, async (item, i) => …)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

interface TransformResult {
  file: string;
  changed: boolean;
  addedImport: boolean;
  transformations: number;
}

class ForEachToForEachAsyncCodemod {
  private results: TransformResult[] = [];
  private dryRun: boolean = false;

  constructor(dryRun: boolean = false) {
    this.dryRun = dryRun;
  }

  /**
   * Main entry point for the codemod
   */
  public async run(directory: string = 'client/src'): Promise<void> {
    console.log(`🔍 Scanning ${directory} for forEach(async ...) patterns...`);
    console.log(`${this.dryRun ? '🧪 DRY RUN MODE - No files will be modified' : '✏️  Files will be modified'}`);
    console.log('');

    const files = this.findTypeScriptFiles(directory);
    console.log(`📁 Found ${files.length} TypeScript files`);

    for (const file of files) {
      await this.transformFile(file);
    }

    this.printSummary();
  }

  /**
   * Find all .ts and .tsx files recursively
   */
  private findTypeScriptFiles(directory: string): string[] {
    const files: string[] = [];

    const scanDirectory = (dir: string): void => {
      try {
        const entries = readdirSync(dir);
        
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip node_modules and other common directories
            if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry)) {
              scanDirectory(fullPath);
            }
          } else if (stat.isFile()) {
            const ext = extname(entry);
            if (['.ts', '.tsx'].includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not scan directory ${dir}:`, error);
      }
    };

    scanDirectory(directory);
    return files;
  }

  /**
   * Transform a single file
   */
  private async transformFile(filePath: string): Promise<void> {
    try {
      const originalContent = readFileSync(filePath, 'utf-8');
      let content = originalContent;
      
      const result: TransformResult = {
        file: filePath,
        changed: false,
        addedImport: false,
        transformations: 0
      };

      // Skip files that already import forEachAsync
      const hasForEachAsyncImport = this.hasForEachAsyncImport(content);
      
      // Find forEach(async ...) patterns
      const forEachMatches = this.findForEachAsyncPatterns(content);
      
      if (forEachMatches.length === 0) {
        return; // No patterns found, skip this file
      }

      console.log(`🔧 Processing: ${relative(process.cwd(), filePath)}`);
      console.log(`   Found ${forEachMatches.length} forEach(async ...) pattern(s)`);

      // Add import if needed and not already present
      if (!hasForEachAsyncImport) {
        content = this.addForEachAsyncImport(content);
        result.addedImport = true;
        console.log(`   ✅ Added forEachAsync import`);
      }

      // Transform forEach patterns
      for (const match of forEachMatches) {
        const transformed = this.transformForEachPattern(match);
        content = content.replace(match.fullMatch, transformed);
        result.transformations++;
        console.log(`   🔄 Transformed: ${match.arrayName}.forEach(...) → forEachAsync(${match.arrayName}, ...)`);
      }

      // Write the file if changed and not in dry run mode
      if (content !== originalContent) {
        result.changed = true;
        
        if (!this.dryRun) {
          writeFileSync(filePath, content, 'utf-8');
          console.log(`   💾 File updated`);
        } else {
          console.log(`   🧪 File would be updated (dry run)`);
        }
      }

      console.log('');
      this.results.push(result);

    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error);
    }
  }

  /**
   * Check if file already imports forEachAsync
   */
  private hasForEachAsyncImport(content: string): boolean {
    const importRegex = /import\s*{[^}]*forEachAsync[^}]*}\s*from\s*['"`].*async-iteration['"`]/;
    return importRegex.test(content);
  }

  /**
   * Find all forEach(async ...) patterns in the content
   */
  private findForEachAsyncPatterns(content: string): Array<{
    fullMatch: string;
    arrayName: string;
    callback: string;
    hasAwait: boolean;
  }> {
    const patterns: Array<{
      fullMatch: string;
      arrayName: string;
      callback: string;
      hasAwait: boolean;
    }> = [];

    // Pattern to match: (await)? someArray.forEach(async (...) => ...)
    // This is a simplified regex - in a production codemod you'd want to use a proper AST parser
    const forEachAsyncRegex = /(await\s+)?(\w+(?:\.\w+)*|\w+(?:\[\w+\])*)\s*\.\s*forEach\s*\(\s*(async\s*\([^)]*\)\s*=>\s*{[^}]*}|async\s*\([^)]*\)\s*=>[^,;]+)/g;

    let match;
    while ((match = forEachAsyncRegex.exec(content)) !== null) {
      const [fullMatch, awaitPrefix, arrayName, callback] = match;
      
      patterns.push({
        fullMatch,
        arrayName: arrayName.trim(),
        callback: callback.trim(),
        hasAwait: Boolean(awaitPrefix)
      });
    }

    return patterns;
  }

  /**
   * Add forEachAsync import to the file
   */
  private addForEachAsyncImport(content: string): string {
    // Find existing imports from utils/async-iteration if any
    const asyncIterationImportRegex = /import\s*{([^}]*)}\s*from\s*['"`].*utils\/async-iteration['"`];?/;
    const match = asyncIterationImportRegex.exec(content);

    if (match) {
      // Extend existing import
      const existingImports = match[1].trim();
      const updatedImports = existingImports 
        ? `${existingImports}, forEachAsync` 
        : 'forEachAsync';
      
      return content.replace(
        asyncIterationImportRegex,
        `import { ${updatedImports} } from 'utils/async-iteration';`
      );
    } else {
      // Add new import after other imports or at the top
      const importRegex = /^((?:import\s+.*?;\s*\n)*)/m;
      const importMatch = importRegex.exec(content);
      
      if (importMatch) {
        const existingImports = importMatch[1];
        const newImport = `import { forEachAsync } from 'utils/async-iteration';\n`;
        return content.replace(importRegex, existingImports + newImport);
      } else {
        // No existing imports, add at the top
        return `import { forEachAsync } from 'utils/async-iteration';\n\n${content}`;
      }
    }
  }

  /**
   * Transform a forEach pattern to forEachAsync
   */
  private transformForEachPattern(match: {
    fullMatch: string;
    arrayName: string;
    callback: string;
    hasAwait: boolean;
  }): string {
    const { arrayName, callback, hasAwait } = match;
    
    // Transform: array.forEach(async (item, i) => ...) 
    // To: forEachAsync(array, async (item, i) => ...)
    const awaitPrefix = hasAwait ? 'await ' : '';
    return `${awaitPrefix}forEachAsync(${arrayName}, ${callback})`;
  }

  /**
   * Print transformation summary
   */
  private printSummary(): void {
    const changedFiles = this.results.filter(r => r.changed);
    const totalTransformations = this.results.reduce((sum, r) => sum + r.transformations, 0);
    const filesWithAddedImports = this.results.filter(r => r.addedImport).length;

    console.log('📊 TRANSFORMATION SUMMARY');
    console.log('========================');
    console.log(`Files processed: ${this.results.length}`);
    console.log(`Files changed: ${changedFiles.length}`);
    console.log(`Total transformations: ${totalTransformations}`);
    console.log(`Files with added imports: ${filesWithAddedImports}`);
    console.log('');

    if (changedFiles.length > 0) {
      console.log('📝 Changed files:');
      for (const result of changedFiles) {
        const relativePath = relative(process.cwd(), result.file);
        console.log(`   ${relativePath} (${result.transformations} transformation(s)${result.addedImport ? ', +import' : ''})`);
      }
      console.log('');
    }

    if (totalTransformations > 0) {
      console.log('✅ Codemod completed successfully!');
      if (this.dryRun) {
        console.log('🧪 This was a dry run. Re-run without --dry-run to apply changes.');
      }
    } else {
      console.log('ℹ️  No forEach(async ...) patterns found to transform.');
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const directory = args.find(arg => !arg.startsWith('--')) || 'client/src';

  console.log('🚀 forEach → forEachAsync Codemod');
  console.log('==================================');
  console.log('');

  const codemod = new ForEachToForEachAsyncCodemod(dryRun);
  await codemod.run(directory);
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('forEach-to-forEachAsync.tsx')) {
  main().catch(console.error);
}

export { ForEachToForEachAsyncCodemod };
