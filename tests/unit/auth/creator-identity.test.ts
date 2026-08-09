import { afterEach, describe, expect, it, vi } from 'vitest';

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
  };
}

function bearerRequest() {
  return {
    authCredential: {
      source: 'bearer' as const,
      token: 'old-token',
      claims: { sub: '12', role: 'partner', fundIds: [] },
    },
  };
}

afterEach(() => {
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
});
