import { describe, expect, it } from 'vitest';
import {
  materializeCapitalSource,
  type CapitalRawSource,
} from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import { FundDraftWriteV1Schema } from '../../../shared/contracts/fund-draft-write-v1.contract';
import { runEconomicsModel } from '../../../shared/lib/economics/economics-engine';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';

// The GP fee exemption is implemented twice: the annual economics engine and the
// capital-plan source materializer. Same draft in, same lifetime fees out.
function lifetimeFees(gpCommitmentExempt: boolean, fundedFromFeesPct: number) {
  const raw = makeCapitalRawConfig();
  raw.fundSize = 100_000_000;
  raw.fundLife = 10;
  raw.investmentPeriod = 5;
  raw.fundedFromFeesPct = fundedFromFeesPct;
  const assumptions = raw.economicsAssumptions!;
  assumptions.gpCommitmentModel = { commitmentAmount: 2_000_000 };
  assumptions.feeModel = {
    source: 'economics_override',
    gpCommitmentExempt,
    tiers: [
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
    ],
  };
  const source: CapitalRawSource = {
    fund: { id: 101, size: '100000000', baseCurrency: 'USD' },
    config: { id: 11, version: 1, raw, publishedAt: '2026-09-01T00:00:00.000Z' },
  };
  const materialized = materializeCapitalSource({
    source,
    inputs: [makeCapitalInput()],
    unitDeclarations: makeCapitalDeclarations(),
  });
  if (!materialized.ok) throw new Error(JSON.stringify(materialized));

  return {
    engine: runEconomicsModel(FundDraftWriteV1Schema.parse(raw)).summary.totalManagementFees,
    capitalPlan: Number(materialized.sourceBundle.feeExpense.lifetimeFeesUsd),
  };
}

describe('GP fee exemption parity: economics engine vs capital-plan materializer', () => {
  // Hand-computed: 2% x 5y + 1.5% x 5y = 17.5% of the fee basis.
  // Full fund basis 100m -> 17.5m; LP-only basis 98m -> 17.15m.
  it.each([
    { exempt: false, fundedFromFeesPct: 0, expected: 17_500_000 },
    { exempt: true, fundedFromFeesPct: 0, expected: 17_150_000 },
    { exempt: true, fundedFromFeesPct: 0.25, expected: 17_150_000 },
  ])(
    'exempt=$exempt fundedFromFeesPct=$fundedFromFeesPct yields $expected in both engines',
    ({ exempt, fundedFromFeesPct, expected }) => {
      const fees = lifetimeFees(exempt, fundedFromFeesPct);
      // 6 decimal places: dollar-level mass-conservation tolerance (1e-6).
      expect(fees.engine).toBeCloseTo(expected, 6);
      expect(fees.capitalPlan).toBeCloseTo(expected, 6);
    }
  );
});
