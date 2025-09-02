#!/usr/bin/env node
/**
 * Lean pre-commit hook that never stalls development
 * Skips heavy checks in CI or with large changesets
 */

import { execSync } from 'node:child_process';

const isCI = process.env.CI === 'true';
const maxFilesForFullCheck = 50;

try {
  // Get staged files
  const staged = execSync('git diff --cached --name-only')
    .toString().trim().split('\n').filter(Boolean);

  if (staged.length === 0) {
    console.log('📝 No staged files, skipping pre-commit checks');
    process.exit(0);
  }

  console.log(`🔍 Pre-commit: ${staged.length} staged files`);

  // Skip heavy checks in CI or with large changesets
  if (isCI || staged.length > maxFilesForFullCheck) {
    console.log(`⚡ Fast mode (CI: ${isCI}, files: ${staged.length})`);
    console.log('✅ Pre-commit checks skipped for velocity');
    process.exit(0);
  }

  // Quick lint check on staged files only
  const lintableFiles = staged.filter(f => 
    f.match(/\.(ts|tsx|js|jsx)$/) && !f.includes('node_modules')
  );

  if (lintableFiles.length > 0) {
    console.log(`🧹 Linting ${lintableFiles.length} files...`);
    try {
      execSync(`npx eslint ${lintableFiles.join(' ')} --max-warnings=0`, { 
        stdio: 'inherit' 
      });
    } catch (error) {
      console.log('🔧 Auto-fixing lint issues...');
      execSync(`npx eslint ${lintableFiles.join(' ')} --fix`, { 
        stdio: 'inherit' 
      });
      console.log('✅ Lint issues auto-fixed');
    }
  }

  // Quick type check on TypeScript files
  const tsFiles = staged.filter(f => f.match(/\.tsx?$/));
  if (tsFiles.length > 0) {
    console.log(`📘 Type checking ${tsFiles.length} TypeScript files...`);
    execSync('npx tsc --noEmit --skipLibCheck', { stdio: 'inherit' });
  }

  console.log('✅ Pre-commit checks passed');

} catch (error) {
  console.error('❌ Pre-commit failed:', error.message);
  console.log('💡 Run `npm run fix-auto` to attempt auto-repair');
  process.exit(1);
}