import { describe, test, expect } from 'vitest';
import { z } from '../types/zod';
import {
  num,
  bounded01,
  nonNegative,
  percent100,
  positiveInt,
  positive,
  yearRange
} from '../schema-helpers';

describe('schema-helpers::num', () => {
  test('coerces strings by default', () => {
    const s = num({ min: 0 });
    expect(s.parse('42')).toBe(42);
    expect(s.parse('3.14')).toBe(3.14);
  });

  test('respects coerce option', () => {
    const s = num({ coerce: false });
    expect(() => s.parse('42')).toThrow();
    expect(s.parse(42)).toBe(42);
  });

  test('handles min/max bounds', () => {
    const s = num({ min: 10, max: 20 });
    expect(s.parse(15)).toBe(15);
    expect(() => s.parse(5)).toThrow();
    expect(() => s.parse(25)).toThrow();
  });

  test('enforces integer constraint', () => {
    const s = num({ int: true });
    expect(s.parse(42)).toBe(42);
    expect(() => s.parse(42.5)).toThrow();
  });

  test('custom error messages', () => {
    const s = num({ min: 0, messageMin: 'Custom min error' });
    try {
      s.parse(-1);
      expect.fail('Should have thrown');
    } catch (e: any) {
      expect(e.errors[0].message).toBe('Custom min error');
    }
  });
});

describe('schema-helpers::presets', () => {
  test('bounded01 enforces 0..1', () => {
    const s = bounded01();
    expect(s.parse(0)).toBe(0);
    expect(s.parse(0.5)).toBe(0.5);
    expect(s.parse(1)).toBe(1);
    expect(() => s.parse(-0.1)).toThrow();
    expect(() => s.parse(1.1)).toThrow();
  });

  test('nonNegative allows >= 0', () => {
    const s = nonNegative();
    expect(s.parse(0)).toBe(0);
    expect(s.parse(100)).toBe(100);
    expect(() => s.parse(-1)).toThrow();
    expect(() => s.parse(-0.001)).toThrow();
  });

  test('percent100 enforces 0..100', () => {
    const s = percent100();
    expect(s.parse(0)).toBe(0);
    expect(s.parse(50)).toBe(50);
    expect(s.parse(100)).toBe(100);
    expect(s.parse(99.9)).toBe(99.9);
    expect(() => s.parse(-1)).toThrow();
    expect(() => s.parse(150)).toThrow();
  });

  test('positiveInt enforces integer >= 1', () => {
    const s = positiveInt();
    expect(s.parse(1)).toBe(1);
    expect(s.parse(100)).toBe(100);
    expect(() => s.parse(0)).toThrow();
    expect(() => s.parse(-1)).toThrow();
    expect(() => s.parse(2.5)).toThrow();
    expect(() => s.parse(0.999)).toThrow();
  });

  test('positive enforces > 0', () => {
    const s = positive();
    expect(s.parse(0.001)).toBe(0.001);
    expect(s.parse(100)).toBe(100);
    expect(() => s.parse(0)).toThrow();
    expect(() => s.parse(-1)).toThrow();
  });

  test('yearRange enforces valid year bounds', () => {
    const s = yearRange(2000, 2030);
    expect(s.parse(2000)).toBe(2000);
    expect(s.parse(2025)).toBe(2025);
    expect(s.parse(2030)).toBe(2030);
    expect(() => s.parse(1999)).toThrow();
    expect(() => s.parse(2031)).toThrow();
    expect(() => s.parse(2025.5)).toThrow(); // Must be integer
  });

  test('yearRange uses defaults', () => {
    const s = yearRange();
    expect(s.parse(1900)).toBe(1900);
    expect(s.parse(2100)).toBe(2100);
    expect(() => s.parse(1899)).toThrow();
    expect(() => s.parse(2101)).toThrow();
  });
});

describe('schema-helpers::edge cases', () => {
  test('handles undefined schema', () => {
    const s = num();
    expect(s.parse(123)).toBe(123);
    expect(s.parse(-456)).toBe(-456);
  });

  test('handles null coercion', () => {
    const s = num({ min: 0 });
    expect(s.parse(null)).toBe(0); // Zod coerces null to 0
  });

  test('handles NaN', () => {
    const s = num();
    expect(() => s.parse(NaN)).toThrow();
  });

  test('handles Infinity', () => {
    const s = num({ max: 1000 });
    expect(() => s.parse(Infinity)).toThrow();
  });
});