import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  fingerprintCapitalSource,
  materializeCapitalSource,
  verifyPinnedCapitalSourceBundle,
  type CapitalRawSource,
  type CapitalMaterializationResult,
} from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import {
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CapitalPlanningInputV1Schema,
  CapitalUnitDeclarationsV1Schema,
} from '../../../shared/contracts/capital-planning-v1.contract';
import { FundDraftWriteV1Schema } from '../../../shared/contracts/fund-draft-write-v1.contract';
import {
  CapitalPlanningCalculationError,
  parseCalculation,
} from '../../../shared/lib/capital-planning/calculation-support';
import * as canonical from '../../../shared/lib/canonical-json';
import {
  makeCapitalRawConfig,
  makeCapitalInput,
  makeCapitalDeclarations,
} from '../../fixtures/capital-planning/fixtures';
import expected from '../../fixtures/capital-planning/expected-values.json';
import maximumShape from '../../fixtures/capital-planning/maximum-shape.json';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const raw = makeCapitalRawConfig();
  const source: CapitalRawSource = {
    fund: { id: 101, size: '100.00', baseCurrency: 'USD' },
    config: { id: 11, version: 1, raw, publishedAt: '2026-09-01T00:00:00.000Z' },
  };
  const input = makeCapitalInput();
  const unitDeclarations = makeCapitalDeclarations();
  return {
    raw,
    source,
    input,
    unitDeclarations,
    run: () => materializeCapitalSource({ source, inputs: [input], unitDeclarations }),
  };
}
function admitted(result: CapitalMaterializationResult) {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}
function refused(result: CapitalMaterializationResult, code: string, path: string, status = 422) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected refusal');
  expect(result.status).toBe(status);
  expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code, path })]));
}

describe('capital source GP and source identity', () => {
  it('retains full source precision until GP money is emitted', () => {
    const f = setup();
    f.source.fund.size = '10000000000';
    f.raw.fundSize = 10000000000;
    f.unitDeclarations['funds.size'] = 'usd_millions';
    f.unitDeclarations.fundSize = 'usd_millions';
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 10000000000;
    f.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'] = 'usd_millions';
    f.raw.fundedFromFeesPct = 0.12345678901249;
    expect(admitted(f.run()).sourceBundle.gp.deemedContributionUsd).toBe('1234567890124900.000000');
    delete f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
    delete f.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentPct = 0.12345678901249;
    f.raw.fundedFromFeesPct = 0.4;
    const percent = admitted(f.run()).sourceBundle.gp;
    expect(percent.resolved.commitmentUsd).toBe('1234567890124900.000000');
    expect(percent.deemedContributionUsd).toBe('493827156049960.000000');
  });

  it('does not apply selected GP domain rules to a schema-valid shadowed top-level amount', () => {
    const f = setup();
    f.raw.gpCommitment = -1;
    expect(admitted(f.run()).sourceBundle.gp.resolved.source).toBe('nested_amount');
  });

  it.each(expected.gp)('$id retains signed A and does not reduce the fee basis', (fixture) => {
    const f = setup();
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = Number(fixture.gp);
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = Number(fixture.fees) / 200;
    f.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.amount =
      Number(fixture.expenses) / 2;
    if (fixture.fraction === null) delete f.raw.fundedFromFeesPct;
    else f.raw.fundedFromFeesPct = Number(fixture.fraction);
    const rawBefore = JSON.stringify(f.raw);
    const hashBefore = fingerprintCapitalSource(f.source).sourceBundleHash;
    const result = admitted(f.run());
    expect(result.availableConstructionCapitalUsd).toBe(Number(fixture.available).toFixed(6));
    expect(result.sourceBundle.gp.deemedContributionUsd).toBe(Number(fixture.deemed).toFixed(6));
    expect(result.sourceBundle.feeExpense.feeBasisUsd).toBe('100.000000');
    expect(result.sourceBundle.feeExpense.lifetimeFeesUsd).toBe(Number(fixture.fees).toFixed(6));
    expect(result.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe(
      Number(fixture.expenses).toFixed(6)
    );
    expect(result.readiness).toEqual({ context: 'current_preview', state: 'READY', issues: [] });
    expect(result.sourceBundle.feeExpense.feeTiers[0]!.population).toBe(
      'full_fund_committed_capital'
    );
    expect(JSON.stringify(f.raw)).toBe(rawBefore);
    expect(fingerprintCapitalSource(f.source).sourceBundleHash).toBe(hashBefore);
    expect(result.sourceBundle.gp.fundedFromFeesPct.state).toBe(
      fixture.fraction === null ? 'absent' : 'present'
    );
  });

  it('preserves raw absent defaults and exact nested amount, nested percent, top-level, zero precedence', () => {
    const f = setup();
    f.raw.gpCommitment = 30;
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentPct = 0.2;
    expect(admitted(f.run()).sourceBundle.gp.resolved.source).toBe('nested_amount');
    delete f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
    delete f.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
    const percentage = admitted(f.run()).sourceBundle.gp;
    expect(percentage.resolved.source).toBe('nested_percent');
    expect(percentage.resolved.commitmentUsd).toBe('20.000000');
    delete f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentPct;
    f.unitDeclarations.gpCommitment = 'usd';
    const top = admitted(f.run()).sourceBundle.gp;
    expect(top.resolved.source).toBe('top_level_amount');
    expect(top.resolved.commitmentUsd).toBe('30.000000');
    delete f.raw.gpCommitment;
    delete f.unitDeclarations.gpCommitment;
    delete f.raw.fundedFromFeesPct;
    const zero = admitted(f.run()).sourceBundle.gp;
    expect(zero.resolved).toEqual({
      source: 'zero_fallback',
      commitmentUsd: '0.000000',
      defaultReason: 'GP_COMMITMENT_SOURCES_ABSENT',
    });
    expect(zero.fundedFromFeesPct).toEqual({
      state: 'absent',
      effectiveValue: '0.000000000000',
      defaultReason: 'ADR_070_MISSING_FRACTION_ZERO',
    });
    expect(f.raw.economicsAssumptions!.gpCommitmentModel).not.toHaveProperty(
      'participatesInInvestmentReturns'
    );
    f.raw.fundedFromFeesPct = 0.1;
    refused(f.run(), 'GP_COMMITMENT_UNRESOLVED', 'gpCommitment');
  });

  it('refuses selected invalid/oversized GP instead of falling through or clamping', () => {
    const f = setup();
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 101;
    refused(
      f.run(),
      'GP_COMMITMENT_EXCEEDS_COMMITMENTS',
      'economicsAssumptions.gpCommitmentModel.commitmentAmount'
    );
    delete f.raw.economicsAssumptions!.gpCommitmentModel;
    delete f.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
    f.raw.gpCommitment = -1;
    f.unitDeclarations.gpCommitment = 'usd';
    refused(f.run(), 'GP_COMMITMENT_INVALID', 'gpCommitment');
  });

  it('validates shadowed persisted fields before capital admission', () => {
    const f = setup();
    f.raw.economicsAssumptions!.feeModel!.defaultRate = 1.01;
    refused(f.run(), 'INVALID_INPUT', 'economicsAssumptions.feeModel.defaultRate', 409);
    delete f.raw.economicsAssumptions!.feeModel!.defaultRate;
    f.raw.fundedFromFeesPct = 0;
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = -1;
    refused(
      f.run(),
      'INVALID_INPUT',
      'economicsAssumptions.gpCommitmentModel.commitmentAmount',
      409
    );
  });

  it('fingerprints raw sources without declarations or interpreter-derived defaults', () => {
    const f = setup();
    const original = fingerprintCapitalSource(f.source);
    f.source.config.publishedAt = '2026-09-02T00:00:00.000Z';
    expect(fingerprintCapitalSource(f.source)).toEqual(original);
    expect(
      materializeCapitalSource({ source: f.source, inputs: [f.input], unitDeclarations: {} }).ok
    ).toBe(false);
    expect(fingerprintCapitalSource(f.source)).toEqual(original);
    f.source.fund.baseCurrency = 'EUR';
    expect(fingerprintCapitalSource(f.source).sourceBundleHash).not.toBe(original.sourceBundleHash);
    refused(f.run(), 'FUND_CURRENCY_UNSUPPORTED', 'baseCurrency');
    f.source.fund.baseCurrency = 'USD';
    f.raw.fundedFromFeesPct = 0;
    expect(fingerprintCapitalSource(f.source).sourceBundleHash).not.toBe(original.sourceBundleHash);
  });

  it('normalizes fund sizes independently and rejects mismatched or missing unit provenance', () => {
    const f = setup();
    f.source.fund.size = '0.0001';
    f.unitDeclarations['funds.size'] = 'usd_millions';
    expect(admitted(f.run()).sourceBundle.fundSize.normalizedValue).toBe('100.000000');
    f.raw.fundSize = 99;
    refused(f.run(), 'FUND_SIZE_SOURCE_MISMATCH', 'fundSize');
    f.raw.fundSize = 100;
    delete f.unitDeclarations.fundSize;
    refused(f.run(), 'UNIT_PROVENANCE_UNRESOLVED', 'fundSize');
  });

  it('verifies pinned source consequences and refuses tampering or unsupported saved interpretation', () => {
    const f = setup();
    const sourceBundle = admitted(f.run()).sourceBundle;
    const args = { sourceBundle, savedProjection: sourceBundle.projection, inputs: [f.input] };
    expect(verifyPinnedCapitalSourceBundle(args)).toEqual({
      ok: true,
      availableConstructionCapitalUsd: '90.000000',
      readiness: { context: 'saved_input', state: 'READY', issues: [] },
    });
    const tampered = structuredClone(sourceBundle);
    tampered.gp.deemedContributionUsd = '3.000000';
    expect(verifyPinnedCapitalSourceBundle({ ...args, sourceBundle: tampered }).ok).toBe(false);
    expect(
      verifyPinnedCapitalSourceBundle({
        ...args,
        sourceBundle: { ...sourceBundle, interpretationVersion: 'unsupported/9.0.0' },
      }).ok
    ).toBe(false);
    const unsupported = materializeCapitalSource({
      source: f.source,
      inputs: [f.input],
      unitDeclarations: f.unitDeclarations,
      expectedInterpretationVersion: `${CAPITAL_SOURCE_INTERPRETATION_VERSION}-future`,
    });
    refused(unsupported, 'INTERPRETATION_VERSION_UNSUPPORTED', 'expectedInterpretationVersion');
  });
});

describe('capital fee/expense source selection and periods', () => {
  it('does not round source rates or recurring expenses before lifetime aggregation', () => {
    const f = setup();
    f.source.fund.size = '10000000000';
    f.raw.fundSize = 10000000000;
    f.unitDeclarations['funds.size'] = 'usd_millions';
    f.unitDeclarations.fundSize = 'usd_millions';
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.12345678901249;
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeFeesUsd).toBe(
      '2469135780249800.000000'
    );
    delete f.raw.economicsAssumptions!.expenseModel!.annualExpenses;
    delete f.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
    f.raw.fundExpenses = [
      { id: 'tiny', category: 'admin', monthlyAmount: 0.0000001, startMonth: 0, endMonth: 11 },
    ];
    f.unitDeclarations['fundExpenses[0].monthlyAmount'] = 'usd';
    f.unitDeclarations['fundExpenses[0].startMonth'] = 'fund_month_zero_based';
    f.unitDeclarations['fundExpenses[0].endMonth'] = 'fund_month_zero_based';
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('0.000001');
  });

  it.each([-1, 0, 0.02, 101])(
    'refuses rate-only managementFeeRate=%s without normalizing it',
    (rate) => {
      const f = setup();
      delete f.raw.economicsAssumptions!.feeModel!.tiers;
      f.raw.managementFeeRate = rate;
      refused(f.run(), 'FEE_TIER_SCHEDULE_REQUIRED', 'managementFeeRate');
    }
  );

  it('retains additive inclusive annual fees and uses full commitments despite GP deemed contribution', () => {
    const f = setup();
    const tier = f.raw.economicsAssumptions!.feeModel!.tiers![0]!;
    f.raw.economicsAssumptions!.feeModel!.tiers!.push({ ...tier, id: 'fee-2' });
    const result = admitted(f.run());
    expect(result.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('8.000000');
    expect(result.availableConstructionCapitalUsd).toBe('86.000000');
  });

  it('treats explicit empty annual expenses as zero before legacy fallback; absence remains unresolved', () => {
    const f = setup();
    f.raw.economicsAssumptions!.expenseModel!.annualExpenses = [];
    delete f.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
    f.raw.fundExpenses = [{ id: 'legacy-e', category: 'admin', monthlyAmount: 999, startMonth: 0 }];
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('0.000000');
    delete f.raw.economicsAssumptions!.expenseModel!.annualExpenses;
    delete f.raw.fundExpenses;
    refused(f.run(), 'EXPENSE_MODEL_UNRESOLVED', 'fundExpenses');
  });

  it.each([
    [0, 0, '10.000000'],
    [0, 5, '60.000000'],
    [6, 11, '60.000000'],
    [0, 11, '120.000000'],
  ] as const)('charges legacy expense months %s through %s inclusively', (start, end, total) => {
    const f = setup();
    delete f.raw.economicsAssumptions!.expenseModel!.annualExpenses;
    delete f.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
    f.raw.fundExpenses = [
      { id: 'legacy-e', category: 'admin', monthlyAmount: 10, startMonth: start, endMonth: end },
    ];
    f.unitDeclarations['fundExpenses[0].monthlyAmount'] = 'usd';
    f.unitDeclarations['fundExpenses[0].startMonth'] = 'fund_month_zero_based';
    f.unitDeclarations['fundExpenses[0].endMonth'] = 'fund_month_zero_based';
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeExpensesUsd).toBe(total);
    delete f.unitDeclarations['fundExpenses[0].endMonth'];
    refused(f.run(), 'TIME_ORIGIN_UNRESOLVED', 'fundExpenses[0].endMonth');
  });

  it('requires whole-year fee boundaries and explicit matching origins', () => {
    const f = setup();
    delete f.raw.economicsAssumptions!.feeModel!.tiers;
    f.raw.feeProfiles = [
      {
        id: 'legacy-fee',
        name: 'Legacy',
        feeTiers: [
          {
            id: 't1',
            name: 'Fee',
            percentage: 2,
            feeBasis: 'committed_capital',
            startMonth: 0,
            endMonth: 23,
          },
        ],
      },
    ];
    f.unitDeclarations['feeProfiles[0].feeTiers[0].percentage'] = 'percent_points';
    f.unitDeclarations['feeProfiles[0].feeTiers[0].startMonth'] = 'fund_month_zero_based';
    f.unitDeclarations['feeProfiles[0].feeTiers[0].endMonth'] = 'fund_month_zero_based';
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeFeesUsd).toBe('4.000000');
    f.raw.feeProfiles[0]!.feeTiers[0]!.startMonth = 6;
    refused(f.run(), 'FEE_PERIOD_NOT_REPRESENTABLE', 'feeProfiles[0].feeTiers[0].startMonth');
    f.raw.feeProfiles[0]!.feeTiers[0]!.startMonth = 0;
    f.raw.feeProfiles[0]!.feeTiers[0]!.percentage = -1;
    refused(f.run(), 'FEE_RATE_INVALID', 'feeProfiles[0].feeTiers[0].percentage');
  });
});

