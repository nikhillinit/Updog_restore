import { describe, expect, it } from 'vitest';
import {
  FundStateReadV1Schema,
  type FundStateReadV1,
} from '../../../../shared/contracts/fund-state-read-v1.contract';
import type { MetricDelta } from '../../../../shared/contracts/fund-results-comparison-v1.contract';
import {
  formatComparisonDelta,
  formatComparisonMetricValue,
  formatDateOrFallback,
  formatDriftCapabilityReason,
  formatLifecycleStatus,
  hasStaleEvidence,
} from '../../../../client/src/pages/fund-model-results/formatters';
import {
  evidenceFromLifecycle,
  mixedScorecardEvidence,
  reasonCopyFor,
  sectionBackedEvidence,
} from '../../../../client/src/pages/fund-model-results/evidence';
import type { EvidenceHeaderLifecycle } from '../../../../client/src/components/results/EvidenceHeader';

interface LifecycleOverrides {
  configState?: Partial<FundStateReadV1['configState']>;
  calculationState?: Partial<FundStateReadV1['calculationState']>;
}

// Parse through the real strict contract schema so a contract-invalid fixture
// fails loudly here instead of silently passing helper tests (see PR #993).
function lifecycle(overrides: LifecycleOverrides = {}): FundStateReadV1 {
  return FundStateReadV1Schema.parse({
    fundId: 123,
    configState: {
      latestVersion: 3,
      draftVersion: 3,
      publishedVersion: 2,
      hasDraft: true,
      hasPublished: true,
      publishedAt: '2026-03-20T12:00:00.000Z',
      draftUpdatedAt: '2026-03-20T11:00:00.000Z',
      publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
      ...overrides.configState,
    },
    calculationState: {
      status: 'ready',
      configVersion: 2,
      runId: 10,
      correlationId: null,
      dispatchState: null,
      availableSnapshotTypes: ['fund_state', 'fund_snapshots'],
      expectedSnapshotTypes: ['fund_state', 'fund_snapshots'],
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      lastError: null,
      legacyEvidence: false,
      ...overrides.calculationState,
    },
    legacy: { engineResultsPresent: false },
  });
}

describe('fund model results formatters', () => {
  it('keeps lifecycle labels stable', () => {
    expect(formatLifecycleStatus('not_requested')).toBe('Not requested');
    expect(formatLifecycleStatus('submitted')).toBe('Submitted');
    expect(formatLifecycleStatus('calculating')).toBe('Calculating');
    expect(formatLifecycleStatus('ready')).toBe('Ready');
    expect(formatLifecycleStatus('failed')).toBe('Failed');
  });

  it('formats comparison metric values and deltas without changing copy', () => {
    const delta: MetricDelta = {
      metric: 'fundSize',
      displayName: 'Fund Size',
      currentValue: 100_000_000,
      previousValue: 80_000_000,
      absoluteDelta: 20_000_000,
      percentageDelta: 25,
      driftCapable: true,
      driftReason: 'stable',
    };

    expect(formatComparisonMetricValue('fundSize', 100_000_000)).toBe('$100M');
    expect(formatComparisonDelta(delta)).toBe('+$20M (+25.0%)');
    expect(formatDriftCapabilityReason({ ...delta, driftReason: 'zero_previous' })).toBe(
      'Previous value is zero, so percentage drift is unstable.'
    );
  });

  it('keeps fallback date copy stable for unavailable values', () => {
    expect(formatDateOrFallback(null)).toBe('Not available');
    expect(formatDateOrFallback(null, 'Not published')).toBe('Not published');
  });

  it('detects stale evidence when calculation config is behind published config', () => {
    expect(hasStaleEvidence(lifecycle())).toBe(false);
    expect(
      hasStaleEvidence(
        lifecycle({
          configState: {
            latestVersion: 4,
            draftVersion: 4,
            publishedVersion: 4,
            publishedAt: '2026-03-21T12:00:00.000Z',
          },
          calculationState: { configVersion: 2 },
        })
      )
    ).toBe(true);
  });
});

describe('fund model results evidence helpers', () => {
  it('keeps reason-code copy stable', () => {
    expect(reasonCopyFor({ reasonCode: 'NO_PUBLISHED_CONFIG' })).toBe(
      'Publish your fund configuration to see this section.'
    );
    expect(reasonCopyFor({ reason: 'Server reason' })).toBe('Server reason');
    expect(reasonCopyFor({})).toBe('Not available');
  });

  it('derives lifecycle evidence from the server lifecycle envelope', () => {
    expect(evidenceFromLifecycle(lifecycle())).toEqual({
      status: 'ready',
      configVersion: 2,
      runId: 10,
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      publishedVersion: 2,
      source: '/api/funds/:id/results',
    });
  });

  it('preserves section-backed evidence semantics', () => {
    const base: EvidenceHeaderLifecycle = evidenceFromLifecycle(lifecycle());
    expect(
      sectionBackedEvidence(base, {
        status: 'available',
        configVersion: 7,
        calculatedAt: '2026-04-01T00:00:00.000Z',
        source: 'fund_snapshots',
      })
    ).toEqual({
      status: 'ready',
      provenanceLevel: 'section_backed_result',
      configVersion: 7,
      runId: null,
      lastCalculatedAt: '2026-04-01T00:00:00.000Z',
      publishedVersion: 2,
      source: 'fund_snapshots',
    });
  });

  it('labels mixed scorecard evidence from actual field sources', () => {
    const base: EvidenceHeaderLifecycle = evidenceFromLifecycle(lifecycle());
    expect(
      mixedScorecardEvidence(base, {
        status: 'available',
        payload: {
          fundSize: { value: 100_000_000, source: 'funds' },
          reserveRatio: { value: 0.4, source: 'fund_snapshots' },
        },
      })
    )?.toMatchObject({
      provenanceLevel: 'mixed_scorecard_sources',
      sourceLabel: 'funds / fund_snapshots',
    });
  });
});
