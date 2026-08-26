import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../../../shared/core/calc-substrate/fixed-clock';

const INSTANT = '2026-07-17T12:34:56.789Z';

describe('createFixedClock', () => {
  it('returns the pinned instant', () => {
    const clock = createFixedClock(INSTANT);
    expect(clock.now().toISOString()).toBe(INSTANT);
    expect(clock.isoNow()).toBe(INSTANT);
  });

  it('normalizes second-precision input to canonical millisecond ISO output', () => {
    const clock = createFixedClock('2026-07-17T00:00:00Z');
    expect(clock.isoNow()).toBe('2026-07-17T00:00:00.000Z');
    expect(createFixedClock('2026-07-17T00:00:00.5Z').isoNow()).toBe('2026-07-17T00:00:00.500Z');
  });

  it('cannot be mutated through a returned Date', () => {
    const clock = createFixedClock(INSTANT);
    const leaked = clock.now();
    leaked.setFullYear(1999);
    leaked.setTime(0);
    expect(clock.now().toISOString()).toBe(INSTANT);
    expect(clock.isoNow()).toBe(INSTANT);
  });

  it('returns a fresh Date object on every call', () => {
    const clock = createFixedClock(INSTANT);
    expect(clock.now()).not.toBe(clock.now());
  });

  it('rejects non-UTC, malformed, and non-existent instants', () => {
    const invalid = [
      'not-a-date',
      '',
      '2026-07-17T00:00:00',
      '2026-07-17 00:00:00Z',
      '2026-07-17T00:00:00+02:00',
      '2026-02-30T00:00:00Z',
      '2026-13-01T00:00:00Z',
      '2026-07-17T24:00:00Z',
    ];
    for (const value of invalid) {
      expect(() => createFixedClock(value), value).toThrow(RangeError);
    }
  });
});