describe('B2 recovered source boundaries', () => {
  it('ISSUE-5625294952-F1 retains category allocations independently of named allocation IDs', () => {
    const f = setup();
    const construction = admitted(f.run()).sourceBundle.construction;
    expect(construction.allocations).toEqual([
      {
        id: 'category-initial',
        category: 'Initial',
        percentage: {
          path: 'allocations[0].percentage',
          rawValue: 60,
          sourceUnit: 'percent_points',
          normalizedValue: '0.600000000000',
          provenanceOrigin: 'contract_resolved',
          unitClass: 'resolved_ratio',
        },
      },
      {
        id: 'category-follow-on',
        category: 'Follow-on',
        percentage: {
          path: 'allocations[1].percentage',
          rawValue: 40,
          sourceUnit: 'percent_points',
          normalizedValue: '0.400000000000',
          provenanceOrigin: 'contract_resolved',
          unitClass: 'resolved_ratio',
        },
      },
    ]);
    expect(construction.capitalPlanAllocations.map((row) => row.id)).toEqual(['a1']);
    expect(construction.links).toEqual([
      {
        allocationId: 'a1',
        pipelineProfileId: 'p1',
        entryStageId: 's0',
        provenanceOrigin: 'scenario_declared',
      },
    ]);
  });

  it.each(['fee', 'expense'] as const)(
    'ISSUE-5625294952-F2 rejects persisted inverted annual %s intervals at schema validation',
    (kind) => {
      const f = setup();
      const item =
        kind === 'fee'
          ? f.raw.economicsAssumptions!.feeModel!.tiers![0]!
          : f.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!;
      item.startYear = 2;
      item.endYear = 1;
      refused(
        f.run(),
        'INVALID_INPUT',
        `economicsAssumptions.${kind === 'fee' ? 'feeModel.tiers' : 'expenseModel.annualExpenses'}[0].endYear`,
        409
      );
    }
  );

  it('ISSUE-5625294952-F2/F4 admits equal annual endpoints as one inclusive year', () => {
    const f = setup();
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.endYear = 1;
    f.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.endYear = 1;
    const result = admitted(f.run());
    expect(result.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('2.000000');
    expect(result.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('1.000000');
    expect(result.sourceBundle.feeExpense.feeTiers[0]!.period).toMatchObject({
      normalizedStartMonth: 0,
      normalizedEndMonth: 11,
    });
  });

  it('ISSUE-5625294952-F2 excludes omitted-end windows beyond the finite horizon', () => {
    const f = setup();
    const fee = f.raw.economicsAssumptions!.feeModel!.tiers![0]!;
    const expense = f.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!;
    fee.startYear = 3;
    expense.startYear = 3;
    delete fee.endYear;
    delete expense.endYear;
    const result = admitted(f.run());
    expect(result.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('0.000000');
    expect(result.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('0.000000');
    for (const period of [
      result.sourceBundle.feeExpense.feeTiers[0]!.period,
      result.sourceBundle.feeExpense.expenses[0]!.period,
    ]) {
      expect(period).toMatchObject({
        normalizedStartMonth: 24,
        normalizedEndMonth: 23,
        end: null,
        endDefaultReason: 'FINITE_FUND_HORIZON_END',
      });
    }
  });

  it.each(['fee', 'expense'] as const)(
    'ISSUE-5625294952-F2/F3 preserves the exact reconstructed inverted %s refusal',
    (kind) => {
      const f = setup();
      const sourceBundle = admitted(f.run()).sourceBundle;
      const prefix = `economicsAssumptions.${kind === 'fee' ? 'feeModel.tiers' : 'expenseModel.annualExpenses'}[0]`;
      for (const fact of sourceBundle.projection.facts) {
        if (fact.state === 'present' && fact.path === `${prefix}.startYear`) fact.rawValue = 2;
        if (fact.state === 'present' && fact.path === `${prefix}.endYear`) fact.rawValue = 1;
      }
      sourceBundle.sourceBundleHash = canonical.sha256CanonicalJson(sourceBundle.projection);
      refused(
        verifyPinnedCapitalSourceBundle({
          sourceBundle,
          savedProjection: sourceBundle.projection,
          inputs: [f.input],
        }),
        kind === 'fee' ? 'FEE_PERIOD_NOT_REPRESENTABLE' : 'INVALID_INPUT',
        `${prefix}.endYear`
      );
    }
  );

  it.each(['materialize', 'verify'] as const)(
    'ISSUE-5625294952-F3 propagates unexpected TypeErrors from %s',
    (operation) => {
      const f = setup();
      const sourceBundle = admitted(f.run()).sourceBundle;
      const failure = new TypeError(`Unexpected ${operation} defect`);
      vi.spyOn(canonical, 'sha256CanonicalJson').mockImplementationOnce(() => {
        throw failure;
      });
      expect(() =>
        operation === 'materialize'
          ? f.run()
          : verifyPinnedCapitalSourceBundle({
              sourceBundle,
              savedProjection: sourceBundle.projection,
              inputs: [f.input],
            })
      ).toThrow(failure);
    }
  );

  it('ISSUE-5625294952-F3 preserves typed pin integrity and admission codes and paths', () => {
    const f = setup();
    const sourceBundle = admitted(f.run()).sourceBundle;
    const verify = (bundle: typeof sourceBundle, savedProjection = bundle.projection) =>
      verifyPinnedCapitalSourceBundle({ sourceBundle: bundle, savedProjection, inputs: [f.input] });
    const wrongProjection = structuredClone(sourceBundle.projection);
    wrongProjection.fundId = 102;
    refused(
      verify(sourceBundle, wrongProjection),
      'HISTORICAL_SOURCE_INTEGRITY_FAILED',
      'sourceBundleHash'
    );
    const wrongDerived = structuredClone(sourceBundle);
    wrongDerived.gp.deemedContributionUsd = '3.000000';
    refused(verify(wrongDerived), 'SOURCE_BUNDLE_INCONSISTENT', 'sourceBundle');
    const missingDeclaration = structuredClone(sourceBundle);
    delete missingDeclaration.unitDeclarations['funds.size'];
    refused(verify(missingDeclaration), 'UNIT_PROVENANCE_UNRESOLVED', 'funds.size');
  });

  it('REC-R7-UNCOMPLETED-100-REFUSAL/REC-PREVIEW-CREATE-VERSION classifies pure version mismatches', () => {
    const f = setup();
    const result = admitted(f.run());
    expect(CAPITAL_SOURCE_INTERPRETATION_VERSION).toBe('capital-source-interpretation/1.0.1');
    expect(result.sourceBundle.interpretationVersion).toBe('capital-source-interpretation/1.0.1');
    const fingerprint = fingerprintCapitalSource(f.source);
    refused(
      materializeCapitalSource({
        source: f.source,
        inputs: [f.input],
        unitDeclarations: f.unitDeclarations,
        expectedInterpretationVersion: 'capital-source-interpretation/1.0.0',
      }),
      'INTERPRETATION_VERSION_UNSUPPORTED',
      'expectedInterpretationVersion'
    );
    const oldBundle = {
      ...result.sourceBundle,
      interpretationVersion: 'capital-source-interpretation/1.0.0',
    };
    refused(
      verifyPinnedCapitalSourceBundle({
        sourceBundle: oldBundle,
        savedProjection: oldBundle.projection,
        inputs: [f.input],
      }),
      'INTERPRETATION_VERSION_UNSUPPORTED',
      'interpretationVersion'
    );
    expect(fingerprintCapitalSource(f.source)).toEqual(fingerprint);
    expect(oldBundle.sourceBundleHash).toBe(result.sourceBundle.sourceBundleHash);
    expect(canonical.sha256CanonicalJson(oldBundle)).not.toBe(
      canonical.sha256CanonicalJson(result.sourceBundle)
    );
  });

  it.each([
    ['OWNERSHIP_INPUT_UNRESOLVED', 'OWNERSHIP_INPUT_UNRESOLVED', 'incomplete'],
    ['Pro-rata chains require entry financing', 'INVALID_INPUT', 'invalid'],
    ['Pro-rata unrelated validation failure', 'INVALID_INPUT', 'invalid'],
    ['OWNERSHIP_INPUT_UNRESOLVED: unrelated suffix', 'INVALID_INPUT', 'invalid'],
    ['CHECK_EXCEEDS_ROUND_SIZE', 'CHECK_EXCEEDS_ROUND_SIZE', 'invalid'],
    ['POOL_DILUTION_UNRESOLVED', 'POOL_DILUTION_UNRESOLVED', 'incomplete'],
  ] as const)('PRRT_kwDOPQIb9c6hPimS classifies exact sentinel %s', (message, code, support) => {
    const schema = z
      .unknown()
      .superRefine((_value, ctx) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['financing'], message })
      );
    try {
      parseCalculation(schema, {}, 'input');
      throw new Error('Expected calculation refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(CapitalPlanningCalculationError);
      if (!(error instanceof CapitalPlanningCalculationError)) throw error;
      expect(error.issues).toEqual([{ code, path: 'input.financing', message, support }]);
    }
  });

  it('PRRT_kwDOPQIb9c6hPimS produces exact ownership sentinels in source admission', () => {
    const f = setup();
    f.input.allocations[0]!.followOnRounds = [
      {
        roundId: 'r1',
        stageId: 's1',
        roundLabel: 'A',
        graduationRatio: '0.500000000000',
        participationRatio: '1.000000000000',
        checkPolicy: { type: 'pro_rata', proRataExerciseRatio: '1.000000000000' },
        monthsAfterPreviousRound: 12,
        timeOrigin: 'previous_round',
        incrementalPreMoneyPoolDilutionRatio: '0.000000000000',
      },
    ];
    const parsed = CapitalPlanningInputV1Schema.safeParse(f.input);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected missing financing');
    expect(parsed.error.issues.map((issue) => issue.message)).toEqual([
      'OWNERSHIP_INPUT_UNRESOLVED',
      'OWNERSHIP_INPUT_UNRESOLVED',
    ]);
    const result = f.run();
    refused(result, 'OWNERSHIP_INPUT_UNRESOLVED', 'allocations[0].entryFinancing');
    refused(result, 'OWNERSHIP_INPUT_UNRESOLVED', 'allocations[0].followOnRounds[0].financing');
  });
});

function withLegacyFee() {
  const f = setup();
  delete f.raw.economicsAssumptions!.feeModel!.tiers;
  f.raw.feeProfiles = [
    {
      id: 'legacy-fee',
      name: 'Legacy',
      feeTiers: [
        {
          id: 'legacy-tier',
          name: 'Committed fee',
          percentage: 2,
          feeBasis: 'committed_capital',
          startMonth: 0,
          endMonth: 23,
        },
      ],
    },
  ];
  f.unitDeclarations['feeProfiles[0].feeTiers[0].percentage'] = 'percent_points';
  f.unitDeclarations['feeProfiles[0].feeTiers[0].startMonth'] = 'fund_month_zero_based';
  f.unitDeclarations['feeProfiles[0].feeTiers[0].endMonth'] = 'fund_month_zero_based';
  return f;
}

function withLegacyExpense() {
  const f = setup();
  delete f.raw.economicsAssumptions!.expenseModel!.annualExpenses;
  delete f.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
  f.raw.fundExpenses = [
    { id: 'monthly', category: 'admin', monthlyAmount: 1, startMonth: 0, endMonth: 23 },
  ];
  f.unitDeclarations['fundExpenses[0].monthlyAmount'] = 'usd';
  f.unitDeclarations['fundExpenses[0].startMonth'] = 'fund_month_zero_based';
  f.unitDeclarations['fundExpenses[0].endMonth'] = 'fund_month_zero_based';
  return f;
}

describe('B2 fee and expense precedence, support and provenance', () => {
  it('FEE-R3-001/004/005 explicit tiers win over legacy profiles and defaults regardless of labels', () => {
    const f = setup();
    f.raw.feeProfiles = [
      { id: 'shadow-1', name: 'Shadow one', feeTiers: [] },
      { id: 'shadow-2', name: 'Shadow two', feeTiers: [] },
    ];
    f.raw.economicsAssumptions!.feeModel!.source = 'legacy_fee_profiles';
    f.raw.economicsAssumptions!.feeModel!.defaultRate = 0.99;
    f.raw.economicsAssumptions!.feeModel!.defaultBasis = 'invested_capital';
    f.raw.managementFeeRate = -1;
    const result = admitted(f.run());
    expect(result.sourceBundle.feeExpense).toMatchObject({
      feeSelection: 'explicit_tiers',
      feeSourceLabel: 'legacy_fee_profiles',
      selectedFeeProfileId: null,
      lifetimeFeesUsd: '4.000000',
      rawPresence: {
        explicitFeeTiers: 'nonempty',
        legacyFeeProfiles: 'nonempty',
        nestedDefaultRate: true,
        managementFeeRate: true,
      },
      shadowedPaths: [
        'feeProfiles',
        'economicsAssumptions.feeModel.defaultRate',
        'economicsAssumptions.feeModel.defaultBasis',
        'managementFeeRate',
      ],
      annotations: [
        {
          code: 'SOURCE_LABEL_SELECTION_MISMATCH',
          path: 'economicsAssumptions.feeModel.source',
          selectedPath: 'economicsAssumptions.feeModel.tiers',
        },
      ],
    });
  });

  it('FEE-R3-003 tests fallback presence before selected financial normalization and nested presence wins', () => {
    const f = setup();
    f.raw.economicsAssumptions!.feeModel!.tiers = [];
    f.raw.economicsAssumptions!.feeModel!.defaultRate = 0;
    f.raw.managementFeeRate = 101;
    f.source.fund.size = '-1';
    f.raw.gpCommitment = -1;
    refused(f.run(), 'FEE_TIER_SCHEDULE_REQUIRED', 'economicsAssumptions.feeModel.defaultRate');
    // The persisted schema gate still precedes presence-based admission.
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = -1;
    refused(
      f.run(),
      'INVALID_INPUT',
      'economicsAssumptions.gpCommitmentModel.commitmentAmount',
      409
    );
  });

  it('FEE-R3-002/011 admits one selected legacy profile and rejects empty or multiple selected profiles', () => {
    const f = withLegacyFee();
    f.raw.economicsAssumptions!.feeModel!.tiers = [];
    const selected = admitted(f.run()).sourceBundle.feeExpense;
    expect(selected).toMatchObject({
      feeSelection: 'legacy_profile',
      selectedFeeProfileId: 'legacy-fee',
      lifetimeFeesUsd: '4.000000',
      rawPresence: { explicitFeeTiers: 'empty' },
    });
    f.raw.feeProfiles!.push({ ...structuredClone(f.raw.feeProfiles![0]!), id: 'second-profile' });
    refused(f.run(), 'FEE_PROFILE_APPLICABILITY_UNSUPPORTED', 'feeProfiles');
    f.raw.feeProfiles!.pop();
    f.raw.feeProfiles![0]!.feeTiers = [];
    refused(f.run(), 'FEE_MODEL_UNRESOLVED', 'feeProfiles[0].feeTiers');
  });

  it('FEE-R3-001 admits explicit zero fee tiers without a rate fallback', () => {
    const f = setup();
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0;
    f.raw.managementFeeRate = 99;
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeFeesUsd).toBe('0.000000');
  });

  it.each([
    ['called_capital_period', 'CALL_SCHEDULE_NOT_MODELED'],
    ['called_capital_cumulative', 'CALL_SCHEDULE_NOT_MODELED'],
    ['called_capital_net_of_returns', 'CALL_SCHEDULE_NOT_MODELED'],
    ['invested_capital', 'INVESTED_BASIS_ADAPTER_NOT_IMPLEMENTED'],
    ['fair_market_value', 'VALUATION_PATH_NOT_MODELED'],
    ['unrealized_cost', 'UNREALIZED_COST_SCHEDULE_NOT_MODELED'],
  ] as const)(
    'CP-038/SRC-R3-006/FEE-R3-004 refuses selected annual basis %s with exact reason',
    (basis, reason) => {
      const f = setup();
      f.raw.economicsAssumptions!.feeModel!.tiers![0]!.basis = basis;
      f.input.netInvestableCapitalUsd = '999.000000';
      const result = f.run();
      refused(result, 'FEE_BASIS_UNSUPPORTED', 'economicsAssumptions.feeModel.tiers[0].basis');
      if (result.ok) throw new Error('Expected refusal');
      expect(result.issues[0]).toMatchObject({
        code: 'FEE_BASIS_UNSUPPORTED',
        feeBasis: basis,
        reason,
        support: 'unsupported',
      });
      expect(result.readiness.state).toBe('UNSUPPORTED');
    }
  );

  it.each([
    ['called_capital_period', 'CALL_SCHEDULE_NOT_MODELED'],
    ['gross_cumulative_called', 'CALL_SCHEDULE_NOT_MODELED'],
    ['net_cumulative_called', 'CALL_SCHEDULE_NOT_MODELED'],
    ['cumulative_invested', 'INVESTED_BASIS_ADAPTER_NOT_IMPLEMENTED'],
    ['fair_market_value', 'VALUATION_PATH_NOT_MODELED'],
    ['unrealized_investments', 'UNREALIZED_COST_SCHEDULE_NOT_MODELED'],
  ] as const)(
    'CP-038/FEE-R3-004 refuses selected legacy basis %s with exact reason',
    (basis, reason) => {
      const f = withLegacyFee();
      f.raw.feeProfiles![0]!.feeTiers[0]!.feeBasis = basis;
      const result = f.run();
      refused(result, 'FEE_BASIS_UNSUPPORTED', 'feeProfiles[0].feeTiers[0].feeBasis');
      if (result.ok) throw new Error('Expected refusal');
      expect(result.issues[0]).toMatchObject({ feeBasis: basis, reason, support: 'unsupported' });
    }
  );

  it('CP-038/FEE-R3-008 distinguishes unknown bases and malformed shadowed sources from unsupported bases', () => {
    const f = setup();
    Object.assign(f.raw.economicsAssumptions!.feeModel!.tiers![0]!, { basis: 'unknown_basis' });
    refused(f.run(), 'INVALID_INPUT', 'economicsAssumptions.feeModel.tiers[0].basis', 409);
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.basis = 'committed_capital';
    f.raw.feeProfiles = [
      {
        id: 'shadow',
        name: 'Shadow',
        feeTiers: [
          { id: 'bad', name: 'Bad', percentage: 2, feeBasis: 'committed_capital', startMonth: 0 },
        ],
      },
    ];
    Object.assign(f.raw.feeProfiles[0]!.feeTiers[0]!, { percentage: 'bad' });
    refused(f.run(), 'INVALID_INPUT', 'feeProfiles[0].feeTiers[0].percentage', 409);
  });

  it('FEE-R3-007/SRCB-R3-006 separates legacy rate units from money and preserves raw provenance', () => {
    const f = withLegacyFee();
    const fee = admitted(f.run()).sourceBundle.feeExpense.feeTiers[0]!;
    expect(fee.rate).toMatchObject({
      path: 'feeProfiles[0].feeTiers[0].percentage',
      rawValue: 2,
      sourceUnit: 'percent_points',
      normalizedValue: '0.020000000000',
      provenanceOrigin: 'scenario_declared',
    });
    delete f.unitDeclarations['feeProfiles[0].feeTiers[0].percentage'];
    refused(f.run(), 'UNIT_PROVENANCE_UNRESOLVED', 'feeProfiles[0].feeTiers[0].percentage');
    f.unitDeclarations['feeProfiles[0].feeTiers[0].percentage'] = 'ratio';
    refused(f.run(), 'FEE_RATE_INVALID', 'feeProfiles[0].feeTiers[0].percentage');
    f.raw.feeProfiles![0]!.feeTiers[0]!.percentage = 0.02;
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeFeesUsd).toBe('4.000000');
  });

  it('FEE-R3-009 supports equivalent one-based fee boundaries and preserves absent finite ends', () => {
    const f = withLegacyFee();
    const tier = f.raw.feeProfiles![0]!.feeTiers[0]!;
    tier.startMonth = 1;
    tier.endMonth = 24;
    f.unitDeclarations['feeProfiles[0].feeTiers[0].startMonth'] = 'fund_month_one_based';
    f.unitDeclarations['feeProfiles[0].feeTiers[0].endMonth'] = 'fund_month_one_based';
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeFeesUsd).toBe('4.000000');
    delete tier.endMonth;
    delete f.unitDeclarations['feeProfiles[0].feeTiers[0].endMonth'];
    const fee = admitted(f.run()).sourceBundle.feeExpense.feeTiers[0]!;
    expect(fee.period).toMatchObject({
      normalizedStartMonth: 0,
      normalizedEndMonth: 23,
      end: { state: 'absent', effectiveValue: 23, defaultReason: 'FINITE_FUND_HORIZON_END' },
    });
    tier.startMonth = 25;
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeFeesUsd).toBe('0.000000');
  });

  it('SRC-R3-007/FEE-R3-014 uses the exact time-origin sentinel for mismatched origins', () => {
    const f = withLegacyFee();
    f.unitDeclarations['feeProfiles[0].feeTiers[0].endMonth'] = 'fund_month_one_based';
    const result = f.run();
    refused(result, 'TIME_ORIGIN_UNRESOLVED', 'feeProfiles[0].feeTiers[0].endMonth');
    if (result.ok) throw new Error('Expected refusal');
    expect(result.issues[0]!.support).toBe('incomplete');
  });

  it.each(['orgExpenseCap', 'orgExpenseCapType'] as const)(
    'FEE-R3-010 refuses an explicit expense %s even at zero',
    (field) => {
      const f = setup();
      Object.assign(f.raw.economicsAssumptions!.expenseModel!, {
        [field]: field === 'orgExpenseCap' ? 0 : 'absolute',
      });
      refused(f.run(), 'EXPENSE_CAP_UNSUPPORTED', `economicsAssumptions.expenseModel.${field}`);
    }
  );

  it.each([-0.1, 0.1])('FEE-R3-010 refuses nonzero expense growth %s', (growthRate) => {
    const f = setup();
    f.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.growthRate = growthRate;
    refused(
      f.run(),
      'EXPENSE_GROWTH_UNSUPPORTED',
      'economicsAssumptions.expenseModel.annualExpenses[0].growthRate'
    );
  });

  it('FEE-R3-006 explicit empty expenses shadow legacy values and preserve source-label annotations', () => {
    const f = setup();
    f.raw.economicsAssumptions!.expenseModel!.source = 'legacy_fund_expenses';
    f.raw.economicsAssumptions!.expenseModel!.annualExpenses = [];
    delete f.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
    f.raw.fundExpenses = [{ id: 'shadowed', category: 'admin', monthlyAmount: -1, startMonth: 0 }];
    expect(admitted(f.run()).sourceBundle.feeExpense).toMatchObject({
      expenseSelection: 'explicit_annual',
      lifetimeExpensesUsd: '0.000000',
      shadowedPaths: ['fundExpenses'],
      rawPresence: { explicitAnnualExpenses: 'empty', legacyFundExpenses: 'nonempty' },
      annotations: [
        {
          code: 'SOURCE_LABEL_SELECTION_MISMATCH',
          path: 'economicsAssumptions.expenseModel.source',
          selectedPath: 'economicsAssumptions.expenseModel.annualExpenses',
        },
      ],
    });
  });

  it('FEE-R3-013 sums overlapping formation and recurring expenses with inclusive clipping', () => {
    const f = withLegacyExpense();
    f.raw.fundExpenses![0]!.endMonth = 35;
    f.raw.fundExpenses!.push({
      id: 'formation',
      category: 'formation',
      monthlyAmount: 5,
      startMonth: 0,
      endMonth: 0,
    });
    f.unitDeclarations['fundExpenses[1].monthlyAmount'] = 'usd';
    f.unitDeclarations['fundExpenses[1].startMonth'] = 'fund_month_zero_based';
    f.unitDeclarations['fundExpenses[1].endMonth'] = 'fund_month_zero_based';
    const result = admitted(f.run());
    expect(result.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('29.000000');
    expect(result.sourceBundle.feeExpense.expenses[1]!.period).toMatchObject({
      normalizedStartMonth: 0,
      normalizedEndMonth: 0,
    });
    expect(result.availableConstructionCapitalUsd).toBe('63.000000');
    expect(
      verifyPinnedCapitalSourceBundle({
        sourceBundle: result.sourceBundle,
        savedProjection: result.sourceBundle.projection,
        inputs: [f.input],
      })
    ).toMatchObject({ ok: true, availableConstructionCapitalUsd: '63.000000' });
  });

  it('FEE-R3-007/016 keeps legacy expense amount units separate and checks selected invalid amounts', () => {
    const f = withLegacyExpense();
    f.raw.fundExpenses![0]!.monthlyAmount = 0.000001;
    f.unitDeclarations['fundExpenses[0].monthlyAmount'] = 'usd_millions';
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('24.000000');
    delete f.unitDeclarations['fundExpenses[0].monthlyAmount'];
    refused(f.run(), 'UNIT_PROVENANCE_UNRESOLVED', 'fundExpenses[0].monthlyAmount');
    f.unitDeclarations['fundExpenses[0].monthlyAmount'] = 'usd';
    f.raw.fundExpenses![0]!.monthlyAmount = -1;
    refused(f.run(), 'EXPENSE_AMOUNT_INVALID', 'fundExpenses[0].monthlyAmount');
  });

  it('FEE-R3-014 rejects reversed explicit legacy periods and preserves omitted expense horizon', () => {
    const f = withLegacyExpense();
    f.raw.fundExpenses![0]!.startMonth = 12;
    f.raw.fundExpenses![0]!.endMonth = 11;
    refused(f.run(), 'INVALID_INPUT', 'fundExpenses[0].endMonth');
    delete f.raw.fundExpenses![0]!.endMonth;
    delete f.unitDeclarations['fundExpenses[0].endMonth'];
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('12.000000');
  });
});

