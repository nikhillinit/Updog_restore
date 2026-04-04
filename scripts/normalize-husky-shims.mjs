import fs from 'node:fs';
import path from 'node:path';

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
  if (!fs.existsSync(filePath)) continue;

  const current = fs.readFileSync(filePath, 'utf8');
  if (!current.startsWith('#!/usr/bin/env sh')) continue;

  fs.writeFileSync(filePath, current.replace('#!/usr/bin/env sh', '#!/bin/sh'));
}
