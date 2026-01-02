 
 
 
 
 
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response } from 'express';
import express from 'express';
import { idempotency } from '../../middleware/idempotency';

// Mock Express app with idempotency middleware
const app = express();
app.use(express.json());
app.use(idempotency);

app.post('/api/test', (req: Request, res: Response) => {
  res.json({ id: 'test-fund', timestamp: Date.now() });
});

describe('API Idempotency Contract', () => {
  beforeEach(() => {
    vi['clearAllMocks']();
  });

  it('returns 409 when same key used with different request body', async () => {
    const idempotencyKey = 'test-key-123';
    
    // First request
    const firstResponse = await request(app)
      .post('/api/test')
      .set('Idempotency-Key', idempotencyKey)
      .send({ data: 'first request' });
    
    expect(firstResponse.status).toBe(200);
    
    // Second request with same key but different body should return 409
    const secondResponse = await request(app)
      .post('/api/test')
      .set('Idempotency-Key', idempotencyKey)
      .send({ data: 'different request' });
    
    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.error).toMatch(/different request body/i);
  });

  it('returns cached response when same key and body used', async () => {
    const idempotencyKey = 'test-key-456';
    const requestBody = { data: 'identical request' };
    
    // First request
    const firstResponse = await request(app)
      .post('/api/test')
      .set('Idempotency-Key', idempotencyKey)
      .send(requestBody);
    
    expect(firstResponse.status).toBe(200);
    
    // Second request with same key and same body should return cached response
    const secondResponse = await request(app)
      .post('/api/test')
      .set('Idempotency-Key', idempotencyKey)
      .send(requestBody);
    
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body).toEqual(firstResponse.body);
  });

  it('processes normally when no idempotency key provided', async () => {
    const response = await request(app)
      .post('/api/test')
      .send({ data: 'no key request' });
    
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('test-fund');
  });
});
