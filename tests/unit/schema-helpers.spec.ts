import { describe, test, expect } from 'vitest';
import {
  num,
  nonNegative,
  bounded01,
  percent100,
  positiveInt,
  yearRange
} from '../../shared/schema-helpers';

describe('num helper', () => {
  test('basic number validation', () => {
    const schema = num();
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse('42')).toBe(42); // coercion enabled by default
    expect(() => schema.parse('invalid')).toThrow();
  });

  test('min/max constraints', () => {
    const schema = num({ min: 10, max: 20 });
    expect(schema.parse(15)).toBe(15);
    expect(() => schema.parse(5)).toThrow();
    expect(() => schema.parse(25)).toThrow();
  });

  test('integer constraint', () => {
    const schema = num({ int: true });
    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse(42.5)).toThrow();
  });

  test('coercion disabled', () => {
    const schema = num({ coerce: false });
    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse('42')).toThrow();
  });

  test('custom error messages', () => {
    const schema = num({
      min: 0,
      max: 100,
      messageMin: 'Must be positive',
      messageMax: 'Too high'
    });

    expect(() => schema.parse(-1)).toThrow('Must be positive');
    expect(() => schema.parse(101)).toThrow('Too high');
  });
});

describe('nonNegative helper', () => {
  test('allows zero and positive numbers', () => {
    const schema = nonNegative();
    expect(schema.parse(0)).toBe(0);
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse('10')).toBe(10);
  });

  test('rejects negative numbers', () => {
    const schema = nonNegative();
    expect(() => schema.parse(-1)).toThrow();
    expect(() => schema.parse(-0.1)).toThrow();
  });
});

describe('bounded01 helper', () => {
  test('enforces 0..1 range', () => {
    const schema = bounded01();
    expect(schema.parse(0)).toBe(0);
    expect(schema.parse(0.5)).toBe(0.5);
    expect(schema.parse(1)).toBe(1);
    expect(schema.parse('0.75')).toBe(0.75);
  });

  test('rejects out-of-range values', () => {
    const schema = bounded01();
    expect(() => schema.parse(-0.1)).toThrow();
    expect(() => schema.parse(1.1)).toThrow();
  });
});

describe('percent100 helper', () => {
  test('enforces 0..100 range', () => {
    const schema = percent100();
    expect(schema.parse(0)).toBe(0);
    expect(schema.parse(50)).toBe(50);
    expect(schema.parse(100)).toBe(100);
    expect(schema.parse('75')).toBe(75);
  });

  test('rejects out-of-range values', () => {
    const schema = percent100();
    expect(() => schema.parse(-1)).toThrow();
    expect(() => schema.parse(101)).toThrow();
  });
});

describe('positiveInt helper', () => {
  test('allows positive integers', () => {
    const schema = positiveInt();
    expect(schema.parse(1)).toBe(1);
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse('10')).toBe(10);
  });

  test('rejects non-positive values', () => {
    const schema = positiveInt();
    expect(() => schema.parse(0)).toThrow();
    expect(() => schema.parse(-1)).toThrow();
  });

  test('rejects non-integers', () => {
    const schema = positiveInt();
    expect(() => schema.parse(1.5)).toThrow();
    expect(() => schema.parse(0.5)).toThrow();
  });
});

describe('yearRange helper', () => {
  test('enforces custom year range', () => {
    const schema = yearRange(1900, 2100);
    expect(schema.parse(1950)).toBe(1950);
    expect(schema.parse(2000)).toBe(2000);
    expect(schema.parse('2023')).toBe(2023);
  });

  test('rejects out-of-range years', () => {
    const schema = yearRange(1900, 2100);
    expect(() => schema.parse(1800)).toThrow();
    expect(() => schema.parse(2200)).toThrow();
  });

  test('includes custom error messages', () => {
    const schema = yearRange(1980, 2050);
    expect(() => schema.parse(1970)).toThrow('Year must be at least 1980');
    expect(() => schema.parse(2060)).toThrow('Year must be at most 2050');
  });

  test('requires integers', () => {
    const schema = yearRange(2000, 2030);
    expect(() => schema.parse(2023.5)).toThrow();
  });
});