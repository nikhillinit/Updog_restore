import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  detectDualLedgerDivergence,
  formatDualLedgerReport,
  type DualLedgerDivergenceResult,
} from '../../scripts/dual-ledger-divergence';
import type { JournalFile } from '../../scripts/migration-ledger';

const repoRoot = process.cwd();
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe('dual ledger divergence detector', () => {
  it('reports the real server forward migration census without detector errors', () => {
    const result = detectDualLedgerDivergence(repoRoot);
    const expectedForwardFiles = countRealServerForwardFiles();

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(expectedForwardFiles).toBeGreaterThan(0);
    expect(expectedForwardFiles).toBe(32);
    expect(result.summary.serverForwardFiles).toBe(expectedForwardFiles);
  });

  it('surfaces a malformed server migration as a detector error', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [{ idx: 0, when: 1, tag: '0000_base', breakpoints: true }]);
    writeSql(root, 'migrations/0000_base.sql', 'CREATE TABLE "journaled_table" (id integer);');
    writeSql(root, 'server/migrations/9999_bad.up.sql', 'CREATE TABLE "broken (id integer);');

    const result = detectDualLedgerDivergence(root);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'sql-parse-error',
          file: 'server/migrations/9999_bad.up.sql',
        }),
      ])
    );
  });

  it('formats a non-empty markdown report containing summary counts', () => {
    const result: DualLedgerDivergenceResult = {
      ok: true,
      divergences: [
        {
          severity: 'info',
          code: 'server-unique-content',
          file: 'server/migrations/example.up.sql',
          message:
            'Server forward migration creates objects absent from the journal/shared ledger: table:example',
        },
      ],
      errors: [],
      summary: {
        serverForwardFiles: 1,
        uniqueObjectFiles: 1,
        duplicateFiles: 0,
        activeConsumerFiles: 0,
      },
    };

    const report = formatDualLedgerReport(result);

    expect(report.length).toBeGreaterThan(0);
    expect(report).toContain('serverForwardFiles=1');
    expect(report).toContain('uniqueObjectFiles=1');
    expect(report).toContain('duplicateFiles=0');
    expect(report).toContain('activeConsumerFiles=0');
  });
});

function countRealServerForwardFiles(): number {
  return fs
    .readdirSync(path.join(repoRoot, 'server', 'migrations'), { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.sql') && !entry.name.endsWith('.down.sql')
    ).length;
}

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dual-ledger-divergence-'));
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