function withFollowOnRounds() {
  const f = setup();
  const stages = f.raw.pipelineProfiles![0]!.stages;
  stages[0]!.graduationRate = 0.9;
  for (const index of [1, 2]) {
    stages.push({
      ...stages[0]!,
      id: `s${index}`,
      name: `Round ${index}`,
      graduationRate: index === 1 ? 0.1 : 0,
    });
    for (const [path, unit] of Object.entries(f.unitDeclarations)) {
      if (path.startsWith('pipelineProfiles[0].stages[0].')) {
        f.unitDeclarations[path.replace('stages[0]', `stages[${index}]`)] = unit;
      }
    }
  }
  f.input.allocations[0]!.followOnRounds = [1, 2].map((index) => ({
    roundId: `r${index}`,
    stageId: `s${index}`,
    roundLabel: `Round ${index}`,
    graduationRatio: index === 1 ? '0.900000000000' : '0.100000000000',
    participationRatio: index === 1 ? '0.000000000000' : '1.000000000000',
    checkPolicy: { type: 'fixed_check', checkUsd: '1.000000' },
    monthsAfterPreviousRound: 12,
    timeOrigin: 'previous_round',
  }));
  return f;
}

describe('B2 selected financial source and input provenance', () => {
  it.each([
    ['funds.size'],
    ['economicsAssumptions.gpCommitmentModel.commitmentAmount'],
    ['economicsAssumptions.expenseModel.annualExpenses[0].amount'],
    ['capitalPlanAllocations[0].initialCheckAmount'],
    ['pipelineProfiles[0].stages[0].roundSize'],
    ['pipelineProfiles[0].stages[0].valuation'],
    ['capitalPlanAllocations[0].capitalAllocationPct'],
    ['pipelineProfiles[0].stages[0].graduationRate'],
  ])('CP-016/SRCB-R3 refuses missing independent unit declaration at %s', (path) => {
    const f = setup();
    delete f.unitDeclarations[path!];
    refused(f.run(), 'UNIT_PROVENANCE_UNRESOLVED', path!);
  });

  it('GP-R3-018/SRCB-R3-004/005 normalizes GP, checks and valuations independently', () => {
    const f = setup();
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 0.00001;
    f.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'] = 'usd_millions';
    f.raw.capitalPlanAllocations![0]!.initialCheckAmount = 0.000001;
    f.unitDeclarations['capitalPlanAllocations[0].initialCheckAmount'] = 'usd_millions';
    f.raw.pipelineProfiles![0]!.stages[0]!.valuation = 0.00001;
    f.unitDeclarations['pipelineProfiles[0].stages[0].valuation'] = 'usd_millions';
    const bundle = admitted(f.run()).sourceBundle;
    expect(bundle.gp.resolved.commitmentUsd).toBe('10.000000');
    expect(bundle.gp.deemedContributionUsd).toBe('4.000000');
    expect(bundle.construction.capitalPlanAllocations[0]!.initialCheckAmount).toMatchObject({
      rawValue: 0.000001,
      sourceUnit: 'usd_millions',
      normalizedValue: '1.000000',
    });
    expect(bundle.construction.pipelineProfiles[0]!.stages[0]!.valuation).toMatchObject({
      rawValue: 0.00001,
      sourceUnit: 'usd_millions',
      normalizedValue: '10.000000',
    });
    expect(bundle.fundSize.sourceUnit).toBe('usd');
  });

  it.each([-0.1, 1.1])(
    'GP-R3-015/017 preserves persisted ratio-domain validation for %s',
    (fraction) => {
      const f = setup();
      f.raw.fundedFromFeesPct = fraction;
      refused(f.run(), 'INVALID_INPUT', 'fundedFromFeesPct', 409);
      f.raw.fundedFromFeesPct = 0;
      delete f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
      delete f.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
      f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentPct = fraction;
      refused(
        f.run(),
        'INVALID_INPUT',
        'economicsAssumptions.gpCommitmentModel.commitmentPct',
        409
      );
    }
  );

  it('GP-R3-019/020/021 keeps absent defaults raw and explicit zero economically equivalent', () => {
    const f = setup();
    delete f.raw.fundedFromFeesPct;
    const before = canonical.canonicalJson(f.raw);
    const absent = admitted(f.run());
    expect(canonical.canonicalJson(f.raw)).toBe(before);
    expect(f.raw.economicsAssumptions!.gpCommitmentModel).toEqual({ commitmentAmount: 10 });
    f.raw.fundedFromFeesPct = 0;
    const zero = admitted(f.run());
    expect(zero.availableConstructionCapitalUsd).toBe(absent.availableConstructionCapitalUsd);
    expect(zero.sourceBundle.gp.deemedContributionUsd).toBe('0.000000');
    expect(zero.sourceBundle.feeExpense).toEqual(absent.sourceBundle.feeExpense);
    expect(zero.sourceBundle.sourceBundleHash).not.toBe(absent.sourceBundle.sourceBundleHash);
    expect(zero.sourceBundle.gp.fundedFromFeesPct.state).toBe('present');
    expect(absent.sourceBundle.gp.fundedFromFeesPct.state).toBe('absent');
  });

  it('CP-006/019/GP-R3-025/SRCB-R3-015 keeps budgets and recycling annotations outside available capital', () => {
    const f = setup();
    f.raw.fundedFromFeesPct = 0;
    const supported = admitted(f.run());
    expect(supported.availableConstructionCapitalUsd).toBe('94.000000');
    f.input.netInvestableCapitalUsd = '1000.000000';
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.recyclingEligiblePct = 1;
    f.raw.economicsAssumptions!.recyclingModel = {
      enabled: true,
      sources: ['exit_proceeds'],
      capPctOfCommitments: 1,
      timing: 'before_waterfall',
    };
    const annotated = admitted(f.run());
    expect(annotated.availableConstructionCapitalUsd).toBe('94.000000');
    expect(annotated.sourceBundle.feeExpense.feeTiers[0]!.recyclingAnnotation).toEqual({
      path: 'economicsAssumptions.feeModel.tiers[0].recyclingEligiblePct',
      state: 'present',
      rawValue: 1,
    });
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 100;
    f.raw.fundedFromFeesPct = 1;
    const negative = admitted(f.run());
    expect(negative.availableConstructionCapitalUsd).toBe('-6.000000');
    expect(negative.readiness.state).toBe('READY');
    expect(f.input.netInvestableCapitalUsd).toBe('1000.000000');
  });

  it('GP-R3-026 rejects a negative explicit planning budget at input validation', () => {
    const f = setup();
    f.input.netInvestableCapitalUsd = '-1.000000';
    refused(f.run(), 'INVALID_INPUT', 'netInvestableCapitalUsd');
  });

  it.each([
    [true, 'FUND_VEHICLE_MODE_UNSUPPORTED', 'UNSUPPORTED'],
    [undefined, 'FUND_VEHICLE_MODE_UNRESOLVED', 'INPUT_REQUIRED'],
  ] as const)('SRC-R3-001/002 classifies vehicle mode %s', (mode, code, state) => {
    const f = setup();
    if (mode === undefined) delete f.raw.isEvergreen;
    else f.raw.isEvergreen = mode;
    const result = f.run();
    refused(result, code, 'isEvergreen');
    expect(result.readiness.state).toBe(state);
  });

  it('SRC-R3-003/004 does not infer a vehicle mode from a fund name', () => {
    const f = setup();
    f.raw.fundName = 'Synthetic SPV';
    expect(admitted(f.run()).sourceBundle.isEvergreen).toBe(false);
  });

  it.each([null, '', 'EUR'] as const)(
    'SRC-R3-005/SRCB-R3-008 refuses unresolved or unsupported currency %s',
    (currency) => {
      const f = setup();
      f.source.fund.baseCurrency = currency;
      refused(
        f.run(),
        currency === 'EUR' ? 'FUND_CURRENCY_UNSUPPORTED' : 'FUND_CURRENCY_UNRESOLVED',
        'baseCurrency'
      );
    }
  );

  it('CP-016 requires exact unique allocation, profile and entry-stage links', () => {
    const f = setup();
    f.input.allocations[0]!.allocationId = 'missing';
    refused(f.run(), 'ALLOCATION_LINK_UNRESOLVED', 'capitalPlanAllocations');
    f.input.allocations[0]!.allocationId = 'a1';
    f.input.allocations[0]!.pipelineProfileId = 'missing';
    refused(f.run(), 'PROFILE_LINK_UNRESOLVED', 'pipelineProfiles');
    f.input.allocations[0]!.pipelineProfileId = 'p1';
    f.input.allocations[0]!.entryStageId = 'missing';
    refused(f.run(), 'STAGE_LINK_UNRESOLVED', 'pipelineProfiles[0].stages');
    f.input.allocations[0]!.entryStageId = 's0';
    f.raw.pipelineProfiles!.push(structuredClone(f.raw.pipelineProfiles![0]!));
    refused(f.run(), 'INVALID_INPUT', 'pipelineProfiles', 409);
    f.raw.pipelineProfiles!.pop();
    f.raw.pipelineProfiles![0]!.stages.push(
      structuredClone(f.raw.pipelineProfiles![0]!.stages[0]!)
    );
    refused(f.run(), 'STAGE_LINK_UNRESOLVED', 'pipelineProfiles[0].stages');
  });

  it('CP-018 preserves skipped-investment stages, later participation and the previous-stage provenance', () => {
    const f = withFollowOnRounds();
    const before = structuredClone(f.input);
    const result = admitted(f.run());
    expect(f.input).toEqual(before);
    expect(
      result.sourceBundle.construction.pipelineProfiles[0]!.stages.map((stage) => stage.id)
    ).toEqual(['s0', 's1', 's2']);
    const provenance = result.assumptionProvenanceByInput[0]!;
    expect(provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].followOnRounds[0].participationRatio',
        effectiveValue: '0.000000000000',
        origin: 'source_derived',
      })
    );
    expect(provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].followOnRounds[1].participationRatio',
        effectiveValue: '1.000000000000',
        origin: 'user_override',
      })
    );
    expect(provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].followOnRounds[1].graduationRatio',
        sourcePath: 'pipelineProfiles[0].stages[1].graduationRate',
        sourceValue: '0.100000000000',
        effectiveValue: '0.100000000000',
        origin: 'source_derived',
      })
    );
    f.input.allocations[0]!.followOnRounds.shift();
    refused(f.run(), 'STAGE_LINK_UNRESOLVED', 'pipelineProfiles[0].stages[2].id');
  });

  it('CP-017 preserves heterogeneous per-profile graduation chains without averaging', () => {
    const f = withFollowOnRounds();
    f.raw.capitalPlanAllocations![0]!.capitalAllocationPct = 50;
    f.raw.capitalPlanAllocations!.push({
      ...f.raw.capitalPlanAllocations![0]!,
      id: 'a2',
      name: 'Second allocation',
    });
    f.raw.pipelineProfiles!.push({ ...structuredClone(f.raw.pipelineProfiles![0]!), id: 'p2' });
    f.raw.pipelineProfiles![1]!.stages[0]!.graduationRate = 0.1;
    f.raw.pipelineProfiles![1]!.stages[1]!.graduationRate = 0.9;
    f.input.allocations[0]!.budgetShareRatio = '0.500000000000';
    const second = structuredClone(f.input.allocations[0]!);
    second.allocationId = 'a2';
    second.pipelineProfileId = 'p2';
    second.followOnRounds[0]!.graduationRatio = '0.100000000000';
    second.followOnRounds[1]!.graduationRatio = '0.900000000000';
    f.input.allocations.push(second);
    for (const [path, unit] of Object.entries(f.unitDeclarations)) {
      if (path.startsWith('pipelineProfiles[0].'))
        f.unitDeclarations[path.replace('pipelineProfiles[0]', 'pipelineProfiles[1]')] = unit;
      if (path.startsWith('capitalPlanAllocations[0].'))
        f.unitDeclarations[path.replace('capitalPlanAllocations[0]', 'capitalPlanAllocations[1]')] =
          unit;
    }
    const source = admitted(f.run()).sourceBundle.construction;
    expect(
      source.pipelineProfiles.map((profile) =>
        profile.stages.slice(0, 2).map((stage) => stage.graduationRate.normalizedValue)
      )
    ).toEqual([
      ['0.900000000000', '0.100000000000'],
      ['0.100000000000', '0.900000000000'],
    ]);
    expect(source.links.map((link) => [link.allocationId, link.pipelineProfileId])).toEqual([
      ['a1', 'p1'],
      ['a2', 'p2'],
    ]);
  });

  it('SRC-R3-007 points missing transition time origin to its previous source stage', () => {
    const f = withFollowOnRounds();
    Reflect.deleteProperty(f.input.allocations[0]!.followOnRounds[1]!, 'timeOrigin');
    refused(f.run(), 'TIME_ORIGIN_UNRESOLVED', 'pipelineProfiles[0].stages[1].monthsToGraduate');
  });

  it('SRCB-R3-012 rejects client source fields and unused or already resolved declarations', () => {
    const f = setup();
    Object.assign(f.input, { sourceBundle: {} });
    refused(f.run(), 'INVALID_INPUT', 'input');
    Reflect.deleteProperty(f.input, 'sourceBundle');
    f.unitDeclarations['allocations[0].percentage'] = 'percent_points';
    refused(f.run(), 'INVALID_INPUT', 'allocations[0].percentage');
    delete f.unitDeclarations['allocations[0].percentage'];
    f.unitDeclarations.gpCommitment = 'usd';
    refused(f.run(), 'INVALID_INPUT', 'gpCommitment');
  });

  it('SRCB-R3-009/010/016 hashes untouched sources independent of object order and selected input', () => {
    const f = setup();
    const original = fingerprintCapitalSource(f.source);
    f.source.config.raw = Object.fromEntries(Object.entries(f.raw).reverse());
    expect(fingerprintCapitalSource(f.source)).toEqual(original);
    f.input.allocations[0]!.initialCheckUsd = '2.000000';
    expect(admitted(f.run()).sourceBundle.sourceBundleHash).toBe(original.sourceBundleHash);
    f.source.config.raw = f.raw;
    f.raw.fundName = 'Changed unrelated persisted field';
    expect(fingerprintCapitalSource(f.source).sourceBundleHash).not.toBe(original.sourceBundleHash);
    f.raw.fundName = 'Synthetic capital source';
    expect(fingerprintCapitalSource(f.source)).toEqual(original);
    f.source.config.version = 2;
    expect(fingerprintCapitalSource(f.source).sourceBundleHash).not.toBe(original.sourceBundleHash);
  });

  it('SRCB-R3-011/014 changes normalized bundle identity for declarations while keeping raw identity', () => {
    const f = setup();
    const original = admitted(f.run()).sourceBundle;
    f.unitDeclarations['pipelineProfiles[0].stages[0].valuation'] = 'usd_millions';
    const changed = admitted(f.run()).sourceBundle;
    expect(changed.sourceBundleHash).toBe(original.sourceBundleHash);
    expect(canonical.sha256CanonicalJson(changed)).not.toBe(
      canonical.sha256CanonicalJson(original)
    );
    expect(changed.construction.pipelineProfiles[0]!.stages[0]!.valuation!.normalizedValue).toBe(
      '10000000.000000'
    );
    expect(
      verifyPinnedCapitalSourceBundle({
        sourceBundle: changed,
        savedProjection: changed.projection,
        inputs: [f.input],
      })
    ).toMatchObject({ ok: true, availableConstructionCapitalUsd: '90.000000' });
    f.source.config.raw = {};
    expect(
      verifyPinnedCapitalSourceBundle({
        sourceBundle: original,
        savedProjection: original.projection,
        inputs: [f.input],
      })
    ).toMatchObject({ ok: true, availableConstructionCapitalUsd: '90.000000' });
  });

  it('preserves source-derived, user-overridden and user-entered assumptions without rewriting input', () => {
    const f = setup();
    f.raw.modelInputsAsOfDate = '2026-08-31';
    f.input.allocations[0]!.initialCheckUsd = '2.000000';
    f.input.allocations[0]!.plannedCompanyCount = 7;
    const before = structuredClone(f.input);
    const provenance = admitted(f.run()).assumptionProvenanceByInput[0]!;
    expect(provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].name',
        origin: 'source_derived',
        sourcePath: 'capitalPlanAllocations[0].name',
        effectiveDate: '2026-08-31',
        sourceVintage: '2026',
      })
    );
    expect(provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].initialCheckUsd',
        origin: 'user_override',
        sourcePath: 'capitalPlanAllocations[0].initialCheckAmount',
        sourceValue: '1.000000',
        effectiveValue: '2.000000',
      })
    );
    expect(provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].plannedCompanyCount',
        origin: 'user_entered',
        sourcePath: null,
        effectiveValue: 7,
      })
    );
    expect(f.input).toEqual(before);
  });
});

