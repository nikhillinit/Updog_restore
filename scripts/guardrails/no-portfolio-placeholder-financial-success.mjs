#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';

const ROUTE_PATH = path.join('server', 'routes', 'portfolio-intelligence.ts');
const BANNED_LITERALS = [
  'mean: { irr: 0.2, multiple: 2.5, dpi: 1.8 }',
  'median: { irr: 0.18, multiple: 2.3, dpi: 1.6 }',
  'percentiles: { p10: 0.12, p25: 0.15, p75: 0.25, p90: 0.3 }',
  'expectedIrr: 0.22',
  'expectedMultiple: 2.8',
  'riskAdjustedReturn: 0.18',
  'totalReturn: 0.22',
  'annualizedReturn: 0.18',
  'sharpeRatio: 1.5',
  'forecastPeriods: [',
  'confidenceIntervals: {',
  'mape: 0.12',
  'rmse: 0.08',
  'currentIrr: 0.18',
  'currentMultiple: 2.1',
  "dataFreshness: 'real-time'",
  'quickProjections: {',
  'timeToExit: 5',
  "message: 'Quick scenario generated successfully'",
];

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\r|\n/).length;
}

function findBannedLiterals(source) {
  return BANNED_LITERALS.flatMap((literal) => {
    const findings = [];
    let startIndex = 0;

    while (startIndex < source.length) {
      const index = source.indexOf(literal, startIndex);
      if (index === -1) break;

      findings.push({
        literal,
        line: lineNumberAt(source, index),
      });
      startIndex = index + literal.length;
    }

    return findings;
  });
}

function run() {
  const routeFilePath = path.join(process.cwd(), ROUTE_PATH);

  if (!fs.existsSync(routeFilePath)) {
    console.error(`[financial-placeholders] failed: missing route file ${ROUTE_PATH}`);
    return 1;
  }

  const source = fs.readFileSync(routeFilePath, 'utf8');
  const findings = findBannedLiterals(source);

  if (findings.length > 0) {
    console.error(
      `[financial-placeholders] failed: banned placeholder financial success literals found in ${ROUTE_PATH}`
    );
    for (const finding of findings) {
      console.error(`  - ${ROUTE_PATH}:${finding.line} contains ${finding.literal}`);
    }
    console.error(
      '[financial-placeholders] remove hardcoded financial success placeholders from the portfolio intelligence route'
    );
    return 1;
  }

  console.log('[financial-placeholders] pass: no placeholder financial success literals found');
  return 0;
}

process.exitCode = run();
