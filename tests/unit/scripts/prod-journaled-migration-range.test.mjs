import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  TARGET_MIGRATION_TAGS,
  classifyTargetLedgerState,
  createTargetMigrationFolder,
  loadTargetMigrationRange,
} from '../../../scripts/prod-journaled-migration-range.mjs';

const TARGET_WHENS = [1785368400000, 1785454800000, 1785541200000, 1785627600000, 1785714000000];
const BASELINE_WHEN = 1775356800000;
const FORBIDDEN_INTERMEDIATE_WHEN = 1775433600000;
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('production journaled migration recovery range', () => {
  it('copies only the five authorized migration tags', async () => {
    const slice = await createTargetMigrationFolder({ migrationsDir: 'migrations' });
    temporaryDirectories.push(slice.directory);
    const journal = JSON.parse(
      await readFile(path.join(slice.directory, 'meta', '_journal.json'), 'utf8')
    );
    expect(journal.entries.map((entry) => entry.tag)).toEqual(TARGET_MIGRATION_TAGS);
    expect(journal.entries.map((entry) => entry.when)).toEqual(TARGET_WHENS);
  });

  it('accepts only the observed 0007 baseline or a complete target range', async () => {
    const targetEntries = await loadTargetMigrationRange({ migrationsDir: 'migrations' });
    expect(classifyTargetLedgerState({
      ledgerRows: [{ created_at: String(BASELINE_WHEN) }],
      targetEntries,
    })).toBe('ready');
    expect(classifyTargetLedgerState({
      ledgerRows: TARGET_WHENS.map((created_at) => ({ created_at: String(created_at) })),
      targetEntries,
    })).toBe('complete');
  });

  it('rejects a partial target ledger', async () => {
    const targetEntries = await loadTargetMigrationRange({ migrationsDir: 'migrations' });
    expect(() => classifyTargetLedgerState({
      ledgerRows: [{ created_at: String(TARGET_WHENS[0]) }],
      targetEntries,
    })).toThrow(/partial target migration ledger/i);
  });

  it('rejects a forbidden intermediate migration with a complete target range', async () => {
    const targetEntries = await loadTargetMigrationRange({ migrationsDir: 'migrations' });
    expect(() => classifyTargetLedgerState({
      ledgerRows: [FORBIDDEN_INTERMEDIATE_WHEN, ...TARGET_WHENS]
        .map((created_at) => ({ created_at: String(created_at) })),
      targetEntries,
    })).toThrow(/unexpected migration ledger timestamp/i);
  });
});
