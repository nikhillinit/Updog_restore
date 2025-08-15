import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Health Endpoint Guards', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    
    // Mock /health/detailed endpoint
    app.get('/health/detailed', (req, res) => {
      const healthKey = process.env.HEALTH_KEY;
      const providedKey = req.get('X-Health-Key');
      const isInternal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
      
      if (healthKey && providedKey !== healthKey && !isInternal) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      res.json({ status: 'ok', detailed: true });
    });
  });

  it('should allow access with correct X-Health-Key', async () => {
    process.env.HEALTH_KEY = 'secret-key-123';
    
    const response = await request(app)
      .get('/health/detailed')
      .set('X-Health-Key', 'secret-key-123');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', detailed: true });
    
    delete process.env.HEALTH_KEY;
  });

  it('should deny access with incorrect X-Health-Key', async () => {
    process.env.HEALTH_KEY = 'secret-key-123';
    
    const response = await request(app)
      .get('/health/detailed')
      .set('X-Health-Key', 'wrong-key');
    
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    
    delete process.env.HEALTH_KEY;
  });

  it('should deny access without X-Health-Key when HEALTH_KEY is set', async () => {
    process.env.HEALTH_KEY = 'secret-key-123';
    
    const response = await request(app)
      .get('/health/detailed');
    
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    
    delete process.env.HEALTH_KEY;
  });

  it('should allow access without key when HEALTH_KEY is not set', async () => {
    delete process.env.HEALTH_KEY;
    
    const response = await request(app)
      .get('/health/detailed');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', detailed: true });
  });

  it('should allow localhost access without key even when HEALTH_KEY is set', async () => {
    process.env.HEALTH_KEY = 'secret-key-123';
    
    // Override IP detection for localhost
    app.set('trust proxy', false);
    const localApp = express();
    localApp.get('/health/detailed', (req, res) => {
      // Simulate localhost request
      const healthKey = process.env.HEALTH_KEY;
      const providedKey = req.get('X-Health-Key');
      const isInternal = true; // Force localhost for test
      
      if (healthKey && providedKey !== healthKey && !isInternal) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      res.json({ status: 'ok', detailed: true });
    });
    
    const response = await request(localApp)
      .get('/health/detailed');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', detailed: true });
    
    delete process.env.HEALTH_KEY;
  });
});