// scripts/doctor-sidecar.js (ESM)
// Validates sidecar tools_local workspace for Windows development
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// ANSI color codes
const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const reset = "\x1b[0m";

console.log('[doctor:sidecar] Checking tools_local workspace...');

// Check if sidecar exists
const sidecarPath = path.resolve('tools_local/package.json');
if (!existsSync(sidecarPath)) {
  console.error(`${red}[doctor:sidecar] ❌ tools_local/package.json not found${reset}`);
  console.error('');
  console.error(`${red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`);
  console.error(`${yellow}FIX THIS NOW:${reset}`);
  console.error('  Create tools_local/package.json with vite/tsx/concurrently');
  console.error(`  Then run: ${green}node scripts/ensure-sidecar.mjs${reset}`);
  console.error(`${red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`);
  process.exit(1);
}

const requireSidecar = createRequire(sidecarPath);

function checkBinary(name, path) {
  if (!existsSync(path)) {
    console.error(`${red}[doctor:sidecar] ❌ Missing binary: ${path}${reset}`);
    console.error(`                 Run: ${green}node scripts/ensure-sidecar.mjs${reset}`);
    return false;
  }
  console.log(`${green}[doctor:sidecar] ✅ Binary exists: ${name}${reset}`);
  return true;
}

function checkSidecarModule(name) {
  try {
    requireSidecar.resolve(name);
    console.log(`${green}[doctor:sidecar] ✅ Sidecar module: ${name}${reset}`);
    return true;
  } catch {
    console.error(`${red}[doctor:sidecar] ❌ Missing sidecar module: ${name}${reset}`);
    console.error(`                 Run: ${green}node scripts/ensure-sidecar.mjs${reset}`);
    return false;
  }
}

function checkVersion(name, expected) {
  try {
    const pkgPath = requireSidecar.resolve(`${name}/package.json`);
    const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
    if (version === expected) {
      console.log(`${green}[doctor:sidecar] ✅ ${name}@${version} (exact match)${reset}`);
      return true;
    } else {
      console.error(`${yellow}[doctor:sidecar] ⚠️ ${name}@${version} (expected ${expected})${reset}`);
      return false;
    }
  } catch {
    console.error(`${red}[doctor:sidecar] ❌ ${name} not found in sidecar${reset}`);
    return false;
  }
}

// Check critical binaries
console.log('[doctor:sidecar] Checking sidecar binaries...');
const binariesOk = [
  checkBinary('vite', 'tools_local/node_modules/vite/bin/vite.js'),
  checkBinary('tsx', 'tools_local/node_modules/tsx/dist/cli.mjs'),
  checkBinary('concurrently', 'tools_local/node_modules/concurrently/dist/bin/concurrently.js')
].every(ok => ok);

// Check runtime dependencies
console.log('[doctor:sidecar] Checking sidecar runtime dependencies...');
const runtimeOk = [
  checkSidecarModule('rollup'),    // vite dependency
  checkSidecarModule('postcss'),   // vite dependency
  checkSidecarModule('chokidar'),  // file watching
  checkSidecarModule('yargs')      // concurrently dependency
].every(ok => ok);

// Check versions
console.log('[doctor:sidecar] Checking sidecar versions...');
const versionsOk = [
  checkVersion('vite', '5.4.11'),
  checkVersion('tsx', '4.19.2'),
  checkVersion('concurrently', '9.2.1')
].every(ok => ok);

if (!binariesOk || !runtimeOk || !versionsOk) {
  console.error('');
  console.error(`${red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`);
  console.error(`${red}[doctor:sidecar] ❌ Sidecar validation failed.${reset}`);
  console.error('');
  console.error(`${yellow}FIX THIS NOW:${reset}`);
  console.error(`  ${green}node scripts/ensure-sidecar.mjs && npm run doctor:sidecar${reset}`);
  console.error(`${red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`);
  process.exit(1);
}

console.log(`${green}[doctor:sidecar] ✅ Sidecar tools_local is ready for Windows development${reset}`);