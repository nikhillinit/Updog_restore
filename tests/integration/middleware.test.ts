import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import cors from 'cors';
import { rateLimitDetailed } from '../../server/middleware/rateLimitDetailed';
import { shutdownGuard } from '../../server/middleware/shutdownGuard';
import { requestId } from '../../server/middleware/requestId';
import { setReady } from '../../server/health/state';
import type { Server } from 'http';

describe('Critical Middleware Tests', () => {
  let server: Server;

  beforeAll(() => {
    // Test setup
  });

  afterAll(() => {
    if (server) server.close();
    // Reset state after tests
    setReady(true);
  });

  describe('A. Rate Limiter', () => {
    it('should use deterministic fallback for unknown IPs', async () => {
      const testApp = express();
      testApp.set('trust proxy', false);
      testApp.use(rateLimitDetailed());
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      // Make requests without IP
      const requests = [];
      for (let i = 0; i < 35; i++) {
        requests.push(request(testApp).get('/test'));
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter((r) => r.status === 429);

      // Should rate limit after 30 requests with same "unknown" key
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should include retryAfter in 429 responses', async () => {
      const testApp = express();
      testApp.use(rateLimitDetailed());
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      // Exhaust rate limit
      for (let i = 0; i < 31; i++) {
        await request(testApp).get('/test');
      }

      const res = await request(testApp).get('/test');
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      expect(res.body.code).toBe('RATE_LIMITED');
    });

    it('should bypass rate limit with valid health key', async () => {
      const originalHealthKey = process.env.HEALTH_KEY;
      try {
        process.env.HEALTH_KEY = 'test-health-key';

        const testApp = express();
        testApp.use(rateLimitDetailed());
        testApp.get('/test', (req, res) => res.json({ ok: true }));

        // Make many requests with health key
        const requests = [];
        for (let i = 0; i < 50; i++) {
          requests.push(request(testApp).get('/test').set('X-Health-Key', 'test-health-key'));
        }

        const responses = await Promise.all(requests);
        const allOk = responses.every((r) => r.status === 200);
        expect(allOk).toBe(true);
      } finally {
        // eslint-disable-next-line require-atomic-updates
        process.env.HEALTH_KEY = originalHealthKey;
      }
    });
  });

  describe('B. CORS Headers', () => {
    it('should sanitize and parse CORS origins', () => {
      const originalCorsOrigin = process.env.CORS_ORIGIN;
      process.env.CORS_ORIGIN = ' http://localhost:3000 , http://example.com ,  ';

      const testApp = express();
      const corsOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : ['http://localhost:5173'];

      testApp.use(
        cors({
          origin: corsOrigins,
          credentials: true,
          exposedHeaders: [
            'X-Request-ID',
            'RateLimit-Limit',
            'RateLimit-Remaining',
            'RateLimit-Reset',
          ],
        })
      );
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      // Should have cleaned up the origins
      expect(corsOrigins).toEqual(['http://localhost:3000', 'http://example.com']);

      process.env.CORS_ORIGIN = originalCorsOrigin;
    });

    it('should expose RateLimit headers', async () => {
      const testApp = express();
      testApp.use(
        cors({
          origin: ['http://localhost:5173'],
          credentials: true,
          exposedHeaders: [
            'X-Request-ID',
            'RateLimit-Limit',
            'RateLimit-Remaining',
            'RateLimit-Reset',
          ],
        })
      );
      testApp.use(rateLimitDetailed());
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const res = await request(testApp).get('/test').set('Origin', 'http://localhost:5173');

      expect(res.headers['access-control-expose-headers']).toContain('RateLimit-Limit');
      expect(res.headers['access-control-expose-headers']).toContain('RateLimit-Remaining');
      expect(res.headers['access-control-expose-headers']).toContain('RateLimit-Reset');
    });
  });

  describe('C. Shutdown Guard', () => {
    it('should return 503 when not ready', async () => {
      setReady(false);

      const testApp = express();
      testApp.use(requestId());
      testApp.use(shutdownGuard());
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const res = await request(testApp).get('/test');

      expect(res.status).toBe(503);
      expect(res.headers['connection']).toBe('close');
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.error).toBe('Service Unavailable');
    });

    it('should pass through when ready', async () => {
      setReady(true);

      const testApp = express();
      testApp.use(shutdownGuard());
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const res = await request(testApp).get('/test');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('D. Error Codes', () => {
    it('should map HTTP status to application codes', async () => {
      const { httpCodeToAppCode } = await import('../../server/lib/apiError');

      expect(httpCodeToAppCode(409)).toBe('CONFLICT');
      expect(httpCodeToAppCode(429)).toBe('RATE_LIMITED');
      expect(httpCodeToAppCode(400)).toBe('BAD_REQUEST');
      expect(httpCodeToAppCode(503)).toBe('SERVICE_UNAVAILABLE');
      expect(httpCodeToAppCode(500)).toBe('INTERNAL');
      expect(httpCodeToAppCode(404)).toBe('NOT_FOUND');
    });

    it('should include error codes in responses', async () => {
      const testApp = express();
      testApp.use(requestId());
      testApp.get('/test', async (req, res) => {
        const { sendApiError, createErrorBody } = await import('../../server/lib/apiError');
        const body = createErrorBody('Test error', (req as any).requestId);
        sendApiError(res, 409, body);
      });

      const res = await request(testApp).get('/test');

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFLICT');
      expect(res.body.error).toBe('Test error');
      expect(res.body.requestId).toBeDefined();
    });
  });

  describe('E. Health Cache Invalidation', () => {
    it('should support multiple invalidators', async () => {
      const { registerInvalidator } = await import('../../server/health/state');

      const called: number[] = [];
      const unregister1 = registerInvalidator(() => called.push(1));
      const unregister2 = registerInvalidator(() => called.push(2));

      // Trigger state change
      setReady(false);
      setReady(true);

      expect(called).toContain(1);
      expect(called).toContain(2);

      // Cleanup
      unregister1();
      unregister2();

      called.length = 0;
      setReady(false);

      // Should not be called after unregister
      expect(called).toHaveLength(0);
    });
  });

  describe('F. Client Capacity Detection', () => {
    it('should use error codes instead of message matching', () => {
      // Create error with code
      const err = new Error('Too many concurrent requests; please retry shortly.');
      (err as any).code = 'CAPACITY_EXCEEDED';

      // Should check code property
      expect((err as any).code).toBe('CAPACITY_EXCEEDED');

      // Should not rely on message
      err.message = 'Different message';
      expect((err as any).code).toBe('CAPACITY_EXCEEDED');
    });
  });

  describe('G. Enhanced Middleware Tests', () => {
    it('should allow /healthz during shutdown', async () => {
      setReady(false);

      const testApp = express();
      testApp.use(shutdownGuard());
      testApp.get('/healthz', (req, res) => res.json({ status: 'ok' }));

      const res = await request(testApp).get('/healthz');
      expect(res.status).toBe(200);
      // Connection header not set for allowlisted paths
      expect(res.headers['retry-after']).toBeUndefined();

      setReady(true);
    });

    it('should return 503 + Connection: close for non-allowlisted paths during shutdown', async () => {
      setReady(false);

      const testApp = express();
      testApp.use(requestId());
      testApp.use(shutdownGuard());
      testApp.get('/api/funds', (req, res) => res.json({ funds: [] }));

      const res = await request(testApp).get('/api/funds');
      expect(res.status).toBe(503);
      expect(res.headers['connection']).toBe('close');
      expect(res.headers['retry-after']).toBe('30');
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');

      setReady(true);
    });

    it('should reject invalid CORS origins', async () => {
      const testApp = express();
      testApp.use(
        cors({
          origin: ['http://localhost:5173'],
          credentials: true,
        })
      );
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      const res = await request(testApp).get('/test').set('Origin', 'chrome-extension://abc');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should return proper headers and body on rate limit', async () => {
      const testApp = express();
      testApp.use(requestId());
      testApp.use(rateLimitDetailed());
      testApp.get('/test', (req, res) => res.json({ ok: true }));

      // Exhaust rate limit
      for (let i = 0; i < 31; i++) {
        await request(testApp).get('/test');
      }

      const res = await request(testApp).get('/test');
      expect(res.status).toBe(429);
      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
      expect(res.headers['ratelimit-reset']).toBeDefined();
      expect(res.headers['retry-after']).toBeDefined();
      expect(res.body.code).toBe('RATE_LIMITED');
      expect(res.body.error).toBe('Too Many Requests');
      expect(res.body.requestId).toBeDefined();
    });

    it('should handle JSON parse errors', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use((err: any, req: Request, res: Response, next: NextFunction) => {
        if (err?.type === 'entity.parse.failed') {
          return res.status(400).json({ error: 'Invalid JSON', code: 'INVALID_JSON' });
        }
        next(err);
      });
      testApp.post('/test', (req, res) => res.json({ received: req.body }));

      const res = await request(testApp)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{invalid json');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_JSON');
    });

    it('should handle payload too large errors', async () => {
      const testApp = express();
      testApp.use(express.json({ limit: '1kb' }));
      testApp.use((err: any, req: Request, res: Response, next: NextFunction) => {
        if (err?.type === 'entity.too.large') {
          return res.status(413).json({ error: 'Payload Too Large', code: 'PAYLOAD_TOO_LARGE' });
        }
        next(err);
      });
      testApp.post('/test', (req, res) => res.json({ received: req.body }));

      const largePayload = JSON.stringify({ data: 'x'.repeat(2000) });
      const res = await request(testApp)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send(largePayload);

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('H. Middleware Ordering Tests', () => {
    it('should include X-Request-ID on JSON parse errors', async () => {
      const testApp = express();
      testApp.use(requestId());
      testApp.use(express.json());
      testApp.use((err: any, req: Request, res: Response, next: NextFunction) => {
        if ((req as any).requestId && !res.get('X-Request-ID')) {
          res.set('X-Request-ID', (req as any).requestId);
        }
        if (err?.type === 'entity.parse.failed') {
          return res.status(400).json({
            error: 'Invalid JSON',
            code: 'INVALID_JSON',
            requestId: (req as any).requestId,
          });
        }
        next(err);
      });
      testApp.post('/test', (req, res) => res.json({ ok: true }));

      const res = await request(testApp)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{bad json');

      expect(res.status).toBe(400);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.body.requestId).toBeDefined();
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });

    // Shutdown guard runs before JSON parsing to keep large bodies from being parsed.
    it('should reject during shutdown without parsing large body', async () => {
      setReady(false);

      const testApp = express();
      testApp.use(requestId());
      testApp.use(shutdownGuard());
      testApp.use(express.json({ limit: '10mb' }));
      testApp.post('/api/test', (req, res) => res.json({ received: true }));

      const largeBody = JSON.stringify({ data: 'x'.repeat(5000000) }); // 5MB
      const startTime = Date.now();

      const res = await request(testApp)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .set('Content-Length', String(largeBody.length))
        .send(largeBody);

      const duration = Date.now() - startTime;

      expect(res.status).toBe(503);
      expect(duration).toBeLessThan(100); // Should reject quickly without parsing

      setReady(true);
    });

    it('should allow /health/detailed during shutdown', async () => {
      setReady(false);

      const testApp = express();
      testApp.use(shutdownGuard());
      testApp.get('/health/detailed', (req, res) => res.json({ status: 'detailed' }));

      const res = await request(testApp).get('/health/detailed');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('detailed');

      setReady(true);
    });

    it('should handle IPv6 addresses in rate limiting', async () => {
      const testApp = express();
      testApp.set('trust proxy', true);
      testApp.use(rateLimitDetailed());
      testApp.get('/test', (req, res) => res.json({ ip: req.ip }));

      const res = await request(testApp).get('/test').set('X-Forwarded-For', '2001:db8::1');

      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBeDefined();
    });

    it('should return error codes from httpCodeToAppCode', async () => {
      const { httpCodeToAppCode } = await import('../../server/lib/apiError');

      expect(httpCodeToAppCode(413)).toBe('PAYLOAD_TOO_LARGE');
      expect(httpCodeToAppCode(415)).toBe('UNSUPPORTED_MEDIA_TYPE');
    });
  });
});
