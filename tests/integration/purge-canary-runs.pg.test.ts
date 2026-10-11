import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runPurge } from '../../scripts/release/purge-canary-runs.mjs';
import { readDatabaseIdentity } from '../../scripts/reconcile-prod-schema.mjs';
import { computeTargetFingerprint } from '../../scripts/run-journaled-0050-0061-migrations.mjs';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const HEAD_SHA = 'a'.repeat(40);
const TEMPLATE = `purge_canary_template_${process.pid}`;
const databases: string[] = [];
let admin: Pool;
let startedContainer = false;

type Plan = { digest: string; deleteOrder: Array<{ table: string; count: number }> } & Record<
  string,
  unknown
>;
type Summary = { outcome: string } & Record<string, unknown>;
type Wrap = (client: Client) => Client;

function baseConnection(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

function databaseUrl(name: string): string {
  const url = new URL(baseConnection());
  url.pathname = `/${name}`;
  return url.toString();
}

async function withClient<T>(connectionString: string, callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function freshDatabase() {
  const name = `purge_canary_${process.pid}_${databases.length}`;
  databases.push(name);
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE}"`);
  const connectionString = databaseUrl(name);
  const fingerprint = await withClient(connectionString, async (client) => {
    const identity = await readDatabaseIdentity(client);
    return computeTargetFingerprint({
      directHost: client.host,
      port: client.port,
      database: identity.database,
      user: identity.user,
    }) as string;
  });
  return { connectionString, fingerprint };
}

let seedSequence = 0;

/** One canary run, its fund, and four residue rows: config, two events, a grant. */
async function seedCanary(
  connectionString: string,
  { status = 'failed', expired = true }: { status?: string; expired?: boolean } = {}
) {
  seedSequence += 1;
  return withClient(connectionString, async (client) => {
    const user = await client.query<{ id: number }>(
      `INSERT INTO users (username, password, role, is_release_canary_principal)
       VALUES ($1, 'hash', 'partner', true) RETURNING id`,
      [`canary-${seedSequence}`]
    );
    const userId = user.rows[0]!.id;
    const run = await client.query<{ id: string }>(
      `INSERT INTO release_canary_runs
         (release_version, release_sha, deployment_id, worker_deployment_id, correlation_id,
          workflow_run_id, workflow_run_attempt, principal_user_id, status, expires_at,
          fund_residue_count, fund_config_residue_count, fund_event_residue_count,
          grant_residue_count, total_residue_count)
       VALUES ('v1', $1, 'dpl_test', 'wrk_test', $2, $3, 1, $4, $5,
               clock_timestamp() + $6::interval, 1, 1, 2, 1, 5)
       RETURNING id`,
      [
        'b'.repeat(40),
        `corr-${seedSequence}`,
        String(1000 + seedSequence),
        userId,
        status,
        expired ? '-1 hour' : '1 hour',
      ]
    );
    const runId = run.rows[0]!.id;
    const fund = await client.query<{ id: number }>(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year, data_origin, canary_run_id)
       VALUES ($1, 1, 0, 0, 2026, 'release_canary', $2) RETURNING id`,
      [`Canary ${seedSequence}`, runId]
    );
    const fundId = fund.rows[0]!.id;
    const config = await client.query<{ id: number }>(
      `INSERT INTO fundconfigs (fund_id, config) VALUES ($1, '{"canary":true}') RETURNING id`,
      [fundId]
    );
    await client.query(
      `INSERT INTO fund_events (fund_id, event_type, event_time)
       VALUES ($1, 'created', now()), ($1, 'drafted', now())`,
      [fundId]
    );
    await client.query('INSERT INTO user_fund_grants (user_id, fund_id) VALUES ($1, $2)', [
      userId,
      fundId,
    ]);
    return { runId, fundId, userId, configId: config.rows[0]!.id };
  });
}

/** A production fund with children that the purge must never touch. */
async function seedProductionFund(connectionString: string) {
  return withClient(connectionString, async (client) => {
    const fund = await client.query<{ id: number }>(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year, data_origin)
       VALUES ('Production', 1, 0, 0, 2026, 'production') RETURNING id`
    );
    const fundId = fund.rows[0]!.id;
    await client.query(`INSERT INTO fundconfigs (fund_id, config) VALUES ($1, '{}')`, [fundId]);
    await client.query(
      `INSERT INTO fund_events (fund_id, event_type, event_time) VALUES ($1, 'created', now())`,
      [fundId]
    );
    return fundId;
  });
}

