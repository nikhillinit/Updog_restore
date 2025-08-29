/**
 * Idempotency and Deduplication Tests
 * Validates exactly-once processing and request deduplication
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { idempotency, clearIdempotencyCache } from '../../server/middleware/idempotency';
import { dedupe, clearDedupeCache } from '../../server/middleware/dedupe';

describe('Idempotency Middleware', () => {
  let app: Express;
  let requestCount = 0;
  
  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Apply idempotency middleware
    app.use(idempotency({
      ttl: 60,
      memoryFallback: true,
    }));
    
    // Test endpoint
    app.post('/api/funds', (req, res) => {
      requestCount++;
      res.status(201).json({
        id: 'fund-123',
        name: req.body.name,
        requestCount,
        timestamp: Date.now(),
      });
    });
    
    // Endpoint without idempotency
    app.post('/api/no-idempotency', (req, res) => {
      res.json({ message: 'No idempotency' });
    });
  });
  
  beforeEach(() => {
    requestCount = 0;
    clearIdempotencyCache();
  });
  
  describe('Header-based Idempotency', () => {
    it('should return same response for duplicate requests with same key', async () => {
      const idempotencyKey = 'test-key-123';
      const payload = { name: 'Test Fund' };
      
      // First request
      const response1 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      
      expect(response1.status).toBe(201);
      expect(response1.body.id).toBe('fund-123');
      expect(response1.body.requestCount).toBe(1);
      expect(response1.headers['x-idempotency-key']).toBe(idempotencyKey);
      
      // Duplicate request with same key
      const response2 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      
      expect(response2.status).toBe(201);
      expect(response2.body.id).toBe('fund-123');
      expect(response2.body.requestCount).toBe(1); // Same as first
      expect(response2.headers['x-idempotent-replay']).toBe('true');
      
      // Handler should only be called once
      expect(requestCount).toBe(1);
    });
    
    it('should process different idempotency keys separately', async () => {
      const payload = { name: 'Test Fund' };
      
      // First request
      const response1 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', 'key-1')
        .send(payload);
      
      expect(response1.body.requestCount).toBe(1);
      
      // Different key
      const response2 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', 'key-2')
        .send(payload);
      
      expect(response2.body.requestCount).toBe(2);
      
      // Handler called twice
      expect(requestCount).toBe(2);
    });
    
    it('should support alternative header names', async () => {
      const idempotencyKey = 'alt-key-123';
      const payload = { name: 'Test Fund' };
      
      // Using X-Idempotency-Key
      const response1 = await request(app)
        .post('/api/funds')
        .set('X-Idempotency-Key', idempotencyKey)
        .send(payload);
      
      expect(response1.status).toBe(201);
      
      // Same key with alternative header
      const response2 = await request(app)
        .post('/api/funds')
        .set('X-Idempotency-Key', idempotencyKey)
        .send(payload);
      
      expect(response2.headers['x-idempotent-replay']).toBe('true');
      expect(requestCount).toBe(1);
    });
    
    it('should process requests without idempotency key normally', async () => {
      const payload = { name: 'Test Fund' };
      
      // First request without key
      const response1 = await request(app)
        .post('/api/funds')
        .send(payload);
      
      expect(response1.status).toBe(201);
      expect(response1.body.requestCount).toBe(1);
      
      // Second request without key
      const response2 = await request(app)
        .post('/api/funds')
        .send(payload);
      
      expect(response2.status).toBe(201);
      expect(response2.body.requestCount).toBe(2);
      
      // Both processed
      expect(requestCount).toBe(2);
    });
  });
  
  describe('Response Caching', () => {
    it('should cache successful responses', async () => {
      const idempotencyKey = 'cache-test';
      
      const response1 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', idempotencyKey)
        .send({ name: 'Cached Fund' });
      
      const timestamp1 = response1.body.timestamp;
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response2 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', idempotencyKey)
        .send({ name: 'Different Name' }); // Different payload, but same key
      
      // Should return cached response
      expect(response2.body.timestamp).toBe(timestamp1);
      expect(response2.body.name).toBe('Cached Fund'); // Original name
    });
    
    it('should preserve response headers', async () => {
      const customApp = express();
      customApp.use(express.json());
      customApp.use(idempotency());
      
      customApp.post('/api/test', (req, res) => {
        res.setHeader('X-Custom-Header', 'test-value');
        res.setHeader('X-Rate-Limit', '100');
        res.json({ success: true });
      });
      
      const idempotencyKey = 'header-test';
      
      // First request
      const response1 = await request(customApp)
        .post('/api/test')
        .set('Idempotency-Key', idempotencyKey)
        .send({});
      
      expect(response1.headers['x-custom-header']).toBe('test-value');
      expect(response1.headers['x-rate-limit']).toBe('100');
      
      // Cached request
      const response2 = await request(customApp)
        .post('/api/test')
        .set('Idempotency-Key', idempotencyKey)
        .send({});
      
      // Headers should be preserved
      expect(response2.headers['x-custom-header']).toBe('test-value');
      expect(response2.headers['x-rate-limit']).toBe('100');
      expect(response2.headers['x-idempotent-replay']).toBe('true');
    });
  });
});

describe('Request Deduplication Middleware', () => {
  let app: Express;
  let simulationCount = 0;
  
  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Apply deduplication middleware
    app.use(dedupe({
      ttl: 60,
      memoryFallback: true,
      useSingleflight: true,
    }));
    
    // Simulation endpoint
    app.post('/api/simulations', async (req, res) => {
      simulationCount++;
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      res.json({
        id: 'sim-123',
        params: req.body,
        simulationCount,
        timestamp: Date.now(),
      });
    });
  });
  
  beforeEach(() => {
    simulationCount = 0;
    clearDedupeCache();
  });
  
  describe('Request Hash Deduplication', () => {
    it('should dedupe identical POST requests', async () => {
      const payload = {
        fundSize: 50000000,
        deploymentPeriod: 3,
        targetMultiple: 3.0,
      };
      
      // First request
      const response1 = await request(app)
        .post('/api/simulations')
        .send(payload);
      
      expect(response1.status).toBe(200);
      expect(response1.body.simulationCount).toBe(1);
      expect(response1.headers['x-dedup-key']).toBeDefined();
      
      // Duplicate request (same payload)
      const response2 = await request(app)
        .post('/api/simulations')
        .send(payload);
      
      expect(response2.status).toBe(200);
      expect(response2.body.simulationCount).toBe(1); // Same as first
      expect(response2.headers['x-request-dedup']).toBe('true');
      expect(response2.headers['x-dedup-count']).toBe('2');
      
      // Handler only called once
      expect(simulationCount).toBe(1);
    });
    
    it('should process different payloads separately', async () => {
      const payload1 = { fundSize: 50000000 };
      const payload2 = { fundSize: 100000000 };
      
      // First request
      const response1 = await request(app)
        .post('/api/simulations')
        .send(payload1);
      
      expect(response1.body.simulationCount).toBe(1);
      
      // Different payload
      const response2 = await request(app)
        .post('/api/simulations')
        .send(payload2);
      
      expect(response2.body.simulationCount).toBe(2);
      
      // Both processed
      expect(simulationCount).toBe(2);
    });
    
    it('should include query parameters in hash', async () => {
      const payload = { fundSize: 50000000 };
      
      // Request with query param
      const response1 = await request(app)
        .post('/api/simulations?version=1')
        .send(payload);
      
      expect(response1.body.simulationCount).toBe(1);
      
      // Same payload, different query
      const response2 = await request(app)
        .post('/api/simulations?version=2')
        .send(payload);
      
      expect(response2.body.simulationCount).toBe(2);
      
      // Both processed (different hashes)
      expect(simulationCount).toBe(2);
    });
  });
  
  describe('Singleflight Pattern', () => {
    it('should coalesce concurrent identical requests', async () => {
      const payload = { fundSize: 50000000 };
      
      // Launch multiple concurrent requests
      const promises = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/simulations')
          .send(payload)
      );
      
      const responses = await Promise.all(promises);
      
      // All should get same response
      const firstResponse = responses[0].body;
      responses.forEach(response => {
        expect(response.body).toEqual(firstResponse);
      });
      
      // Handler only called once
      expect(simulationCount).toBe(1);
      
      // Some should be marked as in-flight dedup
      const inflightResponses = responses.filter(r => 
        r.headers['x-request-dedup'] === 'inflight'
      );
      expect(inflightResponses.length).toBeGreaterThan(0);
    });
    
    it('should handle in-flight request failures', async () => {
      const failApp = express();
      failApp.use(express.json());
      failApp.use(dedupe({ useSingleflight: true }));
      
      let callCount = 0;
      failApp.post('/api/fail', async (req, res) => {
        callCount++;
        if (callCount === 1) {
          // First request fails
          await new Promise(resolve => setTimeout(resolve, 50));
          res.status(500).json({ error: 'Failed' });
        } else {
          // Subsequent request succeeds
          res.json({ success: true, callCount });
        }
      });
      
      // First request (will fail)
      const promise1 = request(failApp)
        .post('/api/fail')
        .send({ test: true });
      
      // Second request (concurrent, should not wait for failed request)
      await new Promise(resolve => setTimeout(resolve, 10));
      const promise2 = request(failApp)
        .post('/api/fail')
        .send({ test: true });
      
      const [response1, response2] = await Promise.all([promise1, promise2]);
      
      expect(response1.status).toBe(500);
      expect(response2.status).toBe(200);
      expect(callCount).toBe(2); // Both processed
    });
  });
  
  describe('TTL and Expiration', () => {
    it('should expire cached responses after TTL', async () => {
      const ttlApp = express();
      ttlApp.use(express.json());
      ttlApp.use(dedupe({ ttl: 1, memoryFallback: true })); // 1 second TTL
      
      let callCount = 0;
      ttlApp.post('/api/ttl', (req, res) => {
        callCount++;
        res.json({ callCount });
      });
      
      const payload = { test: true };
      
      // First request
      const response1 = await request(ttlApp)
        .post('/api/ttl')
        .send(payload);
      
      expect(response1.body.callCount).toBe(1);
      
      // Immediate duplicate (should be cached)
      const response2 = await request(ttlApp)
        .post('/api/ttl')
        .send(payload);
      
      expect(response2.body.callCount).toBe(1);
      expect(response2.headers['x-request-dedup']).toBe('true');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should process new request
      const response3 = await request(ttlApp)
        .post('/api/ttl')
        .send(payload);
      
      expect(response3.body.callCount).toBe(2);
      expect(response3.headers['x-request-dedup']).toBeUndefined();
    });
  });
});

describe('Idempotency + Deduplication Combined', () => {
  let app: Express;
  let processCount = 0;
  
  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Apply both middlewares
    app.use(idempotency());
    app.use(dedupe());
    
    app.post('/api/critical', (req, res) => {
      processCount++;
      res.status(201).json({
        id: 'critical-123',
        processCount,
      });
    });
  });
  
  beforeEach(() => {
    processCount = 0;
    clearIdempotencyCache();
    clearDedupeCache();
  });
  
  it('should handle both idempotency key and request deduplication', async () => {
    const payload = { amount: 1000 };
    
    // Request with idempotency key
    const response1 = await request(app)
      .post('/api/critical')
      .set('Idempotency-Key', 'idem-123')
      .send(payload);
    
    expect(response1.body.processCount).toBe(1);
    
    // Same idempotency key (handled by idempotency middleware)
    const response2 = await request(app)
      .post('/api/critical')
      .set('Idempotency-Key', 'idem-123')
      .send(payload);
    
    expect(response2.headers['x-idempotent-replay']).toBe('true');
    expect(response2.body.processCount).toBe(1);
    
    // No idempotency key but same payload (handled by dedupe middleware)
    const response3 = await request(app)
      .post('/api/critical')
      .send(payload);
    
    expect(response3.headers['x-request-dedup']).toBe('true');
    expect(response3.body.processCount).toBe(1);
    
    // Different idempotency key and different payload (new request)
    const response4 = await request(app)
      .post('/api/critical')
      .set('Idempotency-Key', 'idem-456')
      .send({ amount: 2000 });
    
    expect(response4.body.processCount).toBe(2);
    
    // Total: only 2 actual processing
    expect(processCount).toBe(2);
  });
});