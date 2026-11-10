import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const verifier = path.join(root, 'scripts/verify-secret-scanner-negative-control.mjs');
const temporaryRoots = [];
const genericControl = '256b4b881691f8f0cfca38c75b67d6299' + 'bbe94a25f472e5f205db3414d73e464';
const genericControlPaths = [
  'audit/surface-contract-matrix/g3-c53634-scoped-review.json',
  'audit/surface-contract-matrix/g3-durable-ci-scoped-review.json',
  'audit/surface-contract-matrix/g3-collector-security-scoped-review.json',
  'audit/surface-contract-matrix/g3-musl-security-scoped-review.json',
  'unrelated-secret.json',
];

function temporary() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitleaks-negative-control-test-'));
  temporaryRoots.push(directory);
  return directory;
}

function createScanner() {
  const scanner = path.join(temporary(), 'gitleaks');
  const source = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const report = args[args.indexOf('--report-path') + 1];
const expected = process.env.EXPECTED_GENERIC_CONTROL;
const paths = JSON.parse(process.env.EXPECTED_GENERIC_PATHS);
const omitted = process.env.FAKE_GITLEAKS_OMIT;
const findings = [];
const custom = fs.readFileSync('negative-control.txt', 'utf8');
if (omitted !== 'custom' && /UPDOG_NEGATIVE_CONTROL_TOKEN=updog_test_secret_[0-9a-f]{32}/.test(custom)) {
  findings.push({ RuleID: 'updog-negative-control-token', File: 'negative-control.txt' });
}
for (const file of paths) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8')).api_key;
  if (omitted !== file && value === expected) {
    findings.push({ RuleID: 'generic-api-key', File: file });
  }
}
fs.writeFileSync(report, JSON.stringify(findings));
process.exit(findings.length === 0 ? 0 : 1);
`;
  fs.writeFileSync(scanner, source, { mode: 0o755 });
  return scanner;
}

function runVerifier(gitleaks, extraEnv = {}) {
  return spawnSync(process.execPath, [verifier], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPECTED_GENERIC_CONTROL: genericControl,
      EXPECTED_GENERIC_PATHS: JSON.stringify(genericControlPaths),
      GITLEAKS_BIN: gitleaks,
      TZ: 'UTC',
      ...extraEnv,
    },
  });
}

afterEach(() => {
  temporaryRoots
    .splice(0)
    .forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe('secret scanner negative control', () => {
  it('writes scanner-detectable deterministic controls at every protected path', () => {
    const result = runVerifier(createScanner());

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('all generic negative controls');
  });

  it.each([
    [
      'custom negative-control rule',
      'custom',
      'Gitleaks did not report the Updog negative-control rule.',
    ],
    ...genericControlPaths.map((relativePath) => [
      relativePath,
      relativePath,
      `Gitleaks did not report the generic credential in ${relativePath}.`,
    ]),
  ])('fails closed when scanner omits %s', (_label, omitted, expectedError) => {
    const result = runVerifier(createScanner(), { FAKE_GITLEAKS_OMIT: omitted });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedError);
  });
});
