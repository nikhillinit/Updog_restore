#!/usr/bin/env node

/**
 * ESLint Cleanup Script
 * Fixes ESLint issues incrementally by directory
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const directories = [
  'client/src/components',
  'client/src/pages',
  'client/src/lib',
  'client/src/hooks',
  'client/src/services',
  'server/routes',
  'server/services',
  'server/middleware',
  'shared',
];

const stats = {
  total: 0,
  fixed: 0,
  remaining: 0,
  errors: [],
};

console.log('🔧 ESLint Cleanup Tool\n');
console.log('This will fix ESLint issues directory by directory.\n');

// Function to run ESLint on a directory
function fixDirectory(dir) {
  console.log(`\n📁 Processing: ${dir}`);
  
  if (!fs.existsSync(dir)) {
    console.log(`  ⚠️  Directory does not exist, skipping...`);
    return;
  }
  
  try {
    // First, get the count of issues
    const countCmd = `npx eslint ${dir} --format json`;
    let result;
    try {
      result = execSync(countCmd, { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      // ESLint exits with 1 if there are linting errors
      result = e.stdout;
    }
    
    const issues = JSON.parse(result || '[]');
    const totalIssues = issues.reduce((sum, file) => sum + file.errorCount + file.warningCount, 0);
    
    console.log(`  📊 Found ${totalIssues} issues`);
    stats.total += totalIssues;
    
    if (totalIssues > 0) {
      // Run with --fix
      console.log(`  🔧 Running auto-fix...`);
      try {
        execSync(`npx eslint ${dir} --fix`, { encoding: 'utf8', stdio: 'pipe' });
      } catch (e) {
        // Expected to fail if there are unfixable issues
      }
      
      // Check how many issues remain
      try {
        result = execSync(countCmd, { encoding: 'utf8', stdio: 'pipe' });
      } catch (e) {
        result = e.stdout;
      }
      
      const remainingIssues = JSON.parse(result || '[]');
      const remainingCount = remainingIssues.reduce((sum, file) => sum + file.errorCount + file.warningCount, 0);
      const fixedCount = totalIssues - remainingCount;
      
      stats.fixed += fixedCount;
      stats.remaining += remainingCount;
      
      console.log(`  ✅ Fixed ${fixedCount} issues`);
      console.log(`  ⚠️  ${remainingCount} issues require manual fixing`);
      
      // List the most common remaining issues
      if (remainingCount > 0) {
        const ruleCount = {};
        remainingIssues.forEach(file => {
          file.messages?.forEach(msg => {
            ruleCount[msg.ruleId] = (ruleCount[msg.ruleId] || 0) + 1;
          });
        });
        
        const topRules = Object.entries(ruleCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        
        if (topRules.length > 0) {
          console.log(`  📋 Top remaining issues:`);
          topRules.forEach(([rule, count]) => {
            console.log(`     - ${rule}: ${count} occurrences`);
          });
        }
      }
    } else {
      console.log(`  ✨ No issues found!`);
    }
  } catch (error) {
    console.error(`  ❌ Error processing ${dir}:`, error.message);
    stats.errors.push({ dir, error: error.message });
  }
}

// Main execution
console.log('Starting ESLint cleanup...\n');

directories.forEach(fixDirectory);

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 SUMMARY\n');
console.log(`Total issues found: ${stats.total}`);
console.log(`Issues auto-fixed: ${stats.fixed} (${Math.round(stats.fixed / stats.total * 100)}%)`);
console.log(`Issues remaining: ${stats.remaining} (${Math.round(stats.remaining / stats.total * 100)}%)`);

if (stats.errors.length > 0) {
  console.log('\n❌ Errors encountered:');
  stats.errors.forEach(({ dir, error }) => {
    console.log(`  - ${dir}: ${error}`);
  });
}

if (stats.remaining > 0) {
  console.log('\n📝 Next steps:');
  console.log('1. Review the remaining issues that need manual fixing');
  console.log('2. Most common issues are unused imports/variables');
  console.log('3. Consider commenting out unused code if it will be used later');
  console.log('4. Run "npm run lint" to see detailed remaining issues');
}

console.log('\n✅ ESLint cleanup complete!');
process.exit(stats.remaining > 0 ? 1 : 0);