/**
 * requireLPFundAccess Middleware Tests
 * Tests LP fund-level authorization and canonical fund ID parsing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireLPFundAccess } from '@/server/middleware/requireLPAccess';

describe('requireLPFundAccess Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    req = {
      params: {},
    };

    res = {
      status: statusMock,
      json: jsonMock,
    };

    next = vi.fn();
  });

  it('rejects a non-canonical exponent id before authorization', () => {
    req = {
      params: { fundId: '1e1' },
      lpProfile: {
        id: 1,
        name: 'Test LP',
        email: 'lp@example.com',
        entityType: 'individual',
        fundIds: [1],
      },
    };

    requireLPFundAccess(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(400);
    const body = jsonMock.mock.calls[0]?.[0];
    expect(body).toEqual(
      expect.objectContaining({
        error: 'INVALID_PARAMETER',
        message: 'Invalid fund ID',
        field: 'fundId',
      })
    );
    expect(body).toEqual(expect.objectContaining({ timestamp: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for a valid canonical id the LP holds', () => {
    req = {
      params: { fundId: '123' },
      lpProfile: {
        id: 1,
        name: 'Test LP',
        email: 'lp@example.com',
        entityType: 'individual',
        fundIds: [123],
      },
    };

    requireLPFundAccess(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('returns 400 when fundId parameter is missing', () => {
    req = {
      params: {},
      lpProfile: {
        id: 1,
        name: 'Test LP',
        email: 'lp@example.com',
        entityType: 'individual',
        fundIds: [1],
      },
    };

    requireLPFundAccess(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(400);
    const body = jsonMock.mock.calls[0]?.[0];
    expect(body).toEqual(
      expect.objectContaining({
        error: 'INVALID_PARAMETER',
        message: 'Fund ID is required',
        field: 'fundId',
      })
    );
    expect(body).toEqual(expect.objectContaining({ timestamp: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when fundId is non-numeric', () => {
    req = {
      params: { fundId: 'abc' },
      lpProfile: {
        id: 1,
        name: 'Test LP',
        email: 'lp@example.com',
        entityType: 'individual',
        fundIds: [1],
      },
    };

    requireLPFundAccess(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(400);
    const body = jsonMock.mock.calls[0]?.[0];
    expect(body).toEqual(
      expect.objectContaining({
        error: 'INVALID_PARAMETER',
        message: 'Invalid fund ID',
        field: 'fundId',
      })
    );
    expect(body).toEqual(expect.objectContaining({ timestamp: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the LP does not hold the canonical fund id', () => {
    req = {
      params: { fundId: '99999' },
      lpProfile: {
        id: 1,
        name: 'Test LP',
        email: 'lp@example.com',
        entityType: 'individual',
        fundIds: [1, 2, 3],
      },
    };

    requireLPFundAccess(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'FORBIDDEN',
        message:
          'You do not have access to fund 99999. LPs can only view funds they have invested in.',
        timestamp: expect.any(String),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when called before requireLPAccess', () => {
    req = {
      params: { fundId: '1' },
    };

    requireLPFundAccess(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'MIDDLEWARE_ERROR',
        message: 'requireLPFundAccess must be called after requireLPAccess in middleware chain',
        timestamp: expect.any(String),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
