#!/usr/bin/env node
/**
 * Ensure sidecar workspace is ready before test/dev/build
 * Runs as pretest, predev, prebuild, prepreview hook
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const criticalPackages = ['vite', '@vitejs/plugin-react', 'autoprefixer'];

let needsLink = false;

// Quick check: are critical packages linked?
for (const pkg of criticalPackages) {
  const pkgPath = join(rootDir, 'node_modules', pkg.replace('/', '\\'));
  if (!existsSync(pkgPath)) {
    needsLink = true;
    break;
  }
}

if (needsLink) {
  console.log('[ensure-sidecar] Missing sidecar junctions, recreating...');
  try {
    execSync('node scripts/link-sidecar-packages.mjs', {
      cwd: rootDir,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('[ensure-sidecar] ❌ Failed to link sidecar packages');
    process.exit(1);
  }
} else {
  console.log('[ensure-sidecar] ✅ Sidecar junctions ready');
}
