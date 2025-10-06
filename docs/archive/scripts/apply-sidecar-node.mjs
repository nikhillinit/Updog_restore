// scripts/apply-sidecar-node.mjs
// Convert ALL package.json scripts to use sidecar tools_local binaries (idempotent).
// This avoids npm pruning issues by using a dedicated workspace for tools.
//  - vite         → node tools_local/node_modules/vite/bin/vite.js
//  - tsx          → node tools_local/node_modules/tsx/dist/cli.mjs
//  - concurrently → node tools_local/node_modules/concurrently/dist/bin/concurrently.js
// Handles: plain, NPX, pinned NPX, and direct node forms. Safe to re-run.

import fs from 'node:fs';

const PKG = 'package.json';
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));

const REPLACERS = [
  {
    // vite: any form → sidecar
    name: 'vite',
    bin: 'node tools_local/node_modules/vite/bin/vite.js',
    patterns: [
      /(^|\s)(?:npx\s+)?vite(?:@\S+)?(?=\s|$)/g,  // npx vite[@version]
      /(^|\s)node\s+node_modules\/vite\/bin\/vite\.js(?=\s|$)/g,  // old direct form
    ],
    already: /(^|\s)node\s+tools_local\/node_modules\/vite\/bin\/vite\.js(?=\s|$)/,
  },
  {
    // tsx: any form → sidecar
    name: 'tsx',
    bin: 'node tools_local/node_modules/tsx/dist/cli.mjs',
    patterns: [
      /(^|\s)(?:npx\s+)?tsx(?:@\S+)?(?=\s|$)/g,  // npx tsx[@version]
      /(^|\s)node\s+node_modules\/tsx\/dist\/cli\.mjs(?=\s|$)/g,  // old direct form
    ],
    already: /(^|\s)node\s+tools_local\/node_modules\/tsx\/dist\/cli\.mjs(?=\s|$)/,
  },
  {
    // concurrently: any form → sidecar
    name: 'concurrently',
    bin: 'node tools_local/node_modules/concurrently/dist/bin/concurrently.js',
    patterns: [
      /(^|\s)(?:npx\s+)?concurrently(?:@\S+)?(?=\s|$)/g,  // npx concurrently[@version]
      /(^|\s)node\s+node_modules\/concurrently\/dist\/bin\/concurrently\.js(?=\s|$)/g,  // old direct form
    ],
    already: /(^|\s)node\s+tools_local\/node_modules\/concurrently\/dist\/bin\/concurrently\.js(?=\s|$)/,
  },
];

function convertValue(v) {
  if (typeof v !== 'string') return v;
  let out = v;

  for (const { patterns, bin, already } of REPLACERS) {
    if (already.test(out)) continue;  // already using sidecar

    for (const pattern of patterns) {
      out = out.replace(pattern, (_, s) => `${s}${bin}`);
    }
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
  console.log(`[apply-sidecar-node] Converted ${converted} scripts to sidecar tools_local paths`);
}

// Ensure pre* hooks only on top-level orchestrators (avoid repetitive runs)
// These will now use the sidecar-aware ensure script
pkg.scripts ??= {};
const preHooks = {
  predev: 'node scripts/ensure-sidecar.mjs',
  prebuild: 'node scripts/ensure-sidecar.mjs',
  pretest: 'node scripts/ensure-sidecar.mjs',
  prepreview: 'node scripts/ensure-sidecar.mjs',
};

let hooksAdded = 0;
let hooksUpdated = 0;
for (const [hook, cmd] of Object.entries(preHooks)) {
  if (!pkg.scripts[hook]) {
    pkg.scripts[hook] = cmd;
    hooksAdded++;
  } else if (pkg.scripts[hook].includes('ensure-complete-local') || pkg.scripts[hook].includes('ensure-local-vite')) {
    // Update old ensure scripts to new sidecar version
    pkg.scripts[hook] = cmd;
    hooksUpdated++;
  }
}

if (hooksAdded > 0) console.log(`[apply-sidecar-node] Added ${hooksAdded} pre-hooks`);
if (hooksUpdated > 0) console.log(`[apply-sidecar-node] Updated ${hooksUpdated} pre-hooks to sidecar version`);

fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ Converted ALL scripts to use sidecar tools_local binaries.');