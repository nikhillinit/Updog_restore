import { describe, expect, it } from 'vitest';
import { NEW_ROUTES, OLD_TO_NEW_REDIRECTS } from '@/core/routes/ia';

describe('IA route story metadata', () => {
  it('does not advertise a dead /model surface', () => {
    expect(NEW_ROUTES.map((route) => route.path)).not.toContain('/model');
  });

  it('does not redirect deterministic surfaces through /model', () => {
    expect(OLD_TO_NEW_REDIRECTS['/financial-modeling']).toBeUndefined();
    expect(OLD_TO_NEW_REDIRECTS['/forecasting']).toBeUndefined();
    expect(Object.values(OLD_TO_NEW_REDIRECTS)).not.toContain('/model');
  });
});
