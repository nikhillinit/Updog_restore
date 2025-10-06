// scripts/apply-direct-node.mjs
// Convert ALL package.json scripts to direct local CLI invocation (idempotent).
//  - vite         → node node_modules/vite/bin/vite.js
//  - tsx          → node node_modules/tsx/dist/cli.mjs
//  - concurrently → node node_modules/concurrently/dist/bin/concurrently.js
// Handles: plain, NPX, and pinned NPX forms. Safe to re-run.

import fs from 'node:fs';

const PKG = 'package.json';
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));

const REPLACERS = [
  {
    // vite: "vite …" OR "npx vite[@x] …"
    name: 'vite',
    bin: 'node node_modules/vite/bin/vite.js',
    rx: /(^|\s)(?:npx\s+)?vite(?:@\S+)?(?=\s|$)/g,
    already: /(^|\s)node\s+node_modules\/vite\/bin\/vite\.js(?=\s|$)/,
  },
  {
    // tsx: "tsx …" OR "npx tsx[@x] …"
    name: 'tsx',
    bin: 'node node_modules/tsx/dist/cli.mjs',
    rx: /(^|\s)(?:npx\s+)?tsx(?:@\S+)?(?=\s|$)/g,
    already: /(^|\s)node\s+node_modules\/tsx\/dist\/cli\.mjs(?=\s|$)/,
  },
  {
    // concurrently: "concurrently …" OR "npx concurrently[@x] …"
    name: 'concurrently',
    bin: 'node node_modules/concurrently/dist/bin/concurrently.js',
    rx: /(^|\s)(?:npx\s+)?concurrently(?:@\S+)?(?=\s|$)/g,
    already: /(^|\s)node\s+node_modules\/concurrently\/dist\/bin\/concurrently\.js(?=\s|$)/,
  },
];

function convertValue(v) {
  if (typeof v !== 'string') return v;
  let out = v;
  for (const { rx, bin, already } of REPLACERS) {
    if (already.test(out)) continue;             // already direct
    out = out.replace(rx, (_, s) => `${s}${bin}`); // replace tool token
  }
  return out;
}

// Convert all script entries
if (pkg.scripts && typeof pkg.scripts === 'object') {
  let converted = 0;
  for (const [k, v] of Object.entries(pkg.scripts)) {
    // Don't modify pre* hooks (we'll manage below)
    if (k.startsWith('pre')) continue;
    const original = v;
    pkg.scripts[k] = convertValue(v);
    if (pkg.scripts[k] !== original) {
      converted++;
    }
  }
  console.log(`[apply-direct-node] Converted ${converted} scripts to direct local CLIs`);
}

// Ensure pre* hooks only on top-level orchestrators (avoid repetitive runs)
pkg.scripts ??= {};
const preHooks = {
  predev: 'node scripts/ensure-complete-local.mjs',
  prebuild: 'node scripts/ensure-complete-local.mjs',
  pretest: 'node scripts/ensure-complete-local.mjs',
  prepreview: 'node scripts/ensure-complete-local.mjs',
};

let hooksAdded = 0;
for (const [hook, cmd] of Object.entries(preHooks)) {
  if (!pkg.scripts[hook]) {
    pkg.scripts[hook] = cmd;
    hooksAdded++;
  }
}
console.log(`[apply-direct-node] Added ${hooksAdded} pre-hooks`);

fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ Converted ALL scripts to direct local CLIs and ensured pre* hooks.');