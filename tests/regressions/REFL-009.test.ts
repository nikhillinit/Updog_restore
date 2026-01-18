// REFLECTION_ID: REFL-009
// This test is linked to: docs/skills/REFL-009-crlf-line-endings-break-frontmatter-parsing.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-009: CRLF Line Endings Break Frontmatter Parsing
 *
 * Scripts that parse YAML frontmatter from markdown files fail on Windows
 * because regex patterns only match LF, not CRLF.
 */
describe('REFL-009: CRLF Line Endings Break Frontmatter Parsing', () => {
  // Anti-pattern: LF-only regex
  function parseFrontmatterLFOnly(content: string): Record<string, unknown> | null {
    // This regex only matches LF line endings
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    // Simple YAML-like parsing for test
    const lines = match[1].split('\n');
    const result: Record<string, unknown> = {};
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join(':').trim();
      }
    }
    return result;
  }

  // Verified fix: CRLF-aware regex
  function parseFrontmatterCRLFAware(
    content: string
  ): Record<string, unknown> | null {
    // This regex handles both LF and CRLF
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;

    // Normalize line endings before parsing
    const lines = match[1].split(/\r?\n/);
    const result: Record<string, unknown> = {};
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join(':').trim();
      }
    }
    return result;
  }

  // Alternative fix: Normalize first
  function parseFrontmatterNormalized(
    content: string
  ): Record<string, unknown> | null {
    // Normalize CRLF to LF before parsing
    const normalized = content.replace(/\r\n/g, '\n');
    return parseFrontmatterLFOnly(normalized);
  }

  describe('Anti-pattern: LF-only regex fails on Windows', () => {
    it('should fail to parse CRLF frontmatter', () => {
      // Windows-style line endings (CRLF)
      const windowsContent = '---\r\ntitle: Test\r\nstatus: DRAFT\r\n---\r\n\nContent here';

      const result = parseFrontmatterLFOnly(windowsContent);

      // LF-only regex fails to match CRLF content
      expect(result).toBeNull();
    });

    it('should parse LF frontmatter correctly', () => {
      // Unix-style line endings (LF)
      const unixContent = '---\ntitle: Test\nstatus: DRAFT\n---\n\nContent here';

      const result = parseFrontmatterLFOnly(unixContent);

      // LF content works fine
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test');
    });

    it('should demonstrate CI vs local discrepancy', () => {
      // Same logical content, different line endings
      const localWindows = '---\r\ntitle: Test\r\n---';
      const ciLinux = '---\ntitle: Test\n---';

      const localResult = parseFrontmatterLFOnly(localWindows);
      const ciResult = parseFrontmatterLFOnly(ciLinux);

      // CI passes, local fails - very confusing!
      expect(localResult).toBeNull();
      expect(ciResult).not.toBeNull();
    });
  });

  describe('Verified fix: CRLF-aware parsing', () => {
    it('should parse both LF and CRLF frontmatter', () => {
      const lfContent = '---\ntitle: Test LF\nstatus: VERIFIED\n---\n\nContent';
      const crlfContent = '---\r\ntitle: Test CRLF\r\nstatus: VERIFIED\r\n---\r\n\nContent';

      const lfResult = parseFrontmatterCRLFAware(lfContent);
      const crlfResult = parseFrontmatterCRLFAware(crlfContent);

      // Both parse successfully
      expect(lfResult).not.toBeNull();
      expect(crlfResult).not.toBeNull();

      expect(lfResult?.title).toBe('Test LF');
      expect(crlfResult?.title).toBe('Test CRLF');
    });

    it('should handle mixed line endings', () => {
      // Edge case: file with mixed line endings (can happen with bad editors)
      const mixedContent = '---\r\ntitle: Mixed\nstatus: DRAFT\r\n---\n\nContent';

      const result = parseFrontmatterCRLFAware(mixedContent);

      // Should still parse the frontmatter
      expect(result).not.toBeNull();
    });

    it('should produce same result for both line ending styles', () => {
      const lfContent = '---\nid: REFL-009\ntitle: Test\n---';
      const crlfContent = '---\r\nid: REFL-009\r\ntitle: Test\r\n---';

      const lfResult = parseFrontmatterCRLFAware(lfContent);
      const crlfResult = parseFrontmatterCRLFAware(crlfContent);

      // Results should be identical
      expect(lfResult).toEqual(crlfResult);
    });
  });

  describe('Alternative fix: Normalize before parsing', () => {
    it('should normalize CRLF to LF before parsing', () => {
      const crlfContent = '---\r\ntitle: Normalized\r\nstatus: VERIFIED\r\n---';

      const result = parseFrontmatterNormalized(crlfContent);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Normalized');
    });

    it('should be idempotent on LF content', () => {
      const lfContent = '---\ntitle: Already LF\n---';

      const result = parseFrontmatterNormalized(lfContent);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Already LF');
    });
  });
});
