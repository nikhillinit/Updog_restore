import { describe, expect, it } from 'vitest';

import {
  CONSTRAINT_SENTINEL_QUERY,
  DB_PUSH_POSTCHECK_SKIP_FLAG,
  INDEX_SENTINEL_QUERY,
  MISSING_DATABASE_URL_MESSAGE,
  PROD_DB_PUSH_REFUSAL_MESSAGE,
  appendBoundedOutput,
  buildDrizzleArgs,
  buildDrizzleSpawnCommand,
  buildSentinelChecks,
  classifyDrizzlePushOutput,
  findMissingSentinels,
  matchesDbError,
  parseDbPushArgs,
  pgIdentifier,
  resolveLocalDrizzleBinary,
  resolveLocalDrizzleEntrypoint,
  shouldRefuseProdDbPush,
  shouldRunPostcheck,
  verifyPostPushSentinels,
} from '../../../scripts/db-push-core.mjs';

const connectionString = 'postgres://user:pass@localhost:5432/updog_test';

function allConstraintRows() {
  return buildSentinelChecks().constraints.map((conname) => ({ conname }));
}

function allIndexRows() {
  return buildSentinelChecks().indexes.map((indexname) => ({ indexname }));
}

function createMockClient({ constraintRows = allConstraintRows(), indexRows = allIndexRows() } = {}) {
  const queries = [];
  const client = {
    async connect() {},
    async query(queryText, params) {
      queries.push({ queryText, params });
      if (queryText === CONSTRAINT_SENTINEL_QUERY) {
        return { rows: constraintRows };
      }
      if (queryText === INDEX_SENTINEL_QUERY) {
        return { rows: indexRows };
      }
      throw new Error(`Unexpected query: ${queryText}`);
    },
    async end() {},
  };

  return { client, queries };
}

async function verifyWithMockClient(mockClient) {
  return verifyPostPushSentinels({
    connectionString,
    clientFactory: () => mockClient.client,
  });
}

async function expectPostcheckMissing(mockClient, expectedNames) {
  let rejection;

  try {
    await verifyWithMockClient(mockClient);
  } catch (error) {
    rejection = error;
  }

  expect(rejection).toBeInstanceOf(Error);
  const message = rejection instanceof Error ? rejection.message : '';
  for (const expectedName of expectedNames) {
    expect(message).toContain(expectedName);
  }
}

describe('db-push output classification', () => {
  it('fails false-success 42830 output', () => {
    expect(matchesDbError("error: code: '42830'")).toBe(true);
    expect(matchesDbError('no unique constraint matching given keys')).toBe(true);

    const result = classifyDrizzlePushOutput({
      status: 0,
      dbErrorDetected: true,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'database-error',
    });
    expect(result.message).toContain('PostgreSQL database error');
  });

  it('fails SQLSTATE and PostgresError output', () => {
    expect(matchesDbError('SQLSTATE 42830')).toBe(true);
    expect(matchesDbError('PostgresError: constraint lookup failed')).toBe(true);
  });

  it('does not fail benign warnings', () => {
    expect(matchesDbError('Warning: using experimental drizzle-kit feature')).toBe(false);
    expect(
      classifyDrizzlePushOutput({
        status: 0,
        dbErrorDetected: false,
      })
    ).toMatchObject({ ok: true });
  });

  it('does not fail unrelated error text', () => {
    expect(matchesDbError('note: previous error: count was already reported')).toBe(false);
  });

  it('fails child nonzero status', () => {
    expect(
      classifyDrizzlePushOutput({
        status: 1,
        dbErrorDetected: false,
      })
    ).toMatchObject({
      ok: false,
      reason: 'child-exit',
    });
  });

  it('keeps early DB-error detection sticky outside the bounded output buffer', () => {
    let outputContext = '';
    let dbErrorDetected = false;

    for (const chunk of ["error: code: '42830'", 'x'.repeat(128)]) {
      dbErrorDetected ||= matchesDbError(chunk);
      outputContext = appendBoundedOutput(outputContext, chunk, 32);
    }

    expect(outputContext).not.toContain('42830');
    expect(dbErrorDetected).toBe(true);
    expect(
      classifyDrizzlePushOutput({
        status: 0,
        dbErrorDetected,
      })
    ).toMatchObject({
      ok: false,
      reason: 'database-error',
    });
  });
});

