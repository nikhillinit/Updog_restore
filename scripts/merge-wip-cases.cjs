#!/usr/bin/env node
/* Merge WIP cases into canonical file with schema validation + enum normalization */
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const root = path.join(__dirname, '..');
const schemaPath = path.join(root, 'docs', 'schemas', 'capital-allocation-truth-case.schema.json');
const canonPath  = path.join(root, 'docs', 'capital-allocation.truth-cases.json');
const wipDir     = path.join(root, 'scripts', 'wip-cases');

function die(msg, e) { console.error('❌', msg); if (e) console.error(e); process.exit(1); }

if (!fs.existsSync(schemaPath)) die(`Schema file not found: ${schemaPath}`);
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

const ajv = new Ajv({ allErrors: true /*, strict: true, allowUnionTypes: true */ });
addFormats(ajv);

const validate = ajv.compile(schema);

const canonical = fs.existsSync(canonPath) ? JSON.parse(fs.readFileSync(canonPath, 'utf8')) : [];
const byId = new Map(canonical.map(c => [c.id, c]));

const CATEGORY_MAP = new Map([
  ['integration_recall', 'integration'],
  ['integration_full',   'integration'],
]);

function normalizeCase(c) {
  const out = { ...c };
  if (out.category && CATEGORY_MAP.has(out.category)) out.category = CATEGORY_MAP.get(out.category);
  out.schemaVersion = out.schemaVersion || "1.0.0";
  if (out.expected && out.expected.allocations && !out.expected.allocations_by_cohort) {
    const arr = Object.entries(out.expected.allocations).map(([cohort, amount]) => ({ cohort, amount }));
    out.expected.allocations_by_cohort = arr;
    delete out.expected.allocations;
  }
  return out;
}

if (fs.existsSync(wipDir)) {
  let processed = 0;
  for (const file of fs.readdirSync(wipDir).filter(f => f.endsWith('.json'))) {
    const p = path.join(wipDir, file);
    let c;
    try { c = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { die(`Failed to parse JSON in ${file}`, e); }

    const norm = normalizeCase(c);
    if (!validate(norm)) {
      console.error(`❌ Validation failed for ${file}:`);
      console.error(validate.errors);
      process.exit(1);
    }
    byId.set(norm.id, norm);
    processed++;
  }
  console.log(`✅ Processed ${processed} WIP cases`);
} else {
  console.log(`ℹ️ WIP directory not found, skipping merge: ${wipDir}`);
}

const merged = Array.from(byId.values()).sort((a,b) => a.id.localeCompare(b.id));
fs.writeFileSync(canonPath, JSON.stringify(merged, null, 2));
console.log(`✅ Total cases: ${merged.length} → ${path.relative(root, canonPath)}`);
