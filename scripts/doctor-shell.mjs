// scripts/doctor-shell.mjs
// Validates shell environment for Windows npm shims
// IMPORTANT: npm commands must run in PowerShell/CMD, not Git Bash/WSL

import { env, platform } from 'node:process';

// ANSI color codes
const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const reset = "\x1b[0m";

// Only validate on Windows
if (platform !== 'win32') {
  console.log(`${green}[doctor:shell] ✅ Non-Windows platform - shell validation skipped${reset}`);
  process.exit(0);
}

console.log('[doctor:shell] Validating shell environment for Windows npm shims...');

// Check shell environment variables
const shell = env.SHELL || '';
const comspec = env.COMSPEC || '';

// Detect problematic shells
const isGitBash = shell.toLowerCase().includes('bash') || shell.includes('/bin/sh');
const isWSL = shell.includes('/bin/bash') && env.WSL_DISTRO_NAME;
const isPowerShell = comspec.toLowerCase().includes('cmd.exe') || env.PSModulePath;

let ok = true;
let msg = '';

if (isGitBash) {
  ok = false;
  msg = `
${red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}
${red}PROBLEM: Running in Git Bash${reset}

Git Bash creates POSIX symlinks instead of Windows junctions,
which breaks sidecar package linking.

${yellow}FIX THIS NOW (run in PowerShell or CMD):${reset}

  1. Close Git Bash
  2. Open PowerShell or CMD
  3. Configure npm to use CMD:
     ${green}npm config set script-shell "C:\\Windows\\System32\\cmd.exe"${reset}
  4. Recreate junctions:
     ${green}node scripts/link-sidecar-packages.mjs${reset}
  5. Verify:
     ${green}npm run doctor${reset}

${red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}
`;
} else if (isWSL) {
  ok = false;
  msg = `
${red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}
${red}PROBLEM: Running in WSL${reset}

WSL cannot create Windows junctions for sidecar linking.
Run all npm commands from PowerShell or CMD.

${yellow}FIX THIS NOW:${reset}

  1. Exit WSL
  2. Open PowerShell or CMD in Windows
  3. Navigate to: ${env.PWD || process.cwd()}
  4. Run: ${green}npm run doctor${reset}

${red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}
`;
}

if (!ok) {
  console.error(`\n${red}[doctor:shell] ❌ Shell mismatch${reset}\n${msg}`);
  process.exit(2);
}

console.log(`${green}[doctor:shell] ✅ Shell environment is correct for Windows npm shims${reset}`);
console.log(`[doctor:shell]    Detected: ${comspec || 'PowerShell'}`);
