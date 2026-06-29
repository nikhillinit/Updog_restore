import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  findLooseMigrationSql,
  validateMigrationLedger,
  type JournalFile,
} from '../../scripts/migration-ledger';

const repoRoot = process.cwd();
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe('migration marker validation', () => {
  it('fails when a new journaled tag is missing a marker', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [{ idx: 0, when: 1, tag: '9999_missing_marker', breakpoints: true }]);
    writeSql(root, '9999_missing_marker.sql', 'CREATE TABLE missing_marker (id integer);');

    const result = validateMigrationLedger(root);

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'journaled-sql-missing-marker',
          message: expect.stringContaining(
            'new/edited journaled SQL needs -- @generated or -- @drift-patch marker'
          ),
        }),
      ])
    );
  });

  it('fails when a generated journaled migration has no meta snapshot file', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [
      { idx: 5, when: 1, tag: '9999_generated_without_snapshot', breakpoints: true },
    ]);
    writeMetaFile(root, '0000_snapshot.json', '{}');
    writeSql(
      root,
      '9999_generated_without_snapshot.sql',
      '-- @generated\nCREATE TABLE generated_without_snapshot (id integer);'
    );

    const result = validateMigrationLedger(root);

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'generated-migration-missing-snapshot',
          file: '9999_generated_without_snapshot.sql',
        }),
      ])
    );
  });

  it('fails when a generated journaled migration has a malformed meta snapshot file', () => {
    const malformedSnapshots = [
      { tag: '9999_generated_empty_snapshot', contents: '' },
      { tag: '9999_generated_garbage_snapshot', contents: 'not json' },
      { tag: '9999_generated_wrong_shape_snapshot', contents: '{}' },
    ] as const;

    for (const snapshot of malformedSnapshots) {
      const root = makeFixtureRoot();
      writeJournal(root, [{ idx: 5, when: 1, tag: snapshot.tag, breakpoints: true }]);
      writeMetaFile(root, '0005_snapshot.json', snapshot.contents);
      writeSql(
        root,
        `${snapshot.tag}.sql`,
        `-- @generated\nCREATE TABLE ${snapshot.tag} (id integer);`
      );

      const result = validateMigrationLedger(root);

      expect(result.ok).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'error',
            code: 'generated-migration-missing-snapshot',
            file: `${snapshot.tag}.sql`,
          }),
        ])
      );
    }
  });

  it('passes when a generated journaled migration has a drizzle-shaped meta snapshot file', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [
      { idx: 5, when: 1, tag: '9999_generated_with_snapshot', breakpoints: true },
    ]);
    writeMetaFile(
      root,
      '0005_snapshot.json',
      JSON.stringify({ version: '7', dialect: 'postgresql', tables: {} })
    );
    writeSql(
      root,
      '9999_generated_with_snapshot.sql',
      '-- @generated\nCREATE TABLE generated_with_snapshot (id integer);'
    );

    const result = validateMigrationLedger(root);

    expect(result.ok).toBe(true);
    expect(
      result.findings.filter((finding) => finding.code === 'generated-migration-missing-snapshot')
    ).toEqual([]);
  });

  it('fails when a drift patch marker has no Reason line', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [{ idx: 0, when: 1, tag: '9999_drift_missing_reason', breakpoints: true }]);
    writeSql(
      root,
      '9999_drift_missing_reason.sql',
      '-- @drift-patch\nALTER TABLE drift_missing_reason ADD COLUMN note text;'
    );

    const result = validateMigrationLedger(root);

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'drift-patch-missing-reason',
          file: '9999_drift_missing_reason.sql',
        }),
      ])
    );
  });

  it('reports legacy loose migration files without deleting or failing them', () => {
    const result = validateMigrationLedger(repoRoot);
    const looseFiles = findLooseMigrationSql(repoRoot).map((file) => file.file);
    const looseFindings = result.findings.filter(
      (finding) => finding.code === 'loose-migration-sql'
    );

    expect(result.ok).toBe(true);
    expect(looseFindings).toHaveLength(looseFiles.length);
    for (const file of looseFiles) {
      expect(looseFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file,
            message: expect.stringContaining('report only, not deleted'),
          }),
        ])
      );
    }
  });
});

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-marker-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'migrations', 'meta'), { recursive: true });
  return root;
}

function writeJournal(root: string, entries: JournalFile['entries']): void {
  const journal: JournalFile = { version: '7', dialect: 'postgresql', entries };
  fs.writeFileSync(
    path.join(root, 'migrations', 'meta', '_journal.json'),
    `${JSON.stringify(journal, null, 2)}\n`
  );
}

function writeSql(root: string, file: string, sql: string): void {
  fs.writeFileSync(path.join(root, 'migrations', file), `${sql}\n`);
}

function writeMetaFile(root: string, file: string, contents: string): void {
  fs.writeFileSync(path.join(root, 'migrations', 'meta', file), `${contents}\n`);
}
