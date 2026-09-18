import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActualsDraftSaveRequestV1 } from '../../shared/contracts/lp-reporting/actuals-draft.contract';
import type {
  PublishConnection,
  PublishQueryResult,
} from '../../server/services/lp-reporting/actuals-pilot-publish-service';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

type Service = typeof import('../../server/services/lp-reporting/actuals-draft-service');
type Intercept = (
  sql: string,
  next: () => Promise<PublishQueryResult>
) => Promise<PublishQueryResult>;
let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer;
let admin: Pool;
let service: Service;
let modulePool: { end?: () => Promise<void> };
let access: { fundId: number; actorId: number };
const originalEnv = {
  DATABASE_URL: process.env['DATABASE_URL'],
  NEON_DATABASE_URL: process.env['NEON_DATABASE_URL'],
  USE_REAL_DB_IN_VITEST: process.env['USE_REAL_DB_IN_VITEST'],
};
const runDocker =
  process.env['RUN_DOCKER_ACTUALS_DRAFTS'] === '1' ||
  ['1', 'true'].includes(process.env['CI'] ?? '');
const requestBody = (payload = 'amount,date\nunknown,missing\n'): ActualsDraftSaveRequestV1 => ({
  contractVersion: 'actuals-draft-save/1.0.0',
  classification: 'provisional',
  asOfDate: null,
  sourceNote: 'Synthetic owner estimate; canonical terms are unknown.',
  correctionReason: 'Initial entry.',
  ledger: {
    templateVersion: 'actuals-ledger/1.0.0',
    fileName: 'owner.csv',
    payload: Buffer.from(payload).toString('base64'),
  },
  valuation: null,
});
const command = (
  request = requestBody(),
  ifMatch = service.actualsDraftETag(access.fundId, null)
) => ({
  ...access,
  idempotencyKey: randomUUID(),
  ifMatch,
  request,
});
const connect = (intercept?: Intercept) => async (): Promise<PublishConnection> => {
  const client = await admin.connect();
  return {
    async query<Row>(sql: string, values?: readonly unknown[]) {
      const next = () => client.query(sql, values ? [...values] : undefined);
      const result = intercept ? await intercept(sql, next) : await next();
      return { rows: result.rows as Row[] };
    },
    release(destroy?: boolean) {
      client.release(destroy);
    },
  };
};
const options = () => ({ connect: connect() });
async function seed() {
  const fund = await admin.query<{
    id: number;
  }>(`INSERT INTO funds (name,size,management_fee,carry_percentage,vintage_year,status,is_active,base_currency,data_origin)
    VALUES ('Synthetic draft fund',1000000,0.02,0.2,2026,'active',true,'USD','production') RETURNING id`);
  const actor = await admin.query<{
    id: number;
  }>(`INSERT INTO users (username,password,role,is_active,is_release_canary_principal)
    VALUES ('draft-admin','x','admin',true,false) RETURNING id`);
  access = { fundId: fund.rows[0]!.id, actorId: actor.rows[0]!.id };
  await admin.query('INSERT INTO user_fund_grants (user_id,fund_id) VALUES ($1,$2)', [
    access.actorId,
    access.fundId,
  ]);
}
async function canonicalCounts() {
  const result: Record<string, string> = {};
  for (const table of [
    'cash_flow_events',
    'valuation_marks',
    'financial_facts_snapshots',
    'source_observations',
    'import_batches',
  ]) {
    result[table] = (
      await admin.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`)
    ).rows[0]!.count;
  }
  return result;
}
async function draftCounts() {
  return (
    await admin.query(
      'SELECT (SELECT count(*)::int FROM source_artifacts) AS artifacts, (SELECT count(*)::int FROM actuals_draft_revisions) AS revisions'
    )
  ).rows[0];
}

describe.skipIf(!runDocker)('actuals draft revisions PostgreSQL', { retry: 0 }, () => {
  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('draft_revisions')
      .start();
    const url = container.getConnectionUri();
    admin = new Pool({ connectionString: url, max: 8 });
    await runMigrationsWithConnectionString(url, '0055_current_forecast_recompute_commands');
    Object.assign(process.env, { DATABASE_URL: url, USE_REAL_DB_IN_VITEST: '1' });
    delete process.env['NEON_DATABASE_URL'];
    vi.resetModules();
    service = await import('../../server/services/lp-reporting/actuals-draft-service');
    modulePool = (await import('../../server/db')).pool;
    await seed();
    expect(
      (await admin.query("SELECT to_regclass('public.actuals_draft_revisions') AS relation"))
        .rows[0].relation
    ).toBeNull();
    await expect(service.saveActualsDraftRevision(command(), options())).rejects.toMatchObject({
      code: '42P01',
    });
    expect(
      (await admin.query('SELECT count(*)::int AS count FROM source_artifacts')).rows[0].count
    ).toBe(0);
    console.warn('Original 0055 schema cannot save drafts: 42P01, zero artifacts.');
    await runMigrationsWithConnectionString(url, '0056_actuals_draft_revisions');
  }, 120_000);
  afterAll(async () => {
    await modulePool?.end?.();
    await admin?.end();
    await container?.stop();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }, 120_000);
  beforeEach(async () => {
    await admin.query('TRUNCATE funds, users RESTART IDENTITY CASCADE');
    await seed();
  });

  it('preserves two corrections, immutable original bytes, provenance, and all canonical tables', async () => {
    const before = await canonicalCounts();
    const initialCommand = command();
    const first = await service.saveActualsDraftRevision(initialCommand, options());
    const original = await service.getActualsDraftRevision({ ...access, revision: 1 }, options());
    const corrected = requestBody('amount,date\n125000,unknown\n');
    corrected.correctionReason = 'Corrected owner amount; date still provisional.';
    const second = await service.saveActualsDraftRevision(
      command(corrected, first.revision.etag),
      options()
    );
    const final = {
      ...corrected,
      classification: 'synthetic' as const,
      asOfDate: '2026-03-31',
      correctionReason: 'Corrected cutoff for synthetic readiness test.',
    };
    const third = await service.saveActualsDraftRevision(
      command(final, second.revision.etag),
      options()
    );
    expect([first.revision.revision, second.revision.revision, third.revision.revision]).toEqual([
      1, 2, 3,
    ]);
    expect(second.revision).toMatchObject({
      priorRevision: 1,
      priorRevisionHash: first.revision.revisionHash,
      correctionReason: corrected.correctionReason,
      createdBy: access.actorId,
    });
    expect(second.revision.ledger.payloadSha256).not.toBe(first.revision.ledger.payloadSha256);
    expect(third.revision.revisionHash).not.toBe(second.revision.revisionHash);
    expect(await service.getActualsDraftRevision({ ...access, revision: 1 }, options())).toEqual(
      original
    );
    expect(original.ledger.payload).toBe(initialCommand.request.ledger.payload);
    expect(original.ledger.payloadAvailable).toBe(true);
    expect(await canonicalCounts()).toEqual(before);
    const replay = await service.saveActualsDraftRevision(initialCommand, options());
    expect(replay).toEqual({ ...first, replayed: true });
    const history = await service.listActualsDraftRevisions(access, options());
    expect(history.head?.revision).toBe(3);
    expect(history.revisions.map(({ revision }) => revision)).toEqual([3, 2, 1]);
    expect(JSON.stringify(history)).not.toContain(initialCommand.request.ledger.payload);
    const restored = await service.saveActualsDraftRevision(
      command(
        {
          ...initialCommand.request,
          correctionReason: 'Restore initial source as a new revision.',
        },
        third.revision.etag
      ),
      options()
    );
    expect(restored.revision.revision).toBe(4);
    expect(restored.revision.ledger.payloadSha256).toBe(first.revision.ledger.payloadSha256);
    expect(restored.revision.priorRevisionHash).toBe(third.revision.revisionHash);
  });

  it('serializes competing saves and retains exact old-key replay ahead of head checks', async () => {
    const firstCommand = command();
    const duplicated = await Promise.all([
      service.saveActualsDraftRevision(firstCommand, options()),
      service.saveActualsDraftRevision(firstCommand, options()),
    ]);
    expect(duplicated.map(({ replayed }) => replayed).sort()).toEqual([false, true]);
    const head = duplicated[0]!.revision.etag;
    const contenders = await Promise.allSettled([
      service.saveActualsDraftRevision(command(requestBody('second'), head), options()),
      service.saveActualsDraftRevision(command(requestBody('third'), head), options()),
    ]);
    expect(contenders.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = contenders.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
      statusCode: 412,
      code: 'DRAFT_PRECONDITION_FAILED',
    });
    await expect(
      service.saveActualsDraftRevision(
        { ...firstCommand, request: requestBody('changed') },
        options()
      )
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.saveActualsDraftRevision({ ...firstCommand, ifMatch: head }, options())
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await draftCounts()).toEqual({ artifacts: 2, revisions: 2 });
  });

  it('rechecks actor and fund grant before replay and readback, with zero writes', async () => {
    const savedCommand = command();
    await service.saveActualsDraftRevision(savedCommand, options());
    const before = await draftCounts();
    const otherActor = (
      await admin.query<{ id: number }>(
        "INSERT INTO users (username,password,role,is_active) VALUES ('other-admin','x','admin',true) RETURNING id"
      )
    ).rows[0]!.id;
    await admin.query('INSERT INTO user_fund_grants (user_id,fund_id) VALUES ($1,$2)', [
      otherActor,
      access.fundId,
    ]);
    await expect(
      service.saveActualsDraftRevision({ ...savedCommand, actorId: otherActor }, options())
    ).rejects.toMatchObject({ statusCode: 409 });
    await admin.query('DELETE FROM user_fund_grants WHERE user_id=$1', [access.actorId]);
    await expect(service.saveActualsDraftRevision(savedCommand, options())).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.listActualsDraftRevisions(access, options())).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.getActualsDraftRevision({ ...access, revision: 1 }, options())
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await draftCounts()).toEqual(before);
  });

  it('rolls back both files on a later failure and retries only aborted transactions', async () => {
    const body = {
      ...requestBody(),
      valuation: {
        templateVersion: 'actuals-valuation/1.0.0' as const,
        fileName: 'marks.csv',
        payload: Buffer.from('incomplete').toString('base64'),
      },
    };
    let artifacts = 0;
    await expect(
      service.saveActualsDraftRevision(command(body), {
        connect: connect(async (sql, next) => {
          if (sql.includes('INSERT INTO source_artifacts') && ++artifacts === 2)
            throw Object.assign(new Error('injected constraint failure'), { code: '23514' });
          return next();
        }),
      })
    ).rejects.toMatchObject({ code: '23514' });
    expect(await draftCounts()).toEqual({ artifacts: 0, revisions: 0 });
    let attempts = 0;
    const saved = await service.saveActualsDraftRevision(command(body), {
      connect: connect(async (sql, next) => {
        if (sql.includes('INSERT INTO actuals_draft_revisions') && attempts++ === 0)
          throw Object.assign(new Error('serialization'), { code: '40001' });
        return next();
      }),
    });
    expect(saved.revision.revision).toBe(1);
    expect(attempts).toBe(2);
    expect(await draftCounts()).toEqual({ artifacts: 2, revisions: 1 });
  });

  it.each(['ECONNRESET', '08006', '57P01'])(
    'retains the same command after ambiguous COMMIT %s and resolves exact retry',
    async (code) => {
      const savedCommand = command();
      let lost = false;
      await expect(
        service.saveActualsDraftRevision(savedCommand, {
          connect: connect(async (sql, next) => {
            const result = await next();
            if (sql === 'COMMIT' && !lost) {
              lost = true;
              throw Object.assign(new Error('ack lost'), { code });
            }
            return result;
          }),
        })
      ).rejects.toMatchObject({ statusCode: 503, code: 'DRAFT_OUTCOME_UNKNOWN' });
      const recovered = await service.saveActualsDraftRevision(savedCommand, options());
      expect(recovered.replayed).toBe(true);
      expect(recovered.revision.revision).toBe(1);
      expect(await draftCounts()).toEqual({ artifacts: 1, revisions: 1 });
    }
  );

  it.each([
    { column: 'is_active', value: false, statusCode: 404 },
    { column: 'is_release_canary_principal', value: true, statusCode: 404 },
    { column: 'role', value: 'viewer', statusCode: 403 },
    { column: 'role', value: 'service', statusCode: 404 },
  ])(
    'rechecks actor eligibility before replay and readback: $column=$value',
    async ({ column, value, statusCode }) => {
      const savedCommand = command();
      await service.saveActualsDraftRevision(savedCommand, options());
      await admin.query(`UPDATE users SET ${column} = $1 WHERE id = $2`, [value, access.actorId]);
      for (const operation of [
        () => service.saveActualsDraftRevision(savedCommand, options()),
        () => service.listActualsDraftRevisions(access, options()),
        () => service.getActualsDraftRevision({ ...access, revision: 1 }, options()),
      ]) {
        await expect(operation()).rejects.toMatchObject({ statusCode });
      }
      expect(await draftCounts()).toEqual({ artifacts: 1, revisions: 1 });
    }
  );

  it('rejects request context actor and fund mismatches before opening a transaction', async () => {
    const openConnection = vi.fn(connect());
    const context = {
      userId: String(access.actorId),
      orgId: 'test',
      fundId: String(access.fundId),
      email: 'draft@example.com',
      role: 'admin',
    };
    for (const mismatch of [
      { ...context, userId: String(access.actorId + 1) },
      { ...context, fundId: String(access.fundId + 1) },
    ]) {
      await expect(
        service.saveActualsDraftRevision(
          { ...command(), context: mismatch },
          { connect: openConnection }
        )
      ).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(openConnection).not.toHaveBeenCalled();
    expect(await draftCounts()).toEqual({ artifacts: 0, revisions: 0 });
  });

  it('uses the production pooled connection adapter with authenticated request context', async () => {
    const context = {
      userId: String(access.actorId),
      orgId: 'test',
      fundId: String(access.fundId),
      email: 'draft@example.com',
      role: 'admin',
    };
    const saved = await service.saveActualsDraftRevision({ ...command(), context });
    expect(saved.revision.revision).toBe(1);
    expect((await service.listActualsDraftRevisions({ ...access, context })).head?.revision).toBe(
      1
    );
    expect(
      (await service.getActualsDraftRevision({ ...access, context, revision: 1 })).ledger
        .payloadAvailable
    ).toBe(true);
    expect(await draftCounts()).toEqual({ artifacts: 1, revisions: 1 });
  });

  it('denies expired byte readback and purges only bytes while history and digests survive', async () => {
    const saved = await service.saveActualsDraftRevision(command(), options());
    const expired = new Date(new Date(saved.revision.ledger.purgeAfter).getTime() + 1);
    const unrelated = await admin.query<{ id: number }>(
      `INSERT INTO source_artifacts (fund_id, source_type, file_name, media_type, byte_count,
        payload_sha256, payload, purge_after, created_by, idempotency_key, request_hash)
       SELECT fund_id, source_type, file_name, media_type, byte_count, payload_sha256,
         payload, purge_after, created_by, $1, request_hash
       FROM source_artifacts WHERE id = $2 RETURNING id`,
      [`ad1:${randomUUID()}:ledger`, saved.revision.ledger.sourceArtifactId]
    );
    const before = await service.listActualsDraftRevisions(access, options());
    const detail = await service.getActualsDraftRevision(
      { ...access, revision: 1 },
      { ...options(), now: () => expired }
    );
    expect(detail.ledger).toEqual({ payload: null, payloadAvailable: false });
    const retention =
      await import('../../server/services/financial-observations/artifact-retention-service');
    await retention.runRetentionSweep(expired, (await import('../../server/db')).db);
    expect(
      (
        await admin.query('SELECT payload,purged_at FROM source_artifacts WHERE id = $1', [
          saved.revision.ledger.sourceArtifactId,
        ])
      ).rows[0]
    ).toMatchObject({ payload: null, purged_at: expect.any(Date) });
    expect(
      (
        await admin.query('SELECT payload,purged_at FROM source_artifacts WHERE id = $1', [
          unrelated.rows[0]!.id,
        ])
      ).rows[0]
    ).toMatchObject({ payload: expect.any(Buffer), purged_at: null });
    expect(await service.listActualsDraftRevisions(access, options())).toEqual(before);
    expect(
      (await service.getActualsDraftRevision({ ...access, revision: 1 }, options())).ledger
        .payloadAvailable
    ).toBe(false);
  });

  it('enforces immutable revisions and same-fund artifact foreign keys', async () => {
    await service.saveActualsDraftRevision(command(), options());
    await expect(
      admin.query(
        `INSERT INTO actuals_draft_revisions
         SELECT (jsonb_populate_record(NULL::actuals_draft_revisions,
           to_jsonb(existing) || jsonb_build_object(
             'revision', 2, 'prior_revision', NULL,
             'prior_revision_hash', revision_hash, 'idempotency_key', $1::text
           ))).*
         FROM actuals_draft_revisions existing WHERE revision = 1`,
        [randomUUID()]
      )
    ).rejects.toMatchObject({ code: '23514', constraint: 'actuals_draft_revisions_prior_check' });
    await expect(
      admin.query('UPDATE actuals_draft_revisions SET source_note = $1', ['rewritten'])
    ).rejects.toMatchObject({ code: '23514' });
    await expect(admin.query('DELETE FROM actuals_draft_revisions')).rejects.toMatchObject({
      code: '23514',
    });
    const otherFund = (
      await admin.query<{ id: number }>(
        "INSERT INTO funds (name,size,management_fee,carry_percentage,vintage_year,status,is_active,base_currency,data_origin) VALUES ('Other',1,0,0,2026,'active',true,'USD','production') RETURNING id"
      )
    ).rows[0]!.id;
    await expect(
      admin.query('UPDATE source_artifacts SET fund_id=$1', [otherFund])
    ).rejects.toMatchObject({ code: '23503' });
    expect(await draftCounts()).toEqual({ artifacts: 1, revisions: 1 });
  });

  it('pages newest twenty revisions with a separate current head and refuses bad cursors', async () => {
    let etag = service.actualsDraftETag(access.fundId, null);
    for (let index = 0; index < 21; index += 1) {
      etag = (
        await service.saveActualsDraftRevision(command(requestBody(String(index)), etag), options())
      ).revision.etag;
    }
    const first = await service.listActualsDraftRevisions(access, options());
    expect(first.revisions).toHaveLength(20);
    expect(first.nextBeforeRevision).toBe(2);
    const next = await service.listActualsDraftRevisions(
      { ...access, beforeRevision: first.nextBeforeRevision! },
      options()
    );
    expect(next.revisions.map(({ revision }) => revision)).toEqual([1]);
    expect(next.head).toEqual(first.head);
    expect(next.nextBeforeRevision).toBeNull();
    await expect(
      service.listActualsDraftRevisions({ ...access, beforeRevision: 0 }, options())
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
