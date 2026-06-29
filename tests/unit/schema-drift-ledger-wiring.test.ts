import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { validateMigrationLedgerAndDualLedger } from '../../scripts/schema-drift-active-surfaces';
import { validateMigrationLedger, type JournalFile } from '../../scripts/migration-ledger';

const repoRoot = process.cwd();
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe('schema drift migration ledger wiring', () => {
  it('is green on the real repo tree', () => {
    expect(validateMigrationLedgerAndDualLedger(repoRoot).ok).toBe(true);
  });

  it('fails when the ledger has an error', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [{ idx: 0, when: 1, tag: '9999_new_unmarked', breakpoints: true }]);
    writeSql(root, 'migrations/9999_new_unmarked.sql', 'CREATE TABLE new_unmarked (id integer);');

    expect(validateMigrationLedger(root).ok).toBe(false);
    expect(validateMigrationLedgerAndDualLedger(root).ok).toBe(false);
  });
});

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-drift-ledger-wiring-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'migrations', 'meta'), { recursive: true });
  fs.mkdirSync(path.join(root, 'server', 'migrations'), { recursive: true });
  return root;
}

function writeJournal(root: string, entries: JournalFile['entries']): void {
  const journal: JournalFile = { version: '7', dialect: 'postgresql', entries };
  writeSql(root, 'migrations/meta/_journal.json', JSON.stringify(journal, null, 2));
}

function writeSql(root: string, relativePath: string, contents: string): void {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${contents}\n`, 'utf8');
}
