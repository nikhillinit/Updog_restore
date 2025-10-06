// scripts/ensure-complete-local.mjs
// Ensures local CLIs (vite/tsx/concurrently) and their key deps exist.
// Idempotent: installs only when missing or wrong version. Leaves package.json/lockfile untouched.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { platform } from 'node:os';

const require = createRequire(import.meta.url);

// Windows-only guard (skip on Linux/Mac CI)
if (platform() !== 'win32' && process.env.FORCE_LOCAL_TOOLS !== '1') {
  console.log('[ensure-complete-local] Non-Windows detected; skipping (set FORCE_LOCAL_TOOLS=1 to override)');
  process.exit(0);
}

// Ensure dev dependencies are not omitted
try { execSync('npm config set production false', { stdio: 'ignore' }); } catch {}
try { execSync('npm config delete omit', { stdio: 'ignore' }); } catch {}

const TOOLS = [
  { name: 'vite',          version: '5.4.11', bin: 'node_modules/vite/bin/vite.js' },
  { name: 'tsx',           version: '4.19.2', bin: 'node_modules/tsx/dist/cli.mjs' },
  { name: 'concurrently',  version: '9.2.1',  bin: 'node_modules/concurrently/dist/bin/concurrently.js' },
];

// Modules we want resolvable at runtime (Vite toolchain typical)
const RUNTIME_MODS = [
  'rollup',        // vite driver
  'postcss',       // used by vite pipelines
  'chokidar',      // file watching
  'yargs',         // concurrently uses yargs
];

function localVersion(pkg) {
  try {
    const p = require.resolve(`${pkg}/package.json`);
    const v = JSON.parse(readFileSync(p, 'utf8')).version;
    return v;
  } catch { return null; }
}

function needInstall({ name, version, bin }) {
  const hasBin = existsSync(bin);
  const v = localVersion(name);
  if (!hasBin) return true;
  if (!v) return true;
  return v !== version; // strict version equality for determinism
}

function installOne(spec) {
  console.log(`[ensure-complete-local] Installing ${spec} (with dependencies)…`);
  execSync(`npm install ${spec} --force --no-save`, { stdio: 'inherit' });
}

function verifyRuntimeMods() {
  for (const m of RUNTIME_MODS) {
    try {
      require.resolve(m);
      console.log(`[ensure-complete-local] ✓ resolved ${m}`);
    } catch {
      console.error(`[ensure-complete-local] ✗ missing required module: ${m}`);
      return false;
    }
  }
  return true;
}

function runEnsureOnce() {
  let changed = false;
  for (const { name, version, bin } of TOOLS) {
    if (needInstall({ name, version, bin })) {
      installOne(`${name}@${version}`);
      changed = true;
    } else {
      console.log(`[ensure-complete-local] ✓ ${name}@${localVersion(name)} present`);
    }
  }
  if (!verifyRuntimeMods()) return 'retry';
  return changed ? 'changed' : 'ok';
}

console.log('[ensure-complete-local] Verifying local CLIs and runtime deps…');
let status = runEnsureOnce();

if (status === 'retry') {
  console.warn('[ensure-complete-local] Attempting one cache clean & retry…');
  try { execSync('npm cache clean --force', { stdio: 'inherit' }); } catch {}
  status = runEnsureOnce();
}

if (status === 'retry') {
  console.error('[ensure-complete-local] Required modules still missing after retry.');
  console.error('Consider WSL2/Dev Container or a temporary Defender exclusion for this repo.');
  process.exit(1);
}

console.log('[ensure-complete-local] ✅ All tool CLIs and dependencies are present.');