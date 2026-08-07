import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const TARGET_MIGRATION_TAGS = Object.freeze([
  '0045_internal_economics_policy_runs',
  '0046_internal_economics_certification',
  '0047_internal_economics_linkage',
  '0048_quarterly_review_workflow',
  '0049_kpi_observations',
]);

export const EXPECTED_BASELINE_CREATED_AT = 1775356800000;

export async function loadTargetMigrationRange({ migrationsDir }) {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));

  if (!Array.isArray(journal.entries)) {
    throw new Error(`Migration journal has no entries array: ${journalPath}`);
  }

  const targetEntries = TARGET_MIGRATION_TAGS.map((tag) => {
    const matches = journal.entries.filter((entry) => entry.tag === tag);
    if (matches.length !== 1) {
      throw new Error(`Target migration tag must appear exactly once: ${tag}`);
    }
    return matches[0];
  });

  const firstTargetIndex = journal.entries.indexOf(targetEntries[0]);
  const adjacentTags = journal.entries
    .slice(firstTargetIndex, firstTargetIndex + TARGET_MIGRATION_TAGS.length)
    .map((entry) => entry.tag);
  if (
    adjacentTags.length !== TARGET_MIGRATION_TAGS.length ||
    adjacentTags.some((tag, index) => tag !== TARGET_MIGRATION_TAGS[index])
  ) {
    throw new Error('Target migration tags must be adjacent and in the authorized order');
  }

  for (let index = 0; index < targetEntries.length; index += 1) {
    const entry = targetEntries[index];
    if (!Number.isFinite(entry.when)) {
      throw new Error(`Target migration timestamp must be numeric: ${entry.tag}`);
    }
    if (index > 0 && entry.when <= targetEntries[index - 1].when) {
      throw new Error('Target migration timestamps must be strictly increasing');
    }
    await access(path.join(migrationsDir, `${entry.tag}.sql`));
  }

  return targetEntries;
}

export function classifyTargetLedgerState({ ledgerRows, targetEntries }) {
  const targetTimestamps = targetEntries.map((entry) => entry.when);
  const targetTimestampSet = new Set(targetTimestamps);
  const ledgerTimestamps = ledgerRows.map(({ created_at: createdAt }) => Number(createdAt));

  if (ledgerTimestamps.some((timestamp) => !Number.isFinite(timestamp))) {
    throw new Error('Migration ledger contains an invalid timestamp');
  }

  const finalTargetTimestamp = targetTimestamps[targetTimestamps.length - 1];
  if (ledgerTimestamps.some((timestamp) => timestamp > finalTargetTimestamp)) {
    throw new Error('Migration ledger contains a timestamp newer than 0049');
  }

  const targetCounts = new Map(targetTimestamps.map((timestamp) => [timestamp, 0]));
  for (const timestamp of ledgerTimestamps) {
    if (targetTimestampSet.has(timestamp)) {
      targetCounts.set(timestamp, targetCounts.get(timestamp) + 1);
    }
  }

  if ([...targetCounts.values()].some((count) => count > 1)) {
    throw new Error('Migration ledger contains duplicate target timestamps');
  }

  const presentTargetCount = [...targetCounts.values()].filter((count) => count === 1).length;
  if (presentTargetCount === targetTimestamps.length) {
    return 'complete';
  }
  if (presentTargetCount > 0) {
    throw new Error('Partial target migration ledger is not recoverable');
  }

  const maximumLedgerTimestamp = Math.max(...ledgerTimestamps);
  if (maximumLedgerTimestamp !== EXPECTED_BASELINE_CREATED_AT) {
    throw new Error('Migration ledger does not match the expected 0007 baseline');
  }

  return 'ready';
}

export async function createTargetMigrationFolder({ migrationsDir }) {
  const targetEntries = await loadTargetMigrationRange({ migrationsDir });
  const directory = await mkdtemp(path.join(os.tmpdir(), 'updog-prod-migrations-0045-0049-'));
  const cleanup = async () => {
    await rm(directory, { recursive: true, force: true });
  };

  try {
    const sourceJournal = JSON.parse(
      await readFile(path.join(migrationsDir, 'meta', '_journal.json'), 'utf8')
    );
    await mkdir(path.join(directory, 'meta'));
    await writeFile(
      path.join(directory, 'meta', '_journal.json'),
      `${JSON.stringify({
        version: sourceJournal.version,
        dialect: sourceJournal.dialect,
        entries: targetEntries,
      }, null, 2)}\n`,
      'utf8'
    );
    await Promise.all(TARGET_MIGRATION_TAGS.map((tag) =>
      copyFile(path.join(migrationsDir, `${tag}.sql`), path.join(directory, `${tag}.sql`))
    ));
  } catch (error) {
    await cleanup();
    throw error;
  }

  return { directory, cleanup };
}
