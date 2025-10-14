#!/usr/bin/env node
/**
 * Safe, text-only TS4111 fixer for common index-signature containers.
 * Converts:
 *   process.env.FOO     -> process.env["FOO"]
 *   req.headers.host    -> req.headers["host"]
 *   req.query.page      -> req.query["page"]
 *   req.params.id       -> req.params["id"]
 *
 * Usage:
 *   node scripts/codemods/ts4111-safe-text.mjs <file1> <file2> ...
 *   # or:
 *   git grep -l -E 'process\.env\.|req\.(headers|query|params)\.' -- server shared |
 *     xargs node scripts/codemods/ts4111-safe-text.mjs
 */
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("No files given.");
  process.exit(1);
}

const patterns = [
  // process.env.FOO  -> process.env["FOO"]
  { re: /process\.env\.([A-Z_][A-Z0-9_]*)/g, sub: 'process.env["$1"]' },

  // req.headers.host -> req.headers["host"]
  { re: /(\breq\.headers)\.([A-Za-z0-9_-]+)/g, sub: '$1["$2"]' },

  // req.query.page   -> req.query["page"]
  { re: /(\breq\.query)\.([A-Za-z0-9_-]+)/g, sub: '$1["$2"]' },

  // req.params.id    -> req.params["id"]
  { re: /(\breq\.params)\.([A-Za-z0-9_-]+)/g, sub: '$1["$2"]' },
];

let updatedCount = 0;
for (const file of files) {
  const p = path.resolve(file);
  if (!fs.existsSync(p) || !/\.(ts|tsx)$/.test(p)) continue;

  const before = fs.readFileSync(p, "utf8");
  let after = before;
  for (const { re, sub } of patterns) after = after.replace(re, sub);

  if (after !== before) {
    fs.writeFileSync(p, after, "utf8");
    updatedCount++;
    console.log("updated:", file);
  }
}

console.log(`\nTotal files updated: ${updatedCount}`);
