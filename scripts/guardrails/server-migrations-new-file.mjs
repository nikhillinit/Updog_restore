#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const MIGRATIONS_DIR = path.join('server', 'migrations');
const CODE = 'server-migrations-new-file';

// Lane-B carve-out retired (s8.2 slice 3): the investment_rounds family now lives in the
// canonical Drizzle journal (migrations/0027). The allowlist is intentionally empty:
// every file under server/migrations/ is an offender.
export const LANE_B_ALLOWLIST = [];

export function analyzeServerMigrations({ entries, allowlist = LANE_B_ALLOWLIST }) {
  const allowed = new Set(allowlist);
  const offenders = entries
    .filter((name) => !allowed.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      severity: 'error',
      code: CODE,
      file: `server/migrations/${name}`,
      message:
        `Unexpected server/migrations file: ${name}. The legacy server/migrations ` +
        `topology is retired; add migrations to the canonical Drizzle journal (migrations/).`,
    }));

  return { ok: offenders.length === 0, offenders };
}

// Recursive walk returning forward-slash relative paths (dir-agnostic identity).
// Physical traversal uses path.join (OS separator); the returned `rel` stays
// forward-slash so offender labels are stable cross-platform.
function listMigrationFiles(dir) {
  const files = [];
  const walk = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name), rel);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  };
  walk(dir, '');
  return files;
}

export function checkServerMigrations({ dir = MIGRATIONS_DIR, allowlist = LANE_B_ALLOWLIST } = {}) {
  if (!fs.existsSync(dir)) {
    return { ok: true, offenders: [] };
  }

  // Any file nested under server/migrations/ has a relative path containing '/',
  // which is never in the flat lane-B allowlist -> nesting is always rejected.
  // Flat lane-B files (rel === basename) still pass.
  const entries = listMigrationFiles(dir);

  return analyzeServerMigrations({ entries, allowlist });
}

function printResult(result) {
  if (result.ok) {
    console.log('[server-migrations-new-file] pass: no unexpected server/migrations files');
    return;
  }

  console.error('[server-migrations-new-file] failed: unexpected server/migrations files present');
  for (const offender of result.offenders) {
    console.error(`  - ${offender.file}`);
    console.error(`    ${JSON.stringify(offender)}`);
  }
  console.error(
    '[server-migrations-new-file] the legacy server/migrations topology is retired; ' +
      'use the canonical Drizzle journal (migrations/)'
  );
}

export function runServerMigrationsGuardCli({ dir, allowlist } = {}) {
  const result = checkServerMigrations({ dir, allowlist });
  printResult(result);
  return result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';

if (import.meta.url === invokedPath) {
  process.exitCode = runServerMigrationsGuardCli();
}
