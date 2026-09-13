import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { calculateCapitalPlanningV2 } from '../../../shared/lib/capital-planning/capital-planning-v2';
import { v2Input, v2Bundle } from '../../fixtures/capital-planning/v2-fixtures';
const { detail, snapshot } = vi.hoisted(() => ({ detail: vi.fn(), snapshot: vi.fn() }));
vi.mock('../../../server/services/fund-scenario-set-service.js', () => ({
  verifyFundExists: vi.fn(),
  fetchRawScenarioSet: vi.fn(),
  fetchCapitalScenarioSetDetailFromRaw: detail,
}));
vi.mock('../../../server/services/fund-scenario-capital-read-service.js', () => ({
  fetchCapitalSavedSnapshot: snapshot,
}));
import { buildFundScenarioCapitalComparison } from '../../../server/services/fund-scenario-capital-comparison-service';

describe('saved corrected capital comparison', () => {
  it('uses saved V2 results for memos and exact expected-count deltas', async () => {
    const input = v2Input();
    const sourceBundle = v2Bundle(input);
    const base = calculateCapitalPlanningV2({ input, sourceBundle });
    const changed = structuredClone(input);
    changed.allocations[0]!.initialCheckUsd = '2000000.000000';
    const variant = calculateCapitalPlanningV2({ input: changed, sourceBundle });
    const setId = '00000000-0000-0000-0000-000000000101';
    const baselineId = '00000000-0000-0000-0000-000000000102';
    const variantId = '00000000-0000-0000-0000-000000000103';
    detail.mockResolvedValue({
      fundId: 101,
      id: setId,
      name: 'Corrected comparison',
      baselineVariantId: baselineId,
      representation: 'capital-plan-v2',
      readState: {
        sourceFreshness: 'CURRENT',
        calculationReadiness: { context: 'saved_input', state: 'READY', issues: [] },
        interpretationCompatibility: {
          state: 'CURRENT',
          savedVersion: sourceBundle.interpretationVersion,
          currentVersion: sourceBundle.interpretationVersion,
        },
      },
    });
    snapshot.mockResolvedValue({
      snapshotId: 42,
      payload: {
        calculatedAt: '2026-09-13T00:00:00.000Z',
        variants: [
          { variantId: baselineId, name: 'Baseline', result: base },
          { variantId, name: 'Higher check', result: variant },
        ],
      },
    });
    const before = JSON.stringify([base, variant]);
    const result = await buildFundScenarioCapitalComparison({} as PoolClient, 101, setId);
    expect(result.representation).toBe('capital-plan-v2');
    expect(result.baseline?.result).toBe(base);
    expect(result.variants[0]!.metricDeltas).toContainEqual(
      expect.objectContaining({
        metric: 'companyCount',
        countBasis: 'expected',
        baselineValue: '10.000000000000',
        variantValue: '5.000000000000',
        absoluteDelta: '-5.000000000000',
      })
    );
    expect(JSON.stringify([base, variant])).toBe(before);
  });
});
