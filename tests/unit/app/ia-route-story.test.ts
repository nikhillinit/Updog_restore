import { describe, expect, it } from 'vitest';
import {
  NEW_ROUTES as CLIENT_NEW_ROUTES,
  OLD_TO_NEW_REDIRECTS as CLIENT_OLD_TO_NEW_REDIRECTS,
} from '@/core/routes/ia';
import {
  NEW_ROUTES as MIRROR_NEW_ROUTES,
  OLD_TO_NEW_REDIRECTS as MIRROR_OLD_TO_NEW_REDIRECTS,
} from '../../../src/core/routes/ia';

describe('IA route story metadata', () => {
  it('does not advertise a dead /model surface', () => {
    expect(CLIENT_NEW_ROUTES.map((route) => route.path)).not.toContain('/model');
    expect(MIRROR_NEW_ROUTES.map((route) => route.path)).toContain('/model');
  });

  it('does not redirect deterministic surfaces through /model', () => {
    for (const redirectMap of [CLIENT_OLD_TO_NEW_REDIRECTS, MIRROR_OLD_TO_NEW_REDIRECTS]) {
      expect(redirectMap['/investments']).toBeUndefined();
      expect(redirectMap['/investment-table']).toBeUndefined();
    }

    expect(CLIENT_OLD_TO_NEW_REDIRECTS['/financial-modeling']).toBeUndefined();
    expect(CLIENT_OLD_TO_NEW_REDIRECTS['/forecasting']).toBeUndefined();
    expect(Object.values(CLIENT_OLD_TO_NEW_REDIRECTS)).not.toContain('/model');
    expect(MIRROR_OLD_TO_NEW_REDIRECTS['/financial-modeling']).toBe('/model');
    expect(MIRROR_OLD_TO_NEW_REDIRECTS['/forecasting']).toBe('/model');
  });
});
