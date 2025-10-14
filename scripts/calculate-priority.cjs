#!/usr/bin/env node
/**
 * Priority scoring (maintainable; optional centrality)
 * Input: top-files.txt (lines: "<count> <path>")
 * Output: stdout lines: "<score>\t<count>\t<path>"
 *
 * Weights:
 *  - /core/ or *Engine*  -> x2.0
 *  - /shared/            -> x1.8
 *  - /components/        -> x1.5
 *  - Dashboard/ModelingWizard -> x1.6
 *  - + optional centrality multiplier via madge (log-scale)
 */
const fs = require('fs');
const path = process.argv[2] || 'artifacts/phase0/latest/top-files.txt';

if (!fs.existsSync(path)) {
  process.stderr.write(`top-files not found: ${path}\n`);
  process.exit(0);
}

const lines = fs.readFileSync(path, 'utf8')
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean)
  .slice(0, 50);

const rows = lines.map(line => {
  const m = line.match(/^(\d+)\s+(.*)$/);
  return { count: Number(m?.[1] || 0), file: (m?.[2] || '').trim() };
}).filter(x => x.file && x.count > 0);

// Optional: read madge centrality if present
let dependents = {};
const depsPath = 'artifacts/phase0/latest/deps-client.json';
if (fs.existsSync(depsPath)) {
  try {
    const deps = JSON.parse(fs.readFileSync(depsPath, 'utf8'));
    const modules = deps.modules || deps || {};
    const norm = o => Array.isArray(o) ? o : (o?.modules || []);
    const arr = norm(modules);

    // Support both madge JSON shapes
    if (Array.isArray(arr)) {
      arr.forEach(m => {
        const f = m.filename || m.id || '';
        (m.dependents || []).forEach(d => {
          dependents[d] = (dependents[d] || 0) + 1;
        });
      });
    } else {
      Object.entries(modules).forEach(([f, m]) => {
        (m.dependents || []).forEach(d => {
          dependents[d] = (dependents[d] || 0) + 1;
        });
      });
    }
  } catch { /* ignore */ }
}

function centrality(file) {
  const d = dependents[file] || 0;
  // Gentle log-scale to avoid "god file" overweighting
  return 1 + (Math.log2(d + 1) / 10);
}

for (const r of rows) {
  let w = 1.0;
  const f = r.file;

  // Core engines and engine-like files
  if (f.includes('/core/') || f.startsWith('core/') || /engine/i.test(f)) {
    w *= 2.0;
  }

  // Shared libraries
  if (f.includes('/shared/') || f.startsWith('shared/')) {
    w *= 1.8;
  }

  // Components
  if (f.includes('/components/') || f.startsWith('components/')) {
    w *= 1.5;
  }

  // High-impact UI
  if (/(Dashboard|ModelingWizard)/.test(f)) {
    w *= 1.6;
  }

  // Optional centrality multiplier
  w *= centrality(f);

  r.score = Math.round(r.count * w);
}

rows.sort((a, b) => b.score - a.score);
process.stdout.write(rows.map(r => `${r.score}\t${r.count}\t${r.file}`).join('\n') + '\n');
