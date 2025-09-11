#!/usr/bin/env node
import { execSync } from 'node:child_process';

const DIFF_CMD = 'git diff --cached -U0 --no-color --diff-filter=ACMRTUXB';

try {
  const diff = execSync(DIFF_CMD, { encoding: 'utf8' });

  // Track current file for nicer messages
  let file = '';
  const removedLines = [];
  
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = raw.match(/ b\/(.+)$/);
      if (m) file = m[1];
      continue;
    }
    if (raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('@@')) continue;

    // Only true removed lines from hunks
    if (raw.startsWith('-') && !raw.startsWith('---')) {
      removedLines.push({ file, line: raw.slice(1) });
    }
  }

  // Match `data-testid="..."`, `data-testid='...'`, or within a JSX expression with template literals
  const TESTID_REMOVAL_RE =
    /data-testid\s*=\s*(?:(["'])([^"']+)\1|\{[^}]*(`[^`]*`|"[^"]*"|'[^']*')[^}]*\})/i;

  const hits = removedLines.filter(({ line }) => {
    // Skip comments and Storybook mdx-ish lines quickly
    if (/^\s*\/\//.test(line) || /^\s*\/\*/.test(line) || /^\s*\*/.test(line)) return false;
    if (/^\s*<!--/.test(line)) return false;
    return TESTID_REMOVAL_RE.test(line);
  });

  if (hits.length) {
    console.error('❌ data-testid removal detected in staged changes:\n');
    for (const { file, line } of hits) {
      console.error(`  - ${file}: ${line.trim()}`);
    }
    console.error('\nIf intentional, commit with SKIP_TESTID_GUARD=1.');
    if (!process.env.SKIP_TESTID_GUARD) process.exit(1);
  }

  console.log('✓ Selector guard passed.');
  process.exit(0);
} catch (error) {
  // No staged changes or git not available
  if (error.message?.includes('fatal: not a git repository')) {
    console.log('Not in a git repository, skipping testid check.');
    process.exit(0);
  }
  // If there are no staged changes, that's fine
  console.log('✓ No staged changes to check.');
  process.exit(0);
}