import path from 'node:path';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import process from 'node:process';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ACTUALS_RESTATEMENT_MIGRATION_IDENTITY,
  ACTUALS_RESTATEMENT_MANIFEST_IDENTITY,
  classifyActualsRestatementLedgerState,
  loadActualsRestatementMigration,
  parseActualsRestatementMigrationArgs,
  runActualsRestatementMigrationCli,
} from '../../../scripts/run-actuals-restatement-journaled-migration.mjs';
import {
  loadCurrentForecastBaselineLedger,
  loadCurrentForecastMigrationRange,
} from '../../../scripts/current-forecast-journaled-migration-range.mjs';

import { loadActualsDraftMigration } from '../../../scripts/run-actuals-draft-journaled-migration.mjs';

const migrationsDir = path.join(process.cwd(), 'migrations');
const row = ({ when, hash }) => ({ created_at: String(when), hash });
let baselineEntries;
let targetEntries;
let restatementEntry;
let draftEntry;

beforeAll(async () => {
  [baselineEntries, targetEntries, restatementEntry, draftEntry] = await Promise.all([
    loadCurrentForecastBaselineLedger({ migrationsDir }),
    loadCurrentForecastMigrationRange({ migrationsDir }),
    loadActualsRestatementMigration({ migrationsDir }),
    loadActualsDraftMigration({ migrationsDir }),
  ]);
});

const classify = (ledgerRows) =>
  classifyActualsRestatementLedgerState({
    ledgerRows,
    baselineEntries,
    targetEntries,
    draftEntry,
    restatementEntry,
  });
const completePredecessor = () => [...baselineEntries, ...targetEntries, draftEntry].map(row);

describe('bounded actuals restatement migration admission', () => {
  it('pins the exact 0057 source identity adjacent to the complete predecessor', () => {
    expect(restatementEntry).toMatchObject(ACTUALS_RESTATEMENT_MIGRATION_IDENTITY);
    expect(restatementEntry.idx).toBe(draftEntry.idx + 1);
  });

  it('pins manifest34 bytes separately from the SQL identity', async () => {
    const bytes = await readFile(ACTUALS_RESTATEMENT_MANIFEST_IDENTITY.path);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      ACTUALS_RESTATEMENT_MANIFEST_IDENTITY.hash
    );
  });

  it.each(['sql', 'journal', 'duplicate', 'predecessor'])(
    'refuses changed %s source before constructing a database client',
    async (kind) => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'actuals-restatement-source-'));
      try {
        await cp(migrationsDir, directory, { recursive: true });
        if (kind === 'sql') {
          await writeFile(path.join(directory, `${restatementEntry.tag}.sql`), 'SELECT 1;');
        } else {
          const file = path.join(directory, 'meta', '_journal.json');
          const journal = JSON.parse(await readFile(file, 'utf8'));
          if (kind === 'duplicate') journal.entries.push({ ...journal.entries[58] });
          else if (kind === 'predecessor') journal.entries[57].when += 1;
          else journal.entries[58].breakpoints = false;
          await writeFile(file, JSON.stringify(journal));
        }
        await expect(
          loadActualsRestatementMigration({ migrationsDir: directory })
        ).rejects.toThrow();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  );

  it.each(['canonical', 'adr074-reconciled'])(
    'admits only complete %s predecessor history',
    (kind) => {
      const baseline =
        kind === 'canonical'
          ? baselineEntries
          : [...baselineEntries.slice(0, 9), ...baselineEntries.slice(46)];
      const ledger = [...baseline, ...targetEntries, draftEntry].map(row);
      expect(classify(ledger)).toMatchObject({
        baselineKind: kind,
        state: 'ready',
        appliedTargetCount: 0,
      });
      expect(classify([...ledger, row(restatementEntry)])).toMatchObject({
        baselineKind: kind,
        state: 'complete',
        appliedTargetCount: 1,
      });
    }
  );

  it.each([
    ['missing predecessor', (rows) => rows.slice(0, -1)],
    ['duplicate predecessor', (rows) => [...rows, rows.at(-1)]],
    [
      'wrong predecessor hash',
      (rows) => [...rows.slice(0, -1), { ...rows.at(-1), hash: 'f'.repeat(64) }],
    ],
    ['wrong 0057 hash', (rows) => [...rows, { ...row(restatementEntry), hash: 'e'.repeat(64) }]],
    ['duplicate 0057', (rows) => [...rows, row(restatementEntry), row(restatementEntry)]],
    [
      'unknown later row',
      (rows) => [
        ...rows,
        row(restatementEntry),
        { hash: 'a'.repeat(64), created_at: String(restatementEntry.when + 1) },
      ],
    ],
    ['embedded 0057', (rows) => [...rows.slice(0, -1), row(restatementEntry), rows.at(-1)]],
    ['invalid timestamp', (rows) => [...rows, { hash: restatementEntry.hash, created_at: 'NaN' }]],
    [
      'fractional timestamp',
      (rows) => [...rows, { hash: restatementEntry.hash, created_at: restatementEntry.when + 0.5 }],
    ],
  ])('refuses %s without hiding ledger rows', (_label, alter) => {
    expect(() => classify(alter(completePredecessor()))).toThrow();
  });

  it('defaults to dry-run and requires explicit apply confirmation', () => {
    expect(parseActualsRestatementMigrationArgs([])).toMatchObject({ apply: false });
    expect(parseActualsRestatementMigrationArgs(['--apply', '--yes'])).toMatchObject({
      apply: true,
    });
    expect(() => parseActualsRestatementMigrationArgs(['--apply'])).toThrow();
    expect(() => parseActualsRestatementMigrationArgs(['--force'])).toThrow();
  });

  it('redacts a rejected credential-bearing connection string from CLI errors', async () => {
    const output = [];
    const result = await runActualsRestatementMigrationCli({
      argv: [],
      env: { DATABASE_URL: 'https://private-user:private-secret@example.invalid/database' },
      stdout: { write: (value) => output.push(value) },
      stderr: { write: (value) => output.push(value) },
    });
    expect(result).toBe(1);
    expect(output.join('')).not.toMatch(/private-user|private-secret|example\.invalid/);
  });
});
