#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const gitleaks =
  process.env.GITLEAKS_BIN || (process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks');
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
    'unrelated-secret.json',
  ];
  for (const relativePath of genericControlPaths) {
    const controlPath = path.join(temporaryDirectory, relativePath);
    await mkdir(path.dirname(controlPath), { recursive: true });
    await writeFile(controlPath, JSON.stringify({ api_key: randomBytes(32).toString('hex') }), {
      encoding: 'utf8',
      flag: 'wx',
    });
  }

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

  console.log('[PASS] Gitleaks detected the custom and both generic negative controls.');
} catch (error) {
  console.error(`[FAIL] Secret-scanner negative control failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory !== undefined) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
