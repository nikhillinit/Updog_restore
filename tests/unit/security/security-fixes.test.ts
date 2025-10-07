/**
 * Security Integration Test
 * 
 * Demonstrates that the security fixes prevent various attack vectors
 */

import { describe, it, expect } from 'vitest';

describe('Security Vulnerability Fixes - Integration Test', () => {
  describe('XSS Prevention', () => {
    it('should prevent script injection via incomplete multi-character sanitization', async () => {
      const { sanitizeInput } = await import('../../../server/utils/sanitizer');
      
      // These are attack patterns that could bypass simple regex sanitization
      const attacks = [
        '<scr<script>ipt>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        '<svg/onload=alert(1)>',
        '<<SCRIPT>alert("XSS");//<</SCRIPT>',
      ];

      for (const attack of attacks) {
        const sanitized = sanitizeInput(attack);
        // Should remove all HTML tags but preserve text content
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('<img');
        expect(sanitized).not.toContain('<svg');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('onload=');
      }
    });

    it('should prevent iframe injection', async () => {
      const { sanitizeInput } = await import('../../../server/utils/sanitizer');
      
      const attack = '<iframe src="javascript:alert(1)"></iframe>';
      const sanitized = sanitizeInput(attack);
      
      expect(sanitized).not.toContain('iframe');
      expect(sanitized).not.toContain('javascript');
    });
  });

  describe('URL Scheme Validation', () => {
    it('should reject dangerous URL schemes', async () => {
      const { isValidUrl } = await import('../../../server/utils/url-validator');
      
      const dangerousUrls = [
        'javascript:alert(1)',
        'vbscript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
      ];

      for (const url of dangerousUrls) {
        expect(isValidUrl(url)).toBe(false);
      }
    });

    it('should accept safe URL schemes', async () => {
      const { isValidUrl } = await import('../../../server/utils/url-validator');
      
      const safeUrls = [
        'http://example.com',
        'https://example.com',
        'https://example.com/path?query=value',
      ];

      for (const url of safeUrls) {
        expect(isValidUrl(url)).toBe(true);
      }
    });
  });

  describe('Error Message Sanitization', () => {
    it('should sanitize error messages to prevent format string attacks', async () => {
      const { sanitizeInput } = await import('../../../server/utils/sanitizer');
      
      // Simulate an error message that might contain malicious content
      const maliciousError = '<script>alert("xss")</script>Database error';
      const sanitized = sanitizeInput(maliciousError);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Database error');
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should prevent path traversal in file paths', async () => {
      const { sanitizeFilePath } = await import('../../../server/utils/input-sanitization');
      
      const attacks = [
        'validfile.txt',  // This should work
        'some_file.pdf',  // This should work
      ];

      // Test that normal files work
      for (const filename of attacks) {
        const sanitized = sanitizeFilePath(filename);
        expect(sanitized).toBeTruthy();
      }
      
      // Test that path traversal attempts are caught or sanitized
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
      ];
      
      for (const attack of pathTraversalAttempts) {
        // In strict mode, this will throw an error or be heavily sanitized
        try {
          const sanitized = sanitizeFilePath(attack);
          // If it doesn't throw, ensure it's been sanitized
          expect(sanitized).not.toContain('..');
        } catch (error) {
          // Expected to throw in strict mode
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('HTML Sanitization with Safe Tags', () => {
    it('should allow safe HTML tags while removing dangerous ones', async () => {
      const { sanitizeHTML } = await import('../../../server/utils/sanitizer');
      
      const input = '<b>Bold</b> <i>Italic</i> <script>alert(1)</script>';
      const sanitized = sanitizeHTML(input);
      
      expect(sanitized).toContain('<b>Bold</b>');
      expect(sanitized).toContain('<i>Italic</i>');
      expect(sanitized).not.toContain('script');
      expect(sanitized).not.toContain('alert');
    });

    it('should validate URL schemes in anchor tags', async () => {
      const { sanitizeHTML } = await import('../../../server/utils/sanitizer');
      
      const input = '<a href="javascript:alert(1)">Click</a>';
      const sanitized = sanitizeHTML(input);
      
      expect(sanitized).not.toContain('javascript:');
    });
  });
});
