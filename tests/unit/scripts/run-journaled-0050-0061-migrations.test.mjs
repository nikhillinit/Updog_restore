import path from 'node:path';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import process from 'node:process';
import { URL } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm';

const reconciliation = vi.hoisted(() => ({
  audit: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  timeouts: vi.fn(),
  identity: vi.fn(),
}));
const currentForecast = vi.hoisted(() => ({
  adr074: vi.fn(),
  sentinel: vi.fn(),
  ledger: vi.fn(),
  rawCatalog: vi.fn(),
}));
const actualsDraft = vi.hoisted(() => ({
  catalog: vi.fn(),
  exact: vi.fn(),
}));
const actualsRestatement = vi.hoisted(() => ({
  catalog: vi.fn(),
  exact: vi.fn(),
}));

vi.mock('../../../scripts/reconcile-prod-schema.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  runReconciliation: reconciliation.audit,
  acquireAdvisoryLock: reconciliation.acquire,
  releaseAdvisoryLock: reconciliation.release,
  setApplyTimeouts: reconciliation.timeouts,
  readDatabaseIdentity: reconciliation.identity,
}));
vi.mock(
  '../../../scripts/current-forecast-journaled-migration-range.mjs',
  async (importOriginal) => ({
    ...(await importOriginal()),
    assertCurrentForecastRawMigrationSafeCatalog: currentForecast.rawCatalog,
  })
);
vi.mock(
  '../../../scripts/run-current-forecast-journaled-migrations.mjs',
  async (importOriginal) => ({
    ...(await importOriginal()),
    assertAdr074BaselineCatalog: currentForecast.adr074,
    readCurrentForecastSentinelCatalog: currentForecast.sentinel,
    readMigrationLedger: currentForecast.ledger,
  })
);
vi.mock('../../../scripts/run-actuals-draft-journaled-migration.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  assertActualsDraftMigrationSafeCatalog: actualsDraft.catalog,
  assertExactActualsTableCatalog: actualsDraft.exact,
}));
vi.mock(
  '../../../scripts/run-actuals-restatement-journaled-migration.mjs',
  async (importOriginal) => ({
    ...(await importOriginal()),
    assertActualsRestatementMigrationSafeCatalog: actualsRestatement.catalog,
    assertExactRestatementCatalog: actualsRestatement.exact,
  })
);

import {
  JOURNALED_0050_0061_MANIFEST_PINS,
  JOURNALED_0050_0061_TARGETS,
  JOURNALED_FULL_ABSENCE_DELTAS,
  JournaledRangeMigrationError,
  JournaledRangeTargetError,
  assertJournaledRangeCatalog,
  assertRepositoryTail,
  classifyJournaledRangeLedgerState,
  computeTargetFingerprint,
  deriveTargetStates,
  formatJournaledRangeFailure,
  loadJournaledRangeMigrations,
  parseJournaledRangeMigrationArgs,
  runJournaledRangeMigration,
} from '../../../scripts/run-journaled-0050-0061-migrations.mjs';
import { ActualsDraftMigrationError } from '../../../scripts/run-actuals-draft-journaled-migration.mjs';
import { ReconcileError } from '../../../scripts/reconcile-prod-schema.mjs';

const migrationsDir = path.join(process.cwd(), 'migrations');
const manifestDir = path.join(process.cwd(), 'scripts/prod-schema-manifests');
const row = ({ when, hash }) => ({ created_at: String(when), hash });
const root = process.cwd();
let baselineEntries;
let targetEntries;
let manifests;

beforeAll(async () => {
  const loaded = await loadJournaledRangeMigrations({ migrationsDir, manifestDir });
  baselineEntries = loaded.baselineEntries;
  targetEntries = loaded.targetEntries;
  manifests = loaded.manifests;
});

