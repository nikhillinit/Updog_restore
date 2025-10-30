#!/usr/bin/env node
/**
 * Fix truth cases for Phase 1D Capital Allocation
 * Applies 5 case fixes + adds schemaVersion to all cases
 */

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'docs', 'capital-allocation.truth-cases.json');

// Read existing truth cases
const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

console.log(`Loaded ${data.length} truth cases`);

// Apply fixes
data.forEach(testCase => {
  // Add schemaVersion to all cases
  testCase.schemaVersion = '1.0.0';

  switch (testCase.id) {
    case 'CA-019':
      // Fix: Move negative contribution to negative distribution (capital recall)
      if (testCase.inputs?.flows?.contributions) {
        testCase.inputs.flows.contributions = testCase.inputs.flows.contributions.filter(
          c => c.amount !== -200000
        );
      }
      if (!testCase.inputs.flows.distributions) {
        testCase.inputs.flows.distributions = [];
      }
      testCase.inputs.flows.distributions.push({
        date: '2025-03-10',
        amount: -200000,
        recycle_eligible: false
      });
      testCase.expected.violations = ['capital_recall_processed'];
      testCase.notes = 'Capital recall/clawback as negative distribution; see ADR-008 for semantic implications.';
      console.log('✓ CA-019: Fixed (negative contribution → negative distribution)');
      break;

    case 'CA-012':
      // Fix: Clarify wording (no mid-stream change)
      testCase.notes = 'Comparing 24-month vs 18-month pacing assumptions (separate scenarios, not mid-stream change).';
      console.log('✓ CA-012: Fixed (clarified wording)');
      break;

    case 'CA-016':
      // Fix: Align cohort lifecycle with allocations
      testCase.expected.allocations_by_cohort = [
        { cohort: 'Alpha', amount: 3000000 },
        { cohort: 'Beta', amount: 3000000 },
        { cohort: 'Gamma', amount: 0 }
      ];
      testCase.notes = 'Alpha closes 06/30; Gamma opens 07/01. Contributions on 06/30 allocate to active cohorts only; no retroactive reallocation.';
      console.log('✓ CA-016: Fixed (aligned cohort lifecycle)');
      break;

    case 'CA-013':
      // Fix: Change category to reserve_engine
      testCase.category = 'reserve_engine';
      testCase.notes = 'Reserve floor precedence over monthly pacing; excess deferred until reserve satisfied.';
      console.log('✓ CA-013: Fixed (category → reserve_engine)');
      break;

    case 'CA-020':
      // Fix: Change category to integration
      testCase.category = 'integration';
      testCase.notes = 'Integration case: reserve floor precedence, monthly pacing, cohort caps, and recycling coordinate.';
      console.log('✓ CA-020: Fixed (category → integration)');
      break;
  }
});

// Write back
fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`\n✅ Updated ${FILE_PATH}`);
console.log('All truth cases now have schemaVersion 1.0.0');
