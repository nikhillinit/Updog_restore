// Production-bundle safety verifier.
//
// Asserts that quarantined source modules are NOT present in the built client
// manifest, and that no source-map files were emitted unless explicitly enabled.
// Reusable: extend QUARANTINED_MODULES as more surfaces are build-excluded.
//
// Run after `npm run build` via `npm run build:verify`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIR = resolve(process.cwd(), 'dist/public');
const MANIFEST_PATH = join(DIST_DIR, '.vite/manifest.json');

// Source-path substrings that must never appear in a production build manifest.
export const QUARANTINED_MODULES = [
  'tear-sheet-dashboard',
  'reserves-demo',
  'allocation-manager',
  'cash-management',
  'portfolio-analytics',
  'CapTables',
];

/** Pure: return manifest entries whose key/src/file matches a forbidden substring. */
export function findForbiddenModules(manifest, forbiddenSubstrings) {
  const hits = [];
  for (const key of Object.keys(manifest)) {
    const entry = manifest[key] ?? {};
    const haystacks = [key, entry.src ?? '', entry.file ?? ''];
    for (const needle of forbiddenSubstrings) {
      if (haystacks.some((h) => String(h).includes(needle))) {
        hits.push({ needle, key, file: entry.file ?? '' });
      }
    }
  }
  return hits;
}

/** Pure: return the subset of file paths that are source maps. */
export function findSourceMaps(filePaths) {
  return filePaths.filter((p) => p.endsWith('.map'));
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      `[check-prod-bundle] manifest not found at ${MANIFEST_PATH}. Run "npm run build" first.`
    );
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const moduleHits = findForbiddenModules(manifest, QUARANTINED_MODULES);

  const allowSourceMaps = process.env['VITE_SOURCEMAP'] === 'true';
  const sourceMaps = allowSourceMaps ? [] : findSourceMaps(walk(DIST_DIR));

  let failed = false;
  if (moduleHits.length > 0) {
    failed = true;
    console.error('[check-prod-bundle] FAIL: quarantined modules present in production bundle:');
    for (const hit of moduleHits) console.error(`  - "${hit.needle}" via ${hit.key} -> ${hit.file}`);
  }
  if (sourceMaps.length > 0) {
    failed = true;
    console.error('[check-prod-bundle] FAIL: source maps emitted without VITE_SOURCEMAP=true:');
    for (const map of sourceMaps) console.error(`  - ${map}`);
  }
  if (failed) process.exit(1);
  console.log('[check-prod-bundle] OK: no quarantined modules or stray source maps.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
