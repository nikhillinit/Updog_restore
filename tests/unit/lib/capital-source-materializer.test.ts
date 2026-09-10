import { describe, expect, it } from 'vitest';
import {
  fingerprintCapitalSource,
  materializeCapitalSource,
  verifyPinnedCapitalSourceBundle,
  type CapitalRawSource,
  type CapitalMaterializationResult,
} from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import { CAPITAL_SOURCE_INTERPRETATION_VERSION } from '../../../shared/contracts/capital-planning-v1.contract';
import {
  makeCapitalRawConfig,
  makeCapitalInput,
  makeCapitalDeclarations,
} from '../../fixtures/capital-planning/fixtures';
import expected from '../../fixtures/capital-planning/expected-values.json';

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
    f.source.fund.size = '10000000000'; f.raw.fundSize = 10000000000;
    f.unitDeclarations['funds.size'] = 'usd_millions'; f.unitDeclarations.fundSize = 'usd_millions';
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.12345678901249;
    expect(admitted(f.run()).sourceBundle.feeExpense.lifetimeFeesUsd).toBe('2469135780249800.000000');
    delete f.raw.economicsAssumptions!.expenseModel!.annualExpenses;
    delete f.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
    f.raw.fundExpenses = [{ id: 'tiny', category: 'admin', monthlyAmount: 0.0000001, startMonth: 0, endMonth: 11 }];
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
