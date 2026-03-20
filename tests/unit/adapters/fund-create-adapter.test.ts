/**
 * Tests for fund-create-adapter format detection and parsing
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectPostFormat,
  parseCanonical,
  parseLegacyBasics,
} from '../../../server/adapters/fund-create-adapter';
import { validCreatePayload } from '../../fixtures/fund-contract-v1-fixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detectPostFormat', () => {
  it('detects canonical format (has name, no basics)', () => {
    expect(detectPostFormat({ name: 'Fund I', size: 50_000_000 })).toBe('canonical');
  });

  it('detects legacy-basics format (has basics key)', () => {
    expect(detectPostFormat({ basics: { name: 'Fund I', size: 50_000_000 } })).toBe(
      'legacy-basics'
    );
  });

  it('returns unknown when neither marker present', () => {
    expect(detectPostFormat({ fundSize: 50_000_000 })).toBe('unknown');
  });

  it('returns unknown for null body', () => {
    expect(detectPostFormat(null)).toBe('unknown');
  });

  it('returns unknown for non-object body', () => {
    expect(detectPostFormat('string')).toBe('unknown');
  });

  it('returns legacy-basics when both markers present (documented precedence)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = detectPostFormat({ name: 'Fund I', basics: { name: 'Fund I' } });
    expect(result).toBe('legacy-basics');
    expect(warnSpy).toHaveBeenCalledWith('create-both-markers', expect.any(Object));
  });
});

describe('parseCanonical', () => {
  it('parses valid canonical payload', () => {
    const result = parseCanonical(validCreatePayload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Press On Fund III');
      expect(result.data.size).toBe(50_000_000);
    }
  });

  it('returns error for invalid payload', () => {
    const result = parseCanonical({ size: -1 });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown keys', () => {
    const result = parseCanonical({ ...validCreatePayload, bogus: true });
    expect(result.ok).toBe(false);
  });
});

describe('parseLegacyBasics', () => {
  it('parses valid legacy-basics payload', () => {
    const result = parseLegacyBasics({
      basics: { name: 'Fund I', size: 50_000_000 },
      strategy: { stages: [{ name: 'Seed', graduate: 30, exit: 10, months: 18 }] },
    });
    expect(result.ok).toBe(true);
  });

  it('returns error when basics.name missing', () => {
    const result = parseLegacyBasics({ basics: { size: 50_000_000 } });
    expect(result.ok).toBe(false);
  });
});
