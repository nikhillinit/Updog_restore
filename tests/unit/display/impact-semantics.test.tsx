import { describe, expect, it } from 'vitest';

import { getImpactBadgeClass, getImpactTextClass } from '@/lib/display/impact-semantics';

describe('impact display semantics', () => {
  it('maps impact direction and severity to text classes', () => {
    expect(getImpactTextClass({ direction: 'favorable', severity: 'low' })).toBe(
      'text-presson-positive'
    );
    expect(getImpactTextClass({ direction: 'unfavorable', severity: 'high' })).toBe(
      'text-presson-negative'
    );
    expect(getImpactTextClass({ direction: 'unfavorable', severity: 'medium' })).toBe(
      'text-presson-warning'
    );
    expect(getImpactTextClass({ direction: 'unfavorable', severity: 'low' })).toBe(
      'text-presson-warning'
    );
    expect(getImpactTextClass({ direction: 'neutral', severity: 'low' })).toBe('text-charcoal-900');
  });

  it('never maps favorable impact to adverse classes', () => {
    expect(getImpactTextClass({ direction: 'favorable', severity: 'high' })).not.toBe(
      'text-presson-negative'
    );
    expect(getImpactTextClass({ direction: 'favorable', severity: 'medium' })).not.toBe(
      'text-presson-warning'
    );
  });

  it('maps badge classes by severity', () => {
    expect(getImpactBadgeClass('high')).toBe('border-error/40 bg-error/10 text-error-dark');
    expect(getImpactBadgeClass('medium')).toBe('border-warning/40 bg-warning/10 text-warning-dark');
    expect(getImpactBadgeClass('low')).toBe('border-charcoal-200 bg-pov-gray text-charcoal-700');
  });
});
