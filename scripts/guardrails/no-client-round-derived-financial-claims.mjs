#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const tracked = execFileSync('git', ['ls-files', 'client/src'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const bannedPatterns = [
  /investmentRounds.*(moic|irr|tvpi|dpi|valuation|reserve)/i,
  /(moic|irr|tvpi|dpi|valuation|reserve).*investmentRounds/i,
  /roundsToModel.*(ranking|financial|metric|moic)/i,
];

const allowlist = new Set([
  'client/src/components/investments/InvestmentRoundsSection.tsx',
  'client/src/hooks/useInvestmentRounds.ts',
]);

const violations = [];

for (const file of tracked) {
  if (allowlist.has(file)) {
    continue;
  }
  const absolute = resolve(root, file);
  const content = readFileSync(absolute, 'utf8');
  for (const pattern of bannedPatterns) {
    if (pattern.test(content)) {
      violations.push(relative(root, absolute));
      break;
    }
  }
}

if (violations.length > 0) {
  console.error('Client round-derived financial claim guardrail failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Client round-derived financial claim guardrail passed.');
