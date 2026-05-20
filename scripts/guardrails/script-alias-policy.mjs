#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const BASELINE_PATH = path.join('.baselines', 'script-alias-policy.json');
const PACKAGE_JSON_PATH = 'package.json';
const LEGACY_ALIAS_PATTERN = /^(?:test|lint|validate|guard):(?:wave|phase|slice)[A-Za-z0-9:_-]*$/;

function normalizeScriptNames(scripts) {
  return Object.keys(scripts || {}).sort((a, b) => a.localeCompare(b));
}

export function findLegacyScriptAliases(scripts) {
  return normalizeScriptNames(scripts).filter((name) => LEGACY_ALIAS_PATTERN.test(name));
}

export function analyzeScriptAliasPolicy({ scripts, allowedLegacyAliases }) {
  const allowed = new Set(allowedLegacyAliases || []);
  const currentLegacyAliases = findLegacyScriptAliases(scripts);
  const unexpectedLegacyAliases = currentLegacyAliases.filter((name) => !allowed.has(name));
  const retiredLegacyAliases = [...allowed]
    .filter((name) => !currentLegacyAliases.includes(name))
    .sort((a, b) => a.localeCompare(b));

  return {
    currentLegacyAliases,
    unexpectedLegacyAliases,
    retiredLegacyAliases,
  };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readPackageScripts(packageJsonPath = PACKAGE_JSON_PATH) {
  const packageJson = readJsonFile(packageJsonPath);
  return packageJson.scripts || {};
}

function readBaseline(baselinePath = BASELINE_PATH) {
  if (!fs.existsSync(baselinePath)) {
    return null;
  }

  return readJsonFile(baselinePath);
}

function writeBaseline({ scripts, baselinePath = BASELINE_PATH }) {
  const baseline = {
    allowedLegacyAliases: findLegacyScriptAliases(scripts),
    generatedAt: new Date().toISOString(),
    policy:
      'No new test/lint/validate/guard wave, phase, or slice npm aliases. Prefer capability or domain names.',
  };

  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

  return baseline;
}

function printPolicyResult(result) {
  console.log(
    `[script-alias-policy] legacy aliases in package.json: ${result.currentLegacyAliases.length}`
  );

  if (result.currentLegacyAliases.length > 0) {
    for (const name of result.currentLegacyAliases) {
      console.log(`  - ${name}`);
    }
  }

  if (result.retiredLegacyAliases.length > 0) {
    console.log(
      `[script-alias-policy] retired aliases still present in baseline: ${result.retiredLegacyAliases.length}`
    );
    for (const name of result.retiredLegacyAliases) {
      console.log(`  - ${name}`);
    }
  }
}

function failUnexpectedAliases(unexpectedLegacyAliases) {
  console.error('[script-alias-policy] failed: unexpected legacy npm script aliases found');
  for (const name of unexpectedLegacyAliases) {
    console.error(`  - ${name}`);
  }
  console.error(
    '[script-alias-policy] use capability/domain names instead of new wave, phase, or slice aliases'
  );
}

export function runScriptAliasPolicyCli({
  argv = process.argv.slice(2),
  packageJsonPath = PACKAGE_JSON_PATH,
  baselinePath = BASELINE_PATH,
} = {}) {
  const scripts = readPackageScripts(packageJsonPath);

  if (argv.includes('--write-baseline')) {
    const baseline = writeBaseline({ scripts, baselinePath });
    console.log(
      `[script-alias-policy] baseline written to ${baselinePath} (${baseline.allowedLegacyAliases.length} aliases)`
    );
    return 0;
  }

  const baseline = readBaseline(baselinePath);
  if (!baseline) {
    console.error(`[script-alias-policy] baseline missing: ${baselinePath}`);
    console.error('[script-alias-policy] run with --write-baseline to initialize');
    return 1;
  }

  const result = analyzeScriptAliasPolicy({
    scripts,
    allowedLegacyAliases: baseline.allowedLegacyAliases,
  });
  printPolicyResult(result);

  if (result.unexpectedLegacyAliases.length > 0) {
    failUnexpectedAliases(result.unexpectedLegacyAliases);
    return 1;
  }

  console.log('[script-alias-policy] pass: no unexpected legacy npm script aliases');
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';

if (import.meta.url === invokedPath) {
  process.exitCode = runScriptAliasPolicyCli();
}
