/**
 * Test for security alert #67: Incomplete multi-character sanitization
 * Verifies that nested HTML tags are properly sanitized
 */

import { describe, it, expect } from 'vitest';
import { sanitizeString } from '../input-sanitization.js';

describe('XSS Prevention - Alert #67', () => {
  it('should prevent nested script tag bypass', () => {
    const malicious = '<scrip<script>alert(1)</script>t>';
    const result = sanitizeString(malicious);

    // Should NOT contain any script tags after sanitization
    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script>');
    expect(result).not.toContain('alert(1)');
  });

  it('should prevent nested iframe bypass', () => {
    const malicious = '<ifra<iframe>me src="evil.com"></iframe>';
    const result = sanitizeString(malicious);

    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('</iframe>');
  });

  it('should handle multiple nested tags', () => {
    const malicious = '<di<div>v><scrip<script>t>alert(1)</script></div>';
    const result = sanitizeString(malicious);

    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(1)');
  });

  it('should sanitize valid HTML tags when no tags allowed', () => {
    const input = '<p>Hello</p><script>alert(1)</script>';
    const result = sanitizeString(input);

    // Default config allows no tags
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('<script>');
  });
});
