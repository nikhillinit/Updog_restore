import { describe, expect, it } from 'vitest';

import { joinApiBaseUrl, resolveApiBaseUrl } from '../../../client/src/lib/api-url';

describe('api-url routing', () => {
  it('uses the configured API base outside Vercel deployments', () => {
    const apiBaseUrl = resolveApiBaseUrl(
      'http://localhost:5173',
      'localhost',
      'https://updog-restore.vercel.app'
    );

    expect(apiBaseUrl).toBe('https://updog-restore.vercel.app');
    expect(joinApiBaseUrl('/api/funds', apiBaseUrl)).toBe(
      'https://updog-restore.vercel.app/api/funds'
    );
  });

  it('prefers same-origin API routes on custom domains when origins match', () => {
    const apiBaseUrl = resolveApiBaseUrl(
      'https://staging.updog.pressonventures.com',
      'staging.updog.pressonventures.com',
      'https://staging.updog.pressonventures.com'
    );

    expect(apiBaseUrl).toBe('');
    expect(joinApiBaseUrl('/api/funds', apiBaseUrl)).toBe('/api/funds');
  });

  it('prefers same-origin API routes on Vercel deployments', () => {
    const apiBaseUrl = resolveApiBaseUrl(
      null,
      'updog-restore-preview-123.vercel.app',
      'https://updog-restore.vercel.app'
    );

    expect(apiBaseUrl).toBe('');
    expect(joinApiBaseUrl('/api/funds', apiBaseUrl)).toBe('/api/funds');
  });

  it('preserves configured API base for true cross-origin deployments', () => {
    const apiBaseUrl = resolveApiBaseUrl(
      'https://app.pressonventures.com',
      'app.pressonventures.com',
      'https://api.pressonventures.com'
    );

    expect(apiBaseUrl).toBe('https://api.pressonventures.com');
  });

  it('leaves absolute URLs untouched', () => {
    expect(joinApiBaseUrl('https://example.com/api/funds', '')).toBe(
      'https://example.com/api/funds'
    );
  });
});
