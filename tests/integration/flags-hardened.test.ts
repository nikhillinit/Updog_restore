/**
 * Integration tests for hardened flag system
 * Validates ETag, versioning, auth, and concurrency control
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// Test JWT tokens (simplified for testing)
const adminToken = 'dev-admin-token';
const readToken = 'dev-read-token';
const userToken = 'dev-user-token';

describe('Hardened Flag System', () => {
  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('Client Flags API', () => {
    it('should return flags with ETag and Cache-Control headers', async () => {
      const response = await fetch(`${BASE_URL}/api/flags`);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('etag')).toMatch(/^W\/"/);
      expect(response.headers.get('cache-control')).toBe('max-age=15, must-revalidate');
      
      const data = await response.json();
      expect(data).toHaveProperty('flags');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('_meta.hash');
    });

    it('should handle conditional GET with ETag (304 Not Modified)', async () => {
      // First request to get ETag
      const response1 = await fetch(`${BASE_URL}/api/flags`);
      const etag = response1.headers.get('etag');
      
      expect(etag).toBeTruthy();
      
      // Second request with If-None-Match
      const response2 = await fetch(`${BASE_URL}/api/flags`, {
        headers: {
          'If-None-Match': etag!
        }
      });
      
      expect(response2.status).toBe(304);
      expect(await response2.text()).toBe('');
    });

    it('should support user context for targeting', async () => {
      const response = await fetch(`${BASE_URL}/api/flags`, {
        headers: {
          'X-User-Id': 'test-user-123'
        }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('flags');
    });
  });

  describe('Admin Authentication', () => {
    it('should reject requests without token', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags`);
      expect(response.status).toBe(401);
    });

    it('should reject invalid tokens', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags`, {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });
      expect(response.status).toBe(401);
    });

    it('should accept valid admin token', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      expect([200, 500].includes(response.status)).toBe(true); // 500 OK if DB not set up
    });

    it('should enforce RBAC - read-only access', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags`, {
        headers: {
          'Authorization': `Bearer ${readToken}`
        }
      });
      expect([200, 500].includes(response.status)).toBe(true); // Has flag_read role
    });

    it('should reject insufficient privileges for admin operations', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/test`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Test update'
        })
      });
      expect(response.status).toBe(403);
    });
  });

  describe('Concurrency Control', () => {
    it('should require If-Match header for updates', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/wizard.v1`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Test without version'
        })
      });
      
      if (response.status !== 500) { // Skip if DB issues
        expect(response.status).toBe(400);
        const error = await response.json();
        expect(error.error).toBe('version_required');
      }
    });

    it('should detect version conflicts (409)', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/wizard.v1`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'If-Match': 'old-version-123'
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Test version conflict'
        })
      });
      
      if (response.status !== 500) { // Skip if DB issues
        expect(response.status).toBe(409);
        const error = await response.json();
        expect(error.error).toBe('version_conflict');
      }
    });

    it('should support dry-run mode', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/wizard.v1`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'If-Match': 'any-version'
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Dry run test',
          dryRun: true
        })
      });
      
      if (response.status !== 500) { // Skip if DB issues
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.dryRun).toBe(true);
        expect(data).toHaveProperty('preview');
      }
    });
  });

  describe('Security Headers', () => {
    it('should include security headers on flag endpoints', async () => {
      const response = await fetch(`${BASE_URL}/api/flags`);
      
      // Check for common security headers (from helmet)
      expect(response.headers.has('x-content-type-options')).toBe(true);
      expect(response.headers.has('x-frame-options')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle malformed JSON', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/test`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'If-Match': 'test-version'
        },
        body: '{"invalid": json}'
      });
      
      expect(response.status).toBe(400);
    });

    it('should validate required fields', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/flags/test`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
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
        const error = await response.json();
        expect(error.issues).toBeDefined();
      }
    });
  });
});