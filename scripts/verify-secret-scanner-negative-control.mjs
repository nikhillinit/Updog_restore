#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
      temporaryDirectory,
    ],
    {
      cwd: root,
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

  console.log('[PASS] Gitleaks detected the generated negative control.');
} catch (error) {
  console.error(`[FAIL] Secret-scanner negative control failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory !== undefined) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