async function snapshot(connectionString: string) {
  return withClient(connectionString, async (client) => {
    const read = async (sql: string) => (await client.query(sql)).rows;
    return {
      funds: await read('SELECT id, data_origin, canary_run_id FROM funds ORDER BY id'),
      configs: await read('SELECT id, fund_id, config FROM fundconfigs ORDER BY id'),
      events: await read('SELECT id, fund_id, event_type FROM fund_events ORDER BY id'),
      grants: await read('SELECT user_id, fund_id FROM user_fund_grants ORDER BY 1, 2'),
      runs: await read(
        'SELECT id, status, version, purged_at, total_residue_count FROM release_canary_runs ORDER BY id'
      ),
      receipts: await read(
        "SELECT entity_id, changes FROM audit_log WHERE action = 'release_canary_purge' ORDER BY created_at"
      ),
    };
  });
}

function purge(
  connectionString: string,
  options: Record<string, unknown>,
  wrap: Wrap = (client) => client
) {
  return withClient(connectionString, (client) =>
    runPurge(wrap(client), { headSha: HEAD_SHA, output: () => undefined, ...options })
  ) as Promise<Plan & Summary>;
}

function bound(fingerprint: string, digest: string) {
  return {
    execute: true,
    expectedPlanDigest: digest,
    expectedTargetFingerprint: fingerprint,
    revalidateSource: () => undefined,
    verifyRecoveryEvidence: () => ({ synthetic: 'recovery-evidence-test' }),
  };
}

