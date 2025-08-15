import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Health Endpoint Cache TTL', () => {
  let app: express.Application;
  let healthData = { status: 'ok', timestamp: new Date().toISOString() };
  
  beforeEach(() => {
    vi.useFakeTimers();
    
    // Simple cache implementation
    let cache: { ts: number; data: any } = { ts: 0, data: null };
    const CACHE_MS = 1500;
    
    app = express();
    
    app.get('/readyz', (req, res) => {
      res.set('Cache-Control', 'no-store, max-age=0');
      res.set('Pragma', 'no-cache');
      
      // Return cached if fresh
      if (Date.now() - cache.ts < CACHE_MS && cache.data) {
        res.set('X-Health-From-Cache', '1');
        return res.json(cache.data);
      }
      
      // Generate new response
      const newData = {
        ready: true,
        timestamp: new Date().toISOString(),
        checks: { api: 'ok', database: 'ok' }
      };
      
      cache = { ts: Date.now(), data: newData };
      res.json(newData);
    });
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return cached response within TTL window', async () => {
    // First request - generates new response
    const response1 = await request(app).get('/readyz');
    expect(response1.status).toBe(200);
    expect(response1.headers['x-health-from-cache']).toBeUndefined();
    const timestamp1 = response1.body.timestamp;
    
    // Second request immediately - should be cached
    const response2 = await request(app).get('/readyz');
    expect(response2.status).toBe(200);
    expect(response2.headers['x-health-from-cache']).toBe('1');
    expect(response2.body.timestamp).toBe(timestamp1);
    
    // Third request after 1 second - still cached
    vi.advanceTimersByTime(1000);
    const response3 = await request(app).get('/readyz');
    expect(response3.status).toBe(200);
    expect(response3.headers['x-health-from-cache']).toBe('1');
    expect(response3.body.timestamp).toBe(timestamp1);
  });

  it('should generate new response after TTL expires', async () => {
    // First request
    const response1 = await request(app).get('/readyz');
    const timestamp1 = response1.body.timestamp;
    
    // Advance time past TTL (1500ms)
    vi.advanceTimersByTime(1600);
    
    // Second request - should generate new response
    const response2 = await request(app).get('/readyz');
    expect(response2.status).toBe(200);
    expect(response2.headers['x-health-from-cache']).toBeUndefined();
    expect(response2.body.timestamp).not.toBe(timestamp1);
  });

  it('should set cache control headers on all responses', async () => {
    // Fresh response
    const response1 = await request(app).get('/readyz');
    expect(response1.headers['cache-control']).toBe('no-store, max-age=0');
    expect(response1.headers['pragma']).toBe('no-cache');
    
    // Cached response
    const response2 = await request(app).get('/readyz');
    expect(response2.headers['cache-control']).toBe('no-store, max-age=0');
    expect(response2.headers['pragma']).toBe('no-cache');
    expect(response2.headers['x-health-from-cache']).toBe('1');
  });
});

describe('Error Handler Header Preservation', () => {
  it('should preserve X-Request-ID when already set by middleware', async () => {
    const app = express();
    
    // Middleware that sets X-Request-ID
    app.use((req: any, res, next) => {
      req.requestId = 'req-123';
      res.setHeader('X-Request-ID', 'req-123');
      next();
    });
    
    // Route that throws error
    app.get('/test', (req, res, next) => {
      const error: any = new Error('Test error');
      error.status = 400;
      next(error);
    });
    
    // Error handler
    app.use((err: any, req: any, res: any, next: any) => {
      const rid = req.requestId || 'unknown';
      
      // Only set if not already set
      if (!res.get('X-Request-ID')) {
        res.set('X-Request-ID', rid);
      }
      
      // Should not double-send
      if (res.headersSent) {
        return;
      }
      
      res.status(err.status || 500).json({
        error: err.message,
        requestId: rid
      });
    });
    
    const response = await request(app).get('/test');
    
    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toBe('req-123');
    expect(response.body.requestId).toBe('req-123');
    expect(response.body.error).toBe('Test error');
  });

  it('should not attempt to send response if headers already sent', async () => {
    const app = express();
    let errorHandlerCalled = false;
    let headersSentCheck = false;
    
    app.get('/test', (req, res, next) => {
      // Start sending response
      res.status(200);
      res.setHeader('Content-Type', 'text/plain');
      res.write('partial');
      
      // Simulate error after partial send
      setTimeout(() => {
        const error = new Error('After partial send');
        next(error);
        // End the response to prevent hanging
        res.end();
      }, 10);
    });
    
    // Error handler
    app.use((err: any, req: any, res: any, next: any) => {
      errorHandlerCalled = true;
      
      if (res.headersSent) {
        headersSentCheck = true;
        return; // Don't attempt to send
      }
      
      // This should not be reached
      res.status(500).json({ error: 'Should not send' });
    });
    
    const response = await request(app)
      .get('/test')
      .expect(200); // Should get 200 since headers were sent before error
    
    // Wait a bit for error handler to be called
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(errorHandlerCalled).toBe(true);
    expect(headersSentCheck).toBe(true);
  });
});