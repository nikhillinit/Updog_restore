import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logSecurityMock } = vi.hoisted(() => ({
  logSecurityMock: vi.fn(),
}));

vi.mock('../../../../server/utils/logger', () => ({
  logSecurity: logSecurityMock,
}));

import type { db } from '../../../../server/db';
import { requireActualsPilotGrant } from '../../../../server/lib/auth/actuals-pilot-grant';
import { userFundGrants, users, type UserRole } from '@shared/schema/user';

type GrantDatabase = typeof db;
type UserRow = {
  isActive: boolean;
  role: UserRole;
  isReleaseCanaryPrincipal: boolean;
};

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = (count: number) => Promise.resolve(rows.slice(0, count));
  return promise;
}

class FakeGrantDatabase {
  readonly selectCalls: unknown[] = [];
  writeCalls = 0;

  constructor(
    readonly user: UserRow | undefined = {
      isActive: true,
      role: 'admin',
      isReleaseCanaryPrincipal: false,
    },
    readonly grant = true
  ) {}

  asDatabase(): GrantDatabase {
    return this as unknown as GrantDatabase;
  }

  select(projection?: unknown) {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) => {
          this.selectCalls.push({ table, projection });
          if (table === users) return queryResult(this.user === undefined ? [] : [this.user]);
          if (table === userFundGrants) {
            return queryResult(this.grant ? [{ userId: 7 }] : []);
          }
          return queryResult([]);
        },
      }),
    };
  }

  insert(): never {
    this.writeCalls += 1;
    throw new Error('Grant middleware must not write.');
  }

  update(): never {
    this.writeCalls += 1;
    throw new Error('Grant middleware must not write.');
  }

  delete(): never {
    this.writeCalls += 1;
    throw new Error('Grant middleware must not write.');
  }
}

function requestUser(overrides: Record<string, unknown> = {}): Request['user'] {
  return {
    id: '7',
    sub: '7',
    email: 'pilot@example.com',
    role: 'admin',
    roles: ['admin'],
    ip: '127.0.0.1',
    userAgent: 'vitest',
    fundIds: [],
    ...overrides,
  } as Request['user'];
}

async function invoke(
  database: FakeGrantDatabase,
  options: {
    user?: Request['user'];
    fundId?: string;
    configuredFundId?: number | null;
  } = {}
) {
  const req = {
    params: { fundId: options.fundId ?? '42' },
    user: options.user,
    requestId: 'req_actuals_pilot_test',
  } as unknown as Request;
  const res = {
    type: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const next = vi.fn();

  await requireActualsPilotGrant(
    () => (options.configuredFundId === undefined ? 42 : options.configuredFundId),
    database.asDatabase()
  )(req, res, next);

  return { req, res, next };
}

function expectDenied(
  result: Awaited<ReturnType<typeof invoke>>,
  status: 403 | 404,
  code: 'INSUFFICIENT_ROLE' | 'RESOURCE_NOT_FOUND'
) {
  expect(result.res.status).toHaveBeenCalledWith(status);
  expect(result.res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      error: status === 403 ? 'Insufficient role' : 'Resource not found',
      code,
      requestId: 'req_actuals_pilot_test',
    })
  );
  expect(result.next).not.toHaveBeenCalled();
  expect(logSecurityMock).toHaveBeenCalledTimes(1);
  expect(logSecurityMock).toHaveBeenCalledWith('Actuals pilot grant denied', {
    securityEvent: 'actuals_pilot_grant_denied',
    severity: 'medium',
  });
}

describe('requireActualsPilotGrant', () => {
  beforeEach(() => {
    logSecurityMock.mockClear();
  });

  it('returns a non-enumerating 404 for a missing user without database reads', async () => {
    const database = new FakeGrantDatabase();
    const result = await invoke(database);

    expectDenied(result, 404, 'RESOURCE_NOT_FOUND');
    expect(database.selectCalls).toHaveLength(0);
    expect(database.writeCalls).toBe(0);
  });

  it('returns 404 for an inactive user', async () => {
    const database = new FakeGrantDatabase({
      isActive: false,
      role: 'admin',
      isReleaseCanaryPrincipal: false,
    });
    const result = await invoke(database, { user: requestUser() });

    expectDenied(result, 404, 'RESOURCE_NOT_FOUND');
    expect(database.selectCalls).toHaveLength(1);
    expect(database.writeCalls).toBe(0);
  });

  it('returns 404 for a non-admin without a same-fund grant', async () => {
    const database = new FakeGrantDatabase({
      isActive: true,
      role: 'partner',
      isReleaseCanaryPrincipal: false,
    }, false);
    const result = await invoke(database, {
      user: requestUser({ role: 'partner', roles: ['partner'] }),
    });

    expectDenied(result, 404, 'RESOURCE_NOT_FOUND');
    expect(database.selectCalls).toHaveLength(2);
    expect(database.writeCalls).toBe(0);
  });

  it('returns 403 for a same-fund grant holder who is not an admin', async () => {
    const database = new FakeGrantDatabase({
      isActive: true,
      role: 'partner',
      isReleaseCanaryPrincipal: false,
    });
    const result = await invoke(database, {
      user: requestUser({ role: 'partner', roles: ['partner'] }),
    });

    expectDenied(result, 403, 'INSUFFICIENT_ROLE');
    expect(database.selectCalls).toHaveLength(2);
    expect(database.writeCalls).toBe(0);
  });

  it('returns 404 for service and canary principals', async () => {
    const serviceDatabase = new FakeGrantDatabase();
    const service = await invoke(serviceDatabase, {
      user: requestUser({ role: 'service', roles: ['service'] }),
    });
    expectDenied(service, 404, 'RESOURCE_NOT_FOUND');
    expect(serviceDatabase.selectCalls).toHaveLength(0);
    expect(serviceDatabase.writeCalls).toBe(0);

    logSecurityMock.mockClear();
    const canaryDatabase = new FakeGrantDatabase({
      isActive: true,
      role: 'admin',
      isReleaseCanaryPrincipal: true,
    });
    const canary = await invoke(canaryDatabase, { user: requestUser() });
    expectDenied(canary, 404, 'RESOURCE_NOT_FOUND');
    expect(canaryDatabase.selectCalls).toHaveLength(1);
    expect(canaryDatabase.writeCalls).toBe(0);
  });

  it('returns 404 for a wrong fund or an unset pilot lane without database reads', async () => {
    const wrongFundDatabase = new FakeGrantDatabase();
    const wrongFund = await invoke(wrongFundDatabase, { fundId: '43' });
    expectDenied(wrongFund, 404, 'RESOURCE_NOT_FOUND');
    expect(wrongFundDatabase.selectCalls).toHaveLength(0);
    expect(wrongFundDatabase.writeCalls).toBe(0);

    logSecurityMock.mockClear();
    const unsetDatabase = new FakeGrantDatabase();
    const unset = await invoke(unsetDatabase, { configuredFundId: null });
    expectDenied(unset, 404, 'RESOURCE_NOT_FOUND');
    expect(unsetDatabase.selectCalls).toHaveLength(0);
    expect(unsetDatabase.writeCalls).toBe(0);
  });

  it('allows an active admin with a same-fund grant and remains write-free', async () => {
    const database = new FakeGrantDatabase();
    const result = await invoke(database, { user: requestUser() });

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.res.status).not.toHaveBeenCalled();
    expect(result.res.json).not.toHaveBeenCalled();
    expect(database.selectCalls).toHaveLength(2);
    expect(database.writeCalls).toBe(0);
    expect(logSecurityMock).not.toHaveBeenCalled();
  });
});
