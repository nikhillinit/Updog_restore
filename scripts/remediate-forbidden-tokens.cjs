#!/usr/bin/env node
/**
 * Remediate Forbidden Tokens
 *
 * Systematically removes all European waterfall and Line of Credit references
 * from the codebase.
 */

const fs = require('fs');
const path = require('path');

// File paths to modify
const filesToFix = [
  // Priority 1: Core schema files
  'shared/types.ts',
  'shared/schemas/cashflow-schema.ts',
  'server/validators/fundSchema.ts',

  // Priority 2: Client stores and schemas
  'client/src/stores/fundStore.ts',
  'client/src/schemas/modeling-wizard.schemas.ts',
  'client/src/machines/modeling-wizard.machine.ts',

  // Priority 3: Contracts and types
  'shared/contracts/kpi-selector.contract.ts',

  // Priority 4: Library files
  'client/src/lib/waterfall/american-ledger.ts',
  'client/src/lib/fund-calc-v2.ts',
  'client/src/lib/schema-adapter.ts',
  'client/src/lib/cashflow/generate.ts',

  // Priority 5: Example data
  'shared/schemas/examples/standard-fund.ts',
];

// Transformation rules
const transformations = [
  // Remove EUROPEAN from enum arrays
  {
    pattern: /z\.enum\(\['EUROPEAN',\s*'AMERICAN'\]\)/g,
    replacement: "z.enum(['AMERICAN'])"
  },
  {
    pattern: /z\.enum\(\['AMERICAN',\s*'EUROPEAN'\]\)/g,
    replacement: "z.enum(['AMERICAN'])"
  },

  // Remove EUROPEAN default
  {
    pattern: /\.default\('EUROPEAN'\)/g,
    replacement: ".default('AMERICAN')"
  },

  // Remove hurdle field from Zod schemas
  {
    pattern: /\s+hurdle:\s+z\.number\(\)\.min\(0\)\.max\(1\)\.default\([^)]+\),?\s*\/\/.*?\n/g,
    replacement: '\n'
  },
  {
    pattern: /\s+hurdleRate:\s+z\.number\(\)[^,\n]+,?\s*\n/g,
    replacement: '\n'
  },

  // Remove catchUp field from Zod schemas
  {
    pattern: /\s+catchUp:\s+z\.number\(\)\.min\(0\)\.max\(1\)\.default\([^)]+\),?\s*\/\/.*?\n/g,
    replacement: '\n'
  },
  {
    pattern: /\s+catchUpPct:\s+z\.number\(\)[^,\n]+,?\s*\n/g,
    replacement: '\n'
  },

  // Remove preferredReturn fields
  {
    pattern: /\s+preferredReturn:\s+z\.number\(\)[^,\n]+,?\s*\n/g,
    replacement: '\n'
  },
  {
    pattern: /\s+preferredReturnRate:\s+[^,\n]+,?\s*\n/g,
    replacement: '\n'
  },

  // Remove Line of Credit fields (if present)
  {
    pattern: /\s+lineOfCredit:\s+[^,\n]+,?\s*\n/g,
    replacement: '\n'
  },
  {
    pattern: /\s+locRate:\s+[^,\n]+,?\s*\n/g,
    replacement: '\n'
  },
  {
    pattern: /\s+locCap:\s+[^,\n]+,?\s*\n/g,
    replacement: '\n'
  },

  // Remove European waterfall validation (in refine blocks)
  {
    pattern: /\.refine\(\s*\([^)]+\)\s*=>\s*\{[^}]*if\s*\([^)]*\.type\s*===\s*['"]EUROPEAN['"][^}]*\}[^}]*\},\s*\{[^}]*message:[^}]*path:[^}]*\}\s*\)/gs,
    replacement: ''
  }
];

function fixFile(filePath) {
  const absolutePath = path.join(__dirname, '..', filePath);

  if (!fs.existsSync(absolutePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return { fixed: false, reason: 'not found' };
  }

  let content = fs.readFileSync(absolutePath, 'utf8');
  const originalContent = content;

  // Apply all transformations
  for (const { pattern, replacement } of transformations) {
    content = content.replace(pattern, replacement);
  }

  // Check if any changes were made
  if (content === originalContent) {
    console.log(`  No changes needed: ${filePath}`);
    return { fixed: false, reason: 'no matches' };
  }

  // Write the fixed content
  fs.writeFileSync(absolutePath, content, 'utf8');
  console.log(`✅ Fixed: ${filePath}`);
  return { fixed: true };
}

function main() {
  console.log('🔧 Starting forbidden token remediation...\n');

  const results = {
    fixed: 0,
    skipped: 0,
    notFound: 0
  };

  for (const file of filesToFix) {
    const result = fixFile(file);
    if (result.fixed) {
      results.fixed++;
    } else if (result.reason === 'not found') {
      results.notFound++;
    } else {
      results.skipped++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Fixed: ${results.fixed} files`);
  console.log(`   Skipped (no changes): ${results.skipped} files`);
  console.log(`   Not found: ${results.notFound} files`);
  console.log('\n✨ Remediation complete!');
}

main();
