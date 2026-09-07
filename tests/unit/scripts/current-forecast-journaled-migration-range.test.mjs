import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_FORECAST_BASELINE,
  CURRENT_FORECAST_MIGRATION_TAGS,
  classifyCurrentForecastLedgerState,
  createCurrentForecastMigrationFolder,
  loadCurrentForecastBaselineLedger,
  loadCurrentForecastMigrationRange,
} from '../../../scripts/current-forecast-journaled-migration-range.mjs';

const migrationsDir = path.join(process.cwd(), 'migrations');

describe('Current Forecast journaled migration range', { retry: 0 }, () => {
  it('loads exact adjacent 0050-0055 entries with Drizzle hashes', async () => {
    const entries = await loadCurrentForecastMigrationRange({ migrationsDir });
    expect(entries.map(({ tag }) => tag)).toEqual(CURRENT_FORECAST_MIGRATION_TAGS);
    expect(entries.map(({ when }) => when)).toEqual([
      1785800400000, 1785886800000, 1785973200000, 1786059600000, 1788161773455, 1788235843534,
    ]);
    expect(entries.every(({ hash }) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
  });

  it('refuses an altered but increasing target migration timestamp', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'current-forecast-journal-'));
    try {
      await mkdir(path.join(directory, 'meta'));
      const journal = JSON.parse(
        await readFile(path.join(migrationsDir, 'meta', '_journal.json'), 'utf8')
      );
      const target = journal.entries.find(
        ({ tag }) => tag === '0050_g3_portfolio_and_calculation_schema'
      );
      target.when += 1;
      await writeFile(
        path.join(directory, 'meta', '_journal.json'),
        `${JSON.stringify(journal, null, 2)}\n`,
        'utf8'
      );
      await Promise.all(
        CURRENT_FORECAST_MIGRATION_TAGS.map((tag) =>
          copyFile(path.join(migrationsDir, `${tag}.sql`), path.join(directory, `${tag}.sql`))
        )
      );
      await expect(loadCurrentForecastMigrationRange({ migrationsDir: directory })).rejects.toThrow(
        /timestamp identity mismatch/
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('accepts only exact contiguous hash-matching ledger history through 0049 and target prefixes', async () => {
    const baselineEntries = await loadCurrentForecastBaselineLedger({ migrationsDir });
    const entries = await loadCurrentForecastMigrationRange({ migrationsDir });
    const row = ({ when, hash }) => ({ created_at: String(when), hash });
    const baselineRows = baselineEntries.map(row);
    expect(
      classifyCurrentForecastLedgerState({
        ledgerRows: baselineRows,
        baselineEntries,
        targetEntries: entries,
      })
    ).toEqual({
      state: 'ready',
      appliedTargetCount: 0,
      lastAppliedTag: CURRENT_FORECAST_BASELINE.tag,
    });
    expect(
      classifyCurrentForecastLedgerState({
        ledgerRows: [...baselineRows, ...entries.slice(0, 4).map(row)],
        baselineEntries,
        targetEntries: entries,
      })
    ).toEqual({
      state: 'ready',
      appliedTargetCount: 4,
      lastAppliedTag: CURRENT_FORECAST_MIGRATION_TAGS[3],
    });
    expect(
      classifyCurrentForecastLedgerState({
        ledgerRows: [...baselineRows, ...entries.map(row)],
        baselineEntries,
        targetEntries: entries,
      })
    ).toEqual({
      state: 'complete',
      appliedTargetCount: 6,
      lastAppliedTag: CURRENT_FORECAST_MIGRATION_TAGS[5],
    });

    const valid = [...baselineRows, ...entries.map(row)];
    expect(() =>
      classifyCurrentForecastLedgerState({
        ledgerRows: baselineRows.slice(1),
        baselineEntries,
        targetEntries: entries,
      })
    ).toThrow(/missing|gap|reorder/);
    expect(() =>
      classifyCurrentForecastLedgerState({
        ledgerRows: [valid[0], valid[0], ...valid.slice(1)],
        baselineEntries,
        targetEntries: entries,
      })
    ).toThrow(/duplicate/);
    expect(() =>
      classifyCurrentForecastLedgerState({
        ledgerRows: [{ ...valid[0], hash: '0'.repeat(64) }, ...valid.slice(1)],
        baselineEntries,
        targetEntries: entries,
      })
    ).toThrow(/hash mismatch/);
    expect(() =>
      classifyCurrentForecastLedgerState({
        ledgerRows: [...valid, { created_at: '9999999999999', hash: '0'.repeat(64) }],
        baselineEntries,
        targetEntries: entries,
      })
    ).toThrow(/unknown|post-0055/);
  });

  it('creates an isolated six-migration Drizzle folder', async () => {
    const slice = await createCurrentForecastMigrationFolder({ migrationsDir });
    try {
      const journal = JSON.parse(
        await readFile(path.join(slice.directory, 'meta', '_journal.json'), 'utf8')
      );
      expect(journal.entries.map(({ tag }) => tag)).toEqual(CURRENT_FORECAST_MIGRATION_TAGS);
    } finally {
      await slice.cleanup();
    }
  });
});
