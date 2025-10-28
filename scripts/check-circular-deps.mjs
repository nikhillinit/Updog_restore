#!/usr/bin/env node
/**
 * Circular Dependency Checker
 *
 * Uses madge to detect circular dependencies in the waterfall calculation module.
 * Ensures clean module boundaries and prevents import cycles.
 *
 * Usage:
 *   node scripts/check-circular-deps.mjs
 *
 * Exit codes:
 *   0 - No circular dependencies found
 *   1 - Circular dependencies detected
 */

import madge from 'madge';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const ENTRYPOINTS = [
  'client/src/lib/waterfall.ts',
  'shared/schemas/waterfall-policy.ts',
  'shared/lib/excelRound.ts'
];

const CONFIG = {
  tsConfig: join(rootDir, 'tsconfig.json'),
  fileExtensions: ['ts', 'tsx'],
  excludeRegExp: [
    /node_modules/,
    /\.test\.ts$/,
    /\.test\.tsx$/,
    /dist/,
    /build/
  ]
};

async function checkCircularDependencies() {
  console.log('🔍 Circular Dependency Checker\n');
  console.log('Analyzing waterfall module dependencies...\n');

  let hasCircular = false;
  const allCircular = [];

  for (const entrypoint of ENTRYPOINTS) {
    const filePath = join(rootDir, entrypoint);
    console.log(`📄 Checking: ${entrypoint}`);

    try {
      const result = await madge(filePath, CONFIG);
      const circular = result.circular();

      if (circular.length > 0) {
        hasCircular = true;
        allCircular.push({ entrypoint, circular });

        console.log(`  ❌ Found ${circular.length} circular dependenc${circular.length === 1 ? 'y' : 'ies'}:`);
        circular.forEach((cycle, index) => {
          console.log(`     ${index + 1}. ${cycle.join(' → ')}`);
        });
      } else {
        console.log('  ✅ No circular dependencies');
      }

      // Print dependency tree summary
      const obj = result.obj();
      const totalModules = Object.keys(obj).length;
      console.log(`  📊 Total modules analyzed: ${totalModules}\n`);
    } catch (err) {
      console.error(`  ⚠️  Error analyzing ${entrypoint}: ${err.message}\n`);
    }
  }

  // Print summary
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════\n');

  if (hasCircular) {
    console.log('❌ FAILED: Circular dependencies detected\n');
    console.log('Circular dependencies found in:');
    allCircular.forEach(({ entrypoint, circular }) => {
      console.log(`\n  ${entrypoint}:`);
      circular.forEach((cycle, index) => {
        console.log(`    ${index + 1}. ${cycle.join(' → ')}`);
      });
    });
    console.log('\n⚠️  Circular dependencies can cause:');
    console.log('  - Initialization order issues');
    console.log('  - Harder to test and maintain');
    console.log('  - Potential runtime errors');
    console.log('  - Documentation drift\n');
    console.log('💡 Consider refactoring to break the circular dependencies.\n');

    process.exit(1);
  } else {
    console.log('✅ PASSED: No circular dependencies detected\n');
    console.log('All waterfall module dependencies are acyclic.');
    console.log('Clean module boundaries maintained.\n');

    process.exit(0);
  }
}

// Run checker
checkCircularDependencies().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
