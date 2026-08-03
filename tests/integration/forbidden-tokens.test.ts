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
} from '@shared/types/forbidden-features';

/**
 * The eight Line-of-Credit bans. ADR-068 narrowed FORBIDDEN_TOKENS to exactly
 * these; every one must survive and every one must be reachable by the runtime
 * scanner.
 */
const LINE_OF_CREDIT_BANS = [
  'lineOfCredit',
  'locRate',
  'locCap',
  'locDraw',
  'locRepay',
  'locDrawRules',
  'locRepayRules',
  'useLineOfCredit',
] as const;

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

      console.error(`\nFAIL: Found ${violations.length} forbidden token(s):\n`);
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
    // Every Line-of-Credit ban gets exercised through the runtime scanner, not
    // just a sample: ADR-068 narrowed the token set, so the scanner's coverage
    // of what survived is the thing worth pinning.
    const badSchema = {
      fundName: 'Test Fund',
      lineOfCredit: {
        locRate: 0.05,
        locCap: 10000000,
        locDraw: 1000000,
        locRepay: 500000,
        locDrawRules: { trigger: 'call' },
        locRepayRules: { trigger: 'exit' },
      },
      useLineOfCredit: true,
    };

    const result = validateNoForbiddenKeys(badSchema, 'badSchema');

    expect(result.isValid).toBe(false);

    const foundTokens = result.foundKeys.map((k) => k.split(' ')[0].split('.').pop());
    for (const token of LINE_OF_CREDIT_BANS) {
      expect(foundTokens, `scanner missed the ${token} ban`).toContain(token);
    }
  });

  it('policy: every Line-of-Credit ban survives (ADR-068 narrowing)', () => {
    // Containment, not equality: removing a ban must fail this test, while
    // ADDING a future Line-of-Credit ban is a strengthening and must not.
    // Token ordering is deliberately not made load-bearing.
    for (const token of LINE_OF_CREDIT_BANS) {
      expect([...FORBIDDEN_TOKENS]).toContain(token);
    }
  });

  it('policy: whole-fund vocabulary is no longer a forbidden token (ADR-068)', () => {
    expect([...FORBIDDEN_TOKENS]).not.toContain('european');

    // The scanner matches key names, so the restored term is exercised as a key
    // here on purpose. This assertion fails if the token is ever re-banned.
    expect(validateNoForbiddenKeys({ european: true }, 'restoredVocabulary').isValid).toBe(true);
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
