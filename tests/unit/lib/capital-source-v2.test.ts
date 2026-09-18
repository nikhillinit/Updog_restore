import { describe, expect, it } from 'vitest';
import {
  materializeCapitalSource,
  verifyPinnedCapitalSourceBundle,
} from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';

function fixture() {
  const legacy = makeCapitalInput();
  const { budgetShareRatio, ...allocation } = legacy.allocations[0]!;
  const corrected = {
    contractVersion: 'capital-planning/2.0.0',
    roundingPolicy: 'capital-planning-rounding/half-up-money-6-ratio-12/1.0.0',
    solve: { mode: 'fixed_fund' },
    allocations: [
      {
        ...allocation,
        initialPoolShareRatio: budgetShareRatio,
        scheduleAnchor: 'entry_deployment_month',
        deploymentCadence: 'uniform_monthly_over_deployment_period',
        entryFinancing: {
          valuationUsd: '10.000000',
          valuationBasis: 'pre_money',
          primaryCapital: {
            basis: 'total_primary_including_fund_check',
            totalPrimaryAmountUsd: '2.000000',
            primary_only_excludes_secondary: true,
          },
        },
      },
    ],
  };
  return {
    source: {
      fund: { id: 101, size: '100', baseCurrency: 'USD' },
      config: {
        id: 201,
        version: 1,
        raw: makeCapitalRawConfig(),
        publishedAt: '2026-09-12T00:00:00.000Z',
      },
    },
    unitDeclarations: makeCapitalDeclarations(),
    legacy,
    corrected,
  };
}

describe('corrected capital source admission', () => {
  it('pins identical source facts without assigning V1 budget meaning to initial dollar weights', () => {
    const f = fixture();
    const old = materializeCapitalSource({ ...f, inputs: [f.legacy] });
    const current = materializeCapitalSource({ ...f, inputs: [f.corrected] });
    expect(old.ok).toBe(true);
    expect(current.ok).toBe(true);
    expect(
      materializeCapitalSource({ ...f, inputs: [{ input: f.corrected, benchmarkSelections: [] }] })
        .ok
    ).toBe(true);
    if (!old.ok || !current.ok) throw new Error('source admission failed');
    expect(current.sourceBundle).toEqual(old.sourceBundle);
    expect(
      current.assumptionProvenanceByInput
        .flat()
        .some((p) => p.inputPath.includes('budgetShareRatio'))
    ).toBe(false);
    expect(current.assumptionProvenanceByInput[0]).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].initialPoolShareRatio',
        origin: 'user_entered',
        sourceValue: null,
      })
    );
    expect(
      verifyPinnedCapitalSourceBundle({
        sourceBundle: current.sourceBundle,
        savedProjection: current.sourceBundle.projection,
        inputs: [f.corrected],
      }).ok
    ).toBe(true);
  });

  it('refuses mixed semantic versions and ambiguous corrected timing', () => {
    const f = fixture();
    expect(materializeCapitalSource({ ...f, inputs: [f.legacy, f.corrected] }).ok).toBe(false);
    f.corrected.allocations[0]!.scheduleAnchor = 'ambiguous';
    expect(materializeCapitalSource({ ...f, inputs: [f.corrected] }).ok).toBe(false);
  });
});
