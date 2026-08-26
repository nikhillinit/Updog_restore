import { describe, expect, it } from 'vitest';

import { apiProxyChangeOrigin } from '../../../vite.proxy-policy';

describe('apiProxyChangeOrigin', () => {
  it.each(['http://localhost:5091', 'http://127.0.0.1:5000', 'http://[::1]:4000'])(
    'preserves Host for loopback target %s',
    (target) => {
      expect(apiProxyChangeOrigin(target)).toBe(false);
    }
  );

  it.each(['https://staging.example.com', 'http://10.0.0.5:8080'])(
    'rewrites origin for remote target %s',
    (target) => {
      expect(apiProxyChangeOrigin(target)).toBe(true);
    }
  );

  it('defaults to origin rewriting for a malformed target', () => {
    expect(apiProxyChangeOrigin('not a URL')).toBe(true);
  });
});
