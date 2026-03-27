// scripts/doctor-links.mjs
// Quick verification that core frontend modules resolve

import { existsSync } from 'node:fs';

const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const reset = "\x1b[0m";

const REQUIRED_PATHS = [
  'node_modules/vite/package.json',
  'node_modules/@vitejs/plugin-react/package.json',
  'node_modules/@preact/preset-vite/package.json',
];

let hasErrors = false;

for (const dependencyPath of REQUIRED_PATHS) {
  if (!existsSync(dependencyPath)) {
    console.error(`${red}Missing dependency: ${dependencyPath}${reset}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error(`\n${yellow}Run: npm install${reset}`);
  process.exit(1);
}

console.log(`${green}[doctor:links] PASS: core frontend modules resolve${reset}`);