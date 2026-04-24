import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import { resolveStorageBootMode } from '../storage-runtime-policy.js';

type TransactionWork<T> = (client: PoolClient) => Promise<T>;
type MemoryFallback<T> = () => Promise<T>;

function isMockDatabaseUrl(value: string | undefined): boolean {
  return value?.toLowerCase().includes('mock') ?? false;
}

export function shouldUseMemoryAllocationScenarioReadModel(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const mode = resolveStorageBootMode(env);
  if (mode === 'explicit-memory') {
    return true;
  }

  return isMockDatabaseUrl(env['DATABASE_URL']) || isMockDatabaseUrl(env['NEON_DATABASE_URL']);
}

export async function withAllocationScenarioReadTransaction<T>(
  work: TransactionWork<T>,
  memoryFallback: MemoryFallback<T>,
  env: NodeJS.ProcessEnv = process.env
): Promise<T> {
  if (shouldUseMemoryAllocationScenarioReadModel(env)) {
    return memoryFallback();
  }

  return transaction(work);
}
