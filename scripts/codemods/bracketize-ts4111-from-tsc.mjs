#!/usr/bin/env node
/**
 * Fallback TS4111 codemod (no ts-morph / no tsx).
 *
 * Strategy:
 *  - Consume TSC output filtered to only TS4111 lines (file(line,col): error TS4111: ...)
 *  - Optionally scope to a directory (2nd arg), e.g. server/services
 *  - For each match, rewrite the *single* property access on that line:
 *        lhs.prop  -->  lhs["prop"]
 *    using a conservative regex that:
 *      - leaves declared members elsewhere untouched (we only edit lines TSC flagged)
 *      - doesn't touch numeric literals or string-literal access already bracketed
 *  - Writes a .bak alongside original before changing
 *
 * Usage:
 *   1) npm run ts4111:scan
 *   2) node scripts/codemods/bracketize-ts4111-from-tsc.mjs artifacts/week2/ts4111-errors.txt
 *      # Optional: scope to directory:
 *      node scripts/codemods/bracketize-ts4111-from-tsc.mjs artifacts/week2/ts4111-errors.txt server/services
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const ERR_PATH = process.argv[2] || 'artifacts/week2/ts4111-errors.txt';
const SCOPE = process.argv[3] || ''; // e.g. server/services

if (!fs.existsSync(ERR_PATH)) {
  console.error(`TS4111 list not found: ${ERR_PATH}`);
  process.exit(0);
}

const OUT_DIR = path.join('artifacts', 'week2');
fs.mkdirSync(OUT_DIR, { recursive: true });
const REPORT = path.join(OUT_DIR, 'ts4111-fallback-report.json');

const rec = {
  scope: SCOPE || 'repo',
  processed: 0,
  changedFiles: 0,
  totalChanges: 0,
  perFile: {}
};

// Examples we transform on the flagged line:
//   process.env.PORT  -> process.env["PORT"]
//   bag.foo           -> bag["foo"]
//
// Regex notes:
//  - greedy LHS (group 1) stops before the dot
//  - prop name (group 2) is identifier chars only (avoid string/index/num)
//  - keep it conservative: only bracketize the *first* match on the line
//
// We intentionally do not try to parse the AST; we trust TSC's line targeting.
const DOT_ACCESS = /(^|[^.\w\]'"`])([A-Za-z_$][\w$.\]\[]*)\.([A-Za-z_$][\w$]*)/;

function bracketizeLine(line) {
  // Skip if line already contains bracket access for this segment
  // or string-literal forms like obj["prop"].
  if (/\[\s*['"][A-Za-z_$][\w$]*['"]\s*\]/.test(line)) return null;

  const m = line.match(DOT_ACCESS);
  if (!m) return null;
  const [full, pre, lhs, prop] = m;
  const before = line.slice(0, m.index);
  const after = line.slice(m.index + full.length);
  const replacement = `${pre}${lhs}["${prop}"]`;
  return before + replacement + after;
}

// Parse a TSC line like:
//   server/routes/foo.ts(123,45): error TS4111: ...
// Windows paths may have drive letters like C:/, so be greedy up to '('
const TSC_LINE = /^(.+?)\((\d+),(\d+)\):\s+error\s+TS4111:/;

async function run() {
  const rl = readline.createInterface({
    input: fs.createReadStream(ERR_PATH, 'utf8'),
    crlfDelay: Infinity
  });

  const targets = new Map(); // file -> Set(lineNumbers)
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    const mm = line.match(TSC_LINE);
    if (!mm) continue;
    const [, file, lineNumStr] = mm;
    if (SCOPE && !file.replace(/\\/g, '/').startsWith(SCOPE.replace(/\\/g, '/'))) {
      continue;
    }
    const lineNum = parseInt(lineNumStr, 10);
    if (!targets.has(file)) targets.set(file, new Set());
    targets.get(file).add(lineNum);
  }

  for (const [file, lineSet] of targets) {
    if (!fs.existsSync(file)) continue;
    const original = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    let changes = 0;

    // Work on a copy
    const edited = original.slice();
    for (const ln of lineSet) {
      const idx = ln - 1;
      if (idx < 0 || idx >= edited.length) continue;
      const before = edited[idx];
      const after = bracketizeLine(before);
      if (after && after !== before) {
        edited[idx] = after;
        changes++;
      }
    }

    rec.processed++;
    if (changes > 0) {
      rec.changedFiles++;
      rec.totalChanges += changes;
      rec.perFile[file] = changes;
      // backup + write
      const bak = file + '.bak-ts4111';
      if (!fs.existsSync(bak)) fs.writeFileSync(bak, original.join('\n'), 'utf8');
      fs.writeFileSync(file, edited.join('\n'), 'utf8');
    }
  }

  fs.writeFileSync(REPORT, JSON.stringify(rec, null, 2), 'utf8');
  console.log(`TS4111 fallback codemod: ${rec.totalChanges} changes in ${rec.changedFiles}/${rec.processed} files`);
  console.log(`↳ Report: ${REPORT}`);
}

run().catch((e) => {
  console.error('TS4111 fallback failed:', e);
  process.exit(1);
});
