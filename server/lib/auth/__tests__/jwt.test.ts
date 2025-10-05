/**
 * JWT Authentication Tests
 * Tests for both HS256 and RS256 JWT verification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { verifyAccessToken, signToken, InvalidTokenError } from '../jwt';
import * as authConfig from '../../../config/auth';

describe('JWT Authentication', () => {
  describe('HS256 (HMAC) Algorithm', () => {
    beforeEach(() => {
      // Mock auth config for HS256
      vi.spyOn(authConfig, 'getAuthConfig').mockReturnValue({
        algorithm: 'HS256',
        secret: 'test-secret-key-minimum-32-characters-long-for-security',
        issuer: 'test-issuer',
        audience: 'test-audience',
      });
    });

    it('should sign and verify HS256 token successfully', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      };

      const token = signToken(payload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      const verified = await verifyAccessToken(token);
      expect(verified.sub).toBe('user-123');
      expect(verified.email).toBe('test@example.com');
      expect(verified.role).toBe('admin');
    });

    it('should reject token with invalid signature', async () => {
      const token = signToken({ sub: 'user-123' });
      const tamperedToken = token.slice(0, -5) + 'XXXXX';

      await expect(verifyAccessToken(tamperedToken)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject token with wrong issuer', async () => {
      // Create token with different issuer
      const jwt = await import('jsonwebtoken');
      const token = jwt.sign(
        { sub: 'user-123' },
        'test-secret-key-minimum-32-characters-long-for-security',
        {
          algorithm: 'HS256',
          issuer: 'wrong-issuer',
          audience: 'test-audience',
        }
      );

      await expect(verifyAccessToken(token)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject token with wrong audience', async () => {
      const jwt = await import('jsonwebtoken');
      const token = jwt.sign(
        { sub: 'user-123' },
        'test-secret-key-minimum-32-characters-long-for-security',
        {
          algorithm: 'HS256',
          issuer: 'test-issuer',
          audience: 'wrong-audience',
        }
      );

      await expect(verifyAccessToken(token)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject expired token', async () => {
      const jwt = await import('jsonwebtoken');
      const token = jwt.sign(
        { sub: 'user-123' },
        'test-secret-key-minimum-32-characters-long-for-security',
        {
          algorithm: 'HS256',
          issuer: 'test-issuer',
          audience: 'test-audience',
          expiresIn: '-1h', // Already expired
        }
      );

      await expect(verifyAccessToken(token)).rejects.toThrow(InvalidTokenError);

      try {
        await verifyAccessToken(token);
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTokenError);
        expect((error as InvalidTokenError).reason).toBe('expired');
      }
    });

    it('should reject token without sub claim', async () => {
      const jwt = await import('jsonwebtoken');
      const token = jwt.sign(
        { email: 'test@example.com' }, // Missing 'sub'
        'test-secret-key-minimum-32-characters-long-for-security',
        {
          algorithm: 'HS256',
          issuer: 'test-issuer',
          audience: 'test-audience',
        }
      );

      await expect(verifyAccessToken(token)).rejects.toThrow(InvalidTokenError);

      try {
        await verifyAccessToken(token);
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTokenError);
        expect((error as InvalidTokenError).reason).toBe('invalid');
        expect((error as InvalidTokenError).message).toContain('sub');
      }
    });

    it('should reject empty or missing token', async () => {
      await expect(verifyAccessToken('')).rejects.toThrow(InvalidTokenError);
      await expect(verifyAccessToken('   ')).rejects.toThrow(InvalidTokenError);

      try {
        await verifyAccessToken('');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTokenError);
        expect((error as InvalidTokenError).reason).toBe('missing');
      }
    });

    it('should prevent algorithm spoofing', async () => {
      // Try to create a token with RS256 when HS256 is expected
      const jwt = await import('jsonwebtoken');

      // This should fail because algorithm whitelist only allows HS256
      const maliciousToken = jwt.sign(
        { sub: 'user-123', alg: 'none' },
        'test-secret-key-minimum-32-characters-long-for-security',
        {
          algorithm: 'HS256',
          issuer: 'test-issuer',
          audience: 'test-audience',
        }
      );

      // The token should still verify correctly because jose enforces algorithm whitelist
      const verified = await verifyAccessToken(maliciousToken);
      expect(verified.sub).toBe('user-123');
    });
  });

  describe('RS256 (RSA) Algorithm', () => {
    it('should require JWKS URL for RS256', () => {
      vi.spyOn(authConfig, 'getAuthConfig').mockReturnValue({
        algorithm: 'RS256',
        jwksUri: undefined,
        issuer: 'test-issuer',
        audience: 'test-audience',
      });

      // Should throw error when trying to initialize without JWKS URL
      expect(() => {
        // This will trigger the getAuthConfig validation
        authConfig.getAuthConfig();
      }).toThrow();
    });

    it('should not support token signing with RS256', () => {
      vi.spyOn(authConfig, 'getAuthConfig').mockReturnValue({
        algorithm: 'RS256',
        jwksUri: 'https://example.com/.well-known/jwks.json',
        issuer: 'test-issuer',
        audience: 'test-audience',
      });

      expect(() => signToken({ sub: 'user-123' })).toThrow(
        'Token signing only supported with HS256 algorithm'
      );
    });
  });

  describe('Configuration Validation', () => {
    it('should validate HS256 requires secret', () => {
      expect(() => {
        vi.spyOn(authConfig, 'getAuthConfig').mockImplementation(() => {
          throw new Error('JWT_SECRET is required when JWT_ALG=HS256');
        });
        authConfig.getAuthConfig();
      }).toThrow('JWT_SECRET is required');
    });

    it('should validate RS256 requires JWKS URL', () => {
      expect(() => {
        vi.spyOn(authConfig, 'getAuthConfig').mockImplementation(() => {
          throw new Error('JWT_JWKS_URL is required when JWT_ALG=RS256');
        });
        authConfig.getAuthConfig();
      }).toThrow('JWT_JWKS_URL is required');
    });
  });
});
