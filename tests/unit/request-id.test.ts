import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestId } from '../../server/middleware/requestId';
import type { Request, Response, NextFunction } from 'express';

describe('Request ID Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      get: vi.fn(),
      path: '/api/test',
      method: 'GET'
    };
    
    res = {
      setHeader: vi.fn(),
      on: vi.fn(),
      locals: {}
    };
    
    next = vi.fn();
  });

  it('should generate server X-Request-ID when client ID provided', () => {
    const incomingId = 'client-provided-123';
    (req.get as any).mockReturnValue(incomingId);

    const middleware = requestId();
    middleware(req as Request, res as Response, next);

    expect(req.requestId).toMatch(/^req_[a-f0-9-]+$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(res.locals?.requestId).toBe(req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('should generate new request ID when not provided', () => {
    (req.get as any).mockReturnValue(undefined);
    
    const middleware = requestId();
    middleware(req as Request, res as Response, next);
    
    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(/^req_[a-f0-9-]+$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(res.locals?.requestId).toBe(req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('should generate new ID for empty string header', () => {
    (req.get as any).mockReturnValue('');
    
    const middleware = requestId();
    middleware(req as Request, res as Response, next);
    
    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(/^req_[a-f0-9-]+$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('should generate new ID for whitespace-only header', () => {
    (req.get as any).mockReturnValue('   ');
    
    const middleware = requestId();
    middleware(req as Request, res as Response, next);
    
    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(/^req_[a-f0-9-]+$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('should always set response header', () => {
    const testCases = [
      { input: 'client-123', expected: 'client-123' },
      { input: undefined, expectedPattern: /^req_[a-f0-9-]+$/ },
      { input: '', expectedPattern: /^req_[a-f0-9-]+$/ },
      { input: '  ', expectedPattern: /^req_[a-f0-9-]+$/ }
    ];

    testCases.forEach(({ input, expected, expectedPattern }) => {
      req = { get: vi.fn().mockReturnValue(input), path: '/test', method: 'GET' };
      res = { setHeader: vi.fn(), on: vi.fn(), locals: {} };
      next = vi.fn();
      
      const middleware = requestId();
      middleware(req as Request, res as Response, next);
      
      const actualId = (res.setHeader as any).mock.calls[0][1];
      if (expected) {
        expect(actualId).toBe(expected);
      } else if (expectedPattern) {
        expect(actualId).toMatch(expectedPattern);
      }
    });
  });

  it('should add child logger when global logger exists', () => {
    const mockLogger = {
      child: vi.fn().mockReturnValue({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
      })
    };
    
    (global as any).logger = mockLogger;
    (req.get as any).mockReturnValue('test-123');
    
    const middleware = requestId();
    middleware(req as Request, res as Response, next);
    
    expect(mockLogger.child).toHaveBeenCalledWith({
      requestId: req.requestId,
      path: '/api/test',
      method: 'GET'
    });
    expect(req.log).toBeDefined();
    expect(req.log?.info).toBeDefined();
    expect(req.log?.error).toBeDefined();
    expect(req.log?.warn).toBeDefined();
    
    delete (global as any).logger;
  });

  it('should track start time for duration calculation', () => {
    const middleware = requestId();
    middleware(req as Request, res as Response, next);
    
    expect(res.locals?.startTime).toBeDefined();
    expect(typeof res.locals?.startTime).toBe('number');
    expect(res.locals?.startTime).toBeLessThanOrEqual(Date.now());
  });
});