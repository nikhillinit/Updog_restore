import { describe, it, expect } from 'vitest';
import { normalizeCreateFundResponse } from '@/services/funds';

describe('normalizeCreateFundResponse', () => {
  it('returns direct response shape as-is', () => {
    const raw = { id: 1, name: 'Test' };
    const result = normalizeCreateFundResponse(raw);

    expect(result).toBe(raw);
  });

  it('returns wrapped response data object', () => {
    const raw = { success: true, data: { id: 2, name: 'Wrapped' } };
    const result = normalizeCreateFundResponse(raw);

    expect(result).toBe(raw.data);
  });

  it('throws when id is missing from direct shape', () => {
    expect(() => normalizeCreateFundResponse({ name: 'No ID' })).toThrow(
      'Invalid fund response: missing id'
    );
  });

  it('throws on null input', () => {
    expect(() => normalizeCreateFundResponse(null)).toThrow('Invalid fund response: missing id');
  });

  it('throws on non-object input', () => {
    expect(() => normalizeCreateFundResponse('not-an-object')).toThrow(
      'Invalid fund response: missing id'
    );
  });

  it('throws when wrapped response data.id is missing', () => {
    expect(() => normalizeCreateFundResponse({ success: true, data: { name: 'No ID' } })).toThrow(
      'Invalid fund response: missing id'
    );
  });
});
