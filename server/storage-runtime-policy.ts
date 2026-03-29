export type StorageBootMode = 'test-mock-db' | 'database' | 'explicit-memory' | 'missing-config';

function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export function hasConfiguredDatabaseUrl(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env['DATABASE_URL'] || env['NEON_DATABASE_URL']);
}

export function isTestMockDatabaseMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const isVitest = env['VITEST'] === 'true';
  const isTest = env['NODE_ENV'] === 'test' || isVitest;
  const useRealDbInVitest = env['USE_REAL_DB_IN_VITEST'] === '1';
  return isTest && !useRealDbInVitest;
}

export function isExplicitMemoryStorageEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = env['NODE_ENV'] ?? '';
  return isTruthyFlag(env['ALLOW_MEMORY_STORAGE']) && !['production', 'staging'].includes(nodeEnv);
}

export function resolveStorageBootMode(env: NodeJS.ProcessEnv = process.env): StorageBootMode {
  if (isTestMockDatabaseMode(env)) {
    return 'test-mock-db';
  }

  if (isExplicitMemoryStorageEnabled(env)) {
    return 'explicit-memory';
  }

  if (hasConfiguredDatabaseUrl(env)) {
    return 'database';
  }

  return 'missing-config';
}

export function getStorageConfigurationError(
  env: NodeJS.ProcessEnv = process.env
): string {
  return [
    'Database-backed server boot requires DATABASE_URL or NEON_DATABASE_URL.',
    env['NODE_ENV'] === 'development'
      ? 'For explicit development memory mode, set ALLOW_MEMORY_STORAGE=1.'
      : 'Memory storage is only allowed in test mode or explicit development memory mode.',
  ].join(' ');
}
