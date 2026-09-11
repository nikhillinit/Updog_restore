import { describe, expect, it, vi } from 'vitest';
import {
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  type CapitalPlanningDraftV1,
} from '@shared/contracts/capital-planning-v1.contract';
import { FundScenarioCapitalSourceResponseV1Schema } from '@shared/contracts/fund-scenario-sets-v1.contract';
import { sha256CanonicalJson } from '@shared/lib/canonical-json';
import { CAPITAL_BENCHMARK_CATALOG_VERSION } from '@shared/lib/capital-planning/benchmark-presets';
import { calculateCapitalPlanningV1 } from '@shared/lib/capital-planning/capital-planning-v1';
import {
  inspectCapitalSourcePreview,
  materializeCapitalSource,
  type CapitalRawSource,
} from '@shared/lib/capital-planning/materialize-from-fund-draft';
import * as core from '@shared/lib/capital-planning/source-materialization-core';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';

function fixture() {
  const raw = makeCapitalRawConfig();
  const source: CapitalRawSource = {
    fund: { id: 101, size: '100.00', baseCurrency: 'USD' },
    config: { id: 11, version: 1, raw, publishedAt: '2026-09-01T00:00:00.000Z' },
  };
  return { raw, source, input: makeCapitalInput(), unitDeclarations: makeCapitalDeclarations() };
}

function sourceResponse(source: CapitalRawSource) {
  return FundScenarioCapitalSourceResponseV1Schema.parse({
    contractVersion: 'fund-scenario-capital-source/1.0.0',
    representation: 'capital-plan-v1',
    ...inspectCapitalSourcePreview(source),
    publishedAt: source.config.publishedAt,
    interpretationVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
    interpretationCompatibility: {
      state: 'CURRENT',
      savedVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
      currentVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
    },
  });
}

