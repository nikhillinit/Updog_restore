/**
 * Investigate All Failing XIRR Tests
 * Runs debug analysis on all 8 failing test cases
 */

import { runScenario, checkNPV } from './debug-xirr';
import failingCases from '../docs/xirr-failing-cases-export.json';

interface TestCase {
  id: string;
  scenario: string;
  expectedIRR: number;
  cashflows: Array<{ date: string; amount: number }>;
}

console.log('='.repeat(100));
console.log('PHASE 1.2: COMPREHENSIVE XIRR FAILURE INVESTIGATION');
console.log('='.repeat(100));
console.log(`\nInvestigating ${failingCases.length} failing test cases...\n`);

const results: Array<{
  id: string;
  scenario: string;
  expectedIRR: number;
  solverIRR: number | null;
  closedFormIRR?: number;
  delta: number;
  verdict: 'TRUTH_BUG' | 'SOLVER_BUG' | 'NEEDS_EXCEL' | 'UNKNOWN';
  reason: string;
}> = [];

for (const testCase of failingCases as TestCase[]) {
  console.log('\n' + '='.repeat(100));
  console.log(`TEST: ${testCase.id}`);
  console.log('='.repeat(100));

  const result = runScenario(testCase.id, testCase.cashflows, {
    expectedIRR: testCase.expectedIRR,
    guess: 0.1,
  });

  let verdict: 'TRUTH_BUG' | 'SOLVER_BUG' | 'NEEDS_EXCEL' | 'UNKNOWN' = 'UNKNOWN';
  let reason = '';

  // For 2-flow scenarios, we can compute closed-form
  if (testCase.cashflows.length === 2) {
    const [flow1, flow2] = testCase.cashflows;
    const date1 = new Date(flow1.date);
    const date2 = new Date(flow2.date);
    const days = (date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
    const years = days / 365;
    const multiple = -flow2.amount / flow1.amount;
    const closedFormIRR = Math.pow(multiple, 1 / years) - 1;

    if (result.irr && result.converged) {
      const closedFormMatch = Math.abs(result.irr - closedFormIRR) < 0.001; // within 100 bps
      const expectedMatch = Math.abs(result.irr - testCase.expectedIRR) < 0.001;

      if (closedFormMatch && !expectedMatch) {
        verdict = 'TRUTH_BUG';
        reason = `Closed-form IRR (${(closedFormIRR * 100).toFixed(2)}%) matches solver but not expected (${(testCase.expectedIRR * 100).toFixed(2)}%)`;
      } else if (!closedFormMatch && expectedMatch) {
        verdict = 'SOLVER_BUG';
        reason = `Solver matches expected but not closed-form calculation`;
      } else if (!closedFormMatch && !expectedMatch) {
        verdict = 'UNKNOWN';
        reason = `Solver, closed-form, and expected all disagree - needs investigation`;
      }
    } else {
      verdict = 'SOLVER_BUG';
      reason = `Solver failed to converge on simple 2-flow scenario`;
    }

    results.push({
      id: testCase.id,
      scenario: testCase.scenario,
      expectedIRR: testCase.expectedIRR,
      solverIRR: result.irr,
      closedFormIRR,
      delta: Math.abs((result.irr ?? 0) - testCase.expectedIRR) * 10000,
      verdict,
      reason,
    });
  } else {
    // Multi-flow scenarios need Excel validation
    verdict = 'NEEDS_EXCEL';
    reason = `Multi-flow scenario (${testCase.cashflows.length} cashflows) - manual Excel validation required`;

    results.push({
      id: testCase.id,
      scenario: testCase.scenario,
      expectedIRR: testCase.expectedIRR,
      solverIRR: result.irr,
      delta: Math.abs((result.irr ?? 0) - testCase.expectedIRR) * 10000,
      verdict,
      reason,
    });
  }

  console.log(`\nVERDICT: ${verdict}`);
  console.log(`REASON: ${reason}`);
}

// Summary
console.log('\n' + '='.repeat(100));
console.log('INVESTIGATION SUMMARY');
console.log('='.repeat(100));

const truthBugs = results.filter((r) => r.verdict === 'TRUTH_BUG');
const solverBugs = results.filter((r) => r.verdict === 'SOLVER_BUG');
const needsExcel = results.filter((r) => r.verdict === 'NEEDS_EXCEL');
const unknown = results.filter((r) => r.verdict === 'UNKNOWN');

console.log(`\nTotal Investigated: ${results.length}`);
console.log(`Truth Case Bugs (expected IRR wrong): ${truthBugs.length}`);
console.log(`Solver Bugs (implementation wrong): ${solverBugs.length}`);
console.log(`Needs Excel Validation: ${needsExcel.length}`);
console.log(`Unknown/Unclear: ${unknown.length}`);

if (truthBugs.length > 0) {
  console.log(`\n${'Truth Case Bugs (Update Expected Values)'}:`);
  truthBugs.forEach((r) => {
    console.log(
      `  - ${r.id}: ${(r.expectedIRR * 100).toFixed(4)}% → ${((r.solverIRR ?? 0) * 100).toFixed(4)}% (Δ ${r.delta.toFixed(0)} bps)`
    );
  });
}

if (solverBugs.length > 0) {
  console.log(`\n${'Solver Bugs (Fix Implementation)'}:`);
  solverBugs.forEach((r) => {
    console.log(`  - ${r.id}: ${r.reason}`);
  });
}

if (needsExcel.length > 0) {
  console.log(`\n${'Requires Excel Validation'}:`);
  needsExcel.forEach((r) => {
    const testCase = (failingCases as TestCase[]).find((tc) => tc.id === r.id);
    const numFlows = testCase?.cashflows.length ?? 'unknown';
    console.log(
      `  - ${r.id}: ${numFlows} flows, Expected ${(r.expectedIRR * 100).toFixed(4)}%, Solver ${((r.solverIRR ?? 0) * 100).toFixed(4)}%`
    );
  });
}

console.log('\n' + '='.repeat(100));
console.log('NEXT STEPS:');
console.log('='.repeat(100));
console.log(`1. Update truth cases JSON for ${truthBugs.length} confirmed bugs`);
console.log(`2. Validate ${needsExcel.length} multi-flow cases in Excel`);
console.log(`3. Fix ${solverBugs.length} solver implementation issues`);
console.log(`4. Re-run test suite to measure improvement`);
console.log('='.repeat(100));

// Save results to file
import fs from 'fs';
import path from 'path';

const outputPath = path.join(process.cwd(), 'docs', 'phase1-2-investigation-results.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
console.log(`\nDetailed results saved to: ${outputPath}`);
