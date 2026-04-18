import { describe, expect, it } from 'vitest';

import { joinApiBaseUrl, resolveApiBaseUrl } from '../../../client/src/lib/api-url';

describe('api-url routing', () => {
  it('uses the configured API base outside Vercel deployments', () => {
    const apiBaseUrl = resolveApiBaseUrl('localhost', 'https://updog-restore.vercel.app');

    expect(apiBaseUrl).toBe('https://updog-restore.vercel.app');
    expect(joinApiBaseUrl('/api/funds', apiBaseUrl)).toBe(
      'https://updog-restore.vercel.app/api/funds'
    );
  });

  it('prefers same-origin API routes on Vercel deployments', () => {
    const apiBaseUrl = resolveApiBaseUrl(
      'updog-restore-preview-123.vercel.app',
      'https://updog-restore.vercel.app'
    );

    expect(apiBaseUrl).toBe('');
    expect(joinApiBaseUrl('/api/funds', apiBaseUrl)).toBe('/api/funds');
  });

  it('leaves absolute URLs untouched', () => {
    expect(joinApiBaseUrl('https://example.com/api/funds', '')).toBe(
      'https://example.com/api/funds'
    );
  });
});
