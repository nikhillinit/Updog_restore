import path from 'node:path';

export const DB_PUSH_POSTCHECK_SKIP_FLAG = '--skip-postcheck';
export const DEFAULT_OUTPUT_CONTEXT_LIMIT = 16 * 1024;
export const MISSING_DATABASE_URL_MESSAGE =
  'DATABASE_URL is required for db:push postcheck; pass --skip-postcheck only for explicit offline inspection';
export const PROD_DB_PUSH_REFUSAL_MESSAGE =
  'Refusing db:push against the production database; use scripts/reconcile-prod-schema.mjs for operator-gated prod DDL';
export const KNOWN_PRODUCTION_DB_HOST_PREFIXES = ['ep-snowy-boat-ad1z3h07'];

export const UNIQUE_CONSTRAINT_SENTINELS = [
  'investment_rounds_id_fund_uq',
  'investment_round_model_overrides_id_fund_round_uq',
];

export const FOREIGN_KEY_SENTINELS = [
  'investment_rounds_investment_fund_fk',
  'investment_round_model_overrides_round_fund_fk',
  'investment_round_model_overrides_supersedes_lineage_fk',
];

export const INDEX_SENTINELS = [
  'investment_lots_investment_lot_type_idx',
  'investment_lots_investment_idem_key_idx',
  'investment_lots_investment_cursor_idx',
  'forecast_snapshots_fund_time_idx',
  'forecast_snapshots_source_hash_idx',
  'forecast_snapshots_fund_idem_key_idx',
  'forecast_snapshots_fund_cursor_idx',
  'forecast_snapshots_source_hash_unique_idx',
];

export const CONSTRAINT_SENTINEL_QUERY = `
SELECT c.conname
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
  AND c.conname = ANY($1::text[])
`;

export const INDEX_SENTINEL_QUERY = `
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = ANY($1::text[])
`;

const DB_ERROR_PATTERNS = [
  /\b42830\b/i,
  /\bno unique constraint matching given keys\b/i,
  /\bSQLSTATE\b/i,
  /\bPostgresError\b/i,
];

export class DbPushPostcheckError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DbPushPostcheckError';
    this.details = details;
  }
}

export function matchesDbError(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return false;
  }

  return DB_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyDrizzlePushOutput({ status, dbErrorDetected }) {
  const exitStatus = typeof status === 'number' ? status : 1;

  if (exitStatus !== 0) {
    return {
      ok: false,
      reason: 'child-exit',
      message: `drizzle-kit push exited with status ${exitStatus}`,
    };
  }

  if (dbErrorDetected) {
    return {
      ok: false,
      reason: 'database-error',
      message: 'drizzle-kit push output contained a PostgreSQL database error signature',
    };
  }

  return {
    ok: true,
    reason: 'ok',
    message: 'drizzle-kit push completed cleanly',
  };
}

export function buildDrizzleArgs(userArgs) {
  return ['push', ...userArgs.filter((arg) => arg !== DB_PUSH_POSTCHECK_SKIP_FLAG)];
}

export function parseDbPushArgs(userArgs, env = process.env) {
  const skipPostcheck =
    userArgs.includes(DB_PUSH_POSTCHECK_SKIP_FLAG) || env.UPDOG_DB_PUSH_SKIP_POSTCHECK === '1';

  return {
    drizzleArgs: buildDrizzleArgs(userArgs),
    skipPostcheck,
  };
}

export function resolveLocalDrizzleBinary({
  repoRoot = process.cwd(),
  platform = process.platform,
} = {}) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const fileName = platform === 'win32' ? 'drizzle-kit.cmd' : 'drizzle-kit';
  return pathApi.join(repoRoot, 'node_modules', '.bin', fileName);
}

export function resolveLocalDrizzleEntrypoint({
  repoRoot = process.cwd(),
  platform = process.platform,
} = {}) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  return pathApi.join(repoRoot, 'node_modules', 'drizzle-kit', 'bin.cjs');
}

export function buildDrizzleSpawnCommand({
  drizzleArgs,
  nodePath = process.execPath,
  platform = process.platform,
  repoRoot = process.cwd(),
}) {
  return {
    command: nodePath,
    args: [resolveLocalDrizzleEntrypoint({ repoRoot, platform }), ...drizzleArgs],
    localBinary: resolveLocalDrizzleBinary({ repoRoot, platform }),
    localEntrypoint: resolveLocalDrizzleEntrypoint({ repoRoot, platform }),
  };
}

export function buildSentinelChecks() {
  return {
    constraints: [...UNIQUE_CONSTRAINT_SENTINELS, ...FOREIGN_KEY_SENTINELS],
    indexes: [...INDEX_SENTINELS],
  };
}

export function shouldRunPostcheck({ skipPostcheck, databaseUrlPresent }) {
  if (skipPostcheck) {
    return {
      run: false,
      failure: false,
      reason: 'explicit-skip',
      message: 'postcheck skipped by explicit wrapper option',
    };
  }

  if (!databaseUrlPresent) {
    return {
      run: false,
      failure: true,
      reason: 'missing-database-url',
      message: MISSING_DATABASE_URL_MESSAGE,
    };
  }

  return {
    run: true,
    failure: false,
    reason: 'database-url-present',
    message: 'postcheck will verify public-schema sentinels',
  };
}

