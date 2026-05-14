import { describe, expect, it } from 'vitest';
import { BRANDING } from '@/config/branding';

describe('BRANDING', () => {
  it('uses the governed Updog product name', () => {
    expect(BRANDING.app.name).toBe('Updog');
    expect(BRANDING.app.nameStyled).toBe('Updog');
  });
});
