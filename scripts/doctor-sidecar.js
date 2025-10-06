// scripts/doctor-sidecar.js (ESM)
// Validates sidecar tools_local workspace for Windows development
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

console.log('[doctor] Checking sidecar tools_local workspace...');

// Check if sidecar exists
const sidecarPath = path.resolve('tools_local/package.json');
if (!existsSync(sidecarPath)) {
  console.error('[doctor] ❌ tools_local/package.json not found');
  console.error('');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('FIX THIS NOW:');
  console.error('  Create tools_local/package.json with vite/tsx/concurrently');
  console.error('  Then run: node scripts/ensure-sidecar.mjs');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(1);
}

const requireSidecar = createRequire(sidecarPath);

function checkBinary(name, path) {
  if (!existsSync(path)) {
    console.error(`[doctor] ❌ Missing binary: ${path}`);
    console.error(`         Run: node scripts/ensure-sidecar.mjs`);
    return false;
  }
  console.log(`[doctor] ✅ Binary exists: ${name}`);
  return true;
}

function checkSidecarModule(name) {
  try {
    requireSidecar.resolve(name);
    console.log(`[doctor] ✅ Sidecar module: ${name}`);
    return true;
  } catch {
    console.error(`[doctor] ❌ Missing sidecar module: ${name}`);
    console.error(`         Run: node scripts/ensure-sidecar.mjs`);
    return false;
  }
}

function checkVersion(name, expected) {
  try {
    const pkgPath = requireSidecar.resolve(`${name}/package.json`);
    const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
    if (version === expected) {
      console.log(`[doctor] ✅ ${name}@${version} (exact match)`);
      return true;
    } else {
      console.error(`[doctor] ⚠️ ${name}@${version} (expected ${expected})`);
      return false;
    }
  } catch {
    console.error(`[doctor] ❌ ${name} not found in sidecar`);
    return false;
  }
}

// Check critical binaries
console.log('[doctor] Checking sidecar binaries...');
const binariesOk = [
  checkBinary('vite', 'tools_local/node_modules/vite/bin/vite.js'),
  checkBinary('tsx', 'tools_local/node_modules/tsx/dist/cli.mjs'),
  checkBinary('concurrently', 'tools_local/node_modules/concurrently/dist/bin/concurrently.js')
].every(ok => ok);

// Check runtime dependencies
console.log('[doctor] Checking sidecar runtime dependencies...');
const runtimeOk = [
  checkSidecarModule('rollup'),    // vite dependency
  checkSidecarModule('postcss'),   // vite dependency
  checkSidecarModule('chokidar'),  // file watching
  checkSidecarModule('yargs')      // concurrently dependency
].every(ok => ok);

// Check versions
console.log('[doctor] Checking sidecar versions...');
const versionsOk = [
  checkVersion('vite', '5.4.11'),
  checkVersion('tsx', '4.19.2'),
  checkVersion('concurrently', '9.2.1')
].every(ok => ok);

if (!binariesOk || !runtimeOk || !versionsOk) {
  console.error('');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('[doctor] ❌ Sidecar validation failed.');
  console.error('');
  console.error('FIX THIS NOW:');
  console.error('  node scripts/ensure-sidecar.mjs && npm run doctor:sidecar');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(1);
}

console.log('[doctor] ✅ Sidecar tools_local is ready for Windows development');