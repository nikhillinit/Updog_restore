/**
 * Test security alert #67: incomplete multi-character sanitization.
 */

import { describe, expect, it } from 'vitest';
import { sanitizeString } from '../input-sanitization.js';

describe('XSS Prevention - Alert #67', () => {
  it.each([
    ['nested script tag', '<scrip<script>alert(1)</script>t>'],
    ['nested iframe tag', '<ifra<iframe>me src="evil.com"></iframe>'],
    ['multiple nested tags', '<di<div>v><scrip<script>t>alert(1)</script></div>'],
  ])('rejects dangerous %s input in strict mode', (_description, malicious) => {
    expect(() => sanitizeString(malicious)).toThrow('Input contains potentially dangerous content');
  });

  it('strips benign HTML tags', () => {
    expect(sanitizeString('<p>Hello</p>')).toBe('Hello');
  });
});
