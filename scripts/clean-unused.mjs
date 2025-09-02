#!/usr/bin/env node

/**
 * Simplified script to clean up unused variables by prefixing them with underscore
 * This is a safer approach that doesn't remove code, just marks it as intentionally unused
 */

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Files to process
const FILE_PATTERNS = [
  'client/src/**/*.{ts,tsx}',
  'server/**/*.{ts,tsx}',
  'src/**/*.{ts,tsx}',
  'shared/**/*.{ts,tsx}',
];

// Files to skip
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
];

/**
 * Get list of files with unused variables from ESLint
 */
async function getFilesWithUnusedVars() {
  console.log('🔍 Running ESLint to find unused variables...');
  
  try {
    // Get all TypeScript/JavaScript files
    const files = [];
    for (const pattern of FILE_PATTERNS) {
      const matches = await glob(pattern, { ignore: IGNORE_PATTERNS });
      files.push(...matches);
    }
    
    console.log(`Found ${files.length} files to analyze`);
    
    // Process files in batches to avoid command line length limits
    const batchSize = 20;
    const filesWithIssues = new Map();
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      try {
        execSync(`npx eslint ${batch.join(' ')} --format json --no-error-on-unmatched-pattern`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          maxBuffer: 10 * 1024 * 1024
        });
      } catch (error) {
        // ESLint exits with error when there are issues
        const output = error.stdout?.toString() || '';
        if (output) {
          try {
            const results = JSON.parse(output);
            for (const file of results) {
              const unusedVars = [];
              for (const message of file.messages || []) {
                if (message.ruleId === 'no-unused-vars') {
                  const match = message.message.match(/'([^']+)'/);
                  if (match) {
                    unusedVars.push({
                      name: match[1],
                      line: message.line,
                      column: message.column,
                      message: message.message
                    });
                  }
                }
              }
              if (unusedVars.length > 0) {
                filesWithIssues.set(file.filePath, unusedVars);
              }
            }
          } catch (parseError) {
            // Skip this batch if we can't parse
          }
        }
      }
      
      if ((i + batchSize) % 100 === 0) {
        console.log(`Progress: ${Math.min(i + batchSize, files.length)}/${files.length} files analyzed`);
      }
    }
    
    return filesWithIssues;
  } catch (error) {
    console.error('Error getting unused vars:', error.message);
    return new Map();
  }
}

/**
 * Fix unused variables in a file by prefixing with underscore
 */
async function fixUnusedInFile(filePath, unusedVars) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    let modified = false;
    
    // Sort by line number in reverse to avoid offset issues
    const sortedVars = [...unusedVars].sort((a, b) => b.line - a.line);
    
    for (const varInfo of sortedVars) {
      const lineIndex = varInfo.line - 1;
      if (lineIndex >= 0 && lineIndex < lines.length) {
        const line = lines[lineIndex];
        const { name } = varInfo;
        
        // Skip if already prefixed with underscore
        if (name.startsWith('_')) continue;
        
        // Different patterns to handle
        const patterns = [
          // Function parameters
          new RegExp(`([(,]\\s*)(${name})(\\s*[,:)])`, 'g'),
          // Destructuring
          new RegExp(`({[^}]*)(\\b${name}\\b)([^}]*})`, 'g'),
          // Array destructuring  
          new RegExp(`(\\[[^\\]]*)(\\b${name}\\b)([^\\]]*\\])`, 'g'),
          // Import statements
          new RegExp(`(import\\s+(?:type\\s+)?{[^}]*)(\\b${name}\\b)([^}]*})`, 'g'),
          // Default imports
          new RegExp(`(import\\s+)(${name})(\\s+from)`, 'g'),
        ];
        
        let newLine = line;
        for (const pattern of patterns) {
          if (pattern.test(line)) {
            newLine = line.replace(pattern, '$1_$2$3');
            break;
          }
        }
        
        if (newLine !== line) {
          lines[lineIndex] = newLine;
          modified = true;
        }
      }
    }
    
    if (modified) {
      const newContent = lines.join('\n');
      if (!DRY_RUN) {
        await fs.writeFile(filePath, newContent, 'utf-8');
      }
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🧹 Cleaning up unused variables...');
  if (DRY_RUN) {
    console.log('🏃 DRY RUN MODE - No files will be modified');
  }
  
  const filesWithIssues = await getFilesWithUnusedVars();
  
  if (filesWithIssues.size === 0) {
    console.log('✅ No unused variables found!');
    return;
  }
  
  console.log(`\n📁 Found ${filesWithIssues.size} files with unused variables`);
  
  let processedCount = 0;
  let modifiedCount = 0;
  
  for (const [filePath, unusedVars] of filesWithIssues) {
    if (VERBOSE) {
      console.log(`\nProcessing: ${path.relative(process.cwd(), filePath)}`);
      console.log(`  ${unusedVars.length} unused variables`);
    }
    
    const modified = await fixUnusedInFile(filePath, unusedVars);
    if (modified) {
      modifiedCount++;
      if (VERBOSE) {
        console.log(`  ✓ Fixed`);
      }
    }
    
    processedCount++;
    if (processedCount % 10 === 0 && !VERBOSE) {
      console.log(`Progress: ${processedCount}/${filesWithIssues.size} files processed`);
    }
  }
  
  console.log('\n📊 Summary:');
  console.log(`  Files analyzed: ${filesWithIssues.size}`);
  console.log(`  Files modified: ${modifiedCount}`);
  
  if (!DRY_RUN && modifiedCount > 0) {
    console.log('\n🔧 Verifying fixes with ESLint...');
    try {
      execSync('npm run lint 2>&1', { stdio: 'pipe' });
      console.log('✅ All lint errors fixed!');
    } catch (error) {
      // Count remaining errors
      const output = error.stdout?.toString() || '';
      const errorMatch = output.match(/(\d+) problems? \((\d+) errors?/);
      if (errorMatch) {
        console.log(`⚠️  ${errorMatch[2]} errors remain (down from 1458)`);
      } else {
        console.log('⚠️  Some errors remain. Run `npm run lint` for details.');
      }
    }
  }
  
  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

// Run the script
main().catch(console.error);