/**
 * Build Verification Script
 * Validates that required build artifacts exist after build:prod
 *
 * Checks:
 * - dist/index.js (server entry point for Docker)
 * - dist/public/index.html (frontend entry point)
 * - dist/public/assets (frontend assets directory)
 */
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

const required = [
  ['dist/index.js', 'Server entry'],
  ['dist/public/index.html', 'Frontend entry'],
  ['dist/public/assets', 'Frontend assets'],
];

let failed = false;
for (const [path, desc] of required) {
  const fullPath = resolve(path);
  if (!existsSync(fullPath)) {
    console.error(`MISSING: ${desc} (${path})`);
    failed = true;
  } else {
    const stat = statSync(fullPath);
    const size = stat.isDirectory() ? 'directory' : `${stat.size} bytes`;
    console.log(`OK: ${desc} (${size})`);
  }
}

if (failed) {
  console.error('Build verification FAILED');
  process.exit(1);
}
console.log('Build verification passed');
