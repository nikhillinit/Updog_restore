// scripts/revert-to-normal.mjs
// Revert direct node invocations back to plain tool commands.
// Use this when Windows is fixed and normal installs work again.

import fs from 'node:fs';

const PKG = 'package.json';
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));

const ROLLBACK = [
  {
    rx: /(^|\s)node\s+node_modules\/vite\/bin\/vite\.js(?=\s|$)/g,
    repl: '$1vite',
  },
  {
    rx: /(^|\s)node\s+node_modules\/tsx\/dist\/cli\.mjs(?=\s|$)/g,
    repl: '$1tsx',
  },
  {
    rx: /(^|\s)node\s+node_modules\/concurrently\/dist\/bin\/concurrently\.js(?=\s|$)/g,
    repl: '$1concurrently',
  },
];

function unconvert(v) {
  if (typeof v !== 'string') return v;
  let out = v;
  for (const { rx, repl } of ROLLBACK) out = out.replace(rx, repl);
  return out;
}

if (pkg.scripts && typeof pkg.scripts === 'object') {
  let reverted = 0;
  for (const [k, v] of Object.entries(pkg.scripts)) {
    if (k.startsWith('pre')) continue; // you may remove pre* hooks manually if desired
    const original = v;
    pkg.scripts[k] = unconvert(v);
    if (pkg.scripts[k] !== original) {
      reverted++;
    }
  }
  console.log(`[revert-to-normal] Reverted ${reverted} scripts to normal commands`);

  // Remove pre-hooks added by apply-direct-node (top-level only)
  const preHooksToRemove = [
    'predev', 'prebuild', 'pretest', 'prepreview'
  ];

  let removedHooks = 0;
  for (const hook of preHooksToRemove) {
    if (pkg.scripts[hook] === 'node scripts/ensure-complete-local.mjs') {
      delete pkg.scripts[hook];
      removedHooks++;
    }
  }
  if (removedHooks > 0) {
    console.log(`[revert-to-normal] Removed ${removedHooks} pre-hooks`);
  }
}

fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ Reverted scripts back to normal tool commands.');
console.log('');
console.log('Next steps to complete the reversion:');
console.log('1. Remove temporary scripts:');
console.log('   rm scripts/ensure-complete-local.mjs scripts/apply-direct-node.mjs scripts/revert-to-normal.mjs');
console.log('2. Clean and reinstall:');
console.log('   npm run reset:deps');
console.log('3. Test:');
console.log('   npm run dev');