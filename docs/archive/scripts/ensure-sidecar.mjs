// scripts/ensure-sidecar.mjs
// Ensures sidecar tools_local workspace has vite/tsx/concurrently installed.
// This avoids npm pruning issues by using a dedicated workspace.
// Windows-only by default (skips on Linux/Mac unless FORCE_LOCAL_TOOLS=1).

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { platform } from 'node:os';
import path from 'node:path';

// Windows-only guard (skip on Linux/Mac CI)
if (platform() !== 'win32' && process.env.FORCE_LOCAL_TOOLS !== '1') {
  console.log('[ensure-sidecar] Non-Windows detected; skipping (set FORCE_LOCAL_TOOLS=1 to override)');
  process.exit(0);
}

// Create require for the sidecar workspace
const sidecarPath = path.resolve('tools_local/package.json');
if (!existsSync(sidecarPath)) {
  console.error('[ensure-sidecar] ❌ tools_local/package.json not found');
  console.error('Create it with: { "name": "tools-local", "dependencies": { "vite": "5.4.11", "tsx": "4.19.2", "concurrently": "9.2.1" } }');
  process.exit(1);
}

const requireSidecar = createRequire(sidecarPath);

const TOOLS = [
  { name: 'vite', version: '5.4.11', bin: 'tools_local/node_modules/vite/bin/vite.js' },
  { name: 'tsx', version: '4.19.2', bin: 'tools_local/node_modules/tsx/dist/cli.mjs' },
  { name: 'concurrently', version: '9.2.1', bin: 'tools_local/node_modules/concurrently/dist/bin/concurrently.js' },
];

// Critical runtime modules that must be resolvable
const RUNTIME_MODS = [
  'rollup',     // vite dependency
  'postcss',    // vite dependency
  'chokidar',   // file watching
  'yargs',      // concurrently dependency
];

function sidecarVersion(pkg) {
  try {
    const p = requireSidecar.resolve(`${pkg}/package.json`);
    const v = JSON.parse(readFileSync(p, 'utf8')).version;
    return v;
  } catch {
    return null;
  }
}

function needInstall() {
  // Check if all binaries exist and versions match
  for (const { name, version, bin } of TOOLS) {
    if (!existsSync(bin)) return true;
    const v = sidecarVersion(name);
    if (!v || v !== version) return true;
  }

  // Check if runtime modules are resolvable
  for (const mod of RUNTIME_MODS) {
    try {
      requireSidecar.resolve(mod);
    } catch {
      return true;
    }
  }

  return false;
}

function installSidecar() {
  console.log('[ensure-sidecar] Installing tools_local dependencies...');
  try {
    // Use npm install (not ci) since we may not have a lockfile yet
    execSync('npm install --prefix tools_local --no-audit --no-fund', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('[ensure-sidecar] Installation failed:', error.message);
    return false;
  }
}

function verifySidecar() {
  // Verify binaries
  for (const { name, bin } of TOOLS) {
    if (!existsSync(bin)) {
      console.error(`[ensure-sidecar] ✗ Missing binary: ${bin}`);
      return false;
    }
    const v = sidecarVersion(name);
    console.log(`[ensure-sidecar] ✓ ${name}@${v} in sidecar`);
  }

  // Verify runtime modules
  for (const mod of RUNTIME_MODS) {
    try {
      requireSidecar.resolve(mod);
      console.log(`[ensure-sidecar] ✓ ${mod} resolvable from sidecar`);
    } catch {
      console.error(`[ensure-sidecar] ✗ ${mod} not resolvable from sidecar`);
      return false;
    }
  }

  return true;
}

console.log('[ensure-sidecar] Checking tools_local workspace...');

if (needInstall()) {
  console.log('[ensure-sidecar] Sidecar needs installation/update');

  if (!installSidecar()) {
    // One retry with cache clean
    console.warn('[ensure-sidecar] Retrying with cache clean...');
    try {
      execSync('npm cache clean --force', { stdio: 'inherit' });
    } catch {}

    if (!installSidecar()) {
      console.error('[ensure-sidecar] Failed to install sidecar dependencies');
      console.error('Consider WSL2/Dev Container or temporary Defender exclusion');
      process.exit(1);
    }
  }
} else {
  console.log('[ensure-sidecar] Sidecar already up to date');
}

if (!verifySidecar()) {
  console.error('[ensure-sidecar] Verification failed after installation');
  process.exit(1);
}

console.log('[ensure-sidecar] ✅ All sidecar tools and dependencies ready');