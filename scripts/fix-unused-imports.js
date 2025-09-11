#!/usr/bin/env node

/**
 * Fix unused imports specifically
 * This is the most common and easiest issue to fix automatically
 */

import { execSync } from 'child_process';
import fs from 'fs';

console.log('🔧 Fixing unused imports...\n');

// Install the plugin if not already installed
console.log('Ensuring eslint-plugin-unused-imports is available...');
try {
  execSync('npm ls eslint-plugin-unused-imports', { stdio: 'pipe' });
} catch {
  console.log('Installing eslint-plugin-unused-imports...');
  execSync('npm install --save-dev eslint-plugin-unused-imports', { stdio: 'inherit' });
}

// Create a temporary config that focuses on unused imports
const tempConfig = `
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { 
          vars: 'all', 
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', '.next/**', 'coverage/**'],
  },
];
`;

// Write temporary config
fs.writeFileSync('.eslintrc.unused.mjs', tempConfig);

const directories = [
  'client/src',
  'server',
  'shared',
];

let totalFixed = 0;

for (const dir of directories) {
  if (!fs.existsSync(dir)) {
    console.log(`⚠️  ${dir} does not exist, skipping...`);
    continue;
  }
  
  console.log(`\n📁 Processing ${dir}...`);
  
  try {
    // Run ESLint with fix using the temporary config
    const result = execSync(
      `npx eslint ${dir} --config .eslintrc.unused.mjs --fix --no-ignore`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    console.log(`✅ Fixed unused imports in ${dir}`);
  } catch (e) {
    // ESLint returns non-zero if there are unfixable issues
    const output = e.stdout || e.stderr || '';
    const matches = output.match(/(\d+) problems?.*fixed/);
    if (matches) {
      const fixed = parseInt(matches[1], 10);
      totalFixed += fixed;
      console.log(`✅ Fixed ${fixed} unused import issues in ${dir}`);
    } else {
      console.log(`✅ Processed ${dir}`);
    }
  }
}

// Clean up temporary config
fs.unlinkSync('.eslintrc.unused.mjs');

console.log('\n' + '='.repeat(50));
console.log(`✅ Unused imports cleanup complete!`);
console.log(`📊 Total issues addressed: ${totalFixed}`);
console.log('\nNext steps:');
console.log('1. Review the changes with: git diff');
console.log('2. Stage the changes: git add -p');
console.log('3. Commit: git commit -m "chore: remove unused imports"');
console.log('4. Run full lint to see remaining issues: npm run lint');