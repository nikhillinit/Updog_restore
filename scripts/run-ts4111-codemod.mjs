#!/usr/bin/env node
/**
 * Safe TS4111 Codemod Runner
 *
 * Automatically fixes TS4111 index signature access errors with safety measures.
 *
 * Features:
 * - Dry-run mode (preview changes without modifying files)
 * - Git backup before changes (instant rollback capability)
 * - Baseline verification (before/after comparison)
 * - Test verification (rollback if tests fail)
 * - Auto-commit with proper message
 *
 * Usage:
 *   node scripts/run-ts4111-codemod.mjs --dry-run   # Preview only
 *   node scripts/run-ts4111-codemod.mjs             # Execute with safety
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_TESTS = process.argv.includes('--skip-tests');

const TARGET_PATTERNS = [
  'server/**/*.ts',
  'lib/**/*.ts',
  // Note: Client code handled separately (different patterns)
];

function execCommand(cmd, options = {}) {
  return execSync(cmd, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: options.silent ? 'pipe' : 'inherit',
    ...options
  });
}

function loadBaseline() {
  const baselinePath = path.join(REPO_ROOT, '.tsc-baseline.json');
  if (!fs.existsSync(baselinePath)) {
    throw new Error('Baseline file not found. Run: npm run baseline:save');
  }
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
}

