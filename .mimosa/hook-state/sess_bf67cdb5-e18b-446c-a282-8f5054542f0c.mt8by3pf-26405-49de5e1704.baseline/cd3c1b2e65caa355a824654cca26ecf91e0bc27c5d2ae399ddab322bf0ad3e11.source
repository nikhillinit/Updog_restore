import { beforeEach, describe, expect, it, vi } from 'vitest';

import { revokedTokens, users } from '@shared/schema/user';

const dbMock = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../../../server/db', () => ({ db: dbMock }));

import {
  assertTokenUsable,
  revokeToken,
  TokenRevokedError,
  TokenUsabilityCheckError,
  UserInactiveError,
} from '../../../server/lib/auth/revocation';

function queueSelect(result: ReadonlyArray<Record<string, unknown>> | Error) {
  const limit = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  );
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  dbMock.select.mockReturnValueOnce({ from });
  return { from, limit, where };
}

describe('token revocation', () => {
  beforeEach(() => {
    dbMock.insert.mockReset();
    dbMock.select.mockReset();
  });

  it('allows a fresh token for an active user', async () => {
    const revokedQuery = queueSelect([]);
    const userQuery = queueSelect([{ isActive: true }]);

    await expect(assertTokenUsable({ sub: '7', jti: 'fresh-jti' })).resolves.toBeUndefined();

    expect(revokedQuery.from).toHaveBeenCalledWith(revokedTokens);
    expect(userQuery.from).toHaveBeenCalledWith(users);
  });

  it('rejects a denylisted token', async () => {
    queueSelect([{ jti: 'revoked-jti' }]);

    await expect(assertTokenUsable({ sub: '7', jti: 'revoked-jti' })).rejects.toBeInstanceOf(
      TokenRevokedError
    );
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it('rejects a token for an inactive user', async () => {
    queueSelect([]);
    queueSelect([{ isActive: false }]);

    await expect(assertTokenUsable({ sub: '7', jti: 'fresh-jti' })).rejects.toBeInstanceOf(
      UserInactiveError
    );
  });

  it('allows a token when a numeric subject has no user row', async () => {
    queueSelect([]);
    queueSelect([]);

    await expect(assertTokenUsable({ sub: '404', jti: 'fresh-jti' })).resolves.toBeUndefined();
  });

  it('fails closed when a database query rejects', async () => {
    const databaseFailure = new Error('database unavailable');
    queueSelect(databaseFailure);

    await expect(assertTokenUsable({ sub: '7', jti: 'fresh-jti' })).rejects.toMatchObject({
      name: 'TokenUsabilityCheckError',
      message: 'Token usability check failed',
    });
  });

  it('sanitizes failures from the active-user lookup', async () => {
    queueSelect([]);
    queueSelect(new Error('query params: 7'));

    await expect(assertTokenUsable({ sub: '7', jti: 'fresh-jti' })).rejects.toBeInstanceOf(
      TokenUsabilityCheckError
    );
  });

  it('skips the denylist lookup when jti is absent', async () => {
    const userQuery = queueSelect([{ isActive: true }]);

    await expect(assertTokenUsable({ sub: '7' })).resolves.toBeUndefined();

    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(userQuery.from).toHaveBeenCalledWith(users);
  });

  it('inserts revocations idempotently', async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoNothing }));
    dbMock.insert.mockReturnValue({ values });
    const expiresAt = new Date('2026-07-18T00:00:00.000Z');

    await revokeToken({
      jti: 'logout-jti',
      userId: 7,
      expiresAt,
      reason: 'logout',
    });

    expect(dbMock.insert).toHaveBeenCalledWith(revokedTokens);
    expect(values).toHaveBeenCalledWith({
      jti: 'logout-jti',
      userId: 7,
      expiresAt,
      reason: 'logout',
    });
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });
});