beforeEach(() => {
  vi.clearAllMocks();
  reconciliation.audit.mockImplementation(async ({ manifests: items }) => ({
    audits: items.map(({ name }) => ({
      manifest: name,
      action: 'SKIP',
      objects: [{ action: 'SKIP', deltas: [] }],
    })),
  }));
  reconciliation.identity.mockResolvedValue({ database: 'db', user: 'operator' });
  reconciliation.acquire.mockResolvedValue(undefined);
  reconciliation.release.mockResolvedValue(undefined);
  reconciliation.timeouts.mockResolvedValue(undefined);
  currentForecast.adr074.mockResolvedValue(undefined);
  currentForecast.sentinel.mockResolvedValue([]);
  currentForecast.rawCatalog.mockImplementation(() => undefined);
  actualsDraft.catalog.mockImplementation(() => undefined);
  actualsDraft.exact.mockResolvedValue(undefined);
  actualsRestatement.catalog.mockImplementation(() => undefined);
  actualsRestatement.exact.mockResolvedValue(undefined);
});

function baselineRows(kind = 'canonical') {
  const entries =
    kind === 'canonical'
      ? baselineEntries
      : [...baselineEntries.slice(0, 9), ...baselineEntries.slice(46)];
  return entries.map(row);
}

function ledgerRows(kind, count) {
  return [...baselineRows(kind), ...targetEntries.slice(0, count).map(row)];
}

async function copiedSources() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'journaled-0050-0061-'));
  const copiedMigrations = path.join(directory, 'migrations');
  const copiedManifests = path.join(directory, 'manifests');
  await cp(migrationsDir, copiedMigrations, { recursive: true });
  await cp(manifestDir, copiedManifests, { recursive: true });
  return { directory, migrationsDir: copiedMigrations, manifestDir: copiedManifests };
}

describe('journaled 0050-0061 source and ledger admission', () => {
  it.each(['canonical', 'adr074-reconciled'])('classifies every %s prefix', (kind) => {
    for (let count = 0; count <= 12; count += 1) {
      expect(
        classifyJournaledRangeLedgerState({
          ledgerRows: ledgerRows(kind, count),
          baselineEntries,
          targetEntries,
        })
      ).toMatchObject({
        baselineKind: kind,
        state: count === 12 ? 'complete' : 'ready',
        appliedTargetCount: count,
        lastAppliedTag: count === 0 ? baselineEntries.at(-1).tag : targetEntries[count - 1].tag,
      });
    }
  });

  it.each([
    [
      'unknown later timestamp',
      (rows) => [...rows, { created_at: '9999999999999', hash: 'a'.repeat(64) }],
    ],
    ['gap', (rows) => [...rows.slice(0, -1), row(targetEntries[1])]],
    ['reorder', (rows) => [rows[0], rows[2], rows[1], ...rows.slice(3)]],
    ['duplicate', (rows) => [...rows, rows.at(-1)]],
    [
      'NULL timestamp',
      (rows) => [...rows.slice(0, -1), { created_at: null, hash: rows.at(-1).hash }],
    ],
    [
      'later target timestamp',
      (rows) => [...rows, { created_at: targetEntries[0].when + 1, hash: targetEntries[0].hash }],
    ],
    ['hash mismatch', (rows) => [...rows.slice(0, -1), { ...rows.at(-1), hash: 'f'.repeat(64) }]],
  ])('refuses malformed ledger: %s', (_label, alter) => {
    expect(() =>
      classifyJournaledRangeLedgerState({
        ledgerRows: alter(ledgerRows('canonical', 1)),
        baselineEntries,
        targetEntries,
      })
    ).toThrow();
  });

  it('rejects a non-integer target count', () => {
    expect(() => deriveTargetStates(-1)).toThrow();
    expect(() => deriveTargetStates(13)).toThrow();
    expect(() => deriveTargetStates(1.5)).toThrow();
  });

  it('pins every SQL source and manifest before constructing a client', async () => {
    for (const target of JOURNALED_0050_0061_TARGETS) {
      const sources = await copiedSources();
      try {
        await writeFile(path.join(sources.migrationsDir, `${target.tag}.sql`), 'SELECT 1;');
        await expect(loadJournaledRangeMigrations(sources)).rejects.toThrow(
          `Journaled migration source identity mismatch: ${target.tag}`
        );
      } finally {
        await rm(sources.directory, { recursive: true, force: true });
      }
    }
    for (const pin of JOURNALED_0050_0061_MANIFEST_PINS) {
      const sources = await copiedSources();
      try {
        const loaded = await loadJournaledRangeMigrations(sources);
        const manifest = loaded.manifests.find(({ order }) => order === pin.order);
        const manifestFile = path.resolve(root, manifest.manifestPath);
        const manifestJson = JSON.parse(await readFile(manifestFile, 'utf8'));
        manifestJson.description = `${manifestJson.description ?? ''} drift`;
        await writeFile(manifestFile, JSON.stringify(manifestJson));
        await expect(loadJournaledRangeMigrations(sources)).rejects.toThrow(
          `Journaled manifest source identity mismatch: ${pin.name}`
        );
      } finally {
        const original = await readFile(
          path.resolve(root, manifests.find(({ order }) => order === pin.order).manifestPath)
        );
        const target = path.resolve(
          root,
          manifests.find(({ order }) => order === pin.order).manifestPath
        );
        await writeFile(target, original);
        await rm(sources.directory, { recursive: true, force: true });
      }
    }
  });

  it.each([
    [
      'journal',
      async (sources) => {
        const file = path.join(sources.migrationsDir, 'meta', '_journal.json');
        const journal = JSON.parse(await readFile(file, 'utf8'));
        journal.entries.push({ ...journal.entries.at(-1), idx: 63 });
        await writeFile(file, JSON.stringify(journal));
      },
    ],
    [
      'manifest',
      async (sources) => {
        await writeFile(
          path.join(sources.manifestDir, '39-tail.json'),
          JSON.stringify({
            order: 39,
            name: 'tail',
            manifestPath: 'scripts/prod-schema-manifests/39-tail.json',
          })
        );
      },
    ],
  ])('tail guard refuses %s before constructing a client', async (_label, damage) => {
    const sources = await copiedSources();
    const clientFactory = vi.fn();
    try {
      await damage(sources);
      await expect(
        runJournaledRangeMigration({
          connectionString: 'postgres://operator:password@localhost/db',
          apply: false,
          clientFactory,
          ...sources,
        })
      ).rejects.toThrow('Repository is newer than the 0050-0061 route');
      expect(clientFactory).not.toHaveBeenCalled();
    } finally {
      await rm(sources.directory, { recursive: true, force: true });
    }
  });
});