export function databaseUrlSignature(connectionString) {
  if (!connectionString || connectionString === 'memory://') {
    return null;
  }

  try {
    const url = new URL(connectionString);
    return `${url.protocol}//${url.username}@${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return null;
  }
}

export function shouldRefuseProdDbPush({ databaseUrl, env = process.env } = {}) {
  const signature = databaseUrlSignature(databaseUrl);
  if (!signature) {
    return {
      refuse: false,
      reason: 'no-database-url',
      message: 'no database URL to classify',
    };
  }

  const productionUrlKeys = [
    'UPDOG_PRODUCTION_DATABASE_URL',
    'PRODUCTION_DATABASE_URL',
    'PROD_DATABASE_URL',
  ];
  const productionSignatures = productionUrlKeys
    .map((key) => databaseUrlSignature(env[key]))
    .filter((value) => typeof value === 'string');

  if (productionSignatures.includes(signature)) {
    return {
      refuse: true,
      reason: 'explicit-production-url-match',
      message: PROD_DB_PUSH_REFUSAL_MESSAGE,
    };
  }

  if (env.VERCEL_ENV === 'production') {
    return {
      refuse: true,
      reason: 'vercel-production-env',
      message: PROD_DB_PUSH_REFUSAL_MESSAGE,
    };
  }

  const host = hostFromDatabaseUrl(databaseUrl);
  if (host && KNOWN_PRODUCTION_DB_HOST_PREFIXES.some((prefix) => host.startsWith(prefix))) {
    return {
      refuse: true,
      reason: 'known-production-host',
      message: PROD_DB_PUSH_REFUSAL_MESSAGE,
    };
  }

  return {
    refuse: false,
    reason: 'not-production',
    message: 'database URL is not classified as production',
  };
}

export function appendBoundedOutput(current, chunk, limit = DEFAULT_OUTPUT_CONTEXT_LIMIT) {
  const next = `${current}${chunk}`;
  if (next.length <= limit) {
    return next;
  }

  return next.slice(next.length - limit);
}

function rowNames(rows, fieldName) {
  return new Set(
    rows
      .map((row) => row?.[fieldName])
      .filter((value) => typeof value === 'string' && value.length > 0)
  );
}

export function findMissingSentinels({ sentinels, constraintRows, indexRows }) {
  const presentConstraints = rowNames(constraintRows, 'conname');
  const presentIndexes = rowNames(indexRows, 'indexname');

  return {
    constraints: sentinels.constraints.filter((name) => !presentConstraints.has(name)),
    indexes: sentinels.indexes.filter((name) => !presentIndexes.has(name)),
  };
}

export function formatMissingSentinels(missing) {
  const lines = [];

  if (missing.constraints.length > 0) {
    lines.push(`missing constraints/FKs: ${missing.constraints.join(', ')}`);
  }

  if (missing.indexes.length > 0) {
    lines.push(`missing indexes: ${missing.indexes.join(', ')}`);
  }

  return lines.join('; ');
}

function hasMissingSentinels(missing) {
  return missing.constraints.length > 0 || missing.indexes.length > 0;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function hostFromDatabaseUrl(connectionString) {
  try {
    return new URL(connectionString).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function verifyPostPushSentinels({
  connectionString,
  clientFactory,
  sentinels = buildSentinelChecks(),
}) {
  if (!connectionString) {
    throw new DbPushPostcheckError(
      MISSING_DATABASE_URL_MESSAGE,
      { kind: 'missing-database-url' }
    );
  }

  const client = clientFactory({ connectionString });
  let caughtError;

  try {
    await client.connect();
    const constraintResult = await client.query(CONSTRAINT_SENTINEL_QUERY, [sentinels.constraints]);
    const indexResult = await client.query(INDEX_SENTINEL_QUERY, [sentinels.indexes]);
    const missing = findMissingSentinels({
      sentinels,
      constraintRows: constraintResult.rows,
      indexRows: indexResult.rows,
    });

    if (hasMissingSentinels(missing)) {
      throw new DbPushPostcheckError(
        `db:push postcheck failed; ${formatMissingSentinels(missing)}`,
        {
          kind: 'missing-sentinels',
          missing,
        }
      );
    }
  } catch (error) {
    caughtError = error;
  } finally {
    if (typeof client.end === 'function') {
      try {
        await client.end();
      } catch (error) {
        caughtError ??= error;
      }
    }
  }

  if (caughtError) {
    if (caughtError instanceof DbPushPostcheckError) {
      throw caughtError;
    }

    throw new DbPushPostcheckError(
      `db:push postcheck could not connect or query public-schema sentinels: ${errorMessage(
        caughtError
      )}`,
      {
        kind: 'postcheck-query-failed',
        cause: caughtError,
      }
    );
  }

  return {
    ok: true,
    checked: {
      constraints: sentinels.constraints.length,
      indexes: sentinels.indexes.length,
    },
  };
}
