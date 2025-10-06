// scripts/doctor.js (ESM)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);

console.log('[doctor] If this fails, try: npm run reset:deps');

function mustResolveNpx(cmd, expectPrefix) {
  try {
    const out = execSync(`npx ${cmd} --version`, { stdio: 'pipe' })
      .toString().trim();
    // Extract version from various formats (e.g., "vite/5.4.11 win32..." or just "5.4.11")
    const versionMatch = out.match(/(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : out;

    if (!version.startsWith(expectPrefix)) {
      console.error(`[doctor] ❌ ${cmd} resolved ${version}, expected ${expectPrefix}x`);
      process.exit(1);
    }
    console.log(`[doctor] ✅ ${cmd} → ${version}`);
  } catch (e) {
    console.error(`[doctor] ❌ Unable to execute 'npx ${cmd} --version'`);
    process.exit(1);
  }
}

function noteLocal(mod, expectedPrefix) {
  try {
    const pkgPath = require.resolve(`${mod}/package.json`);
    const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
    const ok = expectedPrefix ? version.startsWith(expectedPrefix) : true;
    console.log(`[doctor] ℹ️ local ${mod}@${version} ${ok ? '(ok)' : `(expected ${expectedPrefix}x)`}`);
  } catch {
    console.log(`[doctor] ℹ️ local ${mod} not installed (using NPX)`);
  }
}

// Phase 4: Check local binaries and runtime modules
import { existsSync } from 'node:fs';

function checkBinary(name, path) {
  if (!existsSync(path)) {
    console.error(`[doctor] ❌ Missing binary: ${path}`);
    console.error(`         Run: node scripts/ensure-complete-local.mjs`);
    return false;
  }
  console.log(`[doctor] ✅ Binary exists: ${name}`);
  return true;
}

function checkRuntimeModule(name) {
  try {
    require.resolve(name);
    console.log(`[doctor] ✅ Runtime module: ${name}`);
    return true;
  } catch {
    console.error(`[doctor] ❌ Missing runtime module: ${name}`);
    console.error(`         Run: node scripts/ensure-complete-local.mjs`);
    return false;
  }
}

// Check critical binaries
console.log('[doctor] Checking local binaries...');
const binariesOk = [
  checkBinary('vite', 'node_modules/vite/bin/vite.js'),
  checkBinary('tsx', 'node_modules/tsx/dist/cli.mjs'),
  checkBinary('concurrently', 'node_modules/concurrently/dist/bin/concurrently.js')
].every(ok => ok);

// Check runtime dependencies
console.log('[doctor] Checking runtime dependencies...');
const runtimeOk = [
  checkRuntimeModule('rollup'),    // vite dependency
  checkRuntimeModule('postcss'),   // vite dependency
  checkRuntimeModule('chokidar'),  // file watching
  checkRuntimeModule('yargs')      // concurrently dependency
].every(ok => ok);

// Check versions
console.log('[doctor] Checking versions...');
noteLocal('vite', '5.4.');
noteLocal('tsx', '4.19.');
noteLocal('concurrently', '9.2.');

if (!binariesOk || !runtimeOk) {
  console.error('');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('[doctor] ❌ Some checks failed.');
  console.error('');
  console.error('FIX THIS NOW:');
  console.error('  node scripts/ensure-complete-local.mjs && npm run doctor');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(1);
}

console.log('[doctor] ✅ All binaries, runtime modules, and versions OK');