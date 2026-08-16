const LOCAL_DATABASE_HOSTS = new Set(['127.0.0.1', '::1', 'host.docker.internal', 'localhost']);

export const LOCAL_DATABASE_TARGET_REQUIRED =
  'Database mutation requires an explicit local database target';

export function assertLocalDatabaseTarget(
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): asserts databaseUrl is string {
  if (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production') {
    throw new Error(LOCAL_DATABASE_TARGET_REQUIRED);
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl ?? '');
  } catch {
    throw new Error(LOCAL_DATABASE_TARGET_REQUIRED);
  }

  if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname)) {
    throw new Error(LOCAL_DATABASE_TARGET_REQUIRED);
  }
}
