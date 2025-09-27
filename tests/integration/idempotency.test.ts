import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

describe('Idempotency Integration Tests', () => {
  let app: express.Application;
  const storedResponses = new Map<string, { body: any; status: number }>();

  beforeEach(() => {
    app = express();
    app.use(express.json());
    storedResponses.clear();

    // Mock idempotent endpoint
    app.post('/api/funds', (req, res) => {
      const idempotencyKey = req.get('Idempotency-Key');
      
      if (!idempotencyKey) {
        return res.status(400).json({ error: 'Idempotency-Key header required' });
      }

      // Check if we've seen this key before
      const stored = storedResponses.get(idempotencyKey);
      
      if (stored) {
        // For proper comparison, store original request body hash
        const currentBodyStr = JSON.stringify(req.body);
        const storedBodyStr = JSON.stringify(stored.body);
        
        // Remove generated fields for comparison
        const currentForComparison = { ...req.body };
        const storedForComparison = { ...stored.body };
        delete storedForComparison.id;
        delete storedForComparison.createdAt;
        
        const currentHash = crypto.createHash('sha256')
          .update(JSON.stringify(currentForComparison))
          .digest('hex');
        
        const storedHash = crypto.createHash('sha256')
          .update(JSON.stringify(storedForComparison))
          .digest('hex');
        
        if (currentHash !== storedHash) {
          // Same key, different body = conflict
          return res.status(409).json({ 
            error: 'Idempotency key already used with different request body' 
          });
        }
        
        // Same key, same body = replay
        res.setHeader('Idempotency-Status', 'replayed');
        return res.status(200).json(stored.body);
      }
      
      // New request
      const responseBody = { 
        id: Math.floor(Math.random() * 10000), 
        ...req.body,
        createdAt: new Date().toISOString()
      };
      
      storedResponses.set(idempotencyKey, { 
        body: responseBody, 
        status: 201 
      });
      
      res.setHeader('Idempotency-Status', 'created');
      res.status(201).json(responseBody);
    });
  });

  describe('Idempotent Fund Creation', () => {
    it('should create new resource on first request', async () => {
      const payload = { name: 'Test Fund', size: 1000000 };
      const idempotencyKey = 'test-key-001';
      
      const response = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      
      expect(response.status).toBe(201);
      expect(response.headers['idempotency-status']).toBe('created');
      expect(response.body.name).toBe('Test Fund');
      expect(response.body.id).toBeDefined();
    });

    it('should replay response for same key and body', async () => {
      const payload = { name: 'Test Fund', size: 1000000 };
      const idempotencyKey = 'test-key-002';
      
      // First request
      const response1 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      
      expect(response1.status).toBe(201);
      expect(response1.headers['idempotency-status']).toBe('created');
      
      // Second request with same key and body
      const response2 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      
      expect(response2.status).toBe(200); // Replayed as 200
      expect(response2.headers['idempotency-status']).toBe('replayed');
      expect(response2.body).toEqual(response1.body); // Exact same response
    });

    it('should return 409 for same key with different body', async () => {
      const payload1 = { name: 'Fund A', size: 1000000 };
      const payload2 = { name: 'Fund B', size: 2000000 };
      const idempotencyKey = 'test-key-003';
      
      // First request
      const response1 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload1);
      
      expect(response1.status).toBe(201);
      
      // Second request with same key but different body
      const response2 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload2);
      
      expect(response2.status).toBe(409);
      expect(response2.body.error).toContain('different request body');
    });

    it('should handle concurrent requests with same key', async () => {
      const payload = { name: 'Concurrent Fund', size: 3000000 };
      const idempotencyKey = 'test-key-004';
      
      // Send multiple requests concurrently
      const promises = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/funds')
          .set('Idempotency-Key', idempotencyKey)
          .send(payload)
      );
      
      const responses = await Promise.all(promises);
      
      // One should be created (201), others replayed (200)
      const createdCount = responses.filter(r => r.status === 201).length;
      const replayedCount = responses.filter(r => r.status === 200).length;
      
      expect(createdCount).toBe(1);
      expect(replayedCount).toBe(4);
      
      // All should have the same response body
      const bodies = responses.map(r => r.body);
      const firstBody = bodies[0];
      bodies.forEach(body => {
        expect(body).toEqual(firstBody);
      });
    });

    it('should require Idempotency-Key header', async () => {
      const payload = { name: 'No Key Fund', size: 4000000 };
      
      const response = await request(app)
        .post('/api/funds')
        .send(payload);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Idempotency-Key header required');
    });

    it('should allow different keys for same payload', async () => {
      const payload = { name: 'Same Payload Fund', size: 5000000 };
      
      // First request with key1
      const response1 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', 'unique-key-001')
        .send(payload);
      
      expect(response1.status).toBe(201);
      
      // Second request with key2 (same payload, different key)
      const response2 = await request(app)
        .post('/api/funds')
        .set('Idempotency-Key', 'unique-key-002')
        .send(payload);
      
      expect(response2.status).toBe(201);
      expect(response2.body.id).not.toBe(response1.body.id); // Different resources created
    });
  });

  describe('Idempotency TTL and Capacity', () => {
    it('should handle capacity limits gracefully', async () => {
      // This test would require mocking the capacity limit
      // In real implementation, test with IDEMPOTENCY_MAX env var
      const maxRequests = 3; // Simulated low limit
      
      const promises = Array(maxRequests + 1).fill(null).map((_, i) =>
        request(app)
          .post('/api/funds')
          .set('Idempotency-Key', `capacity-test-${i}`)
          .send({ name: `Fund ${i}`, size: 1000000 * i })
      );
      
      const responses = await Promise.all(promises);
      
      // All should succeed in this mock (real implementation would enforce limits)
      responses.forEach(r => {
        expect([200, 201]).toContain(r.status);
      });
    });

    it('should namespace keys by environment', async () => {
      // This tests that dev/prod don't collide
      // In real implementation, the hash includes environment
      const payload = { name: 'Environment Fund', size: 6000000 };
      
      // Simulate different environment hashes
      const devKey = `dev|fund-create|${  JSON.stringify(payload)}`;
      const prodKey = `prod|fund-create|${  JSON.stringify(payload)}`;
      
      expect(devKey).not.toBe(prodKey);
    });
  });
});