describe('db-push argument and binary helpers', () => {
  it('forwards Drizzle args and strips wrapper-only flags', () => {
    expect(buildDrizzleArgs(['--force'])).toEqual(['push', '--force']);
    expect(buildDrizzleArgs([DB_PUSH_POSTCHECK_SKIP_FLAG, '--force'])).toEqual([
      'push',
      '--force',
    ]);
  });

  it('parses postcheck skip without dropping child classification args', () => {
    expect(
      parseDbPushArgs([DB_PUSH_POSTCHECK_SKIP_FLAG, '--force'], {
        UPDOG_DB_PUSH_SKIP_POSTCHECK: '0',
      })
    ).toEqual({
      drizzleArgs: ['push', '--force'],
      skipPostcheck: true,
    });

    expect(
      parseDbPushArgs(['--force'], {
        UPDOG_DB_PUSH_SKIP_POSTCHECK: '1',
      })
    ).toEqual({
      drizzleArgs: ['push', '--force'],
      skipPostcheck: true,
    });
  });

  it('resolves the repository-local Drizzle binary without npx', () => {
    expect(
      resolveLocalDrizzleBinary({
        repoRoot: 'C:\\dev\\Updog_restore',
        platform: 'win32',
      })
    ).toBe('C:\\dev\\Updog_restore\\node_modules\\.bin\\drizzle-kit.cmd');

    expect(
      resolveLocalDrizzleBinary({
        repoRoot: '/repo',
        platform: 'linux',
      })
    ).toBe('/repo/node_modules/.bin/drizzle-kit');
  });

  it('builds a Windows-safe local Drizzle spawn command', () => {
    const spawnCommand = buildDrizzleSpawnCommand({
      drizzleArgs: ['push', '--force'],
      nodePath: 'C:\\Program Files\\nodejs\\node.exe',
      repoRoot: 'C:\\dev\\Updog_restore',
      platform: 'win32',
    });

    expect(spawnCommand.command).toBe('C:\\Program Files\\nodejs\\node.exe');
    expect(spawnCommand.localBinary).toBe(
      'C:\\dev\\Updog_restore\\node_modules\\.bin\\drizzle-kit.cmd'
    );
    expect(spawnCommand.localEntrypoint).toBe(
      'C:\\dev\\Updog_restore\\node_modules\\drizzle-kit\\bin.cjs'
    );
    expect(spawnCommand.args).toEqual([
      'C:\\dev\\Updog_restore\\node_modules\\drizzle-kit\\bin.cjs',
      'push',
      '--force',
    ]);
    expect(spawnCommand.command).not.toContain('npx');
    expect(spawnCommand.args.join(' ')).not.toContain('drizzle-kit.cmd');
  });

  it('resolves the local package entrypoint used for direct Node spawning', () => {
    expect(
      resolveLocalDrizzleEntrypoint({
        repoRoot: '/repo',
        platform: 'linux',
      })
    ).toBe('/repo/node_modules/drizzle-kit/bin.cjs');
  });
});

describe('db-push postcheck decisions', () => {
  it('fails closed when DATABASE_URL is missing by default', () => {
    expect(
      shouldRunPostcheck({
        skipPostcheck: false,
        databaseUrlPresent: false,
      })
    ).toMatchObject({
      run: false,
      failure: true,
      reason: 'missing-database-url',
    });
    expect(
      shouldRunPostcheck({
        skipPostcheck: false,
        databaseUrlPresent: false,
      }).message
    ).toBe(MISSING_DATABASE_URL_MESSAGE);
  });

  it('allows explicit postcheck skip only after clean child classification', () => {
    expect(
      shouldRunPostcheck({
        skipPostcheck: true,
        databaseUrlPresent: false,
      })
    ).toMatchObject({
      run: false,
      failure: false,
      reason: 'explicit-skip',
    });

    expect(
      classifyDrizzlePushOutput({
        status: 0,
        dbErrorDetected: true,
      })
    ).toMatchObject({
      ok: false,
      reason: 'database-error',
    });
  });
});

describe('db-push production URL guard', () => {
  it('refuses an explicit production database URL match without comparing secrets', () => {
    const prodUrl = 'postgres://user:secret@prod.example.com:5432/updog?sslmode=require';
    const sameTargetDifferentSecret =
      'postgres://user:different@prod.example.com:5432/updog?sslmode=require';

    expect(
      shouldRefuseProdDbPush({
        databaseUrl: sameTargetDifferentSecret,
        env: { UPDOG_PRODUCTION_DATABASE_URL: prodUrl },
      })
    ).toMatchObject({
      refuse: true,
      reason: 'explicit-production-url-match',
      message: PROD_DB_PUSH_REFUSAL_MESSAGE,
    });
  });

  it('refuses the known Neon production host from the drift handoff', () => {
    expect(
      shouldRefuseProdDbPush({
        databaseUrl:
          'postgres://user:secret@ep-snowy-boat-ad1z3h07-pooler.us-east-1.aws.neon.tech/updog',
        env: {},
      })
    ).toMatchObject({
      refuse: true,
      reason: 'known-production-host',
    });
  });

  it('refuses Vercel production environments', () => {
    expect(
      shouldRefuseProdDbPush({
        databaseUrl: 'postgres://user:secret@db.example.com/updog',
        env: { VERCEL_ENV: 'production' },
      })
    ).toMatchObject({
      refuse: true,
      reason: 'vercel-production-env',
    });
  });
});

