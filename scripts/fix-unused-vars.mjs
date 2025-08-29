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
  // React components that might be used in JSX
  { pattern: /^[A-Z][A-Za-z0-9]*$/, category: 'React component' },
  
  // Common React hooks
  { pattern: /^use[A-Z]/, category: 'React hook' },
  
  // Event handlers
  { pattern: /^(on|handle)[A-Z]/, category: 'Event handler' },
  
  // Type imports
  { pattern: /^[A-Z][A-Za-z0-9]*Type$/, category: 'Type import' },
  
  // Common utility functions that might be used for side effects
  { pattern: /^(init|setup|register|configure|load)[A-Z]/, category: 'Setup function' },
  
  // Debugging variables
  { pattern: /^(debug|log|trace|console)/i, category: 'Debug variable' }
];

// Variables that should never be removed
const CRITICAL_VARIABLES = [
  'React', 
  'useState', 
  'useEffect', 
  'useCallback', 
  'useMemo', 
  'useRef',
  'useContext',
  'useReducer',
  'Fragment',
  'Suspense',
  'ErrorBoundary',
  'memo',
  'forwardRef'
];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const fix = args.includes('--fix');
  const analyze = args.includes('--analyze') || !fix;
  
  console.log('🔍 Analyzing ESLint unused variables issues...');
  
  // Find TypeScript files
  const tsFiles = findTypeScriptFiles();
  console.log(`Found ${tsFiles.length} TypeScript files to analyze`);
  
  // Collect ESLint errors
  const allErrors = [];
  const fileErrors = {};
  
  for (const file of tsFiles) {
    try {
      const result = runEslintOnFile(file);
      if (result.errors.length > 0) {
        allErrors.push(...result.errors);
        fileErrors[file] = result.errors;
      }
    } catch (error) {
      console.error(`Error analyzing ${file}:`, error.message);
    }
  }
  
  // Filter for unused variables
  const unusedVarsErrors = allErrors.filter(error => 
    error.ruleId === 'no-unused-vars' || 
    error.ruleId === '@typescript-eslint/no-unused-vars'
  );
  
  console.log(`\n📊 Found ${unusedVarsErrors.length} unused variable issues out of ${allErrors.length} total ESLint errors`);
  
  if (analyze) {
    // Categorize unused variables
    const categorizedVars = categorizeUnusedVars(unusedVarsErrors);
    
    // Analyze for false positives
    const { safeToRemove, potentialFalsePositives } = analyzeFalsePositives(unusedVarsErrors);
    
    // Print analysis
    printAnalysis(categorizedVars, safeToRemove, potentialFalsePositives, verbose);
  }
  
  if (fix) {
    // Fix unused variables
    fixUnusedVars(fileErrors, dryRun);
  }
}

function findTypeScriptFiles() {
  const output = execSync('git ls-files "*.ts" "*.tsx"', { 
    cwd: projectRoot,
    encoding: 'utf8' 
  });
  
  return output.split('\n')
    .filter(Boolean)
    .map(file => path.join(projectRoot, file));
}

function runEslintOnFile(filePath) {
  try {
    const relativePath = path.relative(projectRoot, filePath);
    const output = execSync(`npx eslint "${relativePath}" --format json`, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    const results = JSON.parse(output);
    
    if (results.length === 0) {
      return { errors: [] };
    }
    
    const errors = results[0].messages.map(msg => ({
      ...msg,
      filePath: relativePath
    }));
    
    return { errors };
  } catch (error) {
    // If ESLint exits with error code, parse the JSON output
    try {
      const output = error.stdout;
      const results = JSON.parse(output);
      
      if (results.length === 0) {
        return { errors: [] };
      }
      
      const relativePath = path.relative(projectRoot, filePath);
      const errors = results[0].messages.map(msg => ({
        ...msg,
        filePath: relativePath
      }));
      
      return { errors };
    } catch (parseError) {
      console.error(`Failed to parse ESLint output for ${filePath}`);
      return { errors: [] };
    }
  }
}

function categorizeUnusedVars(errors) {
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
  
  for (const error of errors) {
    const message = error.message;
    const varName = message.match(/'([^']+)'/)?.[1] || 'unknown';
    
    if (message.includes('import')) {
      categories[CATEGORIES.IMPORTS].push({ ...error, varName });
    } else if (message.includes('destructured')) {
      categories[CATEGORIES.DESTRUCTURED].push({ ...error, varName });
    } else if (message.includes('assigned a value but never used')) {
      categories[CATEGORIES.DECLARED].push({ ...error, varName });
    } else if (message.includes('function parameter')) {
      categories[CATEGORIES.FUNCTION_PARAMS].push({ ...error, varName });
    } else if (message.includes('catch parameter')) {
      categories[CATEGORIES.CATCH_PARAMS].push({ ...error, varName });
    } else if (varName.startsWith('props.') || varName === 'props') {
      categories[CATEGORIES.REACT_PROPS].push({ ...error, varName });
    } else if (varName.startsWith('use')) {
      categories[CATEGORIES.REACT_HOOKS].push({ ...error, varName });
    } else {
      categories[CATEGORIES.OTHER].push({ ...error, varName });
    }
  }
  
  return categories;
}

