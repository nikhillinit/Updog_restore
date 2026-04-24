import { afterEach, describe, expect, it, vi } from 'vitest';

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

import {
  shouldUseMemoryAllocationScenarioReadModel,
  withAllocationScenarioReadTransaction,
} from '../../../server/services/allocation-scenario-repository';

describe('allocation scenario repository runtime boundary', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('routes reads to the memory fallback when explicit memory storage is enabled', () => {
    expect(
      shouldUseMemoryAllocationScenarioReadModel({
        NODE_ENV: 'development',
        ALLOW_MEMORY_STORAGE: '1',
      } as NodeJS.ProcessEnv)
    ).toBe(true);
  });

  it('routes reads to the memory fallback when the configured database is a local mock', () => {
    expect(
      shouldUseMemoryAllocationScenarioReadModel({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock',
      } as NodeJS.ProcessEnv)
    ).toBe(true);
  });

  it('keeps real database reads on the pg transaction path', () => {
    expect(
      shouldUseMemoryAllocationScenarioReadModel({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://updog:secret@localhost:5432/updog',
      } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it('does not open a pg transaction when using the memory fallback', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', 'postgresql://mock:mock@localhost:5432/mock');

    const result = await withAllocationScenarioReadTransaction(
      async () => ['database'],
      async () => ['memory']
    );

    expect(result).toEqual(['memory']);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
