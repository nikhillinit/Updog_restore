import path from 'node:path';
import process from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  assertCurrentForecastRawMigrationSafeCatalog,
  loadCurrentForecastBaselineLedger,
  loadCurrentForecastMigrationRange,
} from '../../../scripts/current-forecast-journaled-migration-range.mjs';
import { runCurrentForecastJournaledMigrationRecovery } from '../../../scripts/run-current-forecast-journaled-migrations.mjs';

const auditMock = vi.hoisted(() => vi.fn());
vi.mock('../../../scripts/reconcile-prod-schema.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  runReconciliation: auditMock,
}));
vi.mock(
  '../../../scripts/current-forecast-journaled-migration-range.mjs',
  async (importOriginal) => ({
    ...(await importOriginal()),
    assertCurrentForecastRawMigrationSafeCatalog: vi.fn(),
  })
);
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: (client) => client }));
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: vi.fn() }));

const migrationsDir = path.join(process.cwd(), 'migrations');
const row = ({ when, hash }) => ({ created_at: String(when), hash });

async function fixture({ canonical = false, count = 0, damage = (audits) => audits } = {}) {
  const baseline = await loadCurrentForecastBaselineLedger({ migrationsDir });
  const targets = await loadCurrentForecastMigrationRange({ migrationsDir });
  const baselineRows = (
    canonical ? baseline : [...baseline.slice(0, 9), ...baseline.slice(46)]
  ).map(row);
  let ledger = [...baselineRows, ...targets.slice(0, count).map(row)];
  let locked = false;
  const events = [];
  const client = {
    connect: vi.fn(),
    end: vi.fn(),
    query: vi.fn(async (sql) => {
      if (sql.includes('pg_try_advisory_lock')) {
        locked = true;
        events.push('lock');
        return { rows: [{ acquired: true }] };
      }
      if (sql.includes('pg_advisory_unlock')) {
        locked = false;
        events.push('unlock');
      }
      if (sql.includes('FROM public.drizzle_migrations')) {
        expect(locked).toBe(true);
        return { rows: ledger };
      }
      if (sql.includes('to_regclass')) return { rows: [{ relation: null }] };
      return { rows: [] };
    }),
  };
  auditMock.mockImplementation(async ({ client: auditClient, manifests, apply }) => {
    expect(auditClient).toBe(client);
    expect(locked).toBe(true);
    expect(apply).toBe(false);
    events.push(`audit:${manifests.map(({ order }) => order).join(',')}`);
    const audits = manifests.map(({ name }) => ({
      manifest: name,
      action: 'SKIP',
      objects: [{ action: 'SKIP', deltas: [] }],
    }));
    return { audits: manifests[0].order === 1 ? damage(audits) : audits };
  });
  migrate.mockImplementation(async (migrationClient) => {
    expect(migrationClient).toBe(client);
    expect(locked).toBe(true);
    events.push('migrate');
    ledger = [...baselineRows, ...targets.map(row)];
  });
  return {
    client,
    events,
    run: (apply = true) =>
      runCurrentForecastJournaledMigrationRecovery({
        connectionString: 'postgres://operator:password@localhost/test',
        apply,
        stdout: { write: () => true },
        clientFactory: () => client,
      }),
  };
}

describe('Current Forecast ADR-074 migration recovery', { retry: 0 }, () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([0, 1, 2, 3, 4, 5, 6])(
    'audits all baseline manifests under the migration lock with %i targets',
    async (count) => {
      const { run, events, client } = await fixture({ count });
      await expect(run()).resolves.toMatchObject({
        preState: { baselineKind: 'adr074-reconciled', appliedTargetCount: count },
        postState: 'complete',
        applied: count !== 6,
      });
      const baselineAudit = `audit:${Array.from({ length: 26 }, (_, index) => index + 1).join(',')}`;
      expect(events.slice(0, 2)).toEqual(['lock', baselineAudit]);
      expect(events.at(-1)).toBe('unlock');
      expect(client.end).toHaveBeenCalledOnce();
      expect(migrate).toHaveBeenCalledTimes(count === 6 ? 0 : 1);
      expect(assertCurrentForecastRawMigrationSafeCatalog).toHaveBeenCalledTimes(
        count === 6 ? 1 : 2
      );
      await expect(run()).resolves.toMatchObject({
        preState: { baselineKind: 'adr074-reconciled', appliedTargetCount: 6 },
        postState: 'complete',
        applied: false,
      });
      expect(migrate).toHaveBeenCalledTimes(count === 6 ? 0 : 1);
    }
  );

  it('audits a sparse dry run without applying migrations', async () => {
    const { run } = await fixture();
    await expect(run(false)).resolves.toMatchObject({ postState: 'ready', applied: false });
    expect(auditMock).toHaveBeenCalledTimes(2);
    expect(migrate).not.toHaveBeenCalled();
  });

  it('keeps canonical recovery on the existing target audit path', async () => {
    const { run, events } = await fixture({ canonical: true });
    await expect(run()).resolves.toMatchObject({
      preState: { baselineKind: 'canonical' },
      applied: true,
    });
    expect(events.filter((event) => event.startsWith('audit:'))).toEqual([
      'audit:27,28,29,30,31,32',
      'audit:27,28,29,30,31,32',
    ]);
  });

  it.each(Array.from({ length: 26 }, (_, index) => index))(
    'refuses non-SKIP baseline manifest %i before migration',
    async (index) => {
      const { run, events, client } = await fixture({
        damage: (audits) => {
          audits[index].action = 'APPLY-MISSING-DDL';
          return audits;
        },
      });
      await expect(run()).rejects.toThrow(/ADR-074 baseline catalog/);
      expect(migrate).not.toHaveBeenCalled();
      expect(assertCurrentForecastRawMigrationSafeCatalog).not.toHaveBeenCalled();
      expect(events.at(-1)).toBe('unlock');
      expect(client.end).toHaveBeenCalledOnce();
    }
  );

  it.each([
    ['missing audit', (audits) => audits.slice(1)],
    ['reordered audit', (audits) => [audits[1], audits[0], ...audits.slice(2)]],
    ['extra audit', (audits) => [...audits, audits[0]]],
    [
      'object delta',
      (audits) => {
        audits[0].objects[0].deltas = [{ kind: 'missing-column' }];
        return audits;
      },
    ],
    [
      'non-SKIP object',
      (audits) => {
        audits[0].objects[0].action = 'REFUSE-FOR-HUMAN';
        return audits;
      },
    ],
    [
      'missing objects',
      (audits) => {
        delete audits[0].objects;
        return audits;
      },
    ],
  ])('refuses malformed baseline audit: %s', async (_, damage) => {
    const { run } = await fixture({ damage });
    await expect(run()).rejects.toThrow(/ADR-074 baseline catalog/);
    expect(migrate).not.toHaveBeenCalled();
  });

  it('preserves target raw catalog refusal after successful baseline audit', async () => {
    const { run } = await fixture();
    assertCurrentForecastRawMigrationSafeCatalog.mockImplementation(() => {
      throw new Error('unsafe target catalog');
    });
    await expect(run()).rejects.toThrow('unsafe target catalog');
    expect(migrate).not.toHaveBeenCalled();
  });
});
