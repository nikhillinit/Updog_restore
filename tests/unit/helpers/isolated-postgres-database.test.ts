import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { manageIsolatedDatabasePool } from '../../helpers/isolated-postgres-database';

class FakePool extends EventEmitter {
  readonly end = vi.fn(async () => undefined);
}

function createDeferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('isolated Postgres database cleanup', () => {
  it('tolerates administrator termination only while forced cleanup is active', async () => {
    const pool = new FakePool();
    const managedPool = manageIsolatedDatabasePool(pool);
    const expectedError = Object.assign(new Error('connection terminated'), { code: '57P01' });
    const expectedMessageError = new Error('terminating connection due to administrator command');
    const query = vi.fn(async () => {
      expect(() => pool.emit('error', expectedError)).not.toThrow();
      expect(() => pool.emit('error', expectedMessageError)).not.toThrow();
      return undefined;
    });

    await managedPool.dropDatabase({ query }, 'isolated_database');

    expect(pool.end).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith('DROP DATABASE IF EXISTS "isolated_database" WITH (FORCE)');
    expect(() => pool.emit('error', expectedError)).toThrow(expectedError);
  });

  it('rethrows unexpected pool errors during forced cleanup', async () => {
    const pool = new FakePool();
    const managedPool = manageIsolatedDatabasePool(pool);
    const unexpectedError = new Error('socket failure');
    const query = vi.fn(async () => {
      pool.emit('error', unexpectedError);
      return undefined;
    });

    await expect(managedPool.dropDatabase({ query }, 'isolated_database')).rejects.toThrow(
      unexpectedError
    );
  });

  it('rethrows unexpected pool shutdown failures after attempting the database drop', async () => {
    const pool = new FakePool();
    const shutdownError = new Error('pool shutdown failed');
    pool.end.mockRejectedValueOnce(shutdownError);
    const managedPool = manageIsolatedDatabasePool(pool);
    const query = vi.fn(async () => undefined);

    await expect(managedPool.dropDatabase({ query }, 'isolated_database')).rejects.toThrow(
      shutdownError
    );
    expect(query).toHaveBeenCalledOnce();
  });

  it('rethrows database drop failures', async () => {
    const pool = new FakePool();
    const managedPool = manageIsolatedDatabasePool(pool);
    const dropError = new Error('database drop failed');
    const query = vi.fn(async () => Promise.reject(dropError));

    await expect(managedPool.dropDatabase({ query }, 'isolated_database')).rejects.toThrow(
      dropError
    );
  });

  it('preserves pool shutdown and database drop failures together', async () => {
    const pool = new FakePool();
    const shutdownError = new Error('pool shutdown failed');
    const dropError = new Error('database drop failed');
    pool.end.mockRejectedValueOnce(shutdownError);
    const managedPool = manageIsolatedDatabasePool(pool);
    const query = vi.fn(async () => Promise.reject(dropError));

    const rejection = await managedPool
      .dropDatabase({ query }, 'isolated_database')
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors).toEqual([shutdownError, dropError]);
  });

  it('waits for pool drain before beginning the forced database drop', async () => {
    const pool = new FakePool();
    const poolEnd = createDeferred();
    const databaseDrop = createDeferred();
    pool.end.mockImplementationOnce(() => poolEnd.promise);
    const managedPool = manageIsolatedDatabasePool(pool);
    const query = vi.fn(() => databaseDrop.promise);

    const cleanup = managedPool.dropDatabase({ query }, 'isolated_database');
    await Promise.resolve();

    expect(query).not.toHaveBeenCalled();

    poolEnd.resolve();
    await vi.waitFor(() => expect(query).toHaveBeenCalledOnce());
    expect(query).toHaveBeenCalledWith('DROP DATABASE IF EXISTS "isolated_database" WITH (FORCE)');

    databaseDrop.resolve();
    await expect(cleanup).resolves.toBeUndefined();
  });
});
