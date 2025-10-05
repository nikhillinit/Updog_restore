/**
 * Forbidden Tokens Integration Test
 *
 * Validates that no forbidden legacy features appear in the codebase:
 * - European waterfall logic
 * - Line of Credit functionality
 * - Hurdle rates and catch-up provisions
 *
 * Tests both compile-time type guards and runtime validation.
 */

import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  FORBIDDEN_TOKENS,
  validateNoForbiddenKeys,
  _forbiddenKeysGuard,
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
    const patterns = [
      'client/**/*.ts',
      'client/**/*.tsx',
      'server/**/*.ts',
      'shared/**/*.ts',
    ];

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
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const trimmedLine = line.trim();

        // Skip comment lines
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
          return;
        }

        // Check for each forbidden token (case-insensitive)
        FORBIDDEN_TOKENS.forEach(token => {
          // Create regex to match token as whole word or property
          const regex = new RegExp(
            `\\b${token}\\b|['"\`]${token}['"\`]|${token}:`,
            'i'
          );

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
        .map(v => `  ${v.file}:${v.line} - "${v.token}"\n    ${v.context}`)
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
      carriedInterest: 0.20,
      vintage: 2024,
      distribution: 'american', // Not 'european'
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
      hurdleRate: 0.08, // FORBIDDEN
      lineOfCredit: {
        // FORBIDDEN
        locRate: 0.05, // FORBIDDEN
        locCap: 10000000, // FORBIDDEN
      },
      preferredReturn: 0.08, // FORBIDDEN
    };

    const result = validateNoForbiddenKeys(badSchema, 'badSchema');

    expect(result.isValid).toBe(false);
    expect(result.foundKeys.length).toBeGreaterThan(0);

    // Should find at least hurdleRate and lineOfCredit
    const foundTokens = result.foundKeys.map(k =>
      k.split(' ')[0].split('.').pop()
    );
    expect(foundTokens).toContain('hurdleRate');
    expect(foundTokens).toContain('lineOfCredit');
  });

  it('compile-time: type guard prevents usage', () => {
    // Verify the type guard exists and can be imported
    expect(_forbiddenKeysGuard).toBeDefined();

    // Verify all tokens are present
    expect(FORBIDDEN_TOKENS).toHaveLength(14);

    // Verify specific critical tokens
    expect(FORBIDDEN_TOKENS).toContain('european');
    expect(FORBIDDEN_TOKENS).toContain('lineOfCredit');
    expect(FORBIDDEN_TOKENS).toContain('hurdleRate');
    expect(FORBIDDEN_TOKENS).toContain('catchUp');
  });
});
