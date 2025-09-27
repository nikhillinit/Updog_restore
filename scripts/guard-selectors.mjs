#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execSync('git diff --cached --name-only --diff-filter=ACMRTUXB', { encoding: 'utf8' })
  .split('\n').filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

const offenders = [];
for (const f of files) {
  try {
    const src = readFileSync(f, 'utf8');
    // Heuristic: useFundStore( (s) => ({ ... or [ ... }) ) without a 2nd arg
    const pattern = /useFundStore\s*\(\s*\(\s*\w+\s*\)\s*=>\s*[\[\{][^)]*\)\s*(?!\s*,)/gms;
    const matches = src.match(pattern) ?? [];
    for (const m of matches) {
      offenders.push({ file: f, snippet: m.slice(0, 120) + '…' });
    }
  } catch (err) {
    // Skip files that can't be read (deleted, etc.)
    continue;
  }
}

if (offenders.length) {
  console.error('\n❌ Object/array-return selectors without equality:');
  offenders.forEach(o => console.error(`- ${o.file}\n  ${o.snippet}`));
  console.error('Use useFundSelector(...) or pass shallow/Object.is as the second arg.\n');
  process.exit(1);
}

console.log('✅ Selector safety check passed');