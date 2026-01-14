// scripts/link-sidecar-packages.mjs
// Creates Windows junctions (or Unix symlinks) from root node_modules to tools_local packages
// This ensures vite + plugins resolve correctly in all runtime contexts (Vite, tsx, workers)

import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Skip sidecar linking on CI environments (Vercel, GitHub Actions, etc.)
// The sidecar is only needed for Windows development to work around Windows Defender issues
if (process.env.CI || process.env.VERCEL || process.env.GITHUB_ACTIONS) {
  console.log('[link-sidecar] Skipping sidecar linking in CI environment');
  console.log('[link-sidecar] Build will use packages from root node_modules/');
  process.exit(0);
}

// Load packages from config file for easier maintenance
let PACKAGES;
try {
  const configPath = path.join(__dirname, 'sidecar-packages.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  PACKAGES = config.packages;
  console.log(`[link-sidecar] Loaded ${PACKAGES.length} packages from sidecar-packages.json`);
} catch (e) {
  console.error('[link-sidecar] Failed to load sidecar-packages.json:', e.message);
  console.error('[link-sidecar] Falling back to hardcoded package list');
  PACKAGES = [
    'vite',
    '@vitejs/plugin-react',
    '@preact/preset-vite',
    'rollup-plugin-visualizer',
    'vite-plugin-virtual',
    'vite-tsconfig-paths',
    'autoprefixer',
    'postcss',
    'tailwindcss',
    'preact',
  ];
}

function linkOne(pkg) {
  const parts = pkg.split('/');
  const rootPkg = path.resolve('node_modules', ...parts);
  const sidecarPkg = path.resolve('tools_local', 'node_modules', ...parts);

  if (!existsSync(sidecarPkg)) {
    console.warn(`[link-sidecar] Skipping ${pkg} — not present in sidecar`);
    return;
  }

  // Ensure parent dir (e.g., node_modules/@vitejs) exists
  mkdirSync(path.dirname(rootPkg), { recursive: true });

  // Remove existing (junction or dir) safely
  if (existsSync(rootPkg)) {
    if (os.platform() === 'win32') {
      try {
        execSync(`cmd /c rmdir "${rootPkg}" 2> NUL`, { stdio: 'ignore' });
      } catch {}
    }
    rmSync(rootPkg, { recursive: true, force: true });
  }

  // Create junction (Windows) or symlink (Unix)
  if (os.platform() === 'win32') {
    const rp = path.win32.resolve(rootPkg);
    const sp = path.win32.resolve(sidecarPkg);
    execSync(`cmd /c mklink /J "${rp}" "${sp}"`, { stdio: 'inherit' });
  } else {
    const rel = path.relative(path.dirname(rootPkg), sidecarPkg);
    execSync(`ln -s "${rel}" "${rootPkg}"`, { stdio: 'inherit' });
  }

  console.log(`[link-sidecar] ✓ ${pkg}`);
}

try {
  console.log('[link-sidecar] Creating junctions for vite + plugins...');
  for (const p of PACKAGES) linkOne(p);
  console.log('[link-sidecar] ✅ Linked vite + plugins into root node_modules');

  // CRITICAL: npm does NOT auto-create .bin shims for junctioned packages
  // We must explicitly run `npm rebuild` to generate them
  console.log('[link-sidecar] Creating .bin shims for junctioned packages...');

  // Only rebuild packages that have bin scripts
  const packagesWithBin = [];
  for (const pkg of PACKAGES) {
    const sidecarPkgJson = path.resolve('tools_local', 'node_modules', ...pkg.split('/'), 'package.json');
    if (existsSync(sidecarPkgJson)) {
      const pkgData = JSON.parse(readFileSync(sidecarPkgJson, 'utf-8'));
      if (pkgData.bin) {
        packagesWithBin.push(pkg);
      }
    }
  }

  if (packagesWithBin.length > 0) {
    console.log(`[link-sidecar] Rebuilding ${packagesWithBin.length} packages with bin scripts...`);
    execSync(`npm rebuild ${packagesWithBin.join(' ')} --ignore-scripts`, { stdio: 'inherit' });
    console.log('[link-sidecar] ✅ Created .bin shims for npm scripts');
  }
} catch (e) {
  console.error('[link-sidecar] ✗ Failed:', e.message);
  console.error('[link-sidecar] On Windows, enable Developer Mode or run in an elevated shell.');
  process.exit(1);
}
