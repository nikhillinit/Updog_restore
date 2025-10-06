// scripts/doctor-links.mjs
// Quick verification that critical junctions/symlinks are in place

import { existsSync } from 'node:fs';

const CRITICAL_LINKS = [
  'node_modules/vite/package.json',
  'node_modules/@vitejs/plugin-react/package.json',
  'node_modules/@preact/preset-vite/package.json',
];

let hasErrors = false;

for (const link of CRITICAL_LINKS) {
  if (!existsSync(link)) {
    console.error(`❌ Missing link: ${link}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\n🔧 Run: node scripts/link-sidecar-packages.mjs');
  process.exit(1);
}

console.log('doctor:links ✅ vite + plugins linked correctly');
