#!/usr/bin/env node

/**
 * Calculate async migration percentage
 * Used by GitHub Actions to track progress
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

function countTotalFiles() {
  try {
    if (fs.existsSync('.migration/total.txt')) {
      const total = fs.readFileSync('.migration/total.txt', 'utf8').trim();
      return parseInt(total, 10);
    }
    
    // Fallback: count files directly using Node.js
    let count = 0;
    
    function walkDir(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === 'node_modules' || file === '.git') continue;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          walkDir(filePath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          count++;
        }
      }
    }
    
    walkDir('.');
    return count;
  } catch (error) {
    console.error('Error counting total files:', error.message);
    return 1; // Avoid division by zero
  }
}

function countMigratedFiles() {
  try {
    // Use git grep which works cross-platform
    const result = execSync('git grep -l "forEachAsync\\|mapAsync\\|filterAsync" -- "*.ts" "*.tsx"', 
      { encoding: 'utf8' });
    return result.trim().split('\n').filter(line => line.trim()).length;
  } catch (error) {
    // grep returns non-zero when no matches found
    return 0;
  }
}

export function identifyHotPaths() {
  try {
    // Exclude test files and type definitions to avoid noisy PRs
    const result = execSync(
      `git grep -c -E "forEach\\(|map\\(|filter\\(" -- '*.ts' '*.tsx' ':!tests/**' ':!**/*.test.*' ':!**/*.d.ts'`,
      { encoding: 'utf8' }
    );
    
    return result.trim().split('\n').map(line => {
      const [file, count] = line.split(':');
      return { 
        file, 
        arrayOps: parseInt(count),
        score: parseInt(count) * (file.includes('worker') ? 2 : 1) // Weight workers higher
      };
    }).sort((a, b) => b.score - a.score).slice(0, 10);
  } catch (error) {
    // No matches found
    return [];
  }
}

function main() {
  const total = countTotalFiles();
  const migrated = countMigratedFiles();
  const percent = Math.round((migrated / total) * 100);
  
  console.log(percent);
  
  // Optional: write to stderr for debugging
  if (process.env.DEBUG) {
    console.error(`Migration progress: ${percent}% (${migrated}/${total} files)`);
  }
}

// Check if this script is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { countTotalFiles, countMigratedFiles };