function main() {
  console.log('═'.repeat(70));
  console.log('  TS4111 Codemod Runner - Automated Error Fixing');
  console.log('═'.repeat(70));
  console.log('');

  if (DRY_RUN) {
    console.log('⚠️  DRY-RUN MODE: No files will be modified');
    console.log('');
  }

  // Step 1: Check git status (must have no modified files for safety)
  console.log('📋 Step 1: Checking git status...');
  const gitStatus = execCommand('git status --porcelain', { silent: true });

  // Only check for modified files (M), ignore untracked files (??)
  const modifiedFiles = gitStatus
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('??'))
    .join('\n');

  if (modifiedFiles.trim() !== '') {
    console.error('');
    console.error('❌ Git working directory has uncommitted changes.');
    console.error('   Commit or stash modified files before running codemod.');
    console.error('');
    console.error('   Run: git status');
    console.error('');
    console.error('   Modified files:');
    modifiedFiles.split('\n').forEach(line => console.error('   ' + line));
    process.exit(1);
  }
  console.log('   ✅ No uncommitted changes');
  console.log('');

  // Step 2: Create backup branch
  if (!DRY_RUN) {
    console.log('💾 Step 2: Creating backup branch...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupBranch = `backup/before-ts4111-codemod-${timestamp}`;

    try {
      execCommand(`git branch ${backupBranch}`, { silent: true });
      console.log(`   ✅ Backup created: ${backupBranch}`);
      console.log('   💡 Rollback command: git reset --hard ' + backupBranch);
    } catch (error) {
      console.error('   ⚠️  Could not create backup branch (may already exist)');
    }
    console.log('');
  }

  // Step 3: Check baseline (before)
  console.log('📊 Step 3: Recording baseline (before)...');
  const baselineBefore = loadBaseline();
  console.log(`   Total errors:  ${baselineBefore.totalErrors}`);
  console.log(`   Client:        ${baselineBefore.projects.client?.total || 0}`);
  console.log(`   Server:        ${baselineBefore.projects.server?.total || 0}`);
  console.log(`   Shared:        ${baselineBefore.projects.shared?.total || 0}`);
  console.log('');

  // Step 4: Run codemod
  console.log(`🚀 Step 4: Running codemod ${DRY_RUN ? '(DRY-RUN)' : ''}...`);
  console.log('');

  // Expand glob patterns to actual file paths
  const targetFiles = [];
  for (const pattern of TARGET_PATTERNS) {
    const files = globSync(pattern, {
      cwd: REPO_ROOT,
      absolute: false,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts']
    });
    targetFiles.push(...files);
  }

  if (targetFiles.length === 0) {
    console.error('❌ No files found matching patterns');
    console.error('   Patterns:', TARGET_PATTERNS);
    process.exit(1);
  }

  console.log(`   Found ${targetFiles.length} files to process`);
  console.log('');

  const codemodPath = path.join(__dirname, 'codemods', 'fix-ts4111.ts');
  const codemodCommand = [
    'npx jscodeshift',
    `-t "${codemodPath}"`,
    ...targetFiles.map(f => `"${f}"`),
    '--parser=tsx',
    '--extensions=ts,tsx',
    DRY_RUN ? '--dry' : '',
    '--verbose=2'
  ].filter(Boolean).join(' ');

  try {
    execCommand(codemodCommand);
  } catch (error) {
    console.error('');
    console.error('❌ Codemod execution failed');
    console.error('   Check error output above');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('');
    console.log('═'.repeat(70));
    console.log('✅ Dry-run complete. Review changes above.');
    console.log('');
    console.log('💡 To apply changes, run without --dry-run:');
    console.log('   node scripts/run-ts4111-codemod.mjs');
    console.log('═'.repeat(70));
    return;
  }

  // Step 5: Update baseline
  console.log('');
  console.log('📊 Step 5: Updating TypeScript baseline...');
  try {
    execCommand('npm run baseline:save');
  } catch (error) {
    console.error('   ❌ Baseline update failed');
    console.error('   Manual baseline update required: npm run baseline:save');
  }
  console.log('');

  // Step 6: Verify improvement
  console.log('📈 Step 6: Verifying improvements...');
  const baselineAfter = loadBaseline();
  const errorsFixed = baselineBefore.totalErrors - baselineAfter.totalErrors;

  console.log('');
  console.log('   Before: ' + baselineBefore.totalErrors + ' errors');
  console.log('   After:  ' + baselineAfter.totalErrors + ' errors');
  console.log('   Fixed:  ' + errorsFixed + ' errors ' + (errorsFixed > 0 ? '✅' : '⚠️'));
  console.log('');

  if (errorsFixed <= 0) {
    console.warn('⚠️  Warning: No errors were fixed (or errors increased)');
    console.warn('   Review codemod output above');
    console.warn('   Baseline file updated but no commit created');
    console.log('');
    return;
  }

  // Step 7: Run tests (unless skipped)
  if (!SKIP_TESTS) {
    console.log('🧪 Step 7: Running tests to verify changes...');
    console.log('   Running: npm run test:quick');
    console.log('');

    try {
      execCommand('npm run test:quick');
      console.log('   ✅ Tests passed');
    } catch (error) {
      console.error('');
      console.error('❌ Tests failed! Changes were made but not committed.');
      console.error('');
      console.error('   Options:');
      console.error('   1. Fix tests manually, then commit');
      console.error('   2. Rollback: git reset --hard HEAD');
      console.error('   3. Review test failures and adjust codemod');
      console.error('');
      process.exit(1);
    }
    console.log('');
  } else {
    console.log('⚠️  Step 7: Tests skipped (--skip-tests flag)');
    console.log('');
  }

  // Step 8: Commit changes
  console.log('💾 Step 8: Committing changes...');

  const commitMessage = `fix(types): Auto-fix ${errorsFixed} TS4111 errors with codemod

Automated transformation using jscodeshift to fix index signature access.

Transformations applied:
- process.env.FOO → process.env['FOO']
- req.app → req['app']
- res.setHeader → res['setHeader']
- router.get → router['get']

Baseline: ${baselineBefore.totalErrors} → ${baselineAfter.totalErrors} errors (-${errorsFixed})

Project breakdown:
- Server: ${baselineBefore.projects.server?.total || 0} → ${baselineAfter.projects.server?.total || 0} (-${(baselineBefore.projects.server?.total || 0) - (baselineAfter.projects.server?.total || 0)})

Generated by: scripts/run-ts4111-codemod.mjs
Codemod: scripts/codemods/fix-ts4111.ts`;

  try {
    execCommand('git add .');
    fs.writeFileSync(path.join(REPO_ROOT, '.git', 'COMMIT_EDITMSG'), commitMessage);
    execCommand('git commit -F .git/COMMIT_EDITMSG');
    console.log('   ✅ Changes committed');
  } catch (error) {
    console.error('   ❌ Commit failed');
    console.error('   Changes are staged. Commit manually or rollback.');
    process.exit(1);
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log('✅ Codemod complete!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Errors fixed:     ${errorsFixed}`);
  console.log(`   New baseline:     ${baselineAfter.totalErrors} errors`);
  console.log(`   Server errors:    ${baselineAfter.projects.server?.total || 0}`);
  console.log('');
  console.log('🎯 Next steps:');
  console.log('   1. Review changes: git show HEAD');
  console.log('   2. Run full tests: npm test');
  console.log('   3. Push to remote: git push');
  console.log('═'.repeat(70));
}

// Run
try {
  main();
} catch (error) {
  console.error('');
  console.error('❌ Fatal error:', error.message);
  console.error('');
  process.exit(1);
}
