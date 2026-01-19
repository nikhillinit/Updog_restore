#!/usr/bin/env node
/**
 * Remove stale SPA artifacts from dist/ before Vite build.
 * Preserves server build outputs (dist/index.js, dist/server).
 *
 * Run: node scripts/clean-spa-dist.mjs
 */

import { existsSync, rmSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

// SPA artifacts to remove from dist/ root (stale from old builds)
const spaTargets = [
  'index.html',
  'assets',
  '.vite',
  'manifest.json',
  'runtime-config.json',
  'dashboard.html',
  'fonts',
  '.well-known',
  'favicon.ico',
  'icon.svg',
];

// Build analysis artifacts (regenerated each build, safe to delete)
const analysisArtifacts = [
  'stats.html',
  'stats.json',
  '.app-size-kb',
  '.bundle-report.json',
];

// Preserve these (server build outputs)
const preserve = new Set(['index.js', 'index.js.map', 'server', 'public']);

if (!existsSync(distDir)) {
  console.log('dist/ does not exist, nothing to clean');
  process.exit(0);
}

let cleaned = 0;
const allTargets = [...spaTargets, ...analysisArtifacts];

for (const target of allTargets) {
  const targetPath = join(distDir, target);
  if (existsSync(targetPath)) {
    const stat = statSync(targetPath);
    rmSync(targetPath, { recursive: true, force: true });
    const type = stat.isDirectory() ? 'directory' : 'file';
    console.log(`Removed stale ${type}: dist/${target}`);
    cleaned++;
  }
}

// Warn about unknown files in dist/ root (not deleted, just flagged)
const remaining = readdirSync(distDir);
for (const item of remaining) {
  if (!preserve.has(item) && !allTargets.includes(item)) {
    const itemPath = join(distDir, item);
    const stat = statSync(itemPath);
    console.log(`Warning: unknown ${stat.isDirectory() ? 'directory' : 'file'} in dist/: ${item}`);
  }
}

if (cleaned === 0) {
  console.log('No stale artifacts found in dist/');
} else {
  console.log(`Cleaned ${cleaned} stale artifact(s) from dist/`);
}
