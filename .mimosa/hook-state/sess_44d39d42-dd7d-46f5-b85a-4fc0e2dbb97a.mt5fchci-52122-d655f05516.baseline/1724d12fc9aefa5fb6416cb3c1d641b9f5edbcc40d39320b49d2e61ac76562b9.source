import { describe, expect, it } from 'vitest';
import { resolveCommittedCapital } from '@/lib/fund-header-metric-calculations';

describe('resolveCommittedCapital - committed-capital provenance', () => {
  it('prefers the server-computed actual.totalCommitted when present', () => {
    expect(resolveCommittedCapital(50_000_000, { totalCommitted: 48_000_000 })).toBe(48_000_000);
  });

  it('falls back to the fund config size when actual metrics are absent', () => {
    expect(resolveCommittedCapital(50_000_000)).toBe(50_000_000);
  });

  it('falls back to the fund config size when actual.totalCommitted is undefined, so committed is always available', () => {
    expect(resolveCommittedCapital(50_000_000, { totalCommitted: undefined })).toBe(50_000_000);
  });
});
