import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Healthz Smoke Test
 *
 * Purpose: Ensures /healthz endpoint is mounted and returns correct schema
 * This is the first CI gate - if this fails, the server is miswired
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Healthz Smoke Test', () => {

  it('endpoint is mounted and returns 200', async () => {
    const response = await fetch(`${BASE_URL}/healthz`);
    expect(response.status).toBe(200);
  });

  it('returns correct JSON schema with build provenance', async () => {
    const response = await fetch(`${BASE_URL}/healthz`);
    const data = await response.json();

    // Required fields for build provenance
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('engine_version');
    expect(data).toHaveProperty('commit_sha');
    expect(data).toHaveProperty('node_version');
  });

  it('status field is "ok"', async () => {
    const response = await fetch(`${BASE_URL}/healthz`);
    const data = await response.json();

    expect(data.status).toBe('ok');
  });

  it('timestamp is valid ISO 8601', async () => {
    const response = await fetch(`${BASE_URL}/healthz`);
    const data = await response.json();

    const timestamp = new Date(data.timestamp);
    expect(timestamp.toISOString()).toBe(data.timestamp);
  });

  it('engine_version matches package.json or fallback', async () => {
    const response = await fetch(`${BASE_URL}/healthz`);
    const data = await response.json();

    // Should be semver or "1.0.0" fallback
    expect(data.engine_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('commit_sha is present (local or SHA)', async () => {
    const response = await fetch(`${BASE_URL}/healthz`);
    const data = await response.json();

    expect(data.commit_sha).toBeTruthy();
    expect(typeof data.commit_sha).toBe('string');
  });

  it('node_version starts with "v" and semver', async () => {
    const response = await fetch(`${BASE_URL}/healthz`);
    const data = await response.json();

    expect(data.node_version).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('response is fast (< 100ms)', async () => {
    const start = Date.now();
    await fetch(`${BASE_URL}/healthz`);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });
});
