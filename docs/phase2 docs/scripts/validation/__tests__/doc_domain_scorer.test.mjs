import test from 'node:test';
import assert from 'node:assert/strict';
import scorer from '../doc_domain_scorer.mjs';

const mk = (out, content) =>
  scorer({ output: out, vars: { doc_content: content, doc_type: 'capital_allocation' } });

test('capital allocation keywords hit', async () => {
  const out = 'Reserve engine enforces cash buffer; pacing window with carryover; cohort caps and spill reallocation.';
  const r = await mk(out, 'Capital Allocation: reserve engine, pacing engine, cohort engine.');
  assert.ok(r.score >= 0.7, `expected >= 0.7, got ${r.score}`);
});

test('contradiction penalty applies', async () => {
  const out = 'Pacing overrides reserve floor when in conflict.'; // this should penalize
  const r = await mk(out, 'Capital Allocation basics.');
  assert.ok(r.score < 0.6, `expected penalty; got ${r.score}`);
});
