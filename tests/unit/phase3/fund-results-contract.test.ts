/**
 * Batch 3A1: Contract shape tests for fund-results-v1
 *
 * Validates Zod schemas parse correctly, reject invalid data, and
 * section discriminated unions work as expected.
 */

import { describe, it, expect } from 'vitest';
import {
  FundResultsReadV1Schema,
  SectionAvailableSchema,
  ReserveResultsSectionSchema,
} from '@shared/contracts/fund-results-v1.contract';

describe('FundResultsReadV1 contract shape', () => {
  // -- Top-level fields --

  it('parses a valid ready response with available reserve and pacing', () => {
    const input = {
      status: 'ready',
      fundId: 1,
      fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
      lifecycle: validLifecycle(),
      sections: {
        reserve: validReserveSection(),
        pacing: validPacingSection(),
        scorecard: { status: 'unavailable', reason: 'No authoritative source' },
        scenarios: { status: 'unavailable', reason: 'No authoritative source' },
        waterfall: { status: 'unavailable', reason: 'No authoritative source' },
      },
    };

    const parsed = FundResultsReadV1Schema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('parses a valid ready response where reserve is unavailable', () => {
    const input = {
      status: 'ready',
      fundId: 1,
      fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
      lifecycle: validLifecycle(),
      sections: {
        reserve: { status: 'unavailable', reason: 'No calculation results available' },
        pacing: validPacingSection(),
        scorecard: { status: 'unavailable', reason: 'No authoritative source' },
        scenarios: { status: 'unavailable', reason: 'No authoritative source' },
        waterfall: { status: 'unavailable', reason: 'No authoritative source' },
      },
    };

    const parsed = FundResultsReadV1Schema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('parses a valid pending response with all sections unavailable', () => {
    const input = {
      status: 'pending',
      fundId: 1,
      fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
      lifecycle: validLifecycle(),
      sections: {
        reserve: { status: 'pending', reason: 'Calculations not yet requested' },
        pacing: { status: 'pending', reason: 'Calculations not yet requested' },
        scorecard: { status: 'unavailable', reason: 'No authoritative source' },
        scenarios: { status: 'unavailable', reason: 'No authoritative source' },
        waterfall: { status: 'unavailable', reason: 'No authoritative source' },
      },
    };

    const parsed = FundResultsReadV1Schema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  // -- Rejection tests --

  it('rejects response with missing fund block', () => {
    const input = {
      status: 'ready',
      fundId: 1,
      // fund: missing
      lifecycle: validLifecycle(),
      sections: allUnavailableSections(),
    };

    const parsed = FundResultsReadV1Schema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  it('rejects response with invalid status value', () => {
    const input = {
      status: 'completed', // not a valid status
      fundId: 1,
      fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
      lifecycle: validLifecycle(),
      sections: allUnavailableSections(),
    };

    const parsed = FundResultsReadV1Schema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  it('rejects unavailable section without reason', () => {
    const input = {
      status: 'ready',
      fundId: 1,
      fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
      lifecycle: validLifecycle(),
      sections: {
        reserve: { status: 'unavailable' }, // missing reason
        pacing: { status: 'unavailable', reason: 'ok' },
        scorecard: { status: 'unavailable', reason: 'ok' },
        scenarios: { status: 'unavailable', reason: 'ok' },
        waterfall: { status: 'unavailable', reason: 'ok' },
      },
    };

    const parsed = FundResultsReadV1Schema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  // -- Section discriminated union --

  it('available section has payload, calculatedAt, source, and legacyEvidence', () => {
    const section = validReserveSection();
    const parsed = SectionAvailableSchema(ReserveResultsSectionSchema).safeParse(section);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('available');
      expect(parsed.data).toHaveProperty('payload');
      expect(parsed.data).toHaveProperty('calculatedAt');
      expect(parsed.data).toHaveProperty('source', 'fund_snapshots');
      expect(parsed.data).toHaveProperty('legacyEvidence');
    }
  });

  it('scorecard section accepts available with per-field source-tagged payload', () => {
    const parsed = FundResultsReadV1Schema.safeParse({
      ...validFullResponse(),
      sections: {
        ...allUnavailableSections(),
        reserve: validReserveSection(),
        pacing: validPacingSection(),
        scorecard: validScorecardSection(),
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('scorecard requires fundName and fundSize facts', () => {
    const parsed = FundResultsReadV1Schema.safeParse({
      ...validFullResponse(),
      sections: {
        ...allUnavailableSections(),
        scorecard: {
          status: 'available',
          payload: {
            // missing fundName and fundSize
            reserveRatio: { value: 0.4, source: 'fund_snapshots' },
          },
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('scorecard allows omitting optional snapshot-backed facts', () => {
    const parsed = FundResultsReadV1Schema.safeParse({
      ...validFullResponse(),
      sections: {
        ...allUnavailableSections(),
        scorecard: {
          status: 'available',
          payload: {
            fundName: { value: 'Test Fund', source: 'funds' },
            fundSize: { value: 100_000_000, source: 'funds' },
            // no reserveRatio, avgConfidence, yearsToFullDeploy, lastCalculatedAt
          },
        },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('scorecard rejects speculative fields like expectedMOIC', () => {
    const parsed = FundResultsReadV1Schema.safeParse({
      ...validFullResponse(),
      sections: {
        ...allUnavailableSections(),
        scorecard: {
          status: 'available',
          payload: {
            fundName: { value: 'Test Fund', source: 'funds' },
            fundSize: { value: 100_000_000, source: 'funds' },
            expectedMOIC: { value: 2.5, source: 'fund_snapshots' },
          },
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('unavailable section accepts optional reasonCode', () => {
    const parsed = FundResultsReadV1Schema.safeParse({
      ...validFullResponse(),
      sections: {
        ...allUnavailableSections(),
        scorecard: {
          status: 'unavailable',
          reason: 'No published config',
          reasonCode: 'NO_PUBLISHED_CONFIG',
        },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('unavailable section rejects invalid reasonCode', () => {
    const parsed = FundResultsReadV1Schema.safeParse({
      ...validFullResponse(),
      sections: {
        ...allUnavailableSections(),
        scorecard: {
          status: 'unavailable',
          reason: 'test',
          reasonCode: 'INVALID_CODE_NOT_IN_ENUM',
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('config-backed waterfall section rejects fund_snapshots source', () => {
    const parsed = FundResultsReadV1Schema.safeParse({
      ...validFullResponse(),
      sections: {
        ...allUnavailableSections(),
        waterfall: {
          ...validWaterfallSection(),
          source: 'fund_snapshots', // wrong source for config-backed
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('waterfall section accepts an available config-backed setup summary', () => {
    const parsed = FundResultsReadV1Schema.safeParse({
      ...validFullResponse(),
      sections: {
        ...allUnavailableSections(),
        reserve: validReserveSection(),
        pacing: validPacingSection(),
        waterfall: validWaterfallSection(),
      },
    });

    expect(parsed.success).toBe(true);
  });
});

// -- Fixtures --

function validLifecycle() {
  return {
    fundId: 1,
    configState: {
      latestVersion: 1,
      draftVersion: null,
      publishedVersion: 1,
      hasDraft: false,
      hasPublished: true,
      publishedAt: '2026-03-20T12:00:00.000Z',
      draftUpdatedAt: null,
      publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
    },
    calculationState: {
      status: 'ready',
      configVersion: 1,
      runId: 10,
      correlationId: 'test-corr-id',
      dispatchState: 'dispatched',
      availableSnapshotTypes: ['RESERVE', 'PACING'],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      lastError: null,
      legacyEvidence: false,
    },
    legacy: { engineResultsPresent: false },
  };
}

function validReserveSection() {
  return {
    status: 'available' as const,
    calculatedAt: '2026-03-20T12:30:00.000Z',
    source: 'fund_snapshots' as const,
    legacyEvidence: false,
    payload: {
      totalAllocation: 40_000_000,
      reserveRatio: 0.4,
      avgConfidence: 0.85,
      allocations: [
        { allocation: 10_000_000, confidence: 0.9, rationale: 'Strong follow-on candidate' },
        { allocation: 30_000_000, confidence: 0.8, rationale: 'Series B expected' },
      ],
    },
  };
}

function validPacingSection() {
  return {
    status: 'available' as const,
    calculatedAt: '2026-03-20T12:30:00.000Z',
    source: 'fund_snapshots' as const,
    legacyEvidence: false,
    payload: {
      deploymentRate: 5_000_000,
      yearsToFullDeploy: 5,
      totalQuarters: 20,
      marketCondition: 'neutral',
      deployments: [{ quarter: 1, deployment: 5_000_000, note: 'Q1 deployment' }],
    },
  };
}

function validScorecardSection() {
  return {
    status: 'available' as const,
    payload: {
      fundName: { value: 'Test Fund', source: 'funds' as const },
      fundSize: { value: 100_000_000, source: 'funds' as const },
      vintageYear: { value: 2024, source: 'funds' as const },
      reserveRatio: { value: 0.4, source: 'fund_snapshots' as const },
      avgConfidence: { value: 0.85, source: 'fund_snapshots' as const },
      yearsToFullDeploy: { value: 5, source: 'fund_snapshots' as const },
      lastCalculatedAt: { value: '2026-03-20T12:30:00.000Z', source: 'fund_state' as const },
    },
  };
}

function validWaterfallSection() {
  return {
    status: 'available' as const,
    source: 'fund_config' as const,
    configVersion: 1,
    publishedAt: '2026-03-20T12:00:00.000Z',
    payload: {
      view: 'setup-summary' as const,
      type: 'american' as const,
      tierCount: 1,
      tiers: [
        {
          name: 'Tier 1',
          preferredReturn: 0.08,
          catchUp: null,
          gpSplit: 20,
          lpSplit: 80,
          condition: 'irr' as const,
          conditionValue: 0.08,
        },
      ],
      recyclingEnabled: true,
      recyclingType: 'both' as const,
      recyclingCap: 25,
      recyclingPeriod: 24,
      exitRecyclingRate: 0.5,
      mgmtFeeRecyclingRate: 0.25,
      allowFutureRecycling: false,
    },
  };
}

function validFullResponse() {
  return {
    status: 'ready' as const,
    fundId: 1,
    fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
    lifecycle: validLifecycle(),
    sections: {
      reserve: validReserveSection(),
      pacing: validPacingSection(),
      scorecard: { status: 'unavailable' as const, reason: 'No authoritative source' },
      scenarios: { status: 'unavailable' as const, reason: 'No authoritative source' },
      waterfall: { status: 'unavailable' as const, reason: 'No authoritative source' },
    },
  };
}

function allUnavailableSections() {
  return {
    reserve: { status: 'unavailable' as const, reason: 'No calculation results available' },
    pacing: { status: 'unavailable' as const, reason: 'No calculation results available' },
    scorecard: { status: 'unavailable' as const, reason: 'No authoritative source' },
    scenarios: { status: 'unavailable' as const, reason: 'No authoritative source' },
    waterfall: { status: 'unavailable' as const, reason: 'No authoritative source' },
  };
}
