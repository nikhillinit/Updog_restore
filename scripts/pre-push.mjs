#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function commandName(command) {
  return command;
}

function needsShell(command) {
  return process.platform === 'win32' && ['npm', 'npx'].includes(command);
}

function run(command, args, options = {}) {
  const result = spawnSync(commandName(command), args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    input: options.input,
    shell: needsShell(command),
    stdio: options.input === undefined ? 'inherit' : ['pipe', 'pipe', 'inherit'],
    encoding: 'utf8',
  });

  if (result.error) {
    if (options.allowFailure) return result;
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function output(command, args, options = {}) {
  const result = spawnSync(commandName(command), args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    input: options.input,
    shell: needsShell(command),
    stdio: ['pipe', 'pipe', options.quietErrors ? 'pipe' : 'inherit'],
    encoding: 'utf8',
  });

  if (result.error) {
    if (options.allowFailure) return '';
    throw result.error;
  }

  if (result.status !== 0) {
    if (options.allowFailure) return '';
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function splitLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const repoRoot = output('git', ['rev-parse', '--show-toplevel']);
process.chdir(repoRoot);
process.env.PATH = `${path.join(repoRoot, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`;

const baseBranch = 'origin/main';

console.log('Checking changed files against origin/main...');

if (!process.env.CLAUDE_HOOKS_DISABLE) {
  console.log('Scanning for large files...');
  const largeFileResult = run(
    'node',
    ['scripts/control-plane/git-safety.mjs', 'pre-push', baseBranch, 'HEAD'],
    { allowFailure: true }
  );

  if (largeFileResult.status !== 0) {
    console.error('');
    console.error('Large file check failed. See above for details.');
    console.error('Add files to .claude/large-file-allowlist.json if intentional.');
    process.exit(largeFileResult.status ?? 1);
  }
}

const changed = output('git', ['diff', '--name-only', `${baseBranch}...HEAD`], {
  allowFailure: true,
});

if (!changed) {
  console.log('No changes detected, skipping tests');
  process.exit(0);
}

const classification = output('node', ['scripts/pre-push-classification.mjs'], {
  input: `${changed}\n`,
});

switch (classification) {
  case 'docs-only-skip':
    console.log('Docs/config-only changes; skipping tests');
    process.exit(0);
    break;
  case 'full-run':
  case 'type-fix-only-skip':
  case 'targeted':
    break;
  default:
    console.error(`Unknown pre-push classification: ${classification}`);
    process.exit(1);
}

console.log('Checking documentation freshness...');
const docFreshness = run('node', ['scripts/check-doc-freshness.mjs'], { allowFailure: true });
if (docFreshness.status !== 0) {
  console.warn('');
  console.warn('STALE documentation detected (warning only)');
  console.warn('Consider updating documents flagged above');
  console.warn('');
}

console.log('Checking TypeScript baseline...');
run('npm', ['run', 'baseline:check']);

console.log('Checking for orphan tests in __tests__ directories...');
const orphanCheckFiles = splitLines(
  output(
    'git',
    ['diff', '--no-renames', '--name-only', '--diff-filter=ACM', `${baseBranch}...HEAD`],
    { allowFailure: true }
  )
);

if (orphanCheckFiles.length > 0) {
  run('node', ['scripts/check-orphan-tests.mjs', ...orphanCheckFiles]);
}

if (classification === 'full-run') {
  console.log('Core configuration changed, running full validation...');
  console.log('Building...');
  run('npm', ['run', 'build']);

  console.log('Running full test suite...');
  run('npm', ['test']);
  process.exit(0);
}

console.log('Running targeted tests for changed files...');
if (classification === 'type-fix-only-skip') {
  console.log('Type-fix only changes detected (ErrorBoundary/LoadingState/CHANGELOG)');
  console.log('TypeScript baseline check already passed');
  console.log('Skipping test suite (no behavioral changes)');
  process.exit(0);
}

const changedFiles = splitLines(changed);
run('npx', [
  'vitest',
  'related',
  ...changedFiles,
  '--run',
  '--config',
  path.join(repoRoot, 'vitest.config.mjs'),
  '--configLoader',
  'native',
  '--project=server',
  '--project=client',
]);
