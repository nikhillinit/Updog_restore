// REFLECTION_ID: REFL-011
// This test is linked to: docs/skills/REFL-011-recharts-formatter-type-signatures.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-011: Recharts Formatter Type Signatures
 *
 * Recharts Tooltip and Legend formatters receive `name` parameter that can be
 * undefined in certain edge cases, but TypeScript defaults suggest it's always a string.
 */
describe('REFL-011: Recharts Formatter Type Signatures', () => {
  // Simulated chart data (demonstrates optional name pattern)
  interface _DataPoint {
    x: number;
    y: number;
    name?: string;
  }

  // Simulated tooltip payload (like Recharts)
  interface TooltipPayload {
    value: number;
    name?: string; // Can be undefined!
    dataKey?: string;
  }

  // Anti-pattern: Assuming name is always a string
  function formatTooltipStrictType(payload: TooltipPayload): string {
    // This will crash if name is undefined
    const name = payload.name as string; // Dangerous assumption!
    return `${name.toUpperCase()}: ${payload.value}`;
  }

  // Verified fix: Handle undefined name
  function formatTooltipSafeType(payload: TooltipPayload): string {
    const name = payload.name ?? 'Unknown';
    return `${name.toUpperCase()}: ${payload.value}`;
  }

  // Alternative fix: Use fallback chain
  function formatTooltipWithFallback(payload: TooltipPayload): string {
    const name = payload.name ?? payload.dataKey ?? 'Series';
    return `${name}: ${payload.value}`;
  }

  describe('Anti-pattern: Strict type signature fails on undefined', () => {
    it('should crash when name is undefined', () => {
      const payload: TooltipPayload = {
        value: 100,
        // name is undefined - common when data series has no explicit name
      };

      // Strict type function will crash
      expect(() => formatTooltipStrictType(payload)).toThrow();
    });

    it('should work when name is defined', () => {
      const payload: TooltipPayload = {
        value: 100,
        name: 'Revenue',
      };

      // Works fine when name is present
      expect(formatTooltipStrictType(payload)).toBe('REVENUE: 100');
    });

    it('should demonstrate type coercion danger', () => {
      // TypeScript won't catch this at compile time with `as string`
      const payloadWithUndefined: TooltipPayload = { value: 50 };

      // The `as string` cast silences the compiler but doesn't fix the bug
      const name = payloadWithUndefined.name as string;
      expect(name).toBeUndefined(); // Still undefined at runtime!
    });
  });

  describe('Verified fix: Handle undefined gracefully', () => {
    it('should use fallback when name is undefined', () => {
      const payload: TooltipPayload = {
        value: 100,
        // name is undefined
      };

      const result = formatTooltipSafeType(payload);

      expect(result).toBe('UNKNOWN: 100');
      expect(result).not.toContain('undefined');
    });

    it('should use provided name when available', () => {
      const payload: TooltipPayload = {
        value: 200,
        name: 'Profit',
      };

      const result = formatTooltipSafeType(payload);

      expect(result).toBe('PROFIT: 200');
    });

    it('should handle fallback chain with dataKey', () => {
      const payload: TooltipPayload = {
        value: 300,
        // name is undefined
        dataKey: 'revenue_q4',
      };

      const result = formatTooltipWithFallback(payload);

      // Falls back to dataKey when name is undefined
      expect(result).toBe('revenue_q4: 300');
    });

    it('should use Series as final fallback', () => {
      const payload: TooltipPayload = {
        value: 400,
        // No name, no dataKey
      };

      const result = formatTooltipWithFallback(payload);

      expect(result).toBe('Series: 400');
    });
  });

  describe('Type signature patterns', () => {
    it('should demonstrate proper Recharts-like type definitions', () => {
      // Proper type definition matching Recharts' actual types
      type FormatterFn = (
        value: number,
        name: string | undefined,
        props: unknown
      ) => string;

      const safeFormatter: FormatterFn = (value, name) => {
        return `${name ?? 'Value'}: ${value}`;
      };

      // Works with undefined
      expect(safeFormatter(100, undefined, {})).toBe('Value: 100');
      // Works with string
      expect(safeFormatter(100, 'Cost', {})).toBe('Cost: 100');
    });

    it('should show multiple payload handling', () => {
      const payloads: TooltipPayload[] = [
        { value: 100, name: 'Q1' },
        { value: 200 }, // No name
        { value: 300, name: 'Q3', dataKey: 'sales' },
      ];

      const formatted = payloads.map((p) => formatTooltipWithFallback(p));

      expect(formatted).toEqual(['Q1: 100', 'Series: 200', 'Q3: 300']);
    });
  });
});
