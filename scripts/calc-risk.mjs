#!/usr/bin/env node
/**
 * Calculate risk-weighted error metrics with pattern-based deduplication
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Risk weights by error code and context
const RISK_WEIGHTS = {
  TS2532: { math: 10, critical: 8, normal: 3 },
  TS18048: { math: 10, critical: 8, normal: 3 },
  TS2345: { math: 7, critical: 6, normal: 2 },
  TS2322: { math: 7, critical: 6, normal: 2 },
  TS2375: { math: 3, critical: 2, normal: 1 },
  TS2379: { math: 3, critical: 2, normal: 1 },
  TS4111: { math: 2, critical: 2, normal: 1 },
  TS2339: { math: 5, critical: 4, normal: 2 },
  TS2353: { math: 5, critical: 4, normal: 2 },
  TS7006: { math: 4, critical: 3, normal: 1 },
  TS2769: { math: 4, critical: 3, normal: 2 },
  default: { math: 2, critical: 2, normal: 1 }
};

// Business-critical file patterns
const CRITICAL_PATTERNS = [
  /investor-payout/i,
  /fund-calculation/i,
  /regulatory-report/i,
  /waterfall/i,
  /capital-account/i
];

// Math file patterns
const MATH_PATTERNS = [
  /xirr/i,
  /monte-carlo/i,
  /performance-prediction/i,
  /power-law/i,
  /capital-calculation/i,
  /analytical-engine/i,
  /statistical/i
];

function parseTypeScriptErrors(output) {
  const lines = output.split('\n');
  const errors = [];

  for (const line of lines) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
    if (match) {
      errors.push({
        file: match[1].replace(/\\/g, '/'),
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        code: match[4],
        message: match[5]
      });
    }
  }

  return errors;
}

function createPatternSignature(error) {
  // Normalize message by removing numbers and specific identifiers
  const normalized = error.message
    .replace(/\d+/g, 'N')
    .replace(/'[^']+'/g, "'X'")
    .replace(/"[^"]+"/g, '"X"');

  return `${error.code}:${normalized}`;
}

function deduplicateErrors(errors) {
  const patterns = new Map();

  for (const err of errors) {
    const signature = createPatternSignature(err);

    if (!patterns.has(signature)) {
      patterns.set(signature, []);
    }
    patterns.get(signature).push(err);
  }

  const deduped = [];

  for (const [sig, instances] of patterns.entries()) {
    // Sort by criticality (will be calculated later)
    // For now, just mark first as primary
    deduped.push({
      ...instances[0],
      duplicateCount: instances.length,
      duplicateFiles: instances.slice(1).map(e => e.file)
    });
  }

  return deduped;
}

function categorizeFile(file) {
  const isMath = MATH_PATTERNS.some(p => p.test(file));
  const isCritical = CRITICAL_PATTERNS.some(p => p.test(file));

  return {
    isMath,
    isCritical,
    category: isMath ? 'math' : isCritical ? 'critical' : 'normal'
  };
}

export function calculateRiskMetrics(tscOutput) {
  const errors = parseTypeScriptErrors(tscOutput);
  const deduped = deduplicateErrors(errors);

  let totalRisk = 0;
  const breakdown = {
    byCode: {},
    byCategory: { math: 0, critical: 0, normal: 0 },
    byFile: {}
  };

  for (const err of deduped) {
    const { category } = categorizeFile(err.file);
    const weights = RISK_WEIGHTS[err.code] || RISK_WEIGHTS.default;
    const weight = weights[category];

    // Calculate risk (weight × duplicate count)
    const risk = weight * (err.duplicateCount || 1);
    totalRisk += risk;

    // Track breakdowns
    breakdown.byCode[err.code] = (breakdown.byCode[err.code] || 0) + risk;
    breakdown.byCategory[category] += risk;
    breakdown.byFile[err.file] = (breakdown.byFile[err.file] || 0) + risk;
  }

  // Sort files by risk
  const topFiles = Object.entries(breakdown.byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, risk]) => ({ file, risk }));

  return {
    timestamp: new Date().toISOString(),
    totalErrors: errors.length,
    uniquePatterns: deduped.length,
    totalRisk,
    avgRiskPerError: totalRisk / errors.length,
    breakdown,
    topFiles,
    summary: {
      mathErrors: errors.filter(e => categorizeFile(e.file).isMath).length,
      criticalErrors: errors.filter(e => categorizeFile(e.file).isCritical).length,
      normalErrors: errors.filter(e => !categorizeFile(e.file).isMath && !categorizeFile(e.file).isCritical).length
    }
  };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const inputFile = process.argv[2];

  let tscOutput;
  if (inputFile && existsSync(inputFile)) {
    tscOutput = readFileSync(inputFile, 'utf8');
  } else {
    // Run tsc directly
    try {
      execSync('npx tsc --noEmit -p tsconfig.server.json', { encoding: 'utf8' });
      tscOutput = ''; // No errors
    } catch (err) {
      tscOutput = err.stdout || err.stderr || '';
    }
  }

  const metrics = calculateRiskMetrics(tscOutput);
  console.log(JSON.stringify(metrics, null, 2));
}
