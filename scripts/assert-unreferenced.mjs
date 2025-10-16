#!/usr/bin/env node
/**
 * Usage: node scripts/assert-unreferenced.mjs <path/to/file.ts> [...]
 * Exits 0 if target is unreferenced (directly or transitively) in server/|client/, non-zero otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['server', 'client'].map(p => path.resolve(process.cwd(), p));
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const TARGETS = process.argv.slice(2).map(p => path.resolve(process.cwd(), p));
if (TARGETS.length === 0) {
  console.error('Usage: node scripts/assert-unreferenced.mjs <file> [more files]');
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (EXTS.some(e => ent.name.endsWith(e))) out.push(full);
  }
  return out;
}

function* findImports(src) {
  const importRE  = /\bimport\s+(?:[\s\S]*?\sfrom\s)?["']([^"']+)["']/g;
  const exportRE  = /\bexport\s+(?:[\s\S]*?\sfrom\s)?["']([^"']+)["']/g;
  const requireRE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  const dynamicRE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = importRE.exec(src)))  yield m[1];
  while ((m = exportRE.exec(src)))  yield m[1];
  while ((m = requireRE.exec(src))) yield m[1];
  while ((m = dynamicRE.exec(src))) yield m[1];
}

function resolveRelative(spec, importer) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(importer), spec);
  const candidates = [
    base,
    ...EXTS.map(e => base + e),
    ...EXTS.map(e => path.join(base, 'index' + e)),
  ];
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch {}
  }
  return null;
}

function buildReverse() {
  const files = ROOTS.flatMap(r => {
    try { return walk(r); } catch { return []; }
  });
  const reverse = new Map(); // dep -> Set(importers)
  for (const f of files) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const spec of findImports(src)) {
      const dep = resolveRelative(spec, f);
      if (!dep) continue;
      if (!reverse.has(dep)) reverse.set(dep, new Set());
      reverse.get(dep).add(f);
    }
  }
  return reverse;
}

const reverse = buildReverse();
let exitCode = 0;
for (const target of TARGETS) {
  const seen = new Set([target]);
  const queue = [target];
  const importers = new Set();
  while (queue.length) {
    const cur = queue.shift();
    const parents = reverse.get(cur) || new Set();
    for (const p of parents) {
      if (seen.has(p)) continue;
      seen.add(p);
      importers.add(p);
      queue.push(p);
    }
  }
  if (importers.size) {
    exitCode = 1;
    console.error(`❌ Referenced: ${path.relative(process.cwd(), target)}`);
    for (const p of [...importers].slice(0, 12)) {
      console.error(`   ↳ ${path.relative(process.cwd(), p)}`);
    }
    if (importers.size > 12) console.error(`   (+${importers.size - 12} more)`);
  } else {
    console.log(`✅ Unreferenced: ${path.relative(process.cwd(), target)} — safe to quarantine`);
  }
}
process.exit(exitCode);
