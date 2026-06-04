export type StorageBootMode = 'test-mock-db' | 'database' | 'explicit-memory' | 'missing-config';

export const PROFESSIONAL_DEMO_RUNTIME_MODE = 'professional-demo-local-postgres';
export const PROFESSIONAL_DEMO_DEFAULT_PORT = '5000';
export const PROFESSIONAL_DEMO_DEFAULT_BASE_URL = `http://localhost:${PROFESSIONAL_DEMO_DEFAULT_PORT}`;

export interface ProfessionalDemoRuntimeOptions {
  requireApiTarget?: boolean;
}

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

export function getStorageConfigurationError(env: NodeJS.ProcessEnv = process.env): string {
  return [
    'Database-backed server boot requires DATABASE_URL or NEON_DATABASE_URL.',
    env['NODE_ENV'] === 'development'
      ? 'For explicit development memory mode, set ALLOW_MEMORY_STORAGE=1.'
      : 'Memory storage is only allowed in test mode or explicit development memory mode.',
  ].join(' ');
}

function databaseUrlFor(env: NodeJS.ProcessEnv): string | undefined {
  return env['DATABASE_URL'] || env['NEON_DATABASE_URL'];
}

function isMockOrMemoryDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  return value === 'memory://' || value.toLowerCase().includes('mock');
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function getProfessionalDemoRuntimeConfigurationError(
  env: NodeJS.ProcessEnv = process.env,
  options: ProfessionalDemoRuntimeOptions = {}
): string | null {
  const runtimeMode = env['PROFESSIONAL_DEMO_MODE'];
  if (runtimeMode === undefined || runtimeMode === '') {
    return null;
  }

  if (runtimeMode !== PROFESSIONAL_DEMO_RUNTIME_MODE) {
    return `PROFESSIONAL_DEMO_MODE must be ${PROFESSIONAL_DEMO_RUNTIME_MODE}.`;
  }

  if (isTruthyFlag(env['ALLOW_MEMORY_STORAGE'])) {
    return 'Professional demo mode requires ALLOW_MEMORY_STORAGE=0.';
  }

  const databaseUrl = databaseUrlFor(env);
  if (!databaseUrl || isMockOrMemoryDatabaseUrl(databaseUrl)) {
    return 'Professional demo mode requires DATABASE_URL or NEON_DATABASE_URL to point at persistent Postgres.';
  }

  if (resolveStorageBootMode(env) !== 'database') {
    return 'Professional demo mode must resolve to database storage.';
  }

  if (options.requireApiTarget === true) {
    const baseUrl = env['BASE_URL'];
    const port = env['PORT'];
    const clientUrl = env['CLIENT_URL'];
    const viteApiBaseUrl = env['VITE_API_BASE_URL'];
    if (!baseUrl) {
      return 'Professional demo API verification requires BASE_URL.';
    }
    const parsedBaseUrl = parseUrl(baseUrl);
    if (parsedBaseUrl === null) {
      return 'Professional demo BASE_URL must be a valid URL.';
    }
    if (
      parsedBaseUrl.pathname !== '/' ||
      parsedBaseUrl.search.length > 0 ||
      parsedBaseUrl.hash.length > 0
    ) {
      return 'Professional demo BASE_URL must not include a path, query, or fragment.';
    }
    if (parsedBaseUrl.origin !== PROFESSIONAL_DEMO_DEFAULT_BASE_URL) {
      return `Professional demo BASE_URL must be ${PROFESSIONAL_DEMO_DEFAULT_BASE_URL}.`;
    }
    if (port !== undefined && port !== PROFESSIONAL_DEMO_DEFAULT_PORT) {
      return `Professional demo PORT must be ${PROFESSIONAL_DEMO_DEFAULT_PORT}.`;
    }
    if (!clientUrl) {
      return 'Professional demo CLIENT_URL is required.';
    }
    if (clientUrl !== baseUrl) {
      return 'Professional demo CLIENT_URL must match BASE_URL.';
    }
    if (!viteApiBaseUrl) {
      return 'Professional demo VITE_API_BASE_URL is required.';
    }
    if (viteApiBaseUrl !== baseUrl) {
      return 'Professional demo VITE_API_BASE_URL must match BASE_URL.';
    }
  }

  return null;
}
