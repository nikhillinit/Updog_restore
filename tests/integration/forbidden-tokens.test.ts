/**
 * Forbidden Tokens Integration Test
 *
 * Validates that no forbidden legacy features appear in the codebase:
 * - Line of Credit functionality (eight bans)
 *
 * The whole-fund waterfall vocabulary is NOT forbidden: ADR-068 restored it as
 * public product vocabulary. This suite pins that restoration so a later sweep
 * cannot silently re-ban the term.
 *
 * Tests both compile-time type guards and runtime validation.
 */

import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_WATERFALL_TYPE,
  FORBIDDEN_TOKENS,
  WaterfallTypeSchema,
  validateNoForbiddenKeys,
  type _forbiddenKeysGuard,
} from '@shared/types/forbidden-features';

interface Violation {
  file: string;
  token: string;
  line: number;
  context: string;
}

describe('Forbidden Features Protection', () => {
  it('runtime: no forbidden tokens in TypeScript codebase', async () => {
    const violations: Violation[] = [];

    // Find all TypeScript files
    const patterns = ['client/**/*.ts', 'client/**/*.tsx', 'server/**/*.ts', 'shared/**/*.ts'];

    const allFiles: string[] = [];
    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: process.cwd(),
        ignore: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/coverage/**',
          '**/forbidden-tokens.test.ts', // Exclude this test file
          '**/forbidden-features.ts', // Exclude the definitions file
        ],
      });
      allFiles.push(...files);
    }

    expect(allFiles.length).toBeGreaterThan(0);

    // Scan each file for forbidden tokens
    for (const file of allFiles) {
      const filePath = join(process.cwd(), file);
      const content = readFileSync(filePath, 'utf-8');

      if (!content) continue;

      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const trimmedLine = line.trim();

        // Skip comment lines
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
          return;
        }

        // Check for each forbidden token (case-insensitive)
        FORBIDDEN_TOKENS.forEach((token) => {
          // Create regex to match token as whole word or property
          const regex = new RegExp(`\\b${token}\\b|['"\`]${token}['"\`]|${token}:`, 'i');

          if (regex.test(line)) {
            violations.push({
              file,
              token,
              line: index + 1,
              context: trimmedLine.substring(0, 100),
            });
          }
        });
      });
    }

    // Report violations
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} - "${v.token}"\n    ${v.context}`)
        .join('\n\n');

      console.error(`\n❌ Found ${violations.length} forbidden token(s):\n`);
      console.error(report);
    }

    expect(violations).toEqual([]);
  });

  it('runtime: no forbidden keys in schema definitions', () => {
    // Example valid schema
    const validSchema = {
      fundName: 'Test Fund',
      fundSize: 100000000,
      managementFee: 0.02,
      carriedInterest: 0.2,
      vintage: 2024,
      distribution: 'american', // Scanner checks key names, not values
      investments: [
        {
          name: 'Company A',
          amount: 5000000,
          ownership: 0.15,
        },
      ],
    };

    const result = validateNoForbiddenKeys(validSchema, 'validSchema');

    expect(result.isValid).toBe(true);
    expect(result.foundKeys).toEqual([]);
  });

  it('runtime: validateNoForbiddenKeys detects violations', () => {
    // Schema with forbidden keys
    const badSchema = {
      fundName: 'Test Fund',
      lineOfCredit: {
        // FORBIDDEN
        locRate: 0.05, // FORBIDDEN
        locCap: 10000000, // FORBIDDEN
      },
      useLineOfCredit: true, // FORBIDDEN
    };

    const result = validateNoForbiddenKeys(badSchema, 'badSchema');

    expect(result.isValid).toBe(false);
    expect(result.foundKeys.length).toBeGreaterThan(0);

    // Should find at least lineOfCredit and useLineOfCredit
    const foundTokens = result.foundKeys.map((k) => k.split(' ')[0].split('.').pop());
    expect(foundTokens).toContain('lineOfCredit');
    expect(foundTokens).toContain('useLineOfCredit');
  });

  it('compile-time: type guard prevents usage', () => {
    // Verify the type guard can be imported (compile-time check)
    type TestGuard = _forbiddenKeysGuard; // TypeScript will error if type doesn't exist

    // Suppress unused variable warning
    const _: TestGuard | undefined = undefined;
    expect(_).toBeUndefined();

    // Verify all tokens are present
    expect(FORBIDDEN_TOKENS).toHaveLength(8);

    // Verify all eight Line-of-Credit bans survive (ADR-068 narrowed the set to
    // Line of Credit only; it did not weaken any Line-of-Credit ban)
    expect([...FORBIDDEN_TOKENS]).toEqual([
      'lineOfCredit',
      'locRate',
      'locCap',
      'locDraw',
      'locRepay',
      'locDrawRules',
      'locRepayRules',
      'useLineOfCredit',
    ]);
  });

  it('policy: whole-fund vocabulary is no longer a forbidden token (ADR-068)', () => {
    expect([...FORBIDDEN_TOKENS]).not.toContain('european');

    // The runtime key scanner must not flag the restored vocabulary either
    const policySelection = { waterfallType: 'european' as const };
    expect(validateNoForbiddenKeys(policySelection, 'policySelection').isValid).toBe(true);
  });

  it('runtime: WaterfallTypeSchema preserves caller intent for both values', () => {
    expect(WaterfallTypeSchema.parse('american')).toBe('american');
    expect(WaterfallTypeSchema.parse('european')).toBe('european');
  });

  it('runtime: WaterfallTypeSchema rejects unknown values', () => {
    expect(() => WaterfallTypeSchema.parse('foo')).toThrow();
    expect(() => WaterfallTypeSchema.parse('AMERICAN')).toThrow();
    expect(() => WaterfallTypeSchema.parse('whole_fund')).toThrow();
    expect(() => WaterfallTypeSchema.parse('deal_by_deal')).toThrow();
  });

  it('runtime: American is the recorded default waterfall type', () => {
    expect(DEFAULT_WATERFALL_TYPE).toBe('american');
    expect(WaterfallTypeSchema.parse(DEFAULT_WATERFALL_TYPE)).toBe('american');
  });
});
