// scripts/doctor-shell.mjs
// Validates shell environment for Windows npm workflows
// IMPORTANT: npm commands must run in PowerShell/CMD, not Git Bash/WSL

import { env, platform } from 'node:process';

const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const reset = "\x1b[0m";

if (platform !== 'win32') {
  console.log(`${green}[doctor:shell] PASS: non-Windows platform - shell validation skipped${reset}`);
  process.exit(0);
}

console.log('[doctor:shell] Validating shell environment for Windows npm workflows...');

const shell = env.SHELL || '';
const comspec = env.COMSPEC || '';

const isGitBash = shell.toLowerCase().includes('bash') || shell.includes('/bin/sh');
const isWSL = shell.includes('/bin/bash') && env.WSL_DISTRO_NAME;

let ok = true;
let msg = '';

if (isGitBash) {
  ok = false;
  msg = `
${red}---------------------------------------------${reset}
${red}PROBLEM: Running in Git Bash${reset}

Git Bash can break Windows npm shim resolution and local script execution.

${yellow}FIX THIS NOW (run in PowerShell or CMD):${reset}

  1. Close Git Bash
  2. Open PowerShell or CMD
  3. Configure npm to use CMD:
     ${green}npm config set script-shell "C:\\Windows\\System32\\cmd.exe"${reset}
  4. Refresh dependencies:
     ${green}npm install${reset}
  5. Verify:
     ${green}npm run doctor${reset}

${red}---------------------------------------------${reset}
`;
} else if (isWSL) {
  ok = false;
  msg = `
${red}---------------------------------------------${reset}
${red}PROBLEM: Running in WSL${reset}

WSL is not the supported shell environment for these Windows npm workflows.
Run all npm commands from PowerShell or CMD.

${yellow}FIX THIS NOW:${reset}

  1. Exit WSL
  2. Open PowerShell or CMD in Windows
  3. Navigate to: ${env.PWD || process.cwd()}
  4. Run: ${green}npm run doctor${reset}

${red}---------------------------------------------${reset}
`;
}

if (!ok) {
  console.error(`\n${red}[doctor:shell] FAIL: shell mismatch${reset}\n${msg}`);
  process.exit(2);
}

console.log(`${green}[doctor:shell] PASS: shell environment is correct for Windows npm workflows${reset}`);
console.log(`[doctor:shell]    Detected: ${comspec || 'PowerShell'}`);