import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const path = process.env.JUNIT_PATH || 'reports/junit-main.xml';
if (!existsSync(path)) {
  console.error(`[stability] junit file not found at ${path}`);
  process.exit(0);
}

const xml = readFileSync(path, 'utf8');

// Parse test results
const cases = [...xml.matchAll(/<testcase\b[^>]*name="([^"]+)"[^>]*time="([\d.]+)"/g)]
  .map((m) => ({ name: m[1], time: Number(m[2]) || 0 }));

const failures = [...xml.matchAll(/<failure\b/g)].length;
const skipped = [...xml.matchAll(/<skipped\b/g)].length;
const total = cases.length + skipped;
const passed = total - failures - skipped;
const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';

// Find slowest tests
const slow = [...cases].sort((a, b) => b.time - a.time).slice(0, 5);

// Generate report
const lines = [];
lines.push('## 📊 Test Stability Report');
lines.push('');
lines.push(`### Summary`);
lines.push(`- **Total Tests:** ${total}`);
lines.push(`- **Passed:** ${passed} (${passRate}%)`);
lines.push(`- **Failed:** ${failures}`);
lines.push(`- **Skipped:** ${skipped}`);
lines.push('');

if (failures > 0) {
  lines.push('### ⚠️ Status: Tests Failing');
  lines.push('Some tests are failing. Please review the test output above.');
} else if (passRate === '100.0') {
  lines.push('### ✅ Status: All Tests Passing!');
  lines.push('Perfect score! All tests are green.');
} else {
  lines.push('### ✅ Status: Tests Passing');
  lines.push(`Tests are passing with ${skipped} skipped.`);
}

if (slow.length) {
  lines.push('');
  lines.push('### ⏱️ Slowest Tests');
  slow.forEach((t, i) => {
    lines.push(`${i + 1}. \`${t.name}\` - ${t.time.toFixed(2)}s`);
  });
}

lines.push('');
lines.push('---');
lines.push(`_Generated from ${path}_`);

// Output to GitHub step summary if available
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  writeFileSync(summaryFile, lines.join('\n') + '\n', { flag: 'a' });
  console.log('[stability] Wrote summary to $GITHUB_STEP_SUMMARY');
} else {
  console.log(lines.join('\n'));
}

// Exit with appropriate code
process.exit(failures > 0 ? 1 : 0);