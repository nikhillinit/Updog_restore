#!/usr/bin/env node
/**
 * Check and auto-ratchet type error budgets
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BUDGET_FILE = '.type-budget.json';

function parseTypeScriptErrors() {
  try {
    const output = execSync('npx tsc --noEmit -p tsconfig.server.json 2>&1', { encoding: 'utf8' });
    return [];
  } catch (err) {
    const output = err.stdout || err.stderr || '';
    const lines = output.split('\n');
    const errors = [];

    for (const line of lines) {
      const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+):/);
      if (match) {
        errors.push({
          file: match[1].replace(/\\/g, '/'),
          line: parseInt(match[2]),
          code: match[4]
        });
      }
    }

    return errors;
  }
}

function groupErrorsByFile(errors) {
  const grouped = new Map();
  for (const err of errors) {
    if (!grouped.has(err.file)) {
      grouped.set(err.file, []);
    }
    grouped.get(err.file).push(err);
  }
  return grouped;
}

export function checkTypeBudget() {
  if (!existsSync(BUDGET_FILE)) {
    console.warn(`⚠ No budget file found at ${BUDGET_FILE}`);
    console.log('Run with --init to create one');
    return;
  }

  const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
  const errors = parseTypeScriptErrors();
  const errorsByFile = groupErrorsByFile(errors);

  const violations = [];
  const improvements = [];
  let updated = false;

  // Check budgeted files
  for (const [file, config] of Object.entries(budget.budgets || {})) {
    const fileErrors = errorsByFile.get(file) || [];
    const current = fileErrors.length;

    // If improved, ratchet down the budget
    if (current < config.current) {
      improvements.push({
        file,
        oldBudget: config.current,
        newBudget: current,
        improvement: config.current - current
      });
      config.current = current;
      updated = true;
    }

    // If exceeded, that's a violation
    if (current > config.current) {
      violations.push({
        file,
        budget: config.current,
        actual: current,
        excess: current - config.current
      });
    }
  }

  // Check strict files (must have 0 errors)
  const strictViolations = [];
  for (const pattern of budget.strictFiles || []) {
    const strictErrors = errors.filter(e => e.file.startsWith(pattern));
    if (strictErrors.length > 0) {
      strictViolations.push({
        pattern,
        errors: strictErrors.length,
        files: [...new Set(strictErrors.map(e => e.file))]
      });
    }
  }

  // Report results
  if (violations.length > 0 || strictViolations.length > 0) {
    console.error('❌ Type budget violations:\n');

    if (violations.length > 0) {
      console.error('Budgeted files:');
      console.table(violations);
    }

    if (strictViolations.length > 0) {
      console.error('\nStrict files (must be clean):');
      strictViolations.forEach(v => {
        console.error(`  ${v.pattern}: ${v.errors} error(s) in ${v.files.length} file(s)`);
      });
    }

    process.exit(1);
  }

  // Report improvements
  if (improvements.length > 0) {
    console.log('✅ Type budget improvements (auto-ratcheted):\n');
    console.table(improvements);

    // Save updated budget
    writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2));
    console.log(`\nUpdated ${BUDGET_FILE} with new budgets`);
  } else {
    console.log('✅ All type budgets met (no changes)');
  }

  // Global target check
  const totalErrors = errors.length;
  const globalTarget = budget.globalTarget || 0;

  if (globalTarget > 0) {
    console.log(`\nGlobal: ${totalErrors} errors (target: ${globalTarget})`);
    if (totalErrors > globalTarget) {
      console.warn(`⚠ Above global target by ${totalErrors - globalTarget} errors`);
    }
  }
}

// Initialize budget file
function initBudget() {
  const errors = parseTypeScriptErrors();
  const errorsByFile = groupErrorsByFile(errors);

  // Get top 10 files by error count
  const top10 = Array.from(errorsByFile.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  const budgets = {};
  for (const [file, errs] of top10) {
    budgets[file] = {
      current: errs.length,
      target: Math.floor(errs.length * 0.5), // Target 50% reduction
      owner: 'team',
      deadline: null
    };
  }

  const budget = {
    budgets,
    globalTarget: errors.length,
    strictFiles: [
      'server/types/',
      'shared/lib/ts/'
    ]
  };

  writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2));
  console.log(`✅ Created ${BUDGET_FILE} with top 10 error files`);
  console.log('Edit this file to adjust targets and deadlines');
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--init')) {
    initBudget();
  } else {
    checkTypeBudget();
  }
}
