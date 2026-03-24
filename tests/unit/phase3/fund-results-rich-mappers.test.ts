import { describe, expect, it } from 'vitest';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import {
  mapPublishedConfigToWaterfallSetup,
  mapScorecardFromEvidence,
} from '../../../server/services/fund-results-rich-mappers';

describe('mapPublishedConfigToWaterfallSetup', () => {
  it('returns null when published config has no coherent waterfall setup', () => {
    const config = FundDraftWriteV1Schema.parse({
      fundName: 'Test Fund',
    });

    expect(mapPublishedConfigToWaterfallSetup(config)).toBeNull();
  });

  it('maps published waterfall config and normalizes missing optionals to null', () => {
    const config = FundDraftWriteV1Schema.parse({
      fundName: 'Test Fund',
      waterfallType: 'hybrid',
      waterfallTiers: [
        {
          id: 'tier-1',
          name: 'Tier 1',
          gpSplit: 20,
          lpSplit: 80,
        },
      ],
      recyclingEnabled: false,
    });

    expect(mapPublishedConfigToWaterfallSetup(config)).toEqual({
      view: 'setup-summary',
      type: 'hybrid',
      tierCount: 1,
      tiers: [
        {
          name: 'Tier 1',
          preferredReturn: null,
          catchUp: null,
          gpSplit: 20,
          lpSplit: 80,
          condition: null,
          conditionValue: null,
        },
      ],
      recyclingEnabled: false,
      recyclingType: null,
      recyclingCap: null,
      recyclingPeriod: null,
      exitRecyclingRate: null,
      mgmtFeeRecyclingRate: null,
      allowFutureRecycling: null,
    });
  });
});

describe('mapScorecardFromEvidence', () => {
  const baseFund = { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 };

  it('includes fund identity facts when no snapshots are available', () => {
    const result = mapScorecardFromEvidence(
      baseFund,
      { status: 'unavailable' },
      { status: 'unavailable' },
      null
    );

    expect(result.fundName).toEqual({ value: 'Test Fund', source: 'funds' });
    expect(result.fundSize).toEqual({ value: 100_000_000, source: 'funds' });
    expect(result.vintageYear).toEqual({ value: 2024, source: 'funds' });
    expect(result.reserveRatio).toBeUndefined();
    expect(result.avgConfidence).toBeUndefined();
    expect(result.yearsToFullDeploy).toBeUndefined();
    expect(result.lastCalculatedAt).toBeUndefined();
  });

  it('includes reserve facts when reserve section is available', () => {
    const result = mapScorecardFromEvidence(
      baseFund,
      {
        status: 'available',
        payload: { reserveRatio: 0.4, avgConfidence: 0.85 },
      },
      { status: 'unavailable' },
      '2026-03-20T12:30:00.000Z'
    );

    expect(result.reserveRatio).toEqual({ value: 0.4, source: 'fund_snapshots' });
    expect(result.avgConfidence).toEqual({ value: 0.85, source: 'fund_snapshots' });
    expect(result.yearsToFullDeploy).toBeUndefined();
    expect(result.lastCalculatedAt).toEqual({
      value: '2026-03-20T12:30:00.000Z',
      source: 'fund_state',
    });
  });

  it('includes pacing facts when pacing section is available', () => {
    const result = mapScorecardFromEvidence(
      baseFund,
      { status: 'unavailable' },
      {
        status: 'available',
        payload: { yearsToFullDeploy: 5 },
      },
      null
    );

    expect(result.yearsToFullDeploy).toEqual({ value: 5, source: 'fund_snapshots' });
    expect(result.reserveRatio).toBeUndefined();
  });

  it('includes all facts when both sections are available', () => {
    const result = mapScorecardFromEvidence(
      baseFund,
      {
        status: 'available',
        payload: { reserveRatio: 0.4, avgConfidence: 0.85 },
      },
      {
        status: 'available',
        payload: { yearsToFullDeploy: 5 },
      },
      '2026-03-20T12:30:00.000Z'
    );

    expect(result.fundName).toEqual({ value: 'Test Fund', source: 'funds' });
    expect(result.fundSize).toEqual({ value: 100_000_000, source: 'funds' });
    expect(result.reserveRatio).toEqual({ value: 0.4, source: 'fund_snapshots' });
    expect(result.avgConfidence).toEqual({ value: 0.85, source: 'fund_snapshots' });
    expect(result.yearsToFullDeploy).toEqual({ value: 5, source: 'fund_snapshots' });
    expect(result.lastCalculatedAt).toEqual({
      value: '2026-03-20T12:30:00.000Z',
      source: 'fund_state',
    });
  });
});