describe('journaled 0050-0061 pure contracts', () => {
  it.each(Array.from({ length: 13 }, (_, count) => count))(
    'derives target states for count %i',
    (count) => {
      const state = deriveTargetStates(count);
      expect(state.currentForecastAppliedCount).toBe(Math.min(count, 6));
      expect(state.actualsDraftState.state).toBe(count >= 7 ? 'complete' : 'ready');
      expect(state.actualsRestatementState.state).toBe(count >= 8 ? 'complete' : 'ready');
      expect(state.ledgeredOrders).toEqual(
        new Set([35, 36, 37, 38].filter((order) => count >= order - 26))
      );
    }
  );

  const targetManifests = JOURNALED_0050_0061_MANIFEST_PINS.map((pin) => ({
    order: pin.order,
    name: pin.name,
    expectedTables: [{}],
  }));
  const cleanAudits = () =>
    targetManifests.map(({ name }) => ({
      manifest: name,
      action: 'SKIP',
      objects: [{ action: 'SKIP', deltas: [] }],
    }));
  const absenceAudits = () => {
    const audits = cleanAudits();
    for (const [index, manifest] of targetManifests.slice(8).entries()) {
      audits[index + 8].action = 'APPLY-MISSING-DDL';
      audits[index + 8].objects = [
        {
          action: 'APPLY-MISSING-DDL',
          deltas: [...JOURNALED_FULL_ABSENCE_DELTAS.get(manifest.name)].map((delta) => {
            const [kind, name] = delta.split(':');
            return { kind, name };
          }),
        },
      ];
    }
    return audits;
  };

  it('requires exact full absence for unledgered manifests 35-38', async () => {
    await expect(
      assertJournaledRangeCatalog({
        client: {},
        appliedTargetCount: 0,
        audits: absenceAudits(),
        sentinelCatalog: [],
        manifests: targetManifests,
      })
    ).resolves.toBeUndefined();

    for (const manifest of targetManifests.slice(8)) {
      const full = [...JOURNALED_FULL_ABSENCE_DELTAS.get(manifest.name)];
      for (const mutation of [
        full.slice(0, -1),
        [...full, 'missing-table:extra'],
        [...full, full[0]],
      ]) {
        const audits = absenceAudits();
        const index = targetManifests.findIndex(({ name }) => name === manifest.name);
        audits[index].objects[0].deltas = mutation.map((delta) => {
          const [kind, name] = delta.split(':');
          return { kind, name };
        });
        await expect(
          assertJournaledRangeCatalog({
            client: {},
            appliedTargetCount: 0,
            audits,
            sentinelCatalog: [],
            manifests: targetManifests,
          })
        ).rejects.toThrow(`Unledgered ${manifest.name}`);
      }
    }

    const ledgered = cleanAudits();
    ledgered[8].objects = [
      { action: 'APPLY-MISSING-DDL', deltas: [{ kind: 'missing-table', name: 'residue' }] },
    ];
    await expect(
      assertJournaledRangeCatalog({
        client: {},
        appliedTargetCount: 9,
        audits: ledgered,
        sentinelCatalog: [],
        manifests: targetManifests,
      })
    ).rejects.toThrow('Ledgered capital-plan-override');
  });

  it('serializes target fingerprints byte-for-byte with the draft and preflight formulas', () => {
    const endpoint = new URL('postgres://User:Password@DB.Example.test/database');
    const input = {
      directHost: endpoint.hostname,
      port: endpoint.port,
      database: 'database',
      user: 'User',
    };
    const preflightFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          directHost: endpoint.hostname.toLowerCase(),
          port: endpoint.port || '5432',
          database: input.database,
          user: input.user,
        })
      )
      .digest('hex');
    const draftFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          directHost: endpoint.hostname.toLowerCase(),
          port: endpoint.port || '5432',
          database: input.database,
          user: input.user,
        })
      )
      .digest('hex');
    expect(computeTargetFingerprint(input)).toBe(draftFingerprint);
    expect(computeTargetFingerprint(input)).toBe(preflightFingerprint);
  });

  it.each([0, 12])('prints fixed readback for %s state', async (count) => {
    const output = [];
    currentForecast.ledger.mockResolvedValue(ledgerRows('canonical', count));
    if (count === 0) {
      reconciliation.audit.mockImplementation(async ({ manifests: items }) => ({
        audits: items.map((manifest) => ({
          manifest: manifest.name,
          action: manifest.order >= 35 ? 'APPLY-MISSING-DDL' : 'SKIP',
          objects:
            manifest.order >= 35
              ? [
                  {
                    action: 'APPLY-MISSING-DDL',
                    deltas: [...JOURNALED_FULL_ABSENCE_DELTAS.get(manifest.name)].map((delta) => {
                      const [kind, name] = delta.split(':');
                      return { kind, name };
                    }),
                  },
                ]
              : [{ action: 'SKIP', deltas: [] }],
        })),
      }));
    }
    const client = {
      query: vi.fn(async (sql) => {
        if (sql.includes('SHOW server_version_num'))
          return { rows: [{ server_version_num: '160000' }] };
        if (sql.includes('to_regclass')) return { rows: [{ present: false }] };
        return { rows: [] };
      }),
      connect: vi.fn(),
      end: vi.fn(),
    };
    await runJournaledRangeMigration({
      connectionString: 'postgres://operator:password@localhost/db',
      apply: false,
      stdout: { write: (value) => output.push(value) },
      clientFactory: () => client,
    });
    expect(output).toContain(
      `journaled-0050-0061: ledger readback ${count === 12 ? 'complete' : 'ready'} ${count}/12\n`
    );
  });
});

