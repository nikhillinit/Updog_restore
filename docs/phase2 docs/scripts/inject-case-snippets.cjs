#!/usr/bin/env node
/* Inject truth case snippets into Markdown documentation between explicit markers */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const docPath = path.join(root, 'docs', 'notebooklm-sources', 'capital-allocation.md');
const casesPath = path.join(root, 'docs', 'capital-allocation.truth-cases.json');

if (!fs.existsSync(casesPath)) { console.error(`❌ Cases not found: ${casesPath}`); process.exit(1); }
if (!fs.existsSync(docPath))   { console.warn(`⚠️ Doc not found, skipping: ${docPath}`); process.exit(0); }

const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
let md = fs.readFileSync(docPath, 'utf8');

function reEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function inject(id, field, value) {
  const start = `<!-- BEGIN:CASE:${id}:${field} -->`;
  const end   = `<!-- END:CASE:${id}:${field} -->`;
  const block = `${start}\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n${end}`;
  const regex = new RegExp(`${reEscape(start)}[\\s\\S]*?${reEscape(end)}`, 'm');

  if (regex.test(md)) {
    md = md.replace(regex, block);
    console.log(`💉 Injected ${id}:${field}`);
  } else {
    console.warn(`⚠️ Markers missing for ${id}:${field} — add them to the doc to enable injection`);
  }
}

const targets = ['CA-007','CA-009','CA-013','CA-015','CA-020'];
for (const id of targets) {
  const c = cases.find(x => x.id === id);
  if (!c) { console.warn(`⚠️ ${id} not found; skipping`); continue; }
  inject(id, 'inputs',   c.inputs ?? c.flows ?? {});
  inject(id, 'expected', c.expected ?? {});
}

fs.writeFileSync(docPath, md);
console.log(`✅ Updated ${path.relative(root, docPath)}`);
