import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ACTUALS_DRAFT_MIGRATION_IDENTITY,
  classifyActualsDraftLedgerState,
  loadActualsDraftMigration,
  parseActualsDraftMigrationArgs,
  runActualsDraftJournaledMigration,
  runActualsDraftMigrationCli,
} from '../../../scripts/run-actuals-draft-journaled-migration.mjs';
import {
  loadCurrentForecastBaselineLedger,
  loadCurrentForecastMigrationRange,
} from '../../../scripts/current-forecast-journaled-migration-range.mjs';

const reconciliation = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  timeouts: vi.fn(),
  identity: vi.fn(),
  fingerprint: vi.fn(),
}));
vi.mock('../../../scripts/reconcile-prod-schema.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  acquireAdvisoryLock: reconciliation.acquire,
  releaseAdvisoryLock: reconciliation.release,
  setApplyTimeouts: reconciliation.timeouts,
  readDatabaseIdentity: reconciliation.identity,
  computeTargetFingerprint: reconciliation.fingerprint,
}));

const migrationsDir = path.join(process.cwd(), 'migrations');
const row = ({ when, hash }) => ({ created_at: String(when), hash });
let baselineEntries;
let targetEntries;
let draftEntry;

beforeAll(async () => {
  [baselineEntries, targetEntries, draftEntry] = await Promise.all([
    loadCurrentForecastBaselineLedger({ migrationsDir }),
    loadCurrentForecastMigrationRange({ migrationsDir }),
    loadActualsDraftMigration({ migrationsDir }),
  ]);
});

const classify = (ledgerRows) =>
  classifyActualsDraftLedgerState({ ledgerRows, baselineEntries, targetEntries, draftEntry });
const completePredecessor = () => [...baselineEntries, ...targetEntries].map(row);

describe('bounded actuals draft migration admission', () => {
  it('pins the exact 0056 source identity adjacent to the complete predecessor', () => {
    expect(draftEntry).toMatchObject(ACTUALS_DRAFT_MIGRATION_IDENTITY);
    expect(draftEntry.idx).toBe(targetEntries.at(-1).idx + 1);
  });

  it.each(['canonical', 'adr074-reconciled'])(
    'admits only complete %s predecessor history',
    (kind) => {
      const baseline =
        kind === 'canonical'
          ? baselineEntries
          : [...baselineEntries.slice(0, 9), ...baselineEntries.slice(46)];
      const ledger = [...baseline, ...targetEntries].map(row);
      expect(classify(ledger)).toMatchObject({
        baselineKind: kind,
        state: 'ready',
        appliedTargetCount: 0,
      });
      expect(classify([...ledger, row(draftEntry)])).toMatchObject({
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
    ['wrong 0056 hash', (rows) => [...rows, { ...row(draftEntry), hash: 'e'.repeat(64) }]],
    ['duplicate 0056', (rows) => [...rows, row(draftEntry), row(draftEntry)]],
    [
      'unknown later row',
      (rows) => [
        ...rows,
        row(draftEntry),
        { hash: 'a'.repeat(64), created_at: String(draftEntry.when + 1) },
      ],
    ],
    ['embedded 0056', (rows) => [...rows.slice(0, -1), row(draftEntry), rows.at(-1)]],
    ['invalid timestamp', (rows) => [...rows, { hash: draftEntry.hash, created_at: 'NaN' }]],
    [
      'fractional timestamp',
      (rows) => [...rows, { hash: draftEntry.hash, created_at: draftEntry.when + 0.5 }],
    ],
  ])('refuses %s without hiding ledger rows', (_label, alter) => {
    expect(() => classify(alter(completePredecessor()))).toThrow();
  });

  it('defaults to dry-run and requires explicit apply confirmation', () => {
    expect(parseActualsDraftMigrationArgs([])).toMatchObject({ apply: false });
    expect(parseActualsDraftMigrationArgs(['--apply', '--yes'])).toMatchObject({ apply: true });
    expect(() => parseActualsDraftMigrationArgs(['--apply'])).toThrow();
    expect(() => parseActualsDraftMigrationArgs(['--force'])).toThrow();
  });

  it('redacts a rejected credential-bearing connection string from CLI errors', async () => {
    const output = [];
    const result = await runActualsDraftMigrationCli({
      argv: [],
      env: { DATABASE_URL: 'https://private-user:private-secret@example.invalid/database' },
      stdout: { write: (value) => output.push(value) },
      stderr: { write: (value) => output.push(value) },
    });
    expect(result).toBe(1);
    expect(output.join('')).not.toMatch(/private-user|private-secret|example\.invalid/);
  });
});

describe('0056 target endpoint', () => {
  it('fingerprints the client endpoint, not a URL authority overridden by ?host=', async () => {
    reconciliation.identity.mockResolvedValue({ database: 'db', user: 'operator' });
    reconciliation.release.mockResolvedValue(undefined);
    const connectionString =
      'postgres://operator:password@prod.example.invalid/db?host=staging.example.invalid&port=6543';
    const stop = new Error('ledger read');
    // A real Client parses the connection string; only the I/O is stubbed.
    const client = Object.assign(new pg.Client({ connectionString }), {
      connect: vi.fn(),
      end: vi.fn(),
      query: vi.fn(async () => {
        throw stop;
      }),
    });
    await expect(
      runActualsDraftJournaledMigration({
        connectionString,
        apply: false,
        stdout: { write: () => true },
        clientFactory: () => client,
      })
    ).rejects.toBe(stop);
    expect(reconciliation.fingerprint).toHaveBeenCalledExactlyOnceWith({
      directHost: 'staging.example.invalid',
      port: 6543,
      database: 'db',
      user: 'operator',
    });

    const hostless = {
      host: undefined,
      port: 6543,
      connect: vi.fn(),
      end: vi.fn(),
      query: vi.fn(),
    };
    await expect(
      runActualsDraftJournaledMigration({
        connectionString,
        apply: false,
        stdout: { write: () => true },
        clientFactory: () => hostless,
      })
    ).rejects.toThrow('0056 target endpoint is unresolved');
    expect(hostless.query).not.toHaveBeenCalled();
    expect(hostless.end).toHaveBeenCalledOnce();
  });
});
