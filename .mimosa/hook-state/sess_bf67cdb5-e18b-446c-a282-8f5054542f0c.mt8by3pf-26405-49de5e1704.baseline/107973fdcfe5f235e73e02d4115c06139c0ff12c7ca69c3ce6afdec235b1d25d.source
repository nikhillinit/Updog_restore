import { describe, expect, it } from 'vitest';

import { metricDisplayDetail, metricDisplayValue } from '@/lib/display/metric-state';

describe('metric availability state', () => {
  it('renders values for available, zero, and stale states', () => {
    expect(metricDisplayValue({ kind: 'available', value: 1.25 })).toBe('1.25');
    expect(metricDisplayValue({ kind: 'zero', value: 0 })).toBe('0');
    expect(metricDisplayValue({ kind: 'stale', value: '$12M', detail: 'Refresh pending' })).toBe(
      '$12M'
    );
  });

  it('preserves explicit formatted zero values', () => {
    expect(metricDisplayValue({ kind: 'zero', value: '0.00x' })).toBe('0.00x');
  });

  it('renders an em dash for unavailable states', () => {
    expect(metricDisplayValue({ kind: 'not_applicable', detail: 'No comparable cohort' })).toBe(
      '—'
    );
    expect(metricDisplayValue({ kind: 'insufficient_history', detail: 'Needs two quarters' })).toBe(
      '—'
    );
    expect(metricDisplayValue({ kind: 'error', detail: 'Metric failed to load' })).toBe('—');
  });

  it('returns detail only when present', () => {
    expect(metricDisplayDetail({ kind: 'available', value: 1 })).toBeUndefined();
    expect(metricDisplayDetail({ kind: 'available', value: 1, detail: 'Audited' })).toBe('Audited');
    expect(metricDisplayDetail({ kind: 'error', detail: 'Metric failed to load' })).toBe(
      'Metric failed to load'
    );
  });
});
