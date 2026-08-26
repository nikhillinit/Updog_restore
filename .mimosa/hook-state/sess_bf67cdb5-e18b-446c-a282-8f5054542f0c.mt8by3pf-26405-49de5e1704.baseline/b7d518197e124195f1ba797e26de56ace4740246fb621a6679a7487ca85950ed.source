const fs = require('fs');
const results = JSON.parse(fs.readFileSync('docs/phase1-xirr-baseline-1.1.1-updated.json', 'utf8'));

const tests = results.testResults[0].assertionResults.filter(
  (t) => !t.title.includes('truth table covers')
);

const rows = tests
  .map((t) => {
    const title = t.title;
    const status = t.status === 'passed' ? 'PASS' : 'FAIL';
    const id = title.split(':')[0].trim();

    // Parse expected/actual from failure message if available
    let expected = 'N/A',
      actual = 'N/A',
      deltaBps = 'N/A',
      category = 'Valid';

    if (status === 'FAIL' && t.failureMessages && t.failureMessages[0]) {
      const msg = t.failureMessages[0];

      // Check for null convergence failures
      if (msg.includes('expected null not to be null')) {
        category = 'Convergence';
        expected = actual = deltaBps = '(no convergence)';
      } else {
        // Parse numeric assertion
        const match = msg.match(/expected ([\d.eE+-]+) to be close to ([\d.eE+-]+)/);
        if (match) {
          actual = parseFloat(match[1]).toFixed(4);
          expected = parseFloat(match[2]).toFixed(4);
          const delta = Math.abs(parseFloat(match[1]) - parseFloat(match[2]));
          deltaBps = (delta * 10000).toFixed(1);
          category = delta > 0.01 ? 'Truth Error' : 'Precision';
        }
      }
    }

    return `| ${id} | ${expected} | ${actual} | ${deltaBps} | ${status} | ${category} |`;
  })
  .join('\n');

const heatmap = `# Phase 1.1.1 XIRR Baseline Heatmap

**Generated:** ${new Date().toISOString()}  
**Pass Rate:** ${results.numPassedTests}/${results.numTotalTests} (${((results.numPassedTests / results.numTotalTests) * 100).toFixed(1)}%)

## Results Table

| Scenario ID | Expected IRR | Actual IRR | |Δ| (bps) | Status | Category |
|-------------|--------------|------------|------------|--------|----------|
${rows}

## Summary

- **Total Tests:** ${results.numTotalTests}
- **Passed:** ${results.numPassedTests}
- **Failed:** ${results.numFailedTests}
- **Pass Rate:** ${((results.numPassedTests / results.numTotalTests) * 100).toFixed(1)}%

### Failure Categories

- **Convergence:** Solver failed to converge (expected edge cases)
- **Precision:** Within 500 bps but > 50 bps (tolerance boundary)
- **Truth Error:** > 500 bps delta (possible truth case error or real bug)
- **Valid:** All tests passed
`;

fs.writeFileSync('docs/phase1-xirr-baseline-heatmap.md', heatmap);
console.log('Heatmap generated: docs/phase1-xirr-baseline-heatmap.md');
