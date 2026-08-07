import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const huskyBin = path.join('node_modules', 'husky', 'bin.js');

// Deployment installs may omit devDependencies. Git hooks are local tooling, so
// skip setup when Husky is absent while still failing if an installed Husky fails.
if (existsSync(huskyBin)) {
  const result = spawnSync(process.execPath, [huskyBin], { stdio: 'inherit' });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const hookDir = path.join('.husky', '_');
const hookNames = [
  'applypatch-msg',
  'commit-msg',
  'post-applypatch',
  'post-checkout',
  'post-commit',
  'post-merge',
  'post-rewrite',
  'pre-applypatch',
  'pre-auto-gc',
  'pre-commit',
  'pre-merge-commit',
  'pre-push',
  'pre-rebase',
  'prepare-commit-msg',
];

for (const hookName of hookNames) {
  const filePath = path.join(hookDir, hookName);
  if (!existsSync(filePath)) continue;

  const current = readFileSync(filePath, 'utf8');
  if (!current.startsWith('#!/usr/bin/env sh')) continue;

  writeFileSync(filePath, current.replace('#!/usr/bin/env sh', '#!/bin/sh'));
}
