/**
 * Integration tests for RLS request-scoped transaction middleware
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { withRLSTransaction, verifyRLSContext } from '../../server/middleware/with-rls-transaction.js';
import { requireSecureContext } from '../../server/lib/secure-context.js';
import { requireIfMatch } from '../../server/lib/http-preconditions.js';
import { withIdempotency } from '../../server/lib/idempotency.js';
import { requireFundLock } from '../../server/lib/locks.js';

// Mock database pool
const mockPool = {
  connect: vi.fn(),
};

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

// Test JWT secret
const JWT_SECRET = 'test-secret';
process.env.JWT_SECRET = JWT_SECRET;

describe('RLS Middleware Integration', () => {
  let app: express.Application;
  
  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Mock the database module
    vi.mock('../../server/lib/db.js', () => ({
      db: {
        pool: mockPool,
        transaction: vi.fn(),
        execute: vi.fn(),
      }
    }));
    
    mockPool.connect.mockResolvedValue(mockClient);
  });
  
  afterAll(() => {
    vi.clearAllMocks();
  });
  
  describe('Authentication and Context', () => {
    it('should reject requests without JWT', async () => {
      app.get('/test/auth', requireSecureContext, (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app)
        .get('/test/auth')
        .expect(401);
      
      expect(response.body).toEqual({
        error: 'unauthorized',
        message: 'Valid JWT token required'
      });
    });
    
    it('should reject requests with invalid JWT', async () => {
      app.get('/test/auth-invalid', requireSecureContext, (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app)
        .get('/test/auth-invalid')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      
      expect(response.body.error).toBe('unauthorized');
    });
    
    it('should accept valid JWT and extract context', async () => {
      app.get('/test/auth-valid', requireSecureContext, (req: any, res) => {
        res.json({ context: req.context });
      });
      
      const token = jwt.sign(
        {
          sub: 'user-123',
          email: 'test@example.com',
          role: 'admin',
          org_id: 'org-456',
          partner_id: 'partner-789'
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      const response = await request(app)
        .get('/test/auth-valid')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.context).toMatchObject({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        orgId: 'org-456',
        partnerId: 'partner-789'
      });
    });
    
    it('should ignore client-supplied user headers', async () => {
      app.get('/test/headers', requireSecureContext, (req: any, res) => {
        res.json({ 
          context: req.context,
          headers: {
            'x-user-id': req.headers['x-user-id'],
            'x-org-id': req.headers['x-org-id']
          }
        });
      });
      
      const token = jwt.sign(
        { sub: 'real-user', email: 'real@example.com', role: 'user', org_id: 'real-org' },
        JWT_SECRET
      );
      
      const response = await request(app)
        .get('/test/headers')
        .set('Authorization', `Bearer ${token}`)
        .set('X-User-Id', 'fake-user')
        .set('X-Org-Id', 'fake-org')
        .expect(200);
      
      expect(response.body.context.userId).toBe('real-user');
      expect(response.body.context.orgId).toBe('real-org');
      expect(response.body.headers['x-user-id']).toBeUndefined();
      expect(response.body.headers['x-org-id']).toBeUndefined();
    });
  });
  
  describe('RLS Transaction Scoping', () => {
    it('should set RLS context in transaction', async () => {
      const token = jwt.sign(
        { sub: 'user-123', email: 'test@example.com', role: 'admin', org_id: 'org-456' },
        JWT_SECRET
      );
      
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return Promise.resolve();
        if (query.includes('set_config')) return Promise.resolve({ rows: [{}] });
        if (query.includes('SET LOCAL')) return Promise.resolve();
        if (query.includes('current_setting')) {
          return Promise.resolve({
            rows: [{
              current_user: 'user-123',
              current_org: 'org-456',
              current_fund: '',
              current_role: 'admin'
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });
      
      app.get('/test/rls', 
        requireSecureContext,
        withRLSTransaction(),
        async (req: any, res) => {
          const context = await verifyRLSContext(req);
          res.json({ context });
        }
      );
      
      const response = await request(app)
        .get('/test/rls')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.context).toMatchObject({
        current_user: 'user-123',
        current_org: 'org-456',
        current_role: 'admin'
      });
      
      // Verify SET LOCAL was called
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        expect.arrayContaining(['user-123', 'test@example.com', 'org-456'])
      );
    });
    
    it('should rollback transaction on error', async () => {
      const token = jwt.sign(
        { sub: 'user-123', email: 'test@example.com', role: 'admin', org_id: 'org-456' },
        JWT_SECRET
      );
      
      app.get('/test/rls-error',
        requireSecureContext,
        withRLSTransaction(),
        async (req: any, res) => {
          throw new Error('Test error');
        }
      );
      
      await request(app)
        .get('/test/rls-error')
        .set('Authorization', `Bearer ${token}`)
        .expect(500);
      
      // Verify ROLLBACK was called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
  
  describe('Concurrency Control', () => {
    it('should require If-Match header when configured', async () => {
      app.post('/test/if-match',
        requireIfMatch(),
        (req, res) => {
          res.json({ success: true });
        }
      );
      
      const response = await request(app)
        .post('/test/if-match')
        .send({ data: 'test' })
        .expect(428);
      
      expect(response.body).toEqual({
        error: 'precondition_required',
        message: 'If-Match header is required for this operation',
        code: 'PRECONDITION_REQUIRED'
      });
    });
    
    it('should process request with valid If-Match header', async () => {
      app.post('/test/if-match-valid',
        requireIfMatch(),
        (req: any, res) => {
          res.json({ 
            success: true,
            ifMatch: req.ifMatch
          });
        }
      );
      
      const response = await request(app)
        .post('/test/if-match-valid')
        .set('If-Match', 'W/"abc123"')
        .send({ data: 'test' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.ifMatch).toBe('abc123');
    });
  });
  
  describe('Idempotency', () => {
    it('should handle idempotent requests', async () => {
      const token = jwt.sign(
        { sub: 'user-123', email: 'test@example.com', role: 'admin', org_id: 'org-456' },
        JWT_SECRET
      );
      
      mockClient.query.mockImplementation((query: string, params: any[]) => {
        if (query.includes('INSERT INTO idempotency_keys')) {
          return Promise.resolve({ rowCount: 1, rows: [{ key: params[0] }] });
        }
        if (query.includes('UPDATE idempotency_keys')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [] });
      });
      
      app.post('/test/idempotent',
        requireSecureContext,
        withRLSTransaction(),
        withIdempotency(),
        (req: any, res) => {
          res.json({ 
            result: 'success',
            timestamp: Date.now()
          });
        }
      );
      
      const response = await request(app)
        .post('/test/idempotent')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'test-key-123')
        .send({ data: 'test' })
        .expect(200);
      
      expect(response.body.result).toBe('success');
      expect(response.headers['x-idempotency-key']).toBe('test-key-123');
    });
    
    it('should replay cached response for duplicate idempotency key', async () => {
      const token = jwt.sign(
        { sub: 'user-123', email: 'test@example.com', role: 'admin', org_id: 'org-456' },
        JWT_SECRET
      );
      
      const cachedResponse = { result: 'cached', timestamp: 12345 };
      
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('INSERT INTO idempotency_keys')) {
          return Promise.resolve({ rowCount: 0 }); // Already exists
        }
        if (query.includes('SELECT status')) {
          return Promise.resolve({ 
            rows: [{
              status: 'succeeded',
              params_hash: 'hash123',
              response: cachedResponse,
              response_status: 200
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });
      
      app.post('/test/idempotent-replay',
        requireSecureContext,
        withRLSTransaction(),
        withIdempotency(),
        (req: any, res) => {
          res.json({ 
            result: 'new',
            timestamp: Date.now()
          });
        }
      );
      
      const response = await request(app)
        .post('/test/idempotent-replay')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'test-key-replay')
        .send({ data: 'test' })
        .expect(200);
      
      expect(response.body).toEqual(cachedResponse);
      expect(response.headers['x-idempotent-replay']).toBe('1');
    });
  });
  
  describe('Fund Locking', () => {
    it('should acquire fund lock for operations', async () => {
      const token = jwt.sign(
        { 
          sub: 'user-123',
          email: 'test@example.com',
          role: 'admin',
          org_id: 'org-456'
        },
        JWT_SECRET
      );
      
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('pg_try_advisory_xact_lock')) {
          return Promise.resolve({ rows: [{ acquired: true }] });
        }
        return Promise.resolve({ rows: [] });
      });
      
      app.post('/test/fund/:fundId/update',
        requireSecureContext,
        (req: any, res, next) => {
          req.context.fundId = req.params.fundId;
          next();
        },
        withRLSTransaction(),
        requireFundLock(),
        (req: any, res) => {
          res.json({ 
            success: true,
            fundId: req.params.fundId
          });
        }
      );
      
      const response = await request(app)
        .post('/test/fund/fund-789/update')
        .set('Authorization', `Bearer ${token}`)
        .send({ data: 'test' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.fundId).toBe('fund-789');
      
      // Verify lock was attempted
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_try_advisory_xact_lock'),
        expect.any(Array)
      );
    });
    
    it('should handle lock contention', async () => {
      const token = jwt.sign(
        { 
          sub: 'user-123',
          email: 'test@example.com',
          role: 'admin',
          org_id: 'org-456'
        },
        JWT_SECRET
      );
      
      let lockAttempts = 0;
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('pg_try_advisory_xact_lock')) {
          lockAttempts++;
          return Promise.resolve({ rows: [{ acquired: false }] });
        }
        if (query.includes('pg_advisory_xact_lock')) {
          // Simulate timeout
          const error: any = new Error('Lock timeout');
          error.code = '55P03';
          return Promise.reject(error);
        }
        return Promise.resolve({ rows: [] });
      });
      
      app.post('/test/fund/:fundId/locked',
        requireSecureContext,
        (req: any, res, next) => {
          req.context.fundId = req.params.fundId;
          next();
        },
        withRLSTransaction(),
        requireFundLock(),
        (req: any, res) => {
          res.json({ success: true });
        }
      );
      
      const response = await request(app)
        .post('/test/fund/fund-999/locked')
        .set('Authorization', `Bearer ${token}`)
        .send({ data: 'test' })
        .expect(503);
      
      expect(response.body).toMatchObject({
        error: 'lock_timeout',
        message: expect.stringContaining('concurrent operation'),
        retryAfter: 2
      });
    });
  });
});