describe('journaled 0050-0061 failure and CLI contracts', () => {
  it.each([
    [
      'tail guard',
      new JournaledRangeMigrationError('Repository is newer than the 0050-0061 route'),
      'before-connect',
      'refused-before-connect',
    ],
    [
      'pin drift',
      new JournaledRangeMigrationError('Journaled migration source identity mismatch: x'),
      'before-connect',
      'refused-before-connect',
    ],
    [
      'manifest load',
      new JournaledRangeMigrationError('manifest failed'),
      'before-connect',
      'refused-before-connect',
    ],
    [
      'missing URL',
      new ReconcileError('DATABASE_URL is missing'),
      'before-connect',
      'refused-before-connect',
    ],
    [
      'pooler URL',
      new ReconcileError('Refusing pooled database URL'),
      'before-connect',
      'refused-before-connect',
    ],
    [
      'lock contention',
      new Error('advisory lock was not acquired'),
      'before-ledger',
      'failed-no-state',
    ],
    ['code-less connection', new Error('socket failed'), 'before-ledger', 'failed-no-state'],
    [
      'classifier refusal',
      new JournaledRangeMigrationError('Migration ledger contains gap or reorder'),
      'after-ledger',
      'refused-ledger-or-catalog',
    ],
    [
      'current forecast validator',
      new JournaledRangeMigrationError('Unsafe Current Forecast catalog'),
      'after-ledger',
      'refused-ledger-or-catalog',
    ],
    [
      'actuals validator',
      new ActualsDraftMigrationError('Unsafe actuals catalog'),
      'after-ledger',
      'refused-ledger-or-catalog',
    ],
    [
      'audit refusal',
      new ReconcileError('audit refused'),
      'after-ledger',
      'refused-ledger-or-catalog',
    ],
    [
      'wrapped SQLSTATE',
      new DrizzleQueryError('ALTER TABLE', [], { severity: 'ERROR', code: '23514' }),
      'after-ledger',
      'failed-sqlstate 23514',
    ],
    ['code-less SQL error', new Error('query failed'), 'after-ledger', 'failed-no-state'],
    [
      'EPIPE',
      Object.assign(new Error('broken pipe'), { code: 'EPIPE' }),
      'after-ledger',
      'failed-no-state',
    ],
  ])('formats %s as %s', (_label, error, stage, expected) => {
    expect(formatJournaledRangeFailure(error, stage)).toContain(expected);
  });

  it('uses constant target refusal text for missing and mismatched fingerprints', () => {
    const missing = formatJournaledRangeFailure(
      new JournaledRangeTargetError('missing'),
      'after-ledger'
    );
    const mismatch = formatJournaledRangeFailure(
      new JournaledRangeTargetError('mismatch'),
      'after-ledger'
    );
    expect(missing).toBe(
      'journaled-0050-0061: refused-target: Target fingerprint missing or mismatched'
    );
    expect(mismatch).toBe(missing);
  });

  it('parses only the explicit apply confirmation', () => {
    expect(parseJournaledRangeMigrationArgs([])).toEqual({ apply: false, yes: false });
    expect(parseJournaledRangeMigrationArgs(['--apply', '--yes'])).toEqual({
      apply: true,
      yes: true,
    });
    expect(() => parseJournaledRangeMigrationArgs(['--apply'])).toThrow('--apply requires --yes');
    expect(() => parseJournaledRangeMigrationArgs(['--force'])).toThrow(
      'Unknown journaled migration argument'
    );
  });

  it('rejects malformed repository tails directly', () => {
    expect(() =>
      assertRepositoryTail({
        journalEntries: Array.from({ length: 64 }, (_, idx) => ({ idx })),
        manifests: Array.from({ length: 38 }, (_, idx) => ({ order: idx + 1 })),
      })
    ).toThrow();
    expect(() =>
      assertRepositoryTail({
        journalEntries: Array.from({ length: 63 }, (_, idx) => ({ idx })),
        manifests: Array.from({ length: 39 }, (_, idx) => ({ order: idx + 1 })),
      })
    ).toThrow();
  });
});
