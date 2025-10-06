// scripts/apply-npx-workaround.mjs
// Idempotently convert all package.json scripts to npx pins:
// - vite@5.4.11
// - tsx@4.19.2
// - concurrently@9.2.1
// Only modifies script values (safe). Re-runnable.

import fs from 'node:fs';

const PKG = 'package.json';
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));

const PINS = {
  vite: 'npx vite@5.4.11',
  tsx: 'npx tsx@4.19.2',
  concurrently: 'npx concurrently@9.2.1',
};

// robust replacer for script strings
function pinTools(str) {
  let out = str;

  // Already pinned? leave as-is
  const alreadyPinned = (tool) =>
    new RegExp(`(^|\\s)npx\\s+${tool}@`).test(out);

  // Replace plain tool calls at word boundaries, including subcommands/args
  const replaceTool = (tool, replacement) => {
    if (alreadyPinned(tool)) return;
    // match tool at start or after whitespace, not preceded by '@' or ':'
    // Examples handled: "vite", "vite build", "tsx file.ts", "concurrently -k ..."
    out = out.replace(
      new RegExp(`(^|\\s)${tool}(?=\\s|$)`, 'g'),
      (_, s) => `${s}${replacement}`
    );
  };

  replaceTool('vite', PINS.vite);
  replaceTool('tsx', PINS.tsx);
  replaceTool('concurrently', PINS.concurrently);

  return out;
}

if (pkg.scripts && typeof pkg.scripts === 'object') {
  for (const [k, v] of Object.entries(pkg.scripts)) {
    if (typeof v === 'string') {
      const pinned = pinTools(v);
      pkg.scripts[k] = pinned;
    }
  }
}

fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('✅ All scripts pinned to NPX workaround.');