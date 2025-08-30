#!/usr/bin/env node
/**
 * Measures TypeScript and ESLint error counts for tracking progress
 */

import { execSync } from 'node:child_process';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function measureTypeScriptErrors() {
  try {
    execSync('npm run check', { stdio: 'pipe' });
    return 0;
  } catch (error) {
    const output = error.stdout?.toString() || '';
    const errorCount = (output.match(/error TS/g) || []).length;
    return errorCount;
  }
}

function measureEslintErrors() {
  try {
    execSync('npm run lint', { stdio: 'pipe' });
    return { errors: 0, warnings: 0 };
  } catch (error) {
    const output = error.stdout?.toString() || '';
    const match = output.match(/(\d+) errors?, (\d+) warnings?/);
    if (match) {
      return { 
        errors: parseInt(match[1]) || 0, 
        warnings: parseInt(match[2]) || 0 
      };
    }
    return { errors: 0, warnings: 0 };
  }
}

function main() {
  console.log(`${colors.cyan}📊 Measuring Error Counts...${colors.reset}\n`);
  
  const tsErrors = measureTypeScriptErrors();
  const eslintResults = measureEslintErrors();
  
  console.log(`${colors.yellow}TypeScript:${colors.reset}`);
  console.log(`  Errors: ${tsErrors === 0 ? colors.green : colors.red}${tsErrors}${colors.reset}`);
  
  console.log(`\n${colors.yellow}ESLint:${colors.reset}`);
  console.log(`  Errors: ${eslintResults.errors === 0 ? colors.green : colors.red}${eslintResults.errors}${colors.reset}`);
  console.log(`  Warnings: ${colors.yellow}${eslintResults.warnings}${colors.reset}`);
  
  const total = tsErrors + eslintResults.errors;
  console.log(`\n${colors.cyan}Total Blocking Errors: ${total === 0 ? colors.green : colors.red}${total}${colors.reset}`);
  
  if (total === 0) {
    console.log(`\n${colors.green}✅ All clear! Ready for deployment.${colors.reset}`);
  }
}

main();