describe('db-push sentinel postcheck', () => {
  it('normalizes PostgreSQL identifiers to the 63-byte stored form', () => {
    expect(pgIdentifier('a'.repeat(75))).toHaveLength(63);
    expect(pgIdentifier('short')).toBe('short');
  });

  it('passes when all public-schema sentinels are present', async () => {
    const mockClient = createMockClient();

    await expect(verifyWithMockClient(mockClient)).resolves.toMatchObject({
      ok: true,
      checked: {
        constraints: 5,
        indexes: 8,
      },
    });
    expect(mockClient.queries).toHaveLength(2);
  });

  it('uses two batched public-schema catalog queries', async () => {
    const mockClient = createMockClient();

    await verifyWithMockClient(mockClient);

    expect(mockClient.queries[0].queryText).toContain("n.nspname = 'public'");
    expect(mockClient.queries[0].queryText).toContain('c.conname = ANY($1::text[])');
    expect(mockClient.queries[0].params[0]).toHaveLength(5);
    expect(mockClient.queries[1].queryText).toContain("schemaname = 'public'");
    expect(mockClient.queries[1].queryText).toContain('indexname = ANY($1::text[])');
    expect(mockClient.queries[1].params[0]).toHaveLength(8);
  });

  it('fails missing unique constraint sentinels with names', async () => {
    const missing = [
      'investment_rounds_id_fund_uq',
      'investment_round_model_overrides_id_fund_round_uq',
    ];
    const mockClient = createMockClient({
      constraintRows: allConstraintRows().filter((row) => !missing.includes(row.conname)),
    });

    await expectPostcheckMissing(mockClient, missing);
  });

  it('fails missing foreign-key sentinels with names', async () => {
    const missing = [
      'investment_rounds_investment_fund_fk',
      'investment_round_model_overrides_round_fund_fk',
      'investment_round_model_overrides_supersedes_lineage_fk',
    ];
    const mockClient = createMockClient({
      constraintRows: allConstraintRows().filter((row) => !missing.includes(row.conname)),
    });

    await expectPostcheckMissing(mockClient, missing);
  });

  it('fails missing index sentinels with names', async () => {
    const missing = [
      'investment_lots_investment_lot_type_idx',
      'forecast_snapshots_source_hash_unique_idx',
    ];
    const mockClient = createMockClient({
      indexRows: allIndexRows().filter((row) => !missing.includes(row.indexname)),
    });

    await expectPostcheckMissing(mockClient, missing);
  });

  it('does not satisfy sentinels with same-named non-public objects', () => {
    const sentinels = buildSentinelChecks();
    const missing = findMissingSentinels({
      sentinels,
      constraintRows: [],
      indexRows: [],
    });

    expect(CONSTRAINT_SENTINEL_QUERY).toContain("n.nspname = 'public'");
    expect(INDEX_SENTINEL_QUERY).toContain("schemaname = 'public'");
    expect(missing.constraints).toEqual(sentinels.constraints);
    expect(missing.indexes).toEqual(sentinels.indexes);
  });

  it('treats a truncated PostgreSQL constraint name as present', () => {
    const longConstraintName = 'a'.repeat(75);
    const missing = findMissingSentinels({
      sentinels: {
        constraints: [longConstraintName],
        indexes: [],
      },
      constraintRows: [{ conname: longConstraintName.slice(0, 63) }],
      indexRows: [],
    });

    expect(missing.constraints).toEqual([]);
  });

  it('fails closed when DATABASE_URL is set but the database is unreachable', async () => {
    const client = {
      async connect() {
        throw new Error('ECONNREFUSED');
      },
      async query() {
        throw new Error('query should not run');
      },
      async end() {},
    };

    await expect(
      verifyPostPushSentinels({
        connectionString,
        clientFactory: () => client,
      })
    ).rejects.toThrow(/could not connect or query.*ECONNREFUSED/);
  });

  it('imports core helpers without running CLI work', async () => {
    const imported = await import('../../../scripts/db-push-core.mjs');

    expect(imported.buildDrizzleArgs(['--force'])).toEqual(['push', '--force']);
  });
});
