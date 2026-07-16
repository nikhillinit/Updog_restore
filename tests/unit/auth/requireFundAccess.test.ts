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
    it('allows a team member to read a fund outside their explicit scope', () => {
      req.method = 'GET';
      req.params = { fundId: '2' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        role: 'analyst',
        roles: ['analyst'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });

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

    it('should grant an admin access to any fund', () => {
      req.params = { fundId: '99999' };
      req.user = {
        id: 'admin-1',
        sub: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
        roles: ['admin'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject fundId 0 as invalid', () => {
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

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid fund ID',
      });
      expect(next).not.toHaveBeenCalled();
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

    it('should reject non-canonical scientific notation fund IDs', () => {
      req.params = { fundId: '1e1' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1],
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
    it('keeps cross-fund writes scoped', () => {
      req.method = 'POST';
      req.params = { fundId: '2' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        role: 'analyst',
        roles: ['analyst'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('keeps LP reads fund-scoped', () => {
      req.method = 'GET';
      req.params = { fundId: '2' };
      req.user = {
        id: 'lp-1',
        sub: 'lp-1',
        email: 'lp@example.com',
        role: 'lp',
        roles: ['lp'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: [1],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('denies anonymous reads', () => {
      req.method = 'GET';
      req.params = { fundId: '2' };
      req.user = undefined;

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

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
    it('should deny access when req.user is undefined', () => {
      req.params = { fundId: '123' };
      req.user = undefined;

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny a non-admin user without fund grants', () => {
      req.params = { fundId: '123' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny a non-admin user with malformed null fund grants', () => {
      req.params = { fundId: '123' };
      req.user = {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        ip: '127.0.0.1',
        userAgent: 'test',
        fundIds: null as unknown as number[],
      };

      requireFundAccess(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases - Numeric Edge Values', () => {
    it('should reject negative fund IDs', () => {
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

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid fund ID',
      });
      expect(next).not.toHaveBeenCalled();
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

    it('should reject fundId with leading zeros as non-canonical', () => {
      req.params = { fundId: '0123' };
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

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Bad Request', message: 'Invalid fund ID' });
      expect(next).not.toHaveBeenCalled();
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

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid fund ID',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
