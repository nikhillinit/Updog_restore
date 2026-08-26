#!/usr/bin/env node
/**
 * Quick Type Safety Metrics - Simplified version
 */

import { execSync } from 'child_process';
import { glob } from 'glob';
import { readFileSync } from 'fs';

console.log('📊 Collecting type safety metrics...\n');

async function collectMetrics() {
  // Count 'any' usage
  const files = await glob('**/*.{ts,tsx}', {
    ignore: ['node_modules/**', 'dist/**', '*.d.ts', '*.test.ts', 'repo/**']
  });
  
  let anyCount = 0;
  let unknownCount = 0;
  let asAnyCount = 0;
  let asUnknownCount = 0;
  let tsIgnoreCount = 0;
  
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      anyCount += (content.match(/:\s*any\b/g) || []).length;
      unknownCount += (content.match(/:\s*unknown\b/g) || []).length;
      asAnyCount += (content.match(/as\s+any\b/g) || []).length;
      asUnknownCount += (content.match(/as\s+unknown\b/g) || []).length;
      tsIgnoreCount += (content.match(/@ts-ignore/g) || []).length;
    } catch (e) {
      // Skip files that can't be read
    }
  }
  
  // Count TypeScript errors
  let tsErrors = 0;
  try {
    execSync('npx tsc --noEmit 2>&1', { encoding: 'utf8' });
  } catch (error) {
    const output = error.stdout || '';
    tsErrors = (output.match(/error TS/g) || []).length;
  }
  
  // Display results
  console.log('='.repeat(60));
  console.log('           TYPE SAFETY METRICS BASELINE');
  console.log('='.repeat(60));
  console.log('\n📈 Current State:');
  console.log(`   Files scanned: ${files.length}`);
  console.log(`   Explicit "any": ${anyCount}`);
  console.log(`   Explicit "unknown": ${unknownCount}`);
  console.log(`   "as any" casts: ${asAnyCount}`);
  console.log(`   "as unknown" casts: ${asUnknownCount}`);
  console.log(`   @ts-ignore: ${tsIgnoreCount}`);
  console.log(`   TypeScript errors: ${tsErrors}`);
  
  console.log('\n🎯 Targets:');
  console.log('   Phase 1: Reduce "any" by 50%');
  console.log('   Phase 2: Eliminate "as any"');
  console.log('   Phase 3: Zero TypeScript errors');
  console.log('   Phase 4: Remove all @ts-ignore');
  
  console.log('\n' + '='.repeat(60));
  
  return {
    files: files.length,
    any: anyCount,
    unknown: unknownCount,
    asAny: asAnyCount,
    asUnknown: asUnknownCount,
    tsIgnore: tsIgnoreCount,
    tsErrors
  };
}

collectMetrics().catch(console.error);