/** True once `pid` waits on a lock; false if it settles first or 5 s pass. */
async function waitForLockWait(observer: Client, pid: number, settled: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await observer.query<{ wait_event_type: string | null }>(
      'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1',
      [pid]
    );
    if (state.rows[0]?.wait_event_type === 'Lock') return true;
    if (settled()) return false;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

function counts(plan: Plan) {
  return Object.fromEntries(
    plan.deleteOrder.filter(({ count }) => count > 0).map(({ table, count }) => [table, count])
  );
}

describe.skipIf(skipIfNoDocker)('single canary run purge', { retry: 0, timeout: 120_000 }, () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedContainer = true;
    }
    admin = new Pool({ connectionString: baseConnection(), max: 1 });
    await admin.query(`CREATE DATABASE "${TEMPLATE}"`);
    await runMigrationsWithConnectionString(databaseUrl(TEMPLATE));
  }, 300_000);

  afterAll(async () => {
    try {
      for (const name of [...databases.reverse(), TEMPLATE]) {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
    } finally {
      await admin?.end();
      if (startedContainer) await cleanupTestContainers();
    }
  });

  it('purges exactly the reviewed run, keeps history counts, and replays its receipt', async () => {
    const { connectionString, fingerprint } = await freshDatabase();
    const productionFundId = await seedProductionFund(connectionString);
    const { runId, fundId } = await seedCanary(connectionString);
    // A second eligible (terminal, expired) canary that is not the target.
    const bystander = await seedCanary(connectionString);
    const target = { runId, fundId: String(fundId) };
    const before = await snapshot(connectionString);
    const bystanderRows = (state: Awaited<ReturnType<typeof snapshot>>) => ({
      funds: state.funds.filter((row) => row.id === bystander.fundId),
      configs: state.configs.filter((row) => row.fund_id === bystander.fundId),
      events: state.events.filter((row) => row.fund_id === bystander.fundId),
      grants: state.grants.filter((row) => row.fund_id === bystander.fundId),
      runs: state.runs.filter((row) => row.id === bystander.runId),
    });
    const bystanderBefore = bystanderRows(before);
    expect(bystanderBefore.events).toHaveLength(2);

    const plan = await purge(connectionString, target);
    expect(plan.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(plan).toMatchObject({ mode: 'single-run-dry-run', residueMatchesStored: true });
    expect(counts(plan)).toEqual({ fundconfigs: 1, fund_events: 2, user_fund_grants: 1, funds: 1 });
    expect(plan.deleteOrder.at(-1)?.table).toBe('funds');
    expect(await snapshot(connectionString)).toEqual(before);

    const purged = await purge(connectionString, { ...target, ...bound(fingerprint, plan.digest) });
    expect(purged).toMatchObject({ outcome: 'purged', runId, fundId, digest: plan.digest });

    const after = await snapshot(connectionString);
    const survivors = [productionFundId, bystander.fundId];
    expect(after.funds.map((row) => row.id)).toEqual(survivors);
    expect([...new Set(after.configs.map((row) => row.fund_id))]).toEqual(survivors);
    expect([...new Set(after.events.map((row) => row.fund_id))]).toEqual(survivors);
    expect(after.grants.map((row) => row.fund_id)).toEqual([bystander.fundId]);
    expect(bystanderRows(after)).toEqual(bystanderBefore);
    const run = after.runs.find((row) => row.id === runId)!;
    const runBefore = before.runs.find((row) => row.id === runId)!;
    expect(run).toMatchObject({
      status: 'purged',
      version: runBefore.version + 1,
      total_residue_count: runBefore.total_residue_count,
    });
    expect(run.purged_at).toBeTruthy();
    expect(after.receipts).toHaveLength(1);
    const receipt = after.receipts[0]!;
    expect(receipt.entity_id).toBe(runId);
    expect(receipt.changes).toMatchObject({
      digest: plan.digest,
      executingSha: HEAD_SHA,
      runId,
      fundId,
      recoveryEvidence: { synthetic: 'recovery-evidence-test' },
    });
    const deletedFunds = receipt.changes.deleted.find(
      (entry: { table: string }) => entry.table === 'funds'
    );
    expect(deletedFunds.rows).toEqual([
      expect.objectContaining({ id: fundId, canary_run_id: runId }),
    ]);

    const { outcome: _purgedOutcome, ...purgedReceipt } = purged;
    const replayed = await purge(connectionString, {
      ...target,
      ...bound(fingerprint, plan.digest),
    });
    const { outcome: replayOutcome, ...replayedReceipt } = replayed;
    expect(replayOutcome).toBe('replayed');
    expect(replayedReceipt).toEqual(purgedReceipt);

    const readback = await purge(connectionString, target);
    expect(readback).toEqual({ ...purgedReceipt, outcome: 'readback' });

    await expect(
      purge(connectionString, { ...target, ...bound(fingerprint, 'c'.repeat(64)) })
    ).rejects.toThrow(/conflicting purge intent/i);
    await expect(
      purge(connectionString, {
        runId,
        fundId: String(productionFundId),
        ...bound(fingerprint, plan.digest),
      })
    ).rejects.toThrow(/conflicting purge intent/i);
    expect(await snapshot(connectionString)).toEqual(after);
    expect(bystanderRows(await snapshot(connectionString))).toEqual(bystanderBefore);
  });

  it('refuses active, unexpired, and mismatched targets before any write', async () => {
    const { connectionString } = await freshDatabase();
    const productionFundId = await seedProductionFund(connectionString);
    const active = await seedCanary(connectionString, { status: 'running' });
    const fresh = await seedCanary(connectionString, { status: 'failed', expired: false });
    const eligible = await seedCanary(connectionString);
    const before = await snapshot(connectionString);

    await expect(
      purge(connectionString, { runId: active.runId, fundId: String(active.fundId) })
    ).rejects.toThrow(/not terminal/i);
    await expect(
      purge(connectionString, { runId: fresh.runId, fundId: String(fresh.fundId) })
    ).rejects.toThrow(/has not expired/i);
    await expect(
      purge(connectionString, { runId: eligible.runId, fundId: String(productionFundId) })
    ).rejects.toThrow(/not the release-canary fund of run/i);
    await expect(
      purge(connectionString, { runId: eligible.runId, fundId: String(fresh.fundId) })
    ).rejects.toThrow(/not the release-canary fund of run/i);
    await expect(
      purge(connectionString, {
        runId: '00000000-0000-4000-8000-000000000000',
        fundId: String(eligible.fundId),
      })
    ).rejects.toThrow(/run was not found/i);
    expect(await snapshot(connectionString)).toEqual(before);
  });

  it('refuses dependent rows, owned rows, and delete triggers outside the reviewed scope', async () => {
    const { connectionString } = await freshDatabase();
    const productionFundId = await seedProductionFund(connectionString);
    const { runId, fundId, configId } = await seedCanary(connectionString);
    const target = { runId, fundId: String(fundId) };
    const exec = (sql: string, values: unknown[] = []) =>
      withClient(connectionString, (client) => client.query(sql, values));

    // A cascading foreign key outside the allowlist: the catalog-driven test
    // driver would have deleted this row without counting it.
    await exec(`INSERT INTO tasks (fund_id, title) VALUES ($1, 'unknown dependency')`, [fundId]);
    await expect(purge(connectionString, target)).rejects.toThrow(/public\.tasks/);
    await exec('DELETE FROM tasks');

    // Fund ownership without a foreign key.
    await exec(`INSERT INTO shares (id, fund_id, created_by) VALUES ('s1', $1, 'x')`, [
      String(fundId),
    ]);
    await expect(purge(connectionString, target)).rejects.toThrow(/public\.shares/);
    await exec('DELETE FROM shares');

    // An allowlisted table row that belongs to another fund but depends on a canary row.
    await exec(
      `INSERT INTO calc_runs (fund_id, config_id, config_version, correlation_id, engines, dispatch_state, requested_at)
       VALUES ($1, $2, 1, 'cross-fund', '{}', 'pending', now())`,
      [productionFundId, configId]
    );
    await expect(purge(connectionString, target)).rejects.toThrow(/public\.calc_runs/);
    await exec('DELETE FROM calc_runs');

    await exec(
      `CREATE FUNCTION purge_test_noop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$`
    );
    await exec(
      'CREATE TRIGGER purge_test_delete BEFORE DELETE ON fund_events FOR EACH ROW EXECUTE FUNCTION purge_test_noop()'
    );
    await expect(purge(connectionString, target)).rejects.toThrow(/purge_test_delete/);
    await exec('DROP TRIGGER purge_test_delete ON fund_events');

    await exec('ALTER TABLE audit_log RENAME TO audit_log_hidden');
    await expect(purge(connectionString, target)).rejects.toThrow(/receipt store/i);
    await exec('ALTER TABLE audit_log_hidden RENAME TO audit_log');

    await expect(purge(connectionString, target)).resolves.toMatchObject({
      mode: 'single-run-dry-run',
    });
  });

  it('binds row content: same-count replacement or a moved target invalidates the digest', async () => {
    const { connectionString, fingerprint } = await freshDatabase();
    const { runId, fundId } = await seedCanary(connectionString);
    const target = { runId, fundId: String(fundId) };
    const exec = (sql: string, values: unknown[] = []) =>
      withClient(connectionString, (client) => client.query(sql, values));

    const plan = await purge(connectionString, target);
    await exec(
      `UPDATE fund_events SET event_type = 'replaced' WHERE id = (SELECT min(id) FROM fund_events WHERE fund_id = $1)`,
      [fundId]
    );
    const before = await snapshot(connectionString);
    await expect(
      purge(connectionString, { ...target, ...bound(fingerprint, plan.digest) })
    ).rejects.toThrow(/plan digest mismatch/i);
    expect(await snapshot(connectionString)).toEqual(before);

    const replanned = await purge(connectionString, target);
    expect(counts(replanned)).toEqual(counts(plan));
    expect(replanned.digest).not.toBe(plan.digest);

    await exec(
      `DELETE FROM fund_events WHERE id = (SELECT min(id) FROM fund_events WHERE fund_id = $1)`,
      [fundId]
    );
    await exec(
      `INSERT INTO fund_events (fund_id, event_type, event_time) VALUES ($1, 'replaced', now())`,
      [fundId]
    );
    const swapped = await purge(connectionString, target);
    expect(counts(swapped)).toEqual(counts(plan));
    expect(swapped.digest).not.toBe(replanned.digest);

    const beforeRefusals = await snapshot(connectionString);
    await expect(
      purge(connectionString, { ...target, ...bound('f'.repeat(64), swapped.digest) })
    ).rejects.toThrow(/target fingerprint/i);
    await expect(
      purge(connectionString, {
        ...target,
        ...bound(fingerprint, swapped.digest),
        headSha: 'c'.repeat(40),
      })
    ).rejects.toThrow(/plan digest mismatch/i);
    let sourceChecks = 0;
    await expect(
      purge(connectionString, {
        ...target,
        ...bound(fingerprint, swapped.digest),
        revalidateSource: () => {
          sourceChecks += 1;
          throw new Error('Live origin main does not equal EXPECTED_SHA.');
        },
      })
    ).rejects.toThrow(/live origin main/i);
    expect(sourceChecks).toBe(1);
    let recoveryChecks = 0;
    await expect(
      purge(connectionString, {
        ...target,
        ...bound(fingerprint, swapped.digest),
        verifyRecoveryEvidence: () => {
          recoveryChecks += 1;
          throw new Error('recovery evidence is stale');
        },
      })
    ).rejects.toThrow(/recovery evidence is stale/);
    expect(recoveryChecks).toBe(1);
    await expect(
      purge(connectionString, {
        ...target,
        ...bound(fingerprint, 'e'.repeat(64)),
        verifyRecoveryEvidence: () => {
          recoveryChecks += 1;
          return {};
        },
      })
    ).rejects.toThrow(/plan digest mismatch/i);
    expect(recoveryChecks).toBe(1);
    expect(await snapshot(connectionString)).toEqual(beforeRefusals);
    expect(beforeRefusals.receipts).toEqual([]);
  });

  it('keeps JSONB numbers beyond 2^53 exact in the digest and the receipt', async () => {
    const { connectionString, fingerprint } = await freshDatabase();
    const { runId, fundId, configId } = await seedCanary(connectionString);
    const target = { runId, fundId: String(fundId) };
    const exec = (sql: string, values: unknown[] = []) =>
      withClient(connectionString, (client) => client.query(sql, values));
    const setValue = (value: string) =>
      exec(
        `UPDATE fundconfigs SET draft_revision = $1::bigint, config = jsonb_build_object('n', $1::numeric) WHERE id = $2`,
        [value, configId]
      );

    await setValue('9007199254740992');
    const lower = await purge(connectionString, target);
    await setValue('9007199254740993');
    const upper = await purge(connectionString, target);
    expect(upper.digest).not.toBe(lower.digest);

    await purge(connectionString, { ...target, ...bound(fingerprint, upper.digest) });
    const stored = await exec(
      `SELECT r->>'draft_revision' AS revision, r->'config'->>'n' AS n
       FROM audit_log, jsonb_array_elements(changes->'deleted') AS d, jsonb_array_elements(d->'rows') AS r
       WHERE action = 'release_canary_purge' AND d->>'table' = 'fundconfigs'`
    );
    expect(stored.rows).toEqual([{ revision: '9007199254740993', n: '9007199254740993' }]);
  });

  it('rolls back every delete and the receipt when the purge fails mid-way', async () => {
    const { connectionString, fingerprint } = await freshDatabase();
    const { runId, fundId } = await seedCanary(connectionString);
    const target = { runId, fundId: String(fundId) };
    const plan = await purge(connectionString, target);
    const before = await snapshot(connectionString);
    const failOnFundDelete: Wrap = (client) =>
      new Proxy(client, {
        get(object, property, receiver) {
          if (property !== 'query') return Reflect.get(object, property, receiver);
          return (sql: unknown, ...rest: unknown[]) => {
            if (typeof sql === 'string' && sql.startsWith('DELETE FROM public.funds')) {
              return Promise.reject(new Error('injected failure before funds delete'));
            }
            return (object.query as (...args: unknown[]) => unknown).call(object, sql, ...rest);
          };
        },
      });

    await expect(
      purge(connectionString, { ...target, ...bound(fingerprint, plan.digest) }, failOnFundDelete)
    ).rejects.toThrow(/injected failure/);
    expect(await snapshot(connectionString)).toEqual(before);
  });

  it('write-excludes fund-owned tables without a foreign key until COMMIT', async () => {
    const { connectionString, fingerprint } = await freshDatabase();
    const { runId, fundId } = await seedCanary(connectionString);
    const target = { runId, fundId: String(fundId) };
    const plan = await purge(connectionString, target);
    expect(plan.writeExcludedTables).toEqual(expect.arrayContaining(['public.shares']));

    const writer = new Client({ connectionString });
    const observer = new Client({ connectionString });
    await writer.connect();
    await observer.connect();
    try {
      const writerPid = (await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
        .rows[0]!.pid;
      let writerSettled = false;
      let writerInsert: Promise<unknown> | undefined;
      let writerBlocked: boolean | undefined;
      // Barrier: after the final ownership count, just before the tombstone, a
      // second connection inserts a row naming the fund in a table with no
      // foreign key. It must wait for the purge's COMMIT, not commit first.
      const barrier: Wrap = (client) =>
        new Proxy(client, {
          get(object, property, receiver) {
            if (property !== 'query') return Reflect.get(object, property, receiver);
            return async (sql: unknown, ...rest: unknown[]) => {
              if (
                typeof sql === 'string' &&
                sql.trimStart().startsWith('UPDATE release_canary_runs')
              ) {
                writerInsert = writer
                  .query(`INSERT INTO shares (id, fund_id, created_by) VALUES ('race', $1, 'x')`, [
                    String(fundId),
                  ])
                  .finally(() => {
                    writerSettled = true;
                  });
                writerBlocked = await waitForLockWait(observer, writerPid, () => writerSettled);
              }
              return (object.query as (...args: unknown[]) => unknown).call(object, sql, ...rest);
            };
          },
        });

      await expect(
        purge(connectionString, { ...target, ...bound(fingerprint, plan.digest) }, barrier)
      ).resolves.toMatchObject({ outcome: 'purged' });
      expect(writerBlocked).toBe(true);
      await writerInsert;

      // The blocked writer resumes after COMMIT and, with no foreign key, can
      // still name the deleted fund. The readback refuses instead of passing it.
      await expect(purge(connectionString, target)).rejects.toThrow(/still name/i);
      await writer.query(`DELETE FROM shares WHERE id = 'race'`);
      await expect(purge(connectionString, target)).resolves.toMatchObject({ outcome: 'readback' });
    } finally {
      await writer.end();
      await observer.end();
    }
  });

  it('serializes competing purges and bounds the wait on a concurrent writer', async () => {
    const { connectionString, fingerprint } = await freshDatabase();
    const { runId, fundId } = await seedCanary(connectionString);
    const target = { runId, fundId: String(fundId) };
    const plan = await purge(connectionString, target);

    const holder = new Client({ connectionString });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM funds WHERE id = $1 FOR UPDATE', [fundId]);
      const startedAt = Date.now();
      await expect(
        purge(connectionString, { ...target, ...bound(fingerprint, plan.digest) })
      ).rejects.toThrow(/lock timeout/i);
      expect(Date.now() - startedAt).toBeLessThan(15_000);
    } finally {
      await holder.query('ROLLBACK');
      await holder.end();
    }
    expect((await snapshot(connectionString)).receipts).toEqual([]);

    const outcomes = await Promise.all([
      purge(connectionString, { ...target, ...bound(fingerprint, plan.digest) }),
      purge(connectionString, { ...target, ...bound(fingerprint, plan.digest) }),
    ]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(['purged', 'replayed']);
    const { outcome: _first, ...firstReceipt } = outcomes[0]!;
    const { outcome: _second, ...secondReceipt } = outcomes[1]!;
    expect(firstReceipt).toEqual(secondReceipt);
    expect((await snapshot(connectionString)).receipts).toHaveLength(1);
  });
});
