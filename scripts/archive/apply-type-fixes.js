#!/usr/bin/env node
/**
 * Apply Type Safety Fixes - Automated replacement of any with unknown
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const REPLACEMENTS = [
  // Simple type annotations
  { pattern: /:\s*any\b/g, replacement: ': unknown' },
  // Type assertions
  { pattern: /as\s+any\b/g, replacement: 'as unknown' },
  // Array types
  { pattern: /:\s*any\[\]/g, replacement: ': unknown[]' },
  // Generic types
  { pattern: /Promise<any>/g, replacement: 'Promise<unknown>' },
  { pattern: /Array<any>/g, replacement: 'Array<unknown>' },
  { pattern: /Record<string,\s*any>/g, replacement: 'Record<string, unknown>' },
];

async function applyFixes() {
  console.log('🔧 Applying type safety fixes...\n');

  const files = await glob('**/*.{ts,tsx}', {
    ignore: [
      'node_modules/**',
      'dist/**',
      '*.test.ts',
      '*.spec.ts',
      '*.d.ts',
      'repo/**',
      'packages/**',
      'types/vendor.d.ts', // Skip vendor types for now
    ],
  });

  let totalFixes = 0;
  const fixedFiles = [];

  for (const file of files) {
    try {
      let content = readFileSync(file, 'utf8');
      const originalContent = content;
      let fileFixCount = 0;

      // Apply replacements
      REPLACEMENTS.forEach(({ pattern, replacement }) => {
        const matches = content.match(pattern) || [];
        if (matches.length > 0) {
          content = content.replace(pattern, replacement);
          fileFixCount += matches.length;
        }
      });

      // Only write if changes were made
      if (content !== originalContent) {
        writeFileSync(file, content);
        totalFixes += fileFixCount;
        fixedFiles.push({ file, count: fileFixCount });
        console.log(`✅ Fixed ${fileFixCount} issues in ${file}`);
      }
    } catch (e) {
      console.error(`❌ Error processing ${file}:`, e.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('           TYPE FIXES APPLIED');
  console.log('='.repeat(60));
  console.log(`Total fixes applied: ${totalFixes}`);
  console.log(`Files modified: ${fixedFiles.length}`);

  if (fixedFiles.length > 0) {
    console.log('\nTop modified files:');
    fixedFiles
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .forEach(({ file, count }) => {
        console.log(`  ${count} fixes: ${file}`);
      });
  }

  console.log('\n🎯 Next steps:');
  console.log('  1. Run TypeScript check: npm run check');
  console.log('  2. Run ESLint: npm run lint');
  console.log('  3. Run tests: npm test');
  console.log('  4. Review changes: git diff');
}

// Safety check
if (process.argv.includes('--confirm')) {
  applyFixes().catch(console.error);
} else {
  console.log('⚠️  This will modify many files!');
  console.log('Run with --confirm to apply fixes:');
  console.log('  node scripts/apply-type-fixes.js --confirm');
}
