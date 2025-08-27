import { readFileSync, existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

const path = process.env.VITEST_JSON || 'reports/vitest-results.json';
if (!existsSync(path)) {
  console.error(`[stability] vitest JSON not found at ${path}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(readFileSync(path, 'utf-8'));
} catch (err) {
  console.error(`[stability] Failed to parse JSON: ${err.message}`);
  process.exit(1);
}

// Extract results with defensive checks
const results = data.testResults || [];
const files = results.filter(r => r && r.assertionResults);

// Calculate totals
let total = 0, passed = 0, failed = 0, skipped = 0;
const slow = [];

for (const file of files) {
  for (const test of (file.assertionResults || [])) {
    total++;
    if (test.status === 'passed') {
      passed++;
      if (test.duration && test.duration > 1000) {
        slow.push({ name: test.fullName || test.title, time: test.duration / 1000 });
      }
    } else if (test.status === 'failed') {
      failed++;
    } else if (test.status === 'pending' || test.status === 'skipped') {
      skipped++;
    }
  }
}

// Sort and limit slow tests
slow.sort((a, b) => b.time - a.time);
const topSlow = slow.slice(0, 5);

// Build summary
const durationMs = data.duration || (data.endTime - data.startTime);
const lines = [];
lines.push('## Stability Report');
lines.push('');
lines.push(`**Total:** ${total}  •  **Passed:** ${passed}  •  **Failed:** ${failed}  •  **Skipped:** ${skipped}`);
if (typeof durationMs === 'number') {
  lines.push(`**Duration:** ${(durationMs/1000).toFixed(2)}s`);
}
if (total > 0) {
  const passRate = ((passed / total) * 100).toFixed(1);
  lines.push(`**Pass Rate:** ${passRate}%`);
}
lines.push('');
if (topSlow.length) {
  lines.push('**Slowest tests**');
  topSlow.forEach((t, i) => lines.push(`${i + 1}. \`${t.name}\` — ${t.time.toFixed(3)}s`));
  lines.push('');
}
lines.push('_Source: reports/vitest-results.json_');

// Write to GitHub summary or console
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  writeFileSync(summaryFile, lines.join('\n') + '\n', { flag: 'a' });
  console.log('[stability] Wrote summary to $GITHUB_STEP_SUMMARY');
} else {
  console.log(lines.join('\n'));
}

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);