describe('bounded source preview parity', () => {
  it.each([
    'source',
    'empty-selection',
    'preset',
    'identical-override',
    'follow-on-preset',
    'follow-on-identical-override',
    'companion',
  ] as const)('preserves full materialization and calculator results for %s intent', (intent) => {
    const f = fixture();
    const draft: CapitalPlanningDraftV1 = { input: f.input };
    const followOn = intent.startsWith('follow-on-');
    if (followOn) {
      const stages = f.raw.pipelineProfiles![0]!.stages;
      stages[0]!.graduationRate = 1;
      stages.push({ ...stages[0]!, id: 's1', name: 'Series A', valuation: 20, roundSize: 5 });
      for (const [path, unit] of Object.entries(f.unitDeclarations)) {
        if (path.startsWith('pipelineProfiles[0].stages[0].'))
          f.unitDeclarations[path.replace('stages[0]', 'stages[1]')] = unit;
      }
      f.input.allocations[0]!.plannedCompanyCount = 1;
      f.input.allocations[0]!.followOnRounds = [
        {
          roundId: 'r1',
          stageId: 's1',
          roundLabel: 'Series A',
          graduationRatio: '1.000000000000',
          participationRatio: '1.000000000000',
          checkPolicy: { type: 'pro_rata', proRataExerciseRatio: '1.000000000000' },
          monthsAfterPreviousRound: 12,
          timeOrigin: 'previous_round',
          incrementalPreMoneyPoolDilutionRatio: '0.000000000000',
        },
      ];
    }
    if (intent === 'companion') {
      f.input.performanceCase = {
        methodVersion: 'aggregate-preference-forecast/1.0.0',
        issuerLabel: 'Synthetic issuer',
        issuerKind: 'representative_issuer',
        exitEquityValueUsd: '20.000000',
        exitDate: '2026-01-01',
        asConvertedOwnershipRatio: '0.250000000000',
        fundLiquidationPreferenceUsd: '4.000000',
        preferenceType: 'participating',
        participationCap: { type: 'none' },
        totalPreferencesSeniorUsd: '2.000000',
        totalPreferencesPariPassuUsd: '4.000000',
        totalPreferencesJuniorUsd: '2.000000',
        investedCostUsd: '2.000000',
        positionFmv: { amountUsd: '7.000000', asOfDate: '2026-08-01', basis: 'direct' },
      };
    }
    if (intent === 'empty-selection') draft.benchmarkSelections = [];
    if (intent === 'preset' || intent === 'identical-override' || followOn) {
      draft.benchmarkSelections = [
        {
          target: { kind: 'entry', allocationId: 'a1' },
          selector: { version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage: 'seed' },
          ...(intent.endsWith('identical-override')
            ? {
                overrides: {
                  valuation: {
                    valuationUsd: '24300000.000000',
                    valuationBasis: 'post_money' as const,
                  },
                  totalPrimaryRoundUsd: '4100000.000000',
                },
              }
            : {}),
        },
      ];
      if (followOn)
        draft.benchmarkSelections.push({
          ...structuredClone(draft.benchmarkSelections[0]!),
          target: { kind: 'follow_on', allocationId: 'a1', roundId: 'r1' },
        });
    }
    const inputs = [intent === 'source' ? f.input : draft];
    const expected = materializeCapitalSource({ ...f, inputs });
    const source = sourceResponse(f.source);
    const before = structuredClone(source);
    const actual = core.materializeCapitalProjectionPreview({
      source,
      inputs,
      unitDeclarations: f.unitDeclarations,
    });
    expect(actual).toStrictEqual(expected);
    expect(source).toStrictEqual(before);
    expect(actual.ok).toBe(true);
    if (!actual.ok || !expected.ok) throw new Error('Expected admitted source');
    expect(actual.availableConstructionCapitalUsd).toBe('90.000000');
    expect(actual.sourceBundle.gp.deemedContributionUsd).toBe('4.000000');
    expect(actual.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('4.000000');
    expect(actual.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('2.000000');
    expect(Object.hasOwn(actual, 'benchmarkSnapshotsByInput')).toBe(
      intent === 'preset' || intent === 'identical-override' || followOn
    );
    const calculate = (result: typeof actual) =>
      calculateCapitalPlanningV1({
        input: result.resolvedInputs?.[0] ?? f.input,
        sourceBundle: result.sourceBundle,
        ...(result.benchmarkSnapshotsByInput === undefined
          ? {}
          : { benchmarkSnapshots: result.benchmarkSnapshotsByInput[0]! }),
      });
    expect(calculate(actual)).toStrictEqual(calculate(expected));
  });

  it.each(['missing', 'mismatched', 'extraneous', 'selected-link'] as const)(
    'preserves full-source refusal for %s draft admission',
    (condition) => {
      const f = fixture();
      if (condition === 'missing')
        delete f.unitDeclarations['capitalPlanAllocations[0].initialCheckAmount'];
      if (condition === 'mismatched') f.unitDeclarations['funds.size'] = 'ratio';
      if (condition === 'extraneous') f.unitDeclarations['unused.amount'] = 'usd';
      if (condition === 'selected-link')
        f.input.allocations[0]!.pipelineProfileId = 'missing-profile';
      const expected = materializeCapitalSource({ ...f, inputs: [f.input] });
      const actual = core.materializeCapitalProjectionPreview({
        source: sourceResponse(f.source),
        inputs: [f.input],
        unitDeclarations: f.unitDeclarations,
      });
      expect(actual).toStrictEqual(expected);
      expect(actual.ok).toBe(false);
    }
  );

  it.each(['hidden-invalid', 'rate-only', 'empty-basis', 'growth', 'cap'] as const)(
    'retains source-global %s blockers from GET inspection',
    (condition) => {
      const f = fixture();
      if (condition === 'hidden-invalid') Object.assign(f.raw, { fundName: 7 });
      if (condition === 'rate-only') {
        delete f.raw.economicsAssumptions!.feeModel!.tiers;
        f.raw.economicsAssumptions!.feeModel!.defaultRate = 0;
      }
      if (condition === 'empty-basis')
        Object.assign(f.raw.economicsAssumptions!.feeModel!.tiers![0]!, { basis: '' });
      if (condition === 'growth')
        f.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.growthRate = 0.1;
      if (condition === 'cap') f.raw.economicsAssumptions!.expenseModel!.orgExpenseCap = 0;
      const source = sourceResponse(f.source);
      const expected = source.calculationReadiness.issues.filter(
        (issue) =>
          issue.message !== 'An exact-path source-unit declaration is required' &&
          issue.message !==
            'Scenario selections are required to determine construction sources and declarations'
      );
      expect(expected.length).toBeGreaterThan(0);
      const actual = core.materializeCapitalProjectionPreview({
        source,
        inputs: [f.input],
        unitDeclarations: f.unitDeclarations,
      });
      expect(actual.ok).toBe(false);
      if (actual.ok) throw new Error('Expected source refusal');
      expect(actual.issues).toStrictEqual(expected);
      expect(actual.readiness.context).toBe('current_preview');
    }
  );

  it('retains unresolved issues sharing a declaration path but not its exact placeholder', () => {
    const f = fixture();
    const source = sourceResponse(f.source);
    const issue = {
      code: 'TIME_ORIGIN_UNRESOLVED' as const,
      path: 'funds.size',
      message: 'Source month origins disagree',
      support: 'incomplete' as const,
    };
    source.calculationReadiness.issues.push(issue);
    const actual = core.materializeCapitalProjectionPreview({
      source,
      inputs: [f.input],
      unitDeclarations: f.unitDeclarations,
    });
    expect(actual.ok).toBe(false);
    if (actual.ok) throw new Error('Expected source refusal');
    expect(actual.issues).toStrictEqual([issue]);
  });

  it('fails closed on facts indexing outside their declared source array', () => {
    const f = fixture();
    const source = sourceResponse(f.source);
    source.projection.facts.push({
      path: 'pipelineProfiles[0].stages[1].valuation',
      state: 'present',
      rawValue: 20,
    });
    source.sourceBundleHash = sha256CanonicalJson(source.projection);
    const actual = core.materializeCapitalProjectionPreview({
      source,
      inputs: [f.input],
      unitDeclarations: f.unitDeclarations,
    });
    expect(actual.ok).toBe(false);
    if (actual.ok) throw new Error('Expected source integrity refusal');
    expect(actual.issues[0]?.code).toBe('HISTORICAL_SOURCE_INTEGRITY_FAILED');
  });

  it('keeps untouched full-source validation before interpretation, draft admission, and hashing', () => {
    const f = fixture();
    Object.assign(f.raw, { fundName: 7 });
    const hash = vi.fn(sha256CanonicalJson);
    const actual = core.materializeCapitalSource(
      { ...f, inputs: [], expectedInterpretationVersion: 'unsupported' },
      hash
    );
    expect(actual.ok).toBe(false);
    if (actual.ok) throw new Error('Expected source validation failure');
    expect(actual.code).toBe('scenario_source_config_invalid');
    expect(actual.issues[0]?.path).toBe('fundName');
    expect(hash).not.toHaveBeenCalled();
  });
});
