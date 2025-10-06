// scripts/doctor-links.mjs
// Quick verification that critical junctions/symlinks are in place

import { existsSync } from 'node:fs';

// ANSI color codes
const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const reset = "\x1b[0m";

const CRITICAL_LINKS = [
  'node_modules/vite/package.json',
  'node_modules/@vitejs/plugin-react/package.json',
  'node_modules/@preact/preset-vite/package.json',
];

let hasErrors = false;

for (const link of CRITICAL_LINKS) {
  if (!existsSync(link)) {
    console.error(`${red}❌ Missing link: ${link}${reset}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error(`\n${yellow}🔧 Run: node scripts/link-sidecar-packages.mjs${reset}`);
  process.exit(1);
}

console.log(`${green}[doctor:links] ✅ vite + plugins linked correctly${reset}`);
