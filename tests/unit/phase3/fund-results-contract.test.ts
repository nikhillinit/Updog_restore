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

  it('scorecard section can only be unavailable in Phase 3', () => {
    const available = {
      status: 'available',
      calculatedAt: '2026-03-22T00:00:00Z',
      source: 'fund_snapshots',
      legacyEvidence: false,
      payload: {},
    };

    // Scorecard should NOT accept available variant in Phase 3
    const parsed = FundResultsReadV1Schema.safeParse({
      ...validFullResponse(),
      sections: { ...allUnavailableSections(), scorecard: available },
    });
    expect(parsed.success).toBe(false);
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
