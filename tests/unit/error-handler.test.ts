import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestId } from '../../server/middleware/requestId';

describe('Error Handler Request-ID', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    
    // Add request ID middleware
    app.use(requestId());
    
    // Test route that throws an error
    app.get('/test-error', (req, res, next) => {
      const error: any = new Error('Test error');
      error.status = 400;
      next(error);
    });
    
    // Test route that throws without status
    app.get('/test-500', (req, res, next) => {
      next(new Error('Internal error'));
    });
    
    // Error handler
    app.use((err: any, req: any, res: any, next: any) => {
      // Ensure X-Request-ID is always present on errors
      if (req.requestId && !res.get('X-Request-ID')) {
        res.set('X-Request-ID', req.requestId);
      }
      
      const status = err.status || err.statusCode || 500;
      const message = err.message || 'Internal Server Error';
      
      res.status(status).json({ 
        error: message,
        requestId: req.requestId 
      });
    });
  });

  it('should include X-Request-ID in error responses', async () => {
    const response = await request(app)
      .get('/test-error');
    
    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-request-id']).toMatch(/^req_[a-f0-9-]+$/);
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.body.error).toBe('Test error');
  });

  it('should preserve client-provided X-Request-ID in errors', async () => {
    const clientId = 'client-error-123';
    
    const response = await request(app)
      .get('/test-error')
      .set('X-Request-ID', clientId);
    
    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toBe(clientId);
    expect(response.body.requestId).toBe(clientId);
  });

  it('should handle 500 errors with Request-ID', async () => {
    const response = await request(app)
      .get('/test-500');
    
    expect(response.status).toBe(500);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.body.error).toBe('Internal error');
  });

  it('should preserve X-Request-ID when already set', async () => {
    // The error handler checks if header is already set
    const testApp = express();
    testApp.use(requestId());
    
    testApp.get('/test-partial', (req, res, next) => {
      // Header already set by requestId middleware
      const error: any = new Error('Partial error');
      error.status = 409;
      next(error);
    });
    
    // Error handler
    testApp.use((err: any, req: any, res: any, next: any) => {
      // Only set if not already set (which it is from requestId middleware)
      if (req.requestId && !res.get('X-Request-ID')) {
        res.set('X-Request-ID', req.requestId);
      }
      
      res.status(err.status || 500).json({ 
        error: err.message,
        requestId: req.requestId 
      });
    });
    
    const response = await request(testApp)
      .get('/test-partial')
      .set('X-Request-ID', 'client-partial-123');
    
    expect(response.status).toBe(409);
    expect(response.headers['x-request-id']).toBe('client-partial-123');
    expect(response.body.error).toBe('Partial error');
  });

  it('should handle errors with custom status codes', async () => {
    const testApp = express();
    testApp.use(requestId());
    
    testApp.get('/test-custom', (req, res, next) => {
      const error: any = new Error('Custom status error');
      error.statusCode = 418; // I'm a teapot
      next(error);
    });
    
    // Error handler
    testApp.use((err: any, req: any, res: any, next: any) => {
      if (req.requestId && !res.get('X-Request-ID')) {
        res.set('X-Request-ID', req.requestId);
      }
      
      const status = err.status || err.statusCode || 500;
      res.status(status).json({ 
        error: err.message,
        requestId: req.requestId 
      });
    });
    
    const response = await request(testApp)
      .get('/test-custom');
    
    expect(response.status).toBe(418);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body.requestId).toBeDefined();
    expect(response.body.error).toBe('Custom status error');
  });

  it('should log errors with request context when logger exists', async () => {
    const mockLog = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };
    
    const testApp = express();
    testApp.use(requestId());
    
    // Add mock logger to request
    testApp.use((req: any, res, next) => {
      req.log = mockLog;
      next();
    });
    
    testApp.get('/test-logged', (req, res, next) => {
      next(new Error('Logged error'));
    });
    
    // Error handler with logging
    testApp.use((err: any, req: any, res: any, next: any) => {
      if (req.requestId && !res.get('X-Request-ID')) {
        res.set('X-Request-ID', req.requestId);
      }
      
      // Log error with request context
      if (req.log) {
        req.log.error({ err, status: err.status || 500 }, 'Request failed');
      }
      
      res.status(err.status || 500).json({ 
        error: err.message,
        requestId: req.requestId 
      });
    });
    
    const response = await request(testApp)
      .get('/test-logged');
    
    expect(response.status).toBe(500);
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        status: 500
      }),
      'Request failed'
    );
  });
});