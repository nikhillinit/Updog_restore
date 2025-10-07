/**
 * Security Sanitization Tests
 * 
 * Tests for the new sanitization utilities
 */

import { describe, it, expect } from 'vitest';
import { sanitizeInput, sanitizeHTML } from '../../../server/utils/sanitizer';
import { isValidUrl } from '../../../server/utils/url-validator';

describe('Security Sanitization', () => {
  describe('sanitizeInput', () => {
    it('should remove all HTML tags', () => {
      const input = '<script>alert("xss")</script>Hello World';
      const result = sanitizeInput(input);
      expect(result).toBe('Hello World');
    });

    it('should remove iframe tags', () => {
      const input = '<iframe src="evil.com"></iframe>Content';
      const result = sanitizeInput(input);
      expect(result).toBe('Content');
    });

    it('should handle nested HTML tags', () => {
      const input = '<div><span><script>alert("xss")</script>Text</span></div>';
      const result = sanitizeInput(input);
      expect(result).toBe('Text');
    });

    it('should preserve plain text', () => {
      const input = 'Plain text without HTML';
      const result = sanitizeInput(input);
      expect(result).toBe('Plain text without HTML');
    });
  });

  describe('sanitizeHTML', () => {
    it('should allow safe HTML tags', () => {
      const input = '<b>Bold</b> and <i>italic</i> text';
      const result = sanitizeHTML(input);
      expect(result).toContain('<b>Bold</b>');
      expect(result).toContain('<i>italic</i>');
    });

    it('should remove dangerous script tags', () => {
      const input = '<b>Safe</b><script>alert("xss")</script>';
      const result = sanitizeHTML(input);
      expect(result).toContain('<b>Safe</b>');
      expect(result).not.toContain('script');
      expect(result).not.toContain('alert');
    });

    it('should validate URL schemes in links', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = sanitizeHTML(input);
      // sanitize-html should remove the javascript: URL
      expect(result).not.toContain('javascript:');
    });
  });

  describe('isValidUrl', () => {
    it('should accept http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('should accept https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    it('should reject javascript URLs', () => {
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });

    it('should reject vbscript URLs', () => {
      expect(isValidUrl('vbscript:alert(1)')).toBe(false);
    });

    it('should reject data URLs', () => {
      expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('should handle invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
    });
  });
});
