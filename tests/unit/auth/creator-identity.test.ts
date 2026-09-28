import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const { getUserFundGrantsMock, algorithmMock } = vi.hoisted(() => ({
  getUserFundGrantsMock: vi.fn(),
  algorithmMock: vi.fn(() => 'HS256' as const),
}));

vi.mock('../../../server/lib/auth/credentials', () => ({
  getUserFundGrants: getUserFundGrantsMock,
}));

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/lib/auth/jwt')>()),
  getConfiguredJwtAlgorithm: algorithmMock,
}));

import {
  creatorUserIdFromRequest,
  renewCreationCredential,
} from '../../../server/lib/auth/creator-identity';

function responseMock() {
  return {
    getHeader: vi.fn().mockReturnValue(undefined),
    removeHeader: vi.fn(),
    setHeader: vi.fn(),
    cookie: vi.fn(),
  };
}

function bearerRequest(claims: Record<string, unknown> = {}) {
  return {
    authCredential: {
      source: 'bearer' as const,
      token: 'old-token',
      claims: {
        sub: '12',
        role: 'partner',
        fundIds: [],
        jti: 'presented-session-jti',
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...claims,
      },
    },
  };
}

function cookieRequest(claims: Record<string, unknown> = {}) {
  const request = bearerRequest(claims);
  return {
    ...request,
    authCredential: { ...request.authCredential, source: 'cookie' as const },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.clearAllMocks();
  algorithmMock.mockReturnValue('HS256');
});

describe('creator identity and credential renewal', () => {
  it('prefers the verified numeric JWT subject over ambient request fields', () => {
    expect(
      creatorUserIdFromRequest({
        authCredential: {
          source: 'bearer',
          token: 'token',
          claims: { sub: '12' },
        },
        user: { id: '99', sub: '99' },
        context: { userId: '88' },
      } as never)
    ).toBe(12);
  });

  it('returns reauth_required when renewal fails after creation', async () => {
    getUserFundGrantsMock.mockRejectedValue(new Error('grant lookup unavailable'));
    const response = responseMock();

    await expect(
      renewCreationCredential(bearerRequest() as never, response as never, 42, 12)
    ).resolves.toEqual({ credentialRenewal: 'reauth_required' });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('does not attempt bearer minting under RS256/JWKS configuration', async () => {
    algorithmMock.mockReturnValue('RS256');
    const response = responseMock();

    await expect(
      renewCreationCredential(bearerRequest() as never, response as never, 42, 12)
    ).resolves.toEqual({ credentialRenewal: 'reauth_required' });
    expect(getUserFundGrantsMock).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each([
    ['missing jti', { jti: undefined }],
    ['empty jti', { jti: '' }],
    ['jti over 64 characters', { jti: 'x'.repeat(65) }],
    ['missing exp', { exp: undefined }],
    ['past exp', { exp: Math.floor(Date.now() / 1000) - 1 }],
    ['exp beyond Date range', { exp: 8_640_000_000_001 }],
  ])('fails closed for %s', async (_case, claims) => {
    getUserFundGrantsMock.mockResolvedValue([]);
    const response = responseMock();
    const signSpy = vi.spyOn(jwt, 'sign');

    await expect(
      renewCreationCredential(bearerRequest(claims) as never, response as never, 42, 12)
    ).resolves.toEqual({ credentialRenewal: 'reauth_required' });
    expect(signSpy).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('fails closed on the cookie path without writing a session cookie', async () => {
    getUserFundGrantsMock.mockResolvedValue([]);
    const response = responseMock();

    await expect(
      renewCreationCredential(cookieRequest({ jti: undefined }) as never, response as never, 42, 12)
    ).resolves.toEqual({ credentialRenewal: 'reauth_required' });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('fails closed when exp expires during grant lookup', async () => {
    vi.useFakeTimers();
    const startedAt = new Date('2026-09-28T00:00:00.000Z');
    vi.setSystemTime(startedAt);
    const exp = Math.floor(startedAt.getTime() / 1000) + 5;
    let resolveGrants!: (fundIds: number[]) => void;
    getUserFundGrantsMock.mockReturnValue(
      new Promise<number[]>((resolve) => {
        resolveGrants = resolve;
      })
    );
    const response = responseMock();
    const signSpy = vi.spyOn(jwt, 'sign');
    const renewal = renewCreationCredential(
      bearerRequest({ exp }) as never,
      response as never,
      42,
      12
    );

    await vi.advanceTimersByTimeAsync(6_000);
    resolveGrants([7]);

    await expect(renewal).resolves.toEqual({ credentialRenewal: 'reauth_required' });
    expect(signSpy).not.toHaveBeenCalled();
  });

  it('preserves jti and exp for cookie renewal while adding the new fund', async () => {
    getUserFundGrantsMock.mockResolvedValue([7]);
    const request = cookieRequest();
    const response = responseMock();

    await expect(
      renewCreationCredential(request as never, response as never, 42, 12)
    ).resolves.toEqual({});

    const token = response.cookie.mock.calls[0]?.[1] as string;
    expect(jwt.decode(token)).toMatchObject({
      jti: request.authCredential.claims.jti,
      exp: request.authCredential.claims.exp,
      fundIds: expect.arrayContaining([42]),
    });
  });

  it('preserves jti and exp for bearer renewal while adding the new fund', async () => {
    getUserFundGrantsMock.mockResolvedValue([7]);
    const request = bearerRequest();
    const response = responseMock();
    const signSpy = vi.spyOn(jwt, 'sign');

    const result = await renewCreationCredential(request as never, response as never, 42, 12);

    expect(signSpy).toHaveBeenCalledTimes(1);

    expect(jwt.decode(result.renewedAccessToken!)).toMatchObject({
      jti: request.authCredential.claims.jti,
      exp: request.authCredential.claims.exp,
      fundIds: expect.arrayContaining([42]),
    });
  });
});
