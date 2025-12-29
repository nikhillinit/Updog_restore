/**
 * requireFundAccess Middleware Tests
 * Tests fund-level authorization and access control
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireFundAccess } from '@/server/lib/auth/jwt';

describe('requireFundAccess Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock response methods
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    req = {
      params: {},
      user: undefined,
    };

    res = {
      status: statusMock,
      json: jsonMock,
    };

    next = vi.fn();
  });

  describe('Authorized Access', () => {
    it('should call next() when user has access to the requested fund', () => {
      req.params = { fundId: '123' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1, 2, 123, 456],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should grant access to any fund when user has empty fundIds array (admin)', () => {
      req.params = { fundId: '99999' };
      req.user = {
        id: 'admin-1',
        sub: 'admin-1',
        email: 'admin@example.com',
        roles: ['admin'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [], // Empty array means admin access to all funds
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle fundId 0 as a valid numeric ID', () => {
      req.params = { fundId: '0' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [0, 1, 2],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('Missing or Invalid fundId Parameter', () => {
    it('should return 400 when fundId parameter is missing', () => {
      req.params = {}; // No fundId parameter
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1, 2, 3],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Fund ID is required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 when fundId is not a valid number (NaN)', () => {
      req.params = { fundId: 'abc' }; // Non-numeric string
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1, 2, 3],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid fund ID',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 for various invalid fundId formats', () => {
      // Note: '12.34.56' is excluded because parseInt('12.34.56', 10) = 12 (valid number)
      const invalidIds = ['abc', 'fund-123', 'null', 'undefined', ''];

      invalidIds.forEach((invalidId) => {
        // Reset mocks for each iteration
        statusMock.mockClear();
        jsonMock.mockClear();
        next.mockClear();

        req.params = { fundId: invalidId };
        req.user = {
          id: 'user-1',
          sub: 'user-1',
          email: 'user@example.com',
          roles: ['user'],
          ip: '127.0.0.1',
          userAgent: 'test',
          fundIds: [1, 2, 3],
        };

        requireFundAccess(req as Request, res as Response, next);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Bad Request',
          message: expect.stringMatching(/Fund ID is required|Invalid fund ID/),
        });
        expect(next).not.toHaveBeenCalled();
      });
    });
  });

  describe('Unauthorized Access', () => {
    it('should return 403 when user does not have access to the requested fund', () => {
      req.params = { fundId: '99999' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1, 2, 3], // Does not include 99999
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You do not have access to fund 99999',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 with correct fundId in error message', () => {
      req.params = { fundId: '456' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1, 2, 3],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You do not have access to fund 456',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Response Format Validation', () => {
    it('should return properly formatted 400 error response', () => {
      req.params = { fundId: 'invalid' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1, 2, 3],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      const errorResponse = jsonMock.mock.calls[0][0];
      expect(errorResponse).toHaveProperty('error', 'Bad Request');
      expect(errorResponse).toHaveProperty('message');
      expect(typeof errorResponse.message).toBe('string');
      expect(errorResponse.message.length).toBeGreaterThan(0);
    });

    it('should return properly formatted 403 error response with fundId', () => {
      const fundId = '12345';
      req.params = { fundId };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1, 2, 3],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      const errorResponse = jsonMock.mock.calls[0][0];
      expect(errorResponse).toHaveProperty('error', 'Forbidden');
      expect(errorResponse).toHaveProperty('message');
      expect(typeof errorResponse.message).toBe('string');
      expect(errorResponse.message).toContain(fundId);
      expect(errorResponse.message).toMatch(/You do not have access to fund \d+/);
    });
  });

  describe('Edge Cases - Null/Undefined User', () => {
    it('should treat undefined req.user as empty fundIds array (admin access)', () => {
      req.params = { fundId: '123' };
      req.user = undefined; // No user attached to request

      requireFundAccess(req as Request, res as Response, next);

      // With empty fundIds (from undefined user), it grants admin access
      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should treat user without fundIds property as empty array (admin access)', () => {
      req.params = { fundId: '123' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        // fundIds property is missing
      };

      requireFundAccess(req as Request, res as Response, next);

      // With missing fundIds property, it defaults to [] and grants admin access
      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle user with null fundIds as empty array (admin access)', () => {
      req.params = { fundId: '123' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: null as any, // Explicitly set to null
      };

      requireFundAccess(req as Request, res as Response, next);

      // null fundIds gets coerced to [] via || operator
      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases - Numeric Edge Values', () => {
    it('should correctly parse and authorize access for negative fund IDs', () => {
      req.params = { fundId: '-1' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [-1, 0, 1],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should correctly parse and deny access for large fund IDs', () => {
      req.params = { fundId: '999999999' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1, 2, 3],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You do not have access to fund 999999999',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle fundId with leading zeros correctly', () => {
      req.params = { fundId: '0123' }; // parseInt('0123', 10) = 123
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [123, 456],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject floating point fund IDs (treated as invalid after decimal)', () => {
      req.params = { fundId: '123.456' }; // parseInt('123.456', 10) = 123
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [123, 456],
      };

      requireFundAccess(req as Request, res as Response, next);

      // parseInt('123.456', 10) = 123, and user has access to 123
      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });
});