describe('B2 canonical lifetime-capital controls', () => {
  it('CP-006 materializes 100m commitments, 17.5m fees, 2.4m expenses and 80.1m capacity with zero deemed GP', () => {
    const f = withLegacyExpense();
    f.source.fund.size = '100000000';
    f.raw.fundSize = 100000000;
    f.raw.fundLife = 10;
    f.raw.investmentPeriod = 5;
    f.raw.fundedFromFeesPct = 0;
    f.raw.economicsAssumptions!.feeModel!.tiers = [
      {
        id: 'investment-fees',
        name: 'Investment period',
        rate: 0.02,
        basis: 'committed_capital',
        startYear: 1,
        endYear: 5,
      },
      {
        id: 'harvest-fees',
        name: 'Harvest period',
        rate: 0.015,
        basis: 'committed_capital',
        startYear: 6,
        endYear: 10,
      },
    ];
    f.raw.fundExpenses![0]!.monthlyAmount = 20000;
    f.raw.fundExpenses![0]!.endMonth = 119;
    const result = admitted(f.run());
    expect(result.sourceBundle.gp.deemedContributionUsd).toBe('0.000000');
    expect(result.sourceBundle.feeExpense.feeBasisUsd).toBe('100000000.000000');
    expect(result.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('17500000.000000');
    expect(result.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('2400000.000000');
    expect(result.availableConstructionCapitalUsd).toBe('80100000.000000');
  });

  it('CP-035/GP-R3-008/009 subtracts included GP only through its deemed portion and retains gross fee basis', () => {
    const f = setup();
    f.source.fund.size = '100000000';
    f.raw.fundSize = 100000000;
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 10000000;
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.09;
    f.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.amount = 1000000;
    f.raw.fundedFromFeesPct = 0;
    const zero = admitted(f.run());
    expect(zero.sourceBundle.gp.deemedContributionUsd).toBe('0.000000');
    expect(zero.availableConstructionCapitalUsd).toBe('80000000.000000');
    f.raw.fundedFromFeesPct = 0.4;
    const deemed = admitted(f.run());
    expect(deemed.sourceBundle.gp.deemedContributionUsd).toBe('4000000.000000');
    expect(deemed.availableConstructionCapitalUsd).toBe('76000000.000000');
    expect(deemed.sourceBundle.feeExpense).toEqual(zero.sourceBundle.feeExpense);
    expect(deemed.sourceBundle.feeExpense.feeBasisUsd).toBe('100000000.000000');
    expect(deemed.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('18000000.000000');
    expect(deemed.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('2000000.000000');
  });

  it('GP-R3-010/011/012/018 resolves equivalent amount, percent and top-level GP to ten USD', () => {
    const f = setup();
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentPct = 0.1;
    f.raw.gpCommitment = 20;
    expect(admitted(f.run()).sourceBundle.gp.resolved).toMatchObject({
      source: 'nested_amount',
      commitmentUsd: '10.000000',
    });
    delete f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
    delete f.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
    expect(admitted(f.run()).sourceBundle.gp.resolved).toMatchObject({
      source: 'nested_percent',
      commitmentUsd: '10.000000',
    });
    delete f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentPct;
    f.raw.gpCommitment = 0.00001;
    f.unitDeclarations.gpCommitment = 'usd_millions';
    expect(admitted(f.run()).sourceBundle.gp.resolved).toMatchObject({
      source: 'top_level_amount',
      commitmentUsd: '10.000000',
    });
  });
});

describe('B2 maximum-shape preparation', () => {
  it('materializes five physical call records with ten allocations, six follow-ons and independent capacity literals', () => {
    expect(maximumShape).toHaveLength(5);
    expect(new Set(maximumShape.map((record) => record.source)).size).toBe(5);
    expect(new Set(maximumShape.map((record) => record.inputs[0])).size).toBe(5);
    for (const record of maximumShape) {
      const raw = record.source.config.raw;
      expect(raw.capitalPlanAllocations).toHaveLength(10);
      expect(raw.pipelineProfiles).toHaveLength(10);
      expect(raw.pipelineProfiles.every((profile) => profile.stages.length === 12)).toBe(true);
      expect(raw.fundLife).toBe(30);
      expect(FundDraftWriteV1Schema.safeParse(raw).success).toBe(true);
      expect(CapitalUnitDeclarationsV1Schema.safeParse(record.unitDeclarations).success).toBe(true);
      expect(record.inputs).toHaveLength(1);
      expect(record.inputs[0]!.allocations).toHaveLength(10);
      expect(
        record.inputs[0]!.allocations.every((allocation) => allocation.followOnRounds.length === 6)
      ).toBe(true);
      expect(CapitalPlanningInputV1Schema.safeParse(record.inputs[0]).success).toBe(true);
      const result = admitted(materializeCapitalSource(record));
      expect(result.sourceBundle.gp.deemedContributionUsd).toBe('4.000000');
      expect(result.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('60.000000');
      expect(result.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('30.000000');
      expect(result.availableConstructionCapitalUsd).toBe('6.000000');
    }
    const combined = admitted(
      materializeCapitalSource({
        ...maximumShape[0]!,
        inputs: maximumShape.flatMap((record) => record.inputs),
      })
    );
    expect(combined.assumptionProvenanceByInput).toHaveLength(5);
    expect(combined.sourceBundle.construction.capitalPlanAllocations).toHaveLength(10);
    expect(
      combined.sourceBundle.construction.pipelineProfiles.every(
        (profile) => profile.stages.length === 7
      )
    ).toBe(true);
    expect(combined.availableConstructionCapitalUsd).toBe('6.000000');
    expect(combined.readiness.state).toBe('READY');
  });
});

describe('B2 selected GP validation precedence', () => {
  it.each([
    ['commitmentAmount', -1],
    ['commitmentAmount', Number.POSITIVE_INFINITY],
    ['commitmentAmount', 'malformed'],
    ['commitmentPct', -1],
    ['commitmentPct', Number.POSITIVE_INFINITY],
    ['commitmentPct', 'malformed'],
  ] as const)(
    'GP-R3-014/015 refuses selected %s=%s with valid lower-precedence sources and zero fraction',
    (field, value) => {
      const f = setup();
      f.raw.fundedFromFeesPct = 0;
      f.raw.gpCommitment = 20;
      f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentPct = 0.1;
      if (field === 'commitmentPct') {
        delete f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
        delete f.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
      }
      Object.assign(f.raw.economicsAssumptions!.gpCommitmentModel!, { [field]: value });
      const finiteDomainRefusal =
        field === 'commitmentAmount' && value === Number.POSITIVE_INFINITY;
      refused(
        f.run(),
        finiteDomainRefusal ? 'GP_COMMITMENT_INVALID' : 'INVALID_INPUT',
        `economicsAssumptions.gpCommitmentModel.${field}`,
        finiteDomainRefusal ? 422 : 409
      );
    }
  );
});

describe('B2 reviewer-required admission boundaries', () => {
  it.each([
    [101, 'percent_points'],
    [1.01, 'ratio'],
    [Number.POSITIVE_INFINITY, 'percent_points'],
  ] as const)(
    'FEE-R3-015 refuses selected legacy rate %s declared %s at its exact path',
    (percentage, unit) => {
      const f = withLegacyFee();
      f.raw.feeProfiles![0]!.feeTiers[0]!.percentage = percentage;
      f.unitDeclarations['feeProfiles[0].feeTiers[0].percentage'] = unit;
      f.raw.economicsAssumptions!.feeModel!.defaultRate = 0;
      refused(f.run(), 'FEE_RATE_INVALID', 'feeProfiles[0].feeTiers[0].percentage');
    }
  );

  it.each([
    [0, '0.000000000000', '0.000000', '94.000000'],
    [100, '1.000000000000', '200.000000', '-106.000000'],
  ] as const)(
    'FEE-R3-015 admits the legacy percent-point boundary %s without clamping',
    (percentage, normalized, fees, available) => {
      const f = withLegacyFee();
      f.raw.feeProfiles![0]!.feeTiers[0]!.percentage = percentage;
      const result = admitted(f.run());
      expect(result.sourceBundle.feeExpense.feeTiers[0]!.rate).toMatchObject({
        path: 'feeProfiles[0].feeTiers[0].percentage',
        rawValue: percentage,
        sourceUnit: 'percent_points',
        normalizedValue: normalized,
      });
      expect(result.sourceBundle.feeExpense.lifetimeFeesUsd).toBe(fees);
      expect(result.availableConstructionCapitalUsd).toBe(available);
      expect(result.readiness.state).toBe('READY');
    }
  );

  it('FEE-R3-015 retains persisted-schema rejection for a negative explicit annual rate', () => {
    const f = setup();
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = -1;
    refused(f.run(), 'INVALID_INPUT', 'economicsAssumptions.feeModel.tiers[0].rate', 409);
  });

  it('FEE-R3-016 preserves the selected legacy Infinity refusal and admits explicit zero amount', () => {
    const f = withLegacyExpense();
    f.raw.fundExpenses![0]!.monthlyAmount = Number.POSITIVE_INFINITY;
    refused(f.run(), 'EXPENSE_AMOUNT_INVALID', 'fundExpenses[0].monthlyAmount');
    f.raw.fundExpenses![0]!.monthlyAmount = 0;
    const result = admitted(f.run());
    expect(result.sourceBundle.feeExpense.expenses[0]!.amount).toMatchObject({
      path: 'fundExpenses[0].monthlyAmount',
      rawValue: 0,
      sourceUnit: 'usd',
      normalizedValue: '0.000000',
    });
    expect(result.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('0.000000');
    expect(result.availableConstructionCapitalUsd).toBe('92.000000');
  });

  it('FEE-R3-016 rejects a negative explicit annual expense through the persisted schema', () => {
    const f = setup();
    f.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.amount = -1;
    refused(
      f.run(),
      'INVALID_INPUT',
      'economicsAssumptions.expenseModel.annualExpenses[0].amount',
      409
    );
  });

  it('FEE-R3-009 selects nested timeline life over raw life and refuses absent life without a default', () => {
    const f = setup();
    f.raw.fundLife = 30;
    f.raw.economicsAssumptions!.timeline = {
      fundLifeYears: 1,
      period: 'annual',
      vintageYear: 2030,
    };
    const result = admitted(f.run());
    expect(result.sourceBundle.fundLife).toEqual({
      path: 'economicsAssumptions.timeline.fundLifeYears',
      rawValue: 1,
      effectiveValue: 1,
      provenanceOrigin: 'contract_resolved',
      shadowed: { path: 'fundLife', state: 'present', rawValue: 30 },
    });
    expect(result.sourceBundle.vintageYear).toBe(2030);
    expect(result.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('2.000000');
    expect(result.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('1.000000');
    expect(result.availableConstructionCapitalUsd).toBe('93.000000');
    delete f.raw.fundLife;
    expect(admitted(f.run()).sourceBundle.fundLife.effectiveValue).toBe(1);
    delete f.raw.economicsAssumptions!.timeline;
    refused(f.run(), 'FUND_TERM_UNRESOLVED', 'fundLife');
  });

  it('SRCB-R3-005 resolves initial, follow-on and exit valuation money through independent exact paths', () => {
    const f = setup();
    f.raw.capitalPlanAllocations![0]!.initialCheckAmount = 2;
    f.raw.capitalPlanAllocations![0]!.followOnAmount = 500000;
    f.raw.pipelineProfiles![0]!.stages[0]!.valuation = 20;
    f.raw.pipelineProfiles![0]!.stages[0]!.exitValuation = 30;
    f.unitDeclarations['capitalPlanAllocations[0].initialCheckAmount'] = 'usd_millions';
    f.unitDeclarations['capitalPlanAllocations[0].followOnAmount'] = 'usd';
    f.unitDeclarations['pipelineProfiles[0].stages[0].valuation'] = 'usd_millions';
    f.unitDeclarations['pipelineProfiles[0].stages[0].exitValuation'] = 'usd_millions';
    const construction = admitted(f.run()).sourceBundle.construction;
    expect(construction.capitalPlanAllocations[0]!.initialCheckAmount).toMatchObject({
      path: 'capitalPlanAllocations[0].initialCheckAmount',
      rawValue: 2,
      sourceUnit: 'usd_millions',
      normalizedValue: '2000000.000000',
    });
    expect(construction.capitalPlanAllocations[0]!.followOnAmount).toMatchObject({
      path: 'capitalPlanAllocations[0].followOnAmount',
      rawValue: 500000,
      sourceUnit: 'usd',
      normalizedValue: '500000.000000',
    });
    expect(construction.pipelineProfiles[0]!.stages[0]!.roundSize).toMatchObject({
      rawValue: 2,
      sourceUnit: 'usd',
      normalizedValue: '2.000000',
    });
    expect(construction.pipelineProfiles[0]!.stages[0]!.valuation).toMatchObject({
      rawValue: 20,
      sourceUnit: 'usd_millions',
      normalizedValue: '20000000.000000',
    });
    expect(construction.pipelineProfiles[0]!.stages[0]!.exitValuation).toMatchObject({
      path: 'pipelineProfiles[0].stages[0].exitValuation',
      rawValue: 30,
      sourceUnit: 'usd_millions',
      normalizedValue: '30000000.000000',
    });
    delete f.unitDeclarations['capitalPlanAllocations[0].followOnAmount'];
    refused(f.run(), 'UNIT_PROVENANCE_UNRESOLVED', 'capitalPlanAllocations[0].followOnAmount');
    f.unitDeclarations['capitalPlanAllocations[0].followOnAmount'] = 'usd';
    delete f.unitDeclarations['pipelineProfiles[0].stages[0].exitValuation'];
    refused(f.run(), 'UNIT_PROVENANCE_UNRESOLVED', 'pipelineProfiles[0].stages[0].exitValuation');
  });

  it.each([
    [1, '10.000000'],
    [12, '120.000000'],
  ] as const)(
    'FEE-R3-013/014 makes one-based expense months 1 through %s equivalent to zero-based periods',
    (endMonth, expenses) => {
      const zero = withLegacyExpense();
      zero.raw.fundExpenses![0]!.monthlyAmount = 10;
      zero.raw.fundExpenses![0]!.endMonth = endMonth - 1;
      const one = withLegacyExpense();
      one.raw.fundExpenses![0]!.monthlyAmount = 10;
      one.raw.fundExpenses![0]!.startMonth = 1;
      one.raw.fundExpenses![0]!.endMonth = endMonth;
      one.unitDeclarations['fundExpenses[0].startMonth'] = 'fund_month_one_based';
      one.unitDeclarations['fundExpenses[0].endMonth'] = 'fund_month_one_based';
      for (const result of [admitted(zero.run()), admitted(one.run())]) {
        expect(result.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe(expenses);
        expect(result.sourceBundle.feeExpense.expenses[0]!.period).toMatchObject({
          normalizedStartMonth: 0,
          normalizedEndMonth: endMonth - 1,
        });
      }
    }
  );

  it('FEE-R3-014 keeps raw identity but changes normalized identity and saved replay for the same raw months under different origins', () => {
    const f = withLegacyExpense();
    f.raw.fundExpenses![0]!.monthlyAmount = 10;
    f.raw.fundExpenses![0]!.startMonth = 1;
    f.raw.fundExpenses![0]!.endMonth = 24;
    const zero = admitted(f.run());
    f.unitDeclarations['fundExpenses[0].startMonth'] = 'fund_month_one_based';
    f.unitDeclarations['fundExpenses[0].endMonth'] = 'fund_month_one_based';
    const one = admitted(f.run());
    expect(zero.sourceBundle.sourceBundleHash).toBe(one.sourceBundle.sourceBundleHash);
    expect(zero.sourceBundle.projection).toEqual(one.sourceBundle.projection);
    expect(canonical.sha256CanonicalJson(zero.sourceBundle)).not.toBe(
      canonical.sha256CanonicalJson(one.sourceBundle)
    );
    expect(zero.sourceBundle.feeExpense.expenses[0]!.period).toMatchObject({
      normalizedStartMonth: 1,
      normalizedEndMonth: 24,
    });
    expect(one.sourceBundle.feeExpense.expenses[0]!.period).toMatchObject({
      normalizedStartMonth: 0,
      normalizedEndMonth: 23,
    });
    expect(zero.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('230.000000');
    expect(one.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('240.000000');
    for (const [result, available] of [
      [zero, '-138.000000'],
      [one, '-148.000000'],
    ] as const) {
      expect(result.availableConstructionCapitalUsd).toBe(available);
      expect(
        verifyPinnedCapitalSourceBundle({
          sourceBundle: result.sourceBundle,
          savedProjection: result.sourceBundle.projection,
          inputs: [f.input],
        })
      ).toMatchObject({ ok: true, availableConstructionCapitalUsd: available });
    }
    f.unitDeclarations['fundExpenses[0].monthlyAmount'] = 'fund_month_one_based';
    refused(f.run(), 'INVALID_INPUT', 'fundExpenses[0].monthlyAmount');
  });

  it('FEE-R3-012 replays four fees, two expenses and ninety available, then zero expenses leave ninety-two', () => {
    const f = setup();
    const base = admitted(f.run());
    expect(base.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('4.000000');
    expect(base.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('2.000000');
    expect(base.availableConstructionCapitalUsd).toBe('90.000000');
    f.raw.economicsAssumptions!.expenseModel!.annualExpenses = [];
    delete f.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
    const zeroExpenses = admitted(f.run());
    expect(zeroExpenses.sourceBundle.feeExpense.lifetimeFeesUsd).toBe('4.000000');
    expect(zeroExpenses.sourceBundle.feeExpense.lifetimeExpensesUsd).toBe('0.000000');
    expect(zeroExpenses.availableConstructionCapitalUsd).toBe('92.000000');
    for (const [result, available] of [
      [base, '90.000000'],
      [zeroExpenses, '92.000000'],
    ] as const) {
      expect(
        verifyPinnedCapitalSourceBundle({
          sourceBundle: result.sourceBundle,
          savedProjection: result.sourceBundle.projection,
          inputs: [f.input],
        })
      ).toMatchObject({ ok: true, availableConstructionCapitalUsd: available });
    }
  });

  it('ISSUE-5625294952-F3 preserves bounded INPUT_TOO_LARGE details in both materialization and pin verification', () => {
    const f = setup();
    const sourceBundle = admitted(f.run()).sourceBundle;
    const inputs = Array.from({ length: 6 }, () => makeCapitalInput());
    for (const result of [
      materializeCapitalSource({ source: f.source, inputs, unitDeclarations: f.unitDeclarations }),
      verifyPinnedCapitalSourceBundle({
        sourceBundle,
        savedProjection: sourceBundle.projection,
        inputs,
      }),
    ]) {
      refused(result, 'INPUT_TOO_LARGE', 'inputs');
      if (result.ok) throw new Error('Expected bounded admission refusal');
      expect(result.issues).toEqual([
        {
          code: 'INPUT_TOO_LARGE',
          path: 'inputs',
          message: 'Source exceeds the admitted bound',
          support: 'unsupported',
          limit: 5,
          observed: 6,
        },
      ]);
      expect(result.readiness.state).toBe('UNSUPPORTED');
    }
  });
});
