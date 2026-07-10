import { describe, expect, it } from 'vitest';

import { principalFromUser } from '../../../server/lib/auth/principal';
import { resolveFundScope } from '../../../server/lib/auth/fund-scope';

const user = (over: Partial<Express.User> = {}): Express.User =>
  ({
    id: 'u1',
    sub: 'u1',
    email: 'u1@example.com',
    roles: [],
    fundIds: [],
    ip: 'x',
    userAgent: 'x',
    ...over,
  }) as Express.User;

describe('principalFromUser', () => {
  it('maps an absent user to anonymous', () => {
    expect(principalFromUser(undefined)).toEqual({ kind: 'anonymous' });
  });

  it('maps role=admin to an admin principal', () => {
    expect(principalFromUser(user({ role: 'admin' }))).toEqual({ kind: 'admin' });
  });

  it('maps role=service to a service principal', () => {
    expect(principalFromUser(user({ role: 'service' }))).toEqual({ kind: 'service' });
  });

  it('maps a non-privileged user to a scoped user principal', () => {
    expect(principalFromUser(user({ role: 'analyst', fundIds: [1, 2] }))).toEqual({
      kind: 'user',
      userId: 'u1',
      fundIds: [1, 2],
    });
  });
});

describe('resolveFundScope (fail-closed acceptance matrix)', () => {
  it('denies an anonymous principal (no fail-open)', () => {
    expect(resolveFundScope({ kind: 'anonymous' }, 1)).toBe('deny');
  });

  it('allows admin for any fund', () => {
    expect(resolveFundScope({ kind: 'admin' }, 42)).toBe('allow');
  });

  it('allows service for any fund', () => {
    expect(resolveFundScope({ kind: 'service' }, 42)).toBe('allow');
  });

  it('allows a user for a fund in scope', () => {
    expect(resolveFundScope({ kind: 'user', userId: 'u1', fundIds: [1, 2] }, 2)).toBe('allow');
  });

  it('denies a user for a fund out of scope', () => {
    expect(resolveFundScope({ kind: 'user', userId: 'u1', fundIds: [1, 2] }, 3)).toBe('deny');
  });

  it('denies a non-privileged user with empty fundIds (empty != unrestricted)', () => {
    expect(resolveFundScope({ kind: 'user', userId: 'u1', fundIds: [] }, 1)).toBe('deny');
  });
});
