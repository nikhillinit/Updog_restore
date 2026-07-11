import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const migrationTag = '0029_h9_actionability_reconcile_drift';
const migrationPath = path.join(repoRoot, 'migrations', `${migrationTag}.sql`);
const journalPath = path.join(repoRoot, 'migrations', 'meta', '_journal.json');

describe('H9 reconcile drift patch migration', () => {
  it('marks 0029 as a drift patch on the first line', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);

    const firstLine = readMigrationSql().split(/\r?\n/, 1)[0];

    expect(firstLine).toBe('-- @drift-patch');
  });

  it('uses replay-safe guards for table and column changes', () => {
    const sql = readMigrationSql();
    const alterTableIfExists = sql.match(/\bALTER\s+TABLE\s+IF\s+EXISTS\b/gi) ?? [];
    const bareAlterTable = sql.match(/\bALTER\s+TABLE\b(?!\s+IF\s+EXISTS\b)/gi) ?? [];
    const addColumnIfNotExists = sql.match(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
    const bareAddColumn = sql.match(/\bADD\s+COLUMN\b(?!\s+IF\s+NOT\s+EXISTS\b)/gi) ?? [];

    expect(alterTableIfExists).toHaveLength(12);
    expect(bareAlterTable).toEqual([]);
    expect(addColumnIfNotExists).toHaveLength(24);
    expect(bareAddColumn).toEqual([]);
  });

  it('guards all constraint additions inside pg_constraint-aware DO blocks', () => {
    const sql = readMigrationSql();
    const doBlocks = sql.match(/DO\s+\$\$[\s\S]*?END\s*\$\$;/gi) ?? [];
    const addConstraintBlocks = doBlocks.filter((block) => /\bADD\s+CONSTRAINT\b/i.test(block));
    const topLevelSql = sql.replace(/DO\s+\$\$[\s\S]*?END\s*\$\$;/gi, '');

    expect(addConstraintBlocks).toHaveLength(8);
    expect(topLevelSql).not.toMatch(/\bADD\s+CONSTRAINT\b/i);

    for (const block of addConstraintBlocks) {
      expect(block).toMatch(/\bNOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_constraint\b/i);
    }
  });

  it('does not include destructive or base-table operations', () => {
    const sql = readMigrationSql();

    expect(sql).not.toMatch(/\bDROP\s+/i);
    expect(sql).not.toMatch(/\bRENAME\s+/i);
    expect(sql).not.toMatch(/\bCREATE\s+TABLE\b/i);
  });

  it('journals 0029 at idx 30', () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
      entries: Array<{
        idx: number;
        version: string;
        when: number;
        tag: string;
        breakpoints: boolean;
      }>;
    };
    const entries = journal.entries.filter((entry) => entry.tag === migrationTag);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      idx: 30,
      version: '7',
      tag: migrationTag,
      breakpoints: true,
    });
    expect(entries[0]?.when).toBeGreaterThan(1783022913852);
  });
});

function readMigrationSql(): string {
  return fs.readFileSync(migrationPath, 'utf8');
}
