import { describe, expect, it } from 'vitest';
import { isPublicApiPath } from '../../../server/lib/public-api-boundary.js';

describe('server public API route boundary', () => {
  it.each([
    ['GET', '/healthz'],
    ['GET', '/flags'],
    ['GET', '/flags/status'],
    ['GET', '/health/details'],
  ])('treats %s %s as public', (method, path) => {
    expect(isPublicApiPath(method, path)).toBe(true);
  });

  it.each([
    ['GET', '/funds'],
    ['POST', '/funds'],
    ['GET', '/funds/1'],
    ['GET', '/funds/not-a-number'],
    ['POST', '/funds/calculate'],
    ['POST', '/funds/finalize'],
    ['GET', '/funds/1/draft'],
    ['PUT', '/funds/1/draft'],
    ['GET', '/funds/1/metrics'],
    ['GET', '/funds/1/variance-dashboard'],
    ['GET', '/funds/finalize'],
    ['GET', '/funds/calculate'],
    ['POST', '/funds/1/allocations'],
    ['GET', '/funds/1/portfolio-analysis'],
    ['GET', '/flags/admin/audit'],
  ])('keeps %s %s protected', (method, path) => {
    expect(isPublicApiPath(method, path)).toBe(false);
  });
});
