/**
 * Report Sharing E2E Tests
 *
 * Tests the share link API endpoints:
 * - Create share link
 * - List shares for fund
 * - Get share details (public)
 * - Verify passkey
 * - Update share
 * - Revoke share
 * - Analytics tracking
 */

import { test, expect } from '@playwright/test';

test.describe('Share API', () => {
  const baseUrl = '/api/shares';
  let createdShareId: string;
  const testFundId = 'test-fund-123';

  test.describe('Create Share', () => {
    test('creates a basic share link', async ({ request }) => {
      const response = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          accessLevel: 'view_only',
          requirePasskey: false,
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.share).toBeDefined();
      expect(body.share.fundId).toBe(testFundId);
      expect(body.share.accessLevel).toBe('view_only');
      expect(body.share.shareUrl).toMatch(/^\/share\//);

      createdShareId = body.share.id;
    });

    test('creates a passkey-protected share', async ({ request }) => {
      const response = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          accessLevel: 'view_with_details',
          requirePasskey: true,
          passkey: 'secret123',
          expiresInDays: 30,
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.share.requirePasskey).toBe(true);
      expect(body.share.expiresAt).toBeDefined();
    });

    test('creates share with custom title and message', async ({ request }) => {
      const response = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          accessLevel: 'view_only',
          requirePasskey: false,
          customTitle: 'Q4 2025 Report',
          customMessage: 'Please review our quarterly performance.',
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.share.customTitle).toBe('Q4 2025 Report');
      expect(body.share.customMessage).toBe('Please review our quarterly performance.');
    });

    test('rejects invalid access level', async ({ request }) => {
      const response = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          accessLevel: 'invalid_level',
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Validation');
    });

    test('rejects empty fundId', async ({ request }) => {
      const response = await request.post(baseUrl, {
        data: {
          fundId: '',
          accessLevel: 'view_only',
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('List Shares', () => {
    test('lists shares for a fund', async ({ request }) => {
      const response = await request.get(`${baseUrl}?fundId=${testFundId}`);

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.shares)).toBe(true);
    });

    test('requires fundId parameter', async ({ request }) => {
      const response = await request.get(baseUrl);

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('fundId');
    });
  });

  test.describe('Get Share', () => {
    test('returns share details for public access', async ({ request }) => {
      // First create a share
      const createResponse = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          accessLevel: 'view_only',
          requirePasskey: false,
        },
      });
      const created = await createResponse.json();
      const shareId = created.share.id;

      // Then retrieve it
      const response = await request.get(`${baseUrl}/${shareId}`);

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.share.id).toBe(shareId);
      expect(body.share.fundId).toBe(testFundId);
    });

    test('returns limited info for passkey-protected share', async ({ request }) => {
      // Create passkey-protected share
      const createResponse = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          requirePasskey: true,
          passkey: 'testpass',
        },
      });
      const created = await createResponse.json();
      const shareId = created.share.id;

      // Get without passkey
      const response = await request.get(`${baseUrl}/${shareId}`);

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.share.requirePasskey).toBe(true);
      expect(body.share.fundId).toBeUndefined(); // Shouldn't expose fundId without passkey
    });

    test('returns 404 for non-existent share', async ({ request }) => {
      const response = await request.get(`${baseUrl}/non-existent-id`);

      expect(response.status()).toBe(404);
    });
  });

  test.describe('Verify Passkey', () => {
    test('allows access with correct passkey', async ({ request }) => {
      // Create passkey-protected share
      const createResponse = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          requirePasskey: true,
          passkey: 'correctpasskey',
        },
      });
      const created = await createResponse.json();
      const shareId = created.share.id;

      // Verify with correct passkey
      const response = await request.post(`${baseUrl}/${shareId}/verify`, {
        data: { passkey: 'correctpasskey' },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.share.fundId).toBe(testFundId); // Now fundId is exposed
    });

    test('rejects incorrect passkey', async ({ request }) => {
      // Create passkey-protected share
      const createResponse = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          requirePasskey: true,
          passkey: 'correctpasskey',
        },
      });
      const created = await createResponse.json();
      const shareId = created.share.id;

      // Verify with wrong passkey
      const response = await request.post(`${baseUrl}/${shareId}/verify`, {
        data: { passkey: 'wrongpasskey' },
      });

      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toContain('Invalid passkey');
    });
  });

  test.describe('Update Share', () => {
    test('updates share configuration', async ({ request }) => {
      // Create share
      const createResponse = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          accessLevel: 'view_only',
        },
      });
      const created = await createResponse.json();
      const shareId = created.share.id;

      // Update it
      const response = await request.patch(`${baseUrl}/${shareId}`, {
        data: {
          accessLevel: 'view_with_details',
          customTitle: 'Updated Title',
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.share.accessLevel).toBe('view_with_details');
      expect(body.share.customTitle).toBe('Updated Title');
    });

    test('can add passkey to existing share', async ({ request }) => {
      // Create share without passkey
      const createResponse = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
          requirePasskey: false,
        },
      });
      const created = await createResponse.json();
      const shareId = created.share.id;

      // Add passkey
      const response = await request.patch(`${baseUrl}/${shareId}`, {
        data: {
          requirePasskey: true,
          passkey: 'newpasskey',
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.share.requirePasskey).toBe(true);
    });
  });

  test.describe('Revoke Share', () => {
    test('deactivates a share', async ({ request }) => {
      // Create share
      const createResponse = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
        },
      });
      const created = await createResponse.json();
      const shareId = created.share.id;

      // Revoke it
      const response = await request.delete(`${baseUrl}/${shareId}`);

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify it's no longer accessible
      const getResponse = await request.get(`${baseUrl}/${shareId}`);
      expect(getResponse.status()).toBe(410); // Gone
    });
  });

  test.describe('Analytics', () => {
    test('retrieves share analytics', async ({ request }) => {
      // Create share
      const createResponse = await request.post(baseUrl, {
        data: {
          fundId: testFundId,
        },
      });
      const created = await createResponse.json();
      const shareId = created.share.id;

      // Get analytics
      const response = await request.get(`${baseUrl}/${shareId}/analytics`);

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.summary).toBeDefined();
      expect(body.summary.totalViews).toBeDefined();
      expect(Array.isArray(body.views)).toBe(true);
    });
  });
});
