/**
 * JWT authentication tests for current configuration and verification contracts.
 */

import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config';

const getConfigMock = vi.hoisted(() => vi.fn());

vi.mock('../../../config', () => ({
  getConfig: getConfigMock,
}));

import { getConfiguredJwtAlgorithm, signToken, verifyAccessToken } from '../jwt';

const secret = 'test-secret-key-minimum-32-characters-long-for-security';

function jwtConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    JWT_ALG: 'HS256',
    JWT_SECRET: secret,
    JWT_ISSUER: 'test-issuer',
    JWT_AUDIENCE: 'test-audience',
    ...overrides,
  } as AppConfig;
}

function signFixture(payload: object): string {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: 'test-issuer',
    audience: 'test-audience',
  });
}

describe('JWT Authentication', () => {
  beforeEach(() => {
    getConfigMock.mockReset();
    getConfigMock.mockReturnValue(jwtConfig());
  });

  describe('HS256', () => {
    it('signs and verifies a token', () => {
      const token = signToken({
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      });

      const verified = verifyAccessToken(token);

      expect(verified).toMatchObject({
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        iss: 'test-issuer',
        aud: 'test-audience',
      });
      expect(verified.jti).toEqual(expect.any(String));
    });

    it('rejects a token with a tampered signature', () => {
      const token = signToken({ sub: 'user-123' });
      const tamperedToken = `${token.slice(0, -5)}XXXXX`;

      expect(() => verifyAccessToken(tamperedToken)).toThrow(JsonWebTokenError);
    });

    it('rejects a token with the wrong issuer', () => {
      const token = jwt.sign({ sub: 'user-123' }, secret, {
        algorithm: 'HS256',
        issuer: 'wrong-issuer',
        audience: 'test-audience',
      });

      expect(() => verifyAccessToken(token)).toThrow('jwt issuer invalid');
    });

    it('rejects a token with the wrong audience', () => {
      const token = jwt.sign({ sub: 'user-123' }, secret, {
        algorithm: 'HS256',
        issuer: 'test-issuer',
        audience: 'wrong-audience',
      });

      expect(() => verifyAccessToken(token)).toThrow('jwt audience invalid');
    });

    it('rejects an expired token', () => {
      const token = jwt.sign({ sub: 'user-123' }, secret, {
        algorithm: 'HS256',
        issuer: 'test-issuer',
        audience: 'test-audience',
        expiresIn: -1,
      });

      expect(() => verifyAccessToken(token)).toThrow(TokenExpiredError);
    });

    it('rejects empty and malformed tokens', () => {
      expect(() => verifyAccessToken('')).toThrow(JsonWebTokenError);
      expect(() => verifyAccessToken('not-a-jwt')).toThrow(JsonWebTokenError);
    });

    it.each([
      ['missing', {}],
      ['empty', { sub: '' }],
      ['non-string', { sub: 123 }],
    ])('rejects a token with a %s subject', (_description, payload) => {
      expect(() => verifyAccessToken(signFixture(payload))).toThrow(JsonWebTokenError);
    });

    it('enforces the configured algorithm allowlist', () => {
      const unsignedToken = jwt.sign({ sub: 'user-123' }, '', {
        algorithm: 'none',
        issuer: 'test-issuer',
        audience: 'test-audience',
      });

      expect(() => verifyAccessToken(unsignedToken)).toThrow('jwt signature is required');
    });
  });

  describe('RS256', () => {
    it('reports the configured algorithm', () => {
      getConfigMock.mockReturnValue(
        jwtConfig({ JWT_ALG: 'RS256', JWT_JWKS_URL: 'https://example.com/jwks' })
      );

      expect(getConfiguredJwtAlgorithm()).toBe('RS256');
    });

    it('directs synchronous callers to the async verifier', () => {
      getConfigMock.mockReturnValue(
        jwtConfig({ JWT_ALG: 'RS256', JWT_JWKS_URL: 'https://example.com/jwks' })
      );

      expect(() => verifyAccessToken('header.payload.signature')).toThrow(
        'Use verifyAccessTokenAsync for RS256'
      );
    });
  });
});
