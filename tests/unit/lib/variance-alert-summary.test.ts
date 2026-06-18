import { describe, expect, it } from 'vitest';
import { deriveAlertSummaryState } from '@/lib/variance-alert-summary';

describe('deriveAlertSummaryState', () => {
  it('reports LOADING while the query is in flight', () => {
    expect(
      deriveAlertSummaryState({ isLoading: true, isError: false, totalActiveAlerts: undefined })
    ).toEqual({ state: 'LOADING' });
  });

  it('reports FAILED on query error instead of a fake zero', () => {
    expect(
      deriveAlertSummaryState({ isLoading: false, isError: true, totalActiveAlerts: undefined })
    ).toEqual({ state: 'FAILED', message: 'Unable to load alert summary.' });
  });

  it('reports UNAVAILABLE when the count is missing but there is no error', () => {
    expect(
      deriveAlertSummaryState({ isLoading: false, isError: false, totalActiveAlerts: undefined })
    ).toEqual({ state: 'UNAVAILABLE', reason: 'No alert summary available yet.' });
  });

  it('preserves a real zero as a LIVE value (not collapsed away)', () => {
    expect(
      deriveAlertSummaryState({ isLoading: false, isError: false, totalActiveAlerts: 0 })
    ).toEqual({ state: 'LIVE', count: 0 });
  });

  it('returns the live count when present', () => {
    expect(
      deriveAlertSummaryState({ isLoading: false, isError: false, totalActiveAlerts: 3 })
    ).toEqual({ state: 'LIVE', count: 3 });
  });
});
