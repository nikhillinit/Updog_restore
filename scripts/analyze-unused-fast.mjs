#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Categories of unused variables
const CATEGORIES = {
  IMPORTS: 'Unused imports',
  DESTRUCTURED: 'Unused destructured variables',
  DECLARED: 'Unused declared variables',
  FUNCTION_PARAMS: 'Unused function parameters',
  CATCH_PARAMS: 'Unused catch parameters',
  REACT_PROPS: 'Unused React props',
  REACT_HOOKS: 'Unused React hooks',
  OTHER: 'Other unused variables'
};

// Patterns to identify false positives
const FALSE_POSITIVE_PATTERNS = [
  { pattern: /^[A-Z][A-Za-z0-9]*$/, category: 'React component' },
  { pattern: /^use[A-Z]/, category: 'React hook' },
  { pattern: /^(on|handle)[A-Z]/, category: 'Event handler' },
  { pattern: /^[A-Z][A-Za-z0-9]*Type$/, category: 'Type import' },
  { pattern: /^(init|setup|register|configure|load)[A-Z]/, category: 'Setup function' },
  { pattern: /^(debug|log|trace|console)/i, category: 'Debug variable' }
];

// Variables that should never be removed
const CRITICAL_VARIABLES = [
  'React', 'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef',
  'useContext', 'useReducer', 'Fragment', 'Suspense', 'ErrorBoundary',
  'memo', 'forwardRef'
];

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  
  console.log('🔍 Fast Analysis of ESLint unused variables...\n');
  
  // Load the existing eslint-errors.json file for faster analysis
  const eslintErrorsPath = path.join(projectRoot, 'eslint-errors.json');
  
  if (!fs.existsSync(eslintErrorsPath)) {
    console.log('⚠️  eslint-errors.json not found. Run npm run lint first.');
    return;
  }
  
  const eslintData = JSON.parse(fs.readFileSync(eslintErrorsPath, 'utf8'));
  
  // Extract unused variable errors
  const unusedVarsErrors = [];
  const fileErrorsMap = {};
  
  for (const file of eslintData) {
    const unusedInFile = file.messages.filter(msg => 
      msg.ruleId === '@typescript-eslint/no-unused-vars' ||
      msg.ruleId === 'no-unused-vars'
    );
    
    if (unusedInFile.length > 0) {
      unusedVarsErrors.push(...unusedInFile.map(msg => ({
        ...msg,
        filePath: file.filePath
      })));
      fileErrorsMap[file.filePath] = unusedInFile;
    }
  }
  
  console.log(`📊 Found ${unusedVarsErrors.length} unused variable issues\n`);
  
  // Categorize errors
  const categories = {
    [CATEGORIES.IMPORTS]: [],
    [CATEGORIES.DESTRUCTURED]: [],
    [CATEGORIES.DECLARED]: [],
    [CATEGORIES.FUNCTION_PARAMS]: [],
    [CATEGORIES.CATCH_PARAMS]: [],
    [CATEGORIES.REACT_PROPS]: [],
    [CATEGORIES.REACT_HOOKS]: [],
    [CATEGORIES.OTHER]: []
  };
  
  for (const error of unusedVarsErrors) {
    const message = error.message;
    const varName = message.match(/'([^']+)'/)?.[1] || 'unknown';
    
    if (message.includes('is defined but never used')) {
      // This is likely an import
      categories[CATEGORIES.IMPORTS].push({ ...error, varName });
    } else if (message.includes('destructured')) {
      categories[CATEGORIES.DESTRUCTURED].push({ ...error, varName });
    } else if (message.includes('assigned a value but never used')) {
      categories[CATEGORIES.DECLARED].push({ ...error, varName });
    } else if (message.includes('function parameter')) {
      categories[CATEGORIES.FUNCTION_PARAMS].push({ ...error, varName });
    } else if (message.includes('catch')) {
      categories[CATEGORIES.CATCH_PARAMS].push({ ...error, varName });
    } else if (varName.startsWith('props') || message.includes('props')) {
      categories[CATEGORIES.REACT_PROPS].push({ ...error, varName });
    } else if (varName.startsWith('use')) {
      categories[CATEGORIES.REACT_HOOKS].push({ ...error, varName });
    } else {
      categories[CATEGORIES.OTHER].push({ ...error, varName });
    }
  }
  
  // Analyze false positives
  const safeToRemove = [];
  const potentialFalsePositives = [];
  
  for (const error of unusedVarsErrors) {
    const message = error.message;
    const varName = message.match(/'([^']+)'/)?.[1] || 'unknown';
    
    if (CRITICAL_VARIABLES.includes(varName)) {
      potentialFalsePositives.push({
        ...error,
        varName,
        reason: 'Critical React/framework variable'
      });
    } else {
      let isFalsePositive = false;
      for (const { pattern, category } of FALSE_POSITIVE_PATTERNS) {
        if (pattern.test(varName)) {
          potentialFalsePositives.push({
            ...error,
            varName,
            reason: category
          });
          isFalsePositive = true;
          break;
        }
      }
      
      if (!isFalsePositive) {
        safeToRemove.push({ ...error, varName });
      }
    }
  }
  
  // Print analysis
  console.log('📋 Unused Variables by Category:');
  for (const [category, errors] of Object.entries(categories)) {
    if (errors.length > 0) {
      console.log(`\n${category}: ${errors.length}`);
      
      if (verbose && errors.length > 0) {
        // Show top files
        const fileCounts = {};
        errors.forEach(e => {
          fileCounts[e.filePath] = (fileCounts[e.filePath] || 0) + 1;
        });
        
        const topFiles = Object.entries(fileCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        
        console.log('  Top files:');
        topFiles.forEach(([file, count]) => {
          const shortPath = file.replace(/\\/g, '/').split('/').slice(-2).join('/');
          console.log(`    .../${shortPath}: ${count}`);
        });
        
        // Show examples
        console.log('  Examples:');
        errors.slice(0, 3).forEach(error => {
          console.log(`    ${error.varName} at line ${error.line}`);
        });
      }
    }
  }
  
  console.log('\n🔍 False Positives Analysis:');
  console.log(`  Safe to auto-fix: ${safeToRemove.length}`);
  console.log(`  Potential false positives: ${potentialFalsePositives.length}`);
  
  if (verbose) {
    const reasonCounts = {};
    potentialFalsePositives.forEach(fp => {
      reasonCounts[fp.reason] = (reasonCounts[fp.reason] || 0) + 1;
    });
    
    console.log('\n  False positive breakdown:');
    Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`    ${reason}: ${count}`);
      });
  }
  
  console.log('\n💡 Recommendations:');
  console.log('  1. Safe to auto-fix: Unused imports and simple declared variables');
  console.log('  2. Manual review needed: React components, hooks, and event handlers');
  console.log('  3. Use --fix flag with the main script to apply safe fixes');
  console.log('\n📝 To fix: node scripts/fix-unused-vars.mjs --fix --dry-run');
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});