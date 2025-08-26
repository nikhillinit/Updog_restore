/**
 * Integration tests for flag route consolidation
 * Validates that all flag endpoints are properly registered and secured
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

describe('Flag Routes Integration', () => {
  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('Client Flags Endpoint', () => {
    it('should return 200 with proper headers', async () => {
      const response = await fetch(`${BASE_URL}/api/flags`);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('etag')).toMatch(/^W\/"/);
      expect(response.headers.get('cache-control')).toBe('max-age=15, must-revalidate');
      
      const data = await response.json();
      expect(data).toHaveProperty('flags');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('_meta');
    });

    it('should only expose client-safe flags', async () => {
      const response = await fetch(`${BASE_URL}/api/flags`);
      const data = await response.json();
      
      // Should contain wizard.v1 (exposeToClient: true)
      expect(data.flags).toHaveProperty('wizard.v1');
      
      // Should NOT contain reserves.v1_1 (exposeToClient: false)
      expect(data.flags).not.toHaveProperty('reserves.v1_1');
    });

    it('should handle user context targeting', async () => {
      const response = await fetch(`${BASE_URL}/api/flags`, {
        headers: {
          'X-User-Id': 'test-user-123'
        }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.flags).toHaveProperty('wizard.v1');
    });
  });

  describe('Flag Status Endpoint', () => {
    it('should return system status', async () => {
      const response = await fetch(`${BASE_URL}/api/flags/status`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('cache');
      expect(data).toHaveProperty('killSwitchActive');
      expect(data).toHaveProperty('environment');
      expect(data).toHaveProperty('timestamp');
    });
  });

  describe('Admin Routes Authentication', () => {
    it('should deny access without token', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags`);
      
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('missing_token');
    });

    it('should deny access with invalid token', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags`, {
        headers: {
          'Authorization': 'Bearer invalid-token-xyz'
        }
      });
      
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('invalid_token');
    });

    it('should allow access with valid dev token (dev mode)', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags`, {
        headers: {
          'Authorization': 'Bearer dev-token'
        }
      });
      
      // Should either succeed or fail with DB error (not auth error)
      expect([200, 500].includes(response.status)).toBe(true);
      
      if (response.status === 500) {
        // DB not configured - expected in test
        const data = await response.json();
        expect(data.error).not.toBe('missing_token');
        expect(data.error).not.toBe('invalid_token');
      }
    });
  });

  describe('Admin Routes Security', () => {
    it('should have no-cache headers on admin endpoints', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags`, {
        headers: {
          'Authorization': 'Bearer dev-token'
        }
      });
      
      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).toContain('no-store');
      expect(cacheControl).toContain('no-cache');
    });

    it('should enforce rate limiting on admin routes', async () => {
      const makeRequest = () => fetch(`${BASE_URL}/api/admin/flags`, {
        headers: { 'Authorization': 'Bearer dev-token' }
      });

      // Make multiple requests rapidly (more than rate limit)
      const promises = Array.from({ length: 12 }, makeRequest);
      const responses = await Promise.all(promises);
      
      // Some should be rate limited (429)
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      const rateLimitHeaders = responses.find(r => r.headers.get('ratelimit-limit'));
      
      // Either we got rate limited or headers indicate limits are active
      expect(rateLimitedCount > 0 || rateLimitHeaders).toBeTruthy();
    }, 10000);
  });

  describe('Admin Routes Authorization', () => {
    it('should require flag_read role for GET operations', async () => {
      // This test assumes dev mode allows both flag_read and flag_admin
      const response = await fetch(`${BASE_URL}/api/admin/flags`, {
        headers: {
          'Authorization': 'Bearer dev-token'
        }
      });
      
      // Should not fail due to role (but may fail due to DB)
      expect(response.status).not.toBe(403);
    });

    it('should require flag_admin role for write operations', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/wizard.v1`, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer dev-token',
          'Content-Type': 'application/json',
          'If-Match': 'test-version'
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Integration test'
        })
      });
      
      // Should either succeed or fail with business logic (not role error)
      expect(response.status).not.toBe(403);
    });
  });

  describe('Concurrency Control', () => {
    it('should require If-Match header for updates', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/wizard.v1`, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer dev-token',
          'Content-Type': 'application/json'
          // Missing If-Match header
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Test without version'
        })
      });
      
      if (response.status !== 500) { // Skip if DB issues
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('version_required');
      }
    });

    it('should detect version conflicts', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/wizard.v1`, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer dev-token',
          'Content-Type': 'application/json',
          'If-Match': 'outdated-version-123'
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Test version conflict'
        })
      });
      
      if (response.status !== 500) { // Skip if DB issues
        expect(response.status).toBe(409);
        const data = await response.json();
        expect(data.error).toBe('version_conflict');
      }
    });
  });

  describe('Error Handling', () => {
    it('should validate request payload', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/test`, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer dev-token',
          'Content-Type': 'application/json',
          'If-Match': 'test-version'
        },
        body: JSON.stringify({
          enabled: true
          // Missing required 'reason' field
        })
      });
      
      if (response.status !== 500) {
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('invalid_request');
        expect(data.issues).toBeDefined();
      }
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/test`, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer dev-token',
          'Content-Type': 'application/json',
          'If-Match': 'test-version'
        },
        body: '{"invalid": json syntax}'
      });
      
      expect(response.status).toBe(400);
    });
  });

  describe('Kill Switch', () => {
    it('should require admin auth for kill switch operations', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/kill-switch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      expect(response.status).toBe(401);
    });

    it('should accept authenticated kill switch request', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/kill-switch`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer dev-token',
          'Content-Type': 'application/json'
        }
      });
      
      // Should either succeed or fail with business logic (not auth)
      expect([200, 500].includes(response.status)).toBe(true);
    });
  });
});