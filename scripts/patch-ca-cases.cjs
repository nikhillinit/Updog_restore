#!/usr/bin/env node
const fs = require('fs');
const p = 'docs/capital-allocation.truth-cases.json';
const data = JSON.parse(fs.readFileSync(p, 'utf8'));

const idx = id => data.findIndex(c => c.id === id);
const touch = (id, f) => { const i = idx(id); if (i >= 0) data[i] = f(data[i]); };

// Ensure schemaVersion on all
for (const c of data) { if (!c.schemaVersion) c.schemaVersion = '1.0.0'; }

// CA-019: negative distribution recall (and remove any negative contributions)
touch('CA-019', c => {
  c.inputs = c.inputs || {};
  c.inputs.flows = c.inputs.flows || {};
  c.inputs.flows.contributions = (c.inputs.flows.contributions || []).filter(x => x.amount >= 0);
  c.inputs.flows.distributions = (c.inputs.flows.distributions || []);
  c.inputs.flows.distributions.push({ date: '2025-03-10', amount: -200000, recycle_eligible: false });
  c.expected = c.expected || {};
  c.expected.violations = ['capital_recall_processed'];
  c.notes = 'Capital recall/clawback modeled as negative distribution; see ADR-008.';
  return c;
});

// CA-012: clarify wording
touch('CA-012', c => { c.notes = 'Comparing 24-month vs 18-month pacing assumptions (separate scenarios, not mid-stream change).'; return c; });

// CA-016: lifecycle alignment
touch('CA-016', c => {
  c.expected = c.expected || {};
  c.expected.allocations_by_cohort = [
    { cohort: 'Alpha', amount: 3000000 },
    { cohort: 'Beta',  amount: 3000000 },
    { cohort: 'Gamma', amount: 0 }
  ];
  c.notes = 'Alpha closes 06/30; Gamma opens 07/01. 06/30 contributions allocate to active cohorts only.';
  return c;
});

// CA-013: category reserve_engine + note
touch('CA-013', c => { c.category = 'reserve_engine'; c.notes = 'Reserve floor precedence over monthly pacing; deferral until reserve satisfied.'; return c; });

// CA-020: category integration + note
touch('CA-020', c => { c.category = 'integration'; c.notes = 'Integration: reserve precedence + pacing + cohort caps + recycling coordinate.'; return c; });

fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
console.log('✅ Patched truth cases:', data.map(c => c.id).join(', '));
