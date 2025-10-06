// scripts/link-sidecar-packages.mjs
// Creates Windows junctions (or Unix symlinks) from root node_modules to tools_local packages
// This ensures vite + plugins resolve correctly in all runtime contexts (Vite, tsx, workers)

import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const PACKAGES = [
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
} catch (e) {
  console.error('[link-sidecar] ✗ Failed:', e.message);
  console.error('[link-sidecar] On Windows, enable Developer Mode or run in an elevated shell.');
  process.exit(1);
}
