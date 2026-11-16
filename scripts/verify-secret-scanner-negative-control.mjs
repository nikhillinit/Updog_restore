#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const gitleaks =
  process.env.GITLEAKS_BIN || (process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks');
// Verified SHA-256 source fingerprint. It is inert, but Gitleaks 8.30.1 detects
// this exact value in credential-key context; random hexadecimal controls do not.
const SCANNER_SHA256_FINGERPRINT =
  '256b4b881691f8f0cfca38c75b67d6299bbe94a25f472e5f205db3414d73e464';
const PR1700_REVIEW_PATH =
  'audit/surface-contract-matrix/pr1700-review-fixes-20261113-scoped-review.json';
const PR1700_WRONG_PATH =
  'audit/surface-contract-matrix/pr1700-review-fixes-20261113-unrelated.json';
const PR1700_BOUNDARY_FINGERPRINT =
  '47d40ea57e0d5d5dcc72958f6bb827e8d485da19167da368c7356a9627fcf178';
const templatePath = path.join(
  root,
  'tests',
  'fixtures',
  'security',
  'secret-scan-negative-control.txt.template'
);

let temporaryDirectory;

try {
  const template = await readFile(templatePath, 'utf8');
  if (!template.includes('{{HEX_32}}')) {
    throw new Error('Negative-control template is missing the inert placeholder.');
  }

  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'updog-gitleaks-negative-control-'));
  const fixturePath = path.join(temporaryDirectory, 'negative-control.txt');
  const reportPath = path.join(temporaryDirectory, 'negative-control-report.json');
  const generatedFixture = template.replace('{{HEX_32}}', randomBytes(16).toString('hex'));
  await writeFile(fixturePath, generatedFixture, { encoding: 'utf8', flag: 'wx' });

  // A scoped evidence exception must not suppress credentials in that file or elsewhere.
  const genericControlPaths = [
    'audit/surface-contract-matrix/g3-c53634-scoped-review.json',
    'audit/surface-contract-matrix/g3-durable-ci-scoped-review.json',
    'audit/surface-contract-matrix/g3-collector-security-scoped-review.json',
    'audit/surface-contract-matrix/g3-musl-security-scoped-review.json',
    'unrelated-secret.json',
  ];
  for (const relativePath of genericControlPaths) {
    const controlPath = path.join(temporaryDirectory, relativePath);
    await mkdir(path.dirname(controlPath), { recursive: true });
    await writeFile(controlPath, JSON.stringify({ api_key: SCANNER_SHA256_FINGERPRINT }), {
      encoding: 'utf8',
      flag: 'wx',
    });
  }

  const pr1700ReviewPath = path.join(temporaryDirectory, PR1700_REVIEW_PATH);
  await mkdir(path.dirname(pr1700ReviewPath), { recursive: true });
  await writeFile(
    pr1700ReviewPath,
    [
      '{',
      `  "scripts/build-vercel-api.mjs": "${SCANNER_SHA256_FINGERPRINT}",`,
      `  "server/lib/public-api-boundary.ts": "${PR1700_BOUNDARY_FINGERPRINT.slice(0, -1)}9",`,
      `  "api_key": "${SCANNER_SHA256_FINGERPRINT}"`,
      '}',
    ].join('\n'),
    { encoding: 'utf8', flag: 'wx' }
  );

  const pr1700WrongPath = path.join(temporaryDirectory, PR1700_WRONG_PATH);
  await mkdir(path.dirname(pr1700WrongPath), { recursive: true });
  await writeFile(
    pr1700WrongPath,
    `{\n  "scripts/build-vercel-api.mjs": "${SCANNER_SHA256_FINGERPRINT}"\n}\n`,
    { encoding: 'utf8', flag: 'wx' }
  );

  const result = spawnSync(
    gitleaks,
    [
      'dir',
      '--config',
      path.join(root, '.gitleaks.toml'),
      '--no-banner',
      '--redact',
      '--report-format',
      'json',
      '--report-path',
      reportPath,
      '.',
    ],
    {
      cwd: temporaryDirectory,
      encoding: 'utf8',
      windowsHide: true,
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 1) {
    throw new Error(
      `Gitleaks negative control must produce finding exit code 1; received ${String(result.status)}.`
    );
  }

  const findings = JSON.parse(await readFile(reportPath, 'utf8'));
  if (
    !Array.isArray(findings) ||
    !findings.some((finding) => finding.RuleID === 'updog-negative-control-token')
  ) {
    throw new Error('Gitleaks did not report the Updog negative-control rule.');
  }

  for (const relativePath of genericControlPaths) {
    if (
      !findings.some(
        (finding) =>
          finding.RuleID === 'generic-api-key' &&
          finding.File.replaceAll('\\', '/').endsWith(relativePath)
      )
    ) {
      throw new Error(`Gitleaks did not report the generic credential in ${relativePath}.`);
    }
  }

  const normalizedFindings = findings.map((finding) => ({
    ...finding,
    File: finding.File.replaceAll('\\', '/'),
  }));
  const hasGenericFinding = (relativePath, line) =>
    normalizedFindings.some(
      (finding) =>
        finding.RuleID === 'generic-api-key' &&
        finding.File.endsWith(relativePath) &&
        finding.StartLine === line
    );

  if (hasGenericFinding(PR1700_REVIEW_PATH, 2)) {
    throw new Error('Gitleaks reported the exact approved PR 1700 source fingerprint.');
  }
  if (!hasGenericFinding(PR1700_REVIEW_PATH, 3)) {
    throw new Error('Gitleaks did not report the changed PR 1700 source fingerprint.');
  }
  if (!hasGenericFinding(PR1700_REVIEW_PATH, 4)) {
    throw new Error('Gitleaks did not report the unrelated credential key in the PR 1700 review.');
  }
  if (!hasGenericFinding(PR1700_WRONG_PATH, 2)) {
    throw new Error('Gitleaks did not report the approved fingerprint at an unrelated path.');
  }

  console.log('[PASS] Gitleaks detected the custom and all generic negative controls.');
} catch (error) {
  console.error(`[FAIL] Secret-scanner negative control failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory !== undefined) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
