#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import path from 'node:path';
import process from 'node:process';

import {
  parseChangedFiles,
  requiresVendoredSkillLockCheck,
} from './pre-push-classification.mjs';

let childEnvironment = process.env;

function commandName(command) {
  return command;
}

function needsShell(command) {
  return process.platform === 'win32' && ['npm', 'npx'].includes(command);
}

function run(command, args, options = {}) {
  const result = spawnSync(commandName(command), args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? childEnvironment,
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
    env: options.env ?? childEnvironment,
    input: options.input,
    shell: needsShell(command),
    stdio: ['pipe', 'pipe', options.quietErrors ? 'pipe' : 'inherit'],
    encoding: options.raw ? null : 'utf8',
  });

  if (result.error) {
    if (options.allowFailure) return options.raw ? Buffer.alloc(0) : '';
    throw result.error;
  }

  if (result.status !== 0) {
    if (options.allowFailure) return options.raw ? Buffer.alloc(0) : '';
    process.exit(result.status ?? 1);
  }

  return options.raw ? result.stdout : result.stdout.trim();
}

const repoRoot = output('git', ['rev-parse', '--show-toplevel']);
process.chdir(repoRoot);
process.env.PATH = `${path.join(repoRoot, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`;
childEnvironment = { ...process.env };
delete childEnvironment.GIT_DIR;
delete childEnvironment.GIT_WORK_TREE;
delete childEnvironment.GIT_INDEX_FILE;

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

const changed = output('git', ['diff', '--no-renames', '--name-only', '-z', `${baseBranch}...HEAD`], {
  allowFailure: true,
  raw: true,
});

if (changed.length === 0) {
  console.log('No changes detected, skipping tests');
  process.exit(0);
}

const changedFiles = parseChangedFiles(changed);
const changedSkillFiles = changedFiles.filter((file) => file.startsWith('.claude/skills/'));
if (changedSkillFiles.length > 0) {
  console.log('Skill files changed; verifying skill index freshness...');
  run('npm', ['run', 'skills:check']);
}

if (requiresVendoredSkillLockCheck(changedFiles)) {
  console.log('Vendored skills or lock changed; verifying vendored skill lock...');
  run('npm', ['run', 'skills:lock:check']);
}

const classification = output('node', ['scripts/pre-push-classification.mjs'], {
  input: changed,
});

switch (classification) {
  case 'docs-only-skip':
    console.log('Docs/config-only changes; skipping tests');
    process.exit(0);
    break;
  case 'full-run':
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
const orphanCheckFiles = parseChangedFiles(
  output(
    'git',
    ['diff', '--no-renames', '--name-only', '--diff-filter=ACM', '-z', `${baseBranch}...HEAD`],
    { allowFailure: true, raw: true }
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
// Local optimization only. Vitest related follows statically discoverable
// imports; required CI remains authoritative and fails closed through the
// affected-test planner when direct ownership is not proven.
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