function analyzeFalsePositives(errors) {
  const safeToRemove = [];
  const potentialFalsePositives = [];
  
  for (const error of errors) {
    const message = error.message;
    const varName = message.match(/'([^']+)'/)?.[1] || 'unknown';
    
    // Check if it's a critical variable
    if (CRITICAL_VARIABLES.includes(varName)) {
      potentialFalsePositives.push({
        ...error,
        varName,
        reason: 'Critical React/framework variable'
      });
      continue;
    }
    
    // Check against false positive patterns
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
      safeToRemove.push({
        ...error,
        varName
      });
    }
  }
  
  return { safeToRemove, potentialFalsePositives };
}

function printAnalysis(categorizedVars, safeToRemove, potentialFalsePositives, verbose) {
  console.log('\n📋 Unused Variables Analysis:');
  
  // Print categories
  for (const [category, errors] of Object.entries(categorizedVars)) {
    if (errors.length > 0) {
      console.log(`\n${category}: ${errors.length}`);
      
      if (verbose) {
        const topFiles = getTopFiles(errors, 5);
        console.log('  Top files:');
        topFiles.forEach(({ file, count }) => {
          console.log(`    ${file}: ${count}`);
        });
        
        const examples = errors.slice(0, 3);
        console.log('  Examples:');
        examples.forEach(error => {
          console.log(`    ${error.filePath}:${error.line} - ${error.varName}`);
        });
      }
    }
  }
  
  // Print false positives analysis
  console.log(`\n🔍 False Positives Analysis:`);
  console.log(`  Safe to remove: ${safeToRemove.length}`);
  console.log(`  Potential false positives: ${potentialFalsePositives.length}`);
  
  if (verbose) {
    console.log('\n  False positive categories:');
    const reasonCounts = {};
    potentialFalsePositives.forEach(fp => {
      reasonCounts[fp.reason] = (reasonCounts[fp.reason] || 0) + 1;
    });
    
    Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`    ${reason}: ${count}`);
      });
  }
  
  console.log('\n💡 Recommendations:');
  console.log('  1. Safe to automatically fix: Unused imports, destructured variables, and declared variables');
  console.log('  2. Manual review needed: Function parameters, React props, and potential false positives');
  console.log('  3. Run with --fix to automatically fix safe issues');
}

function getTopFiles(errors, limit) {
  const fileCounts = {};
  
  errors.forEach(error => {
    fileCounts[error.filePath] = (fileCounts[error.filePath] || 0) + 1;
  });
  
  return Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([file, count]) => ({ file, count }));
}

function fixUnusedVars(fileErrors, dryRun) {
  console.log(`\n🔧 ${dryRun ? 'Would fix' : 'Fixing'} unused variables in ${Object.keys(fileErrors).length} files...`);
  
  let fixedCount = 0;
  
  for (const [filePath, errors] of Object.entries(fileErrors)) {
    const unusedVarsErrors = errors.filter(error => 
      error.ruleId === 'no-unused-vars' || 
      error.ruleId === '@typescript-eslint/no-unused-vars'
    );
    
    if (unusedVarsErrors.length === 0) continue;
    
    // Filter out potential false positives
    const safeErrors = unusedVarsErrors.filter(error => {
      const message = error.message;
      const varName = message.match(/'([^']+)'/)?.[1] || 'unknown';
      
      // Skip critical variables
      if (CRITICAL_VARIABLES.includes(varName)) {
        return false;
      }
      
      // Skip potential false positives
      for (const { pattern } of FALSE_POSITIVE_PATTERNS) {
        if (pattern.test(varName)) {
          return false;
        }
      }
      
      return true;
    });
    
    if (safeErrors.length === 0) continue;
    
    console.log(`  ${dryRun ? 'Would fix' : 'Fixing'} ${safeErrors.length} issues in ${filePath}`);
    
    if (!dryRun) {
      try {
        execSync(`npx eslint "${filePath}" --fix`, {
          cwd: projectRoot,
          stdio: 'ignore'
        });
        fixedCount++;
      } catch (error) {
        console.error(`    Failed to fix ${filePath}: ${error.message}`);
      }
    }
  }
  
  console.log(`\n✅ ${dryRun ? 'Would have fixed' : 'Fixed'} issues in ${fixedCount} files`);
  
  if (dryRun) {
    console.log('\n💡 Run without --dry-run to apply fixes');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}