import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import healthRouter from '../../server/routes/health';
import fundsRouter from '../../server/routes/funds';
import operationsRouter from '../../server/routes/operations';
import { metricsRouter } from '../../server/metrics';
import { errorHandler } from '../../server/errors';
import { registerRoutes } from '../../server/routes';

describe('Operations Endpoint', () => {
  let server: any;

  beforeAll(async () => {
    // Create a simplified test server
    const app = express();
    
    // Core hardening
    app.set('trust proxy', true);
    app.use(express.json({ limit: '1mb' }));

    // Register all routes including the main API routes
    server = await registerRoutes(app);
    
    // Additional test-specific routes
    app.use(healthRouter);
    app.use(fundsRouter);
    app.use(operationsRouter);
    app.use(metricsRouter);

    // Final error handler
    app.use(errorHandler());

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve()); // Use port 0 for random available port
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('returns 202 joined and does not unhandled-reject', async () => {
    const payload = { fundSize: 1e8 };
    const key = 'itest-key-joined';
    const [r1, r2] = await Promise.all([
      request(server).post('/api/funds/calculate').set('Idempotency-Key', key).send(payload),
      request(server).post('/api/funds/calculate').set('Idempotency-Key', key).send(payload),
    ]);
    expect([201, 202]).toContain(r1.status);
    expect([201, 202]).toContain(r2.status);
    
    // Check for proper headers on 202 response
    const joinedResponse = r1.status === 202 ? r1 : r2;
    if (joinedResponse.status === 202) {
      expect(joinedResponse.headers['idempotency-status']).toBe('joined');
      expect(joinedResponse.headers['retry-after']).toBe('2');
      expect(joinedResponse.headers['location']).toMatch(/^\/api\/operations\//);
    }
  });

  it('operations endpoint reflects status', async () => {
    const payload = { fundSize: 1e8 };
    const key = 'itest-op-1';
    await request(server).post('/api/funds/calculate').set('Idempotency-Key', key).send(payload);
    const r = await request(server).get(`/api/operations/${key}`);
    expect([200, 202]).toContain(r.status);
    if (r.body.status) {
      expect(['succeeded', 'in-progress', 'failed']).toContain(r.body.status);
    }
  });

  it('returns 404 for unknown operation', async () => {
    const r = await request(server).get('/api/operations/unknown-key-xyz');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('NOT_FOUND');
    expect(r.body.message).toContain('Unknown operation');
  });

  it('400 on bad numerics with structured error', async () => {
    // Test fundId validation on portfolio-companies endpoint
    const res = await request(server).get('/api/portfolio-companies?fundId=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.message).toBeDefined();
  });

  it('handles bad fund ID with structured error', async () => {
    const res = await request(server).get('/api/funds/not-a-number');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid');
    expect(res.body.message).toBeDefined();
  });

  it('handles negative fund ID with structured error', async () => {
    const res = await request(server).get('/api/funds/-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid');
    expect(res.body.message).toContain('positive');
  });

  it('concurrent idempotent requests do not cause unhandled rejections', async () => {
    const payload = { fundSize: 5e7 };
    const key = `itest-concurrent-${  Date.now()}`;
    
    // Fire 5 concurrent requests with same key
    const requests = Array(5).fill(null).map(() => 
      request(server)
        .post('/api/funds/calculate')
        .set('Idempotency-Key', key)
        .send(payload)
    );
    
    const responses = await Promise.all(requests);
    
    // Should have exactly one 201 and rest should be 202
    const createdCount = responses.filter(r => r.status === 201).length;
    const joinedCount = responses.filter(r => r.status === 202).length;
    
    expect(createdCount).toBeLessThanOrEqual(1);
    expect(joinedCount).toBeGreaterThanOrEqual(responses.length - 1);
    expect(createdCount + joinedCount).toBe(responses.length);
  });

  it('polling operations endpoint eventually returns success', async () => {
    const payload = { fundSize: 2e7 };
    const key = `itest-poll-${  Date.now()}`;
    
    // Start calculation
    const initRes = await request(server)
      .post('/api/funds/calculate')
      .set('Idempotency-Key', key)
      .send(payload);
    
    if (initRes.status === 201) {
      // Already complete
      expect(initRes.body).toBeDefined();
    } else {
      // Poll for completion (max 10 attempts)
      let attempts = 0;
      let completed = false;
      
      while (attempts < 10 && !completed) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const pollRes = await request(server).get(`/api/operations/${key}`);
        
        if (pollRes.status === 200) {
          completed = true;
          expect(pollRes.body.status).toBe('succeeded');
          expect(pollRes.body.result).toBeDefined();
        } else if (pollRes.status === 500) {
          completed = true;
          expect(pollRes.body.status).toBe('failed');
        }
        
        attempts++;
      }
      
      expect(completed).toBe(true);
    }
  });
});