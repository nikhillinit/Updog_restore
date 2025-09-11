// scripts/compare-perf.mjs
// Compare a k6 --summary-export JSON file against a simple budget.
// Exits 1 on FAIL so CI can gate merges. Prints a readable summary.
//
// Env vars:
//   PERF_SUMMARY_PATH      (default: perf/summary.json)
//   PERF_BUDGET_PATH       (default: perf/budget.json)
//   PERF_WARN_MULTIPLIER   (default: 1.20) -> warn if p95 > budget * WARN
//   PERF_FAIL_MULTIPLIER   (default: 1.35) -> fail if p95 > budget * FAIL

import fs from 'node:fs';
import path from 'node:path';

const summaryPath = process.env.PERF_SUMMARY_PATH || 'perf/summary.json';
const budgetPath  = process.env.PERF_BUDGET_PATH  || 'perf/budget.json';

function readJson(p) {
  const fp = path.resolve(p);
  if (!fs.existsSync(fp)) {
    throw new Error(`File not found: ${fp}`);
  }
  const raw = fs.readFileSync(fp, 'utf8');
  return JSON.parse(raw);
}

function toNumber(x) {
  if (x == null) return null;
  const n = typeof x === 'number' ? x : Number(String(x).replace(/ms$/i, ''));
  return Number.isFinite(n) ? n : null;
}

// k6 summary_export shape commonly:
// summary.metrics[metric].values["p(95)"]
// but older/newer shapes may store percentiles under 'percentiles'.
// We try both.
function getP95FromMetric(metricObj) {
  if (!metricObj) return null;

  // Try .values["p(95)"]
  const v = metricObj.values || {};
  let p95 = toNumber(v['p(95)']) ?? toNumber(v['p95']);

  // Try .percentiles["p(95)"]
  if (p95 == null) {
    const p = metricObj.percentiles || {};
    p95 = toNumber(p['p(95)']) ?? toNumber(p['p95']);
  }

  return p95;
}

function padRight(str, width) {
  return String(str ?? '').padEnd(width);
}

function fmt(n) {
  if (n == null) return 'n/a';
  return `${n.toFixed(1)}ms`;
}

function writeJobSummary(lines) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    try {
      fs.appendFileSync(summaryFile, lines.join('\n') + '\n');
    } catch (err) {
      console.warn('Failed to write job summary:', err.message);
    }
  }
}

const warnMult = Number(process.env.PERF_WARN_MULTIPLIER ?? '1.20');
const failMult = Number(process.env.PERF_FAIL_MULTIPLIER ?? '1.35');

const summary = readJson(summaryPath);
const budget  = readJson(budgetPath);

const metrics = summary.metrics || {};
const results = [];

let hasFail = false;
let hasWarn = false;

for (const [metricName, cfg] of Object.entries(budget)) {
  const metric = metrics[metricName];
  const p95 = getP95FromMetric(metric);
  const budgetMs = Number(cfg.p95_ms);

  if (!Number.isFinite(budgetMs)) {
    results.push({ metricName, status: 'SKIP', reason: 'invalid budget', p95, budgetMs });
    continue;
  }
  if (p95 == null) {
    results.push({ metricName, status: 'SKIP', reason: 'metric missing in summary', p95, budgetMs });
    continue;
  }

  const warnThreshold = budgetMs * warnMult;
  const failThreshold = budgetMs * failMult;

  let status = 'OK';
  if (p95 > failThreshold) status = 'FAIL';
  else if (p95 > warnThreshold) status = 'WARN';

  if (status === 'FAIL') hasFail = true;
  if (status === 'WARN') hasWarn = true;

  results.push({ metricName, status, p95, budgetMs, warnThreshold, failThreshold });
}

const header = [
  'Perf Budget Check',
  `summary: ${path.resolve(summaryPath)}`,
  `budget:  ${path.resolve(budgetPath)}`,
  `warn x${warnMult}  fail x${failMult}`,
  ''
];

const tableHeader = `${padRight('metric', 22)}  ${padRight('p95', 10)}  ${padRight('budget', 10)}  status`;
const lines = [...header, '```', tableHeader];

for (const r of results) {
  let status = r.status;
  if (r.status === 'SKIP') {
    lines.push(`${padRight(r.metricName, 22)}  ${padRight(fmt(r.p95), 10)}  ${padRight(fmt(r.budgetMs), 10)}  SKIP (${r.reason})`);
    continue;
  }
  lines.push(`${padRight(r.metricName, 22)}  ${padRight(fmt(r.p95), 10)}  ${padRight(fmt(r.budgetMs), 10)}  ${status}`);
}

lines.push('```');

if (hasFail) lines.push('\n❌ Performance **FAIL**: at least one metric exceeded the fail threshold.');
else if (hasWarn) lines.push('\n⚠️ Performance **WARN**: at least one metric exceeded the warn threshold.');
else lines.push('\n✅ Performance **OK**: all metrics within budget.');

console.log(lines.join('\n'));
writeJobSummary(['## Performance Budget', '', ...lines]);

process.exit(hasFail ? 1 : 0);