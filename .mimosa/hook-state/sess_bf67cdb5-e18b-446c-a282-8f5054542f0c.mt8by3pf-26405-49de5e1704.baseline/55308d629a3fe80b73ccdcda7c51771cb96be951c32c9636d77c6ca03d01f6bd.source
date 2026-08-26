/**
 * Export Failing XIRR Test Cases to CSV
 *
 * Reads truth cases JSON and exports failing scenarios to CSV
 * for easy copy-paste into Excel validation template.
 */

import fs from 'fs';
import path from 'path';

// Failing test IDs from Phase 1.1.1 baseline
const FAILING_TEST_IDS = [
  'xirr-13-leap-year-handling',
  'xirr-21-typical-vc-fund-10year',
  'xirr-golden-case-2-rapid-3x',
  'xirr-golden-case-3-multi-stage-exit',
  'xirr-golden-case-9-extreme-unicorn',
  'xirr-golden-case-10-alternating-signs',
  'xirr-golden-case-11-leap-year-precision',
  'xirr-golden-case-12-annual-dividends',
];

interface Cashflow {
  date: string;
  amount: number;
}

interface TruthCase {
  id: string;
  scenario: string;
  cashflows: Cashflow[];
  expectedIRR?: number;
  expected?: {
    irr?: number;
    converged?: boolean;
    algorithm?: string;
  };
}

function loadTruthCases(): TruthCase[] {
  const filePath = path.join(process.cwd(), 'docs', 'xirr.truth-cases.json');

  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Truth cases file not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function exportToCSV(cases: TruthCase[], outputPath: string): void {
  const rows: string[] = [];

  // Header
  rows.push('TestID,Date,Amount,ExpectedIRR,Notes');

  for (const testCase of cases) {
    if (!FAILING_TEST_IDS.includes(testCase.id)) continue;

    const expectedIRR = testCase.expectedIRR ?? testCase.expected?.irr ?? 'N/A';

    // Add cashflows for this test
    testCase.cashflows.forEach((cf, index) => {
      const isFirstRow = index === 0;
      rows.push(
        [
          isFirstRow ? testCase.id : '',
          cf.date,
          cf.amount.toString(),
          isFirstRow ? expectedIRR.toString() : '',
          isFirstRow ? testCase.scenario : '',
        ].join(',')
      );
    });

    // Blank row between tests
    rows.push('');
  }

  fs.writeFileSync(outputPath, rows.join('\n'), 'utf8');
  console.log(`Exported ${cases.length} failing test cases to: ${outputPath}`);
}

function exportDetailed(cases: TruthCase[], outputPath: string): void {
  const output: Array<{
    id: string;
    scenario: string;
    expectedIRR: number | string;
    cashflows: Cashflow[];
  }> = [];

  for (const testCase of cases) {
    if (!FAILING_TEST_IDS.includes(testCase.id)) continue;

    output.push({
      id: testCase.id,
      scenario: testCase.scenario,
      expectedIRR: testCase.expectedIRR ?? testCase.expected?.irr ?? 'N/A',
      cashflows: testCase.cashflows,
    });
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Exported detailed JSON to: ${outputPath}`);
}

function main() {
  console.log('Loading truth cases...');
  const allCases = loadTruthCases();

  console.log(`Found ${allCases.length} total test cases`);
  console.log(`Filtering to ${FAILING_TEST_IDS.length} failing cases...`);

  const csvPath = path.join(process.cwd(), 'docs', 'xirr-failing-cases-export.csv');
  const jsonPath = path.join(process.cwd(), 'docs', 'xirr-failing-cases-export.json');

  exportToCSV(allCases, csvPath);
  exportDetailed(allCases, jsonPath);

  console.log('\nExport complete!');
  console.log('Use CSV file for Excel copy-paste validation.');
  console.log('Use JSON file for programmatic debugging.');
}

// Run main function
main();

export { loadTruthCases, exportToCSV, exportDetailed };
