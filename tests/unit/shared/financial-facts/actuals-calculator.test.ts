import { describe, expect, it } from 'vitest';

import {
  calculateActualsV1,
  type ActualsCalculatorInputV1,
} from '@shared/lib/financial-facts/actuals-calculator';

const ledgerHash = '1'.repeat(64);
const valuationHash = '2'.repeat(64);
const commitmentHash = '3'.repeat(64);
const rowHash = '5'.repeat(64);

function cashRow(
  eventType: ActualsCalculatorInputV1['ledgerRows'][number]['eventType'],
  canonicalAmount: string,
  overrides: Partial<ActualsCalculatorInputV1['ledgerRows'][number]> = {}
): ActualsCalculatorInputV1['ledgerRows'][number] {
  return {
    contractVersion: 'actuals-pilot-cash-flow/1.0.0',
    sourceExternalRef: `ref-${eventType}-${canonicalAmount}`,
    rowContentHash: rowHash,
    templateVersion: 'actuals-ledger/1.0.0',
    settlementStatus: null,
    deploymentCategory: null,
    expenseCategory: null,
    distributionType: null,
    recallable: null,
    canonicalAmount,
    eventType,
    effectiveDate: '2026-01-31',
    resolvedCompanyId: null,
    resolvedVehicleId: null,
    ...overrides,
  };
}

function input(overrides: Partial<ActualsCalculatorInputV1> = {}): ActualsCalculatorInputV1 {
  return {
    ledgerRows: [],
    vehicleCommitment: { vehicleId: 1, amount: '100.000000', sourceHash: commitmentHash },
    roster: [],
    valuationMarks: [],
    ledgerCoverage: 'complete',
    ledgerPayloadSha256: ledgerHash,
    valuationPayloadSha256: null,
    predecessorSnapshotInputHash: null,
    ...overrides,
  };
}

function success(value: ActualsCalculatorInputV1) {
  const result = calculateActualsV1(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe('actuals calculator', () => {
  it('TV-001 preserves paid-in, applies recallable add-back, and calculates exact ratios', () => {
    const result = success(
      input({
        ledgerRows: [
          cashRow('settled_contribution', '50.000000'),
          cashRow('portfolio_investment', '40.000000', {
            sourceExternalRef: 'investment-1',
            resolvedCompanyId: 10,
            resolvedVehicleId: 1,
            deploymentCategory: 'initial',
          }),
          cashRow('realized_proceeds', '12.000000', {
            sourceExternalRef: 'proceeds-1',
            resolvedCompanyId: 10,
            resolvedVehicleId: 1,
          }),
          cashRow('lp_distribution', '3.000000', {
            sourceExternalRef: 'distribution-1',
            recallable: false,
          }),
          cashRow('lp_distribution', '5.000000', {
            sourceExternalRef: 'distribution-2',
            recallable: true,
          }),
        ],
        roster: [{ vehicleId: 1, companyId: 10 }],
        valuationPayloadSha256: valuationHash,
        valuationMarks: [
          {
            contractVersion: 'actuals-pilot-valuation-mark/1.0.0',
            sourceExternalRef: 'mark-1',
            rowContentHash: rowHash,
            templateVersion: 'actuals-valuation/1.0.0',
            markId: 1,
            markDate: '2026-01-31',
            positionFairValue: '55.000000',
            markSource: 'gp_estimate',
            confidenceLevel: 'medium',
            resolvedCompanyId: 10,
            resolvedVehicleId: 1,
            externalRefHash: rowHash,
          },
        ],
        calledCapitalIssued: '60.000000',
        nav: '55.000000',
      })
    );

    expect(result.capitalActuals.uncalledCapital.value).toBe('45.000000');
    expect(result.capitalActuals.paidInCapital.value).toBe('50.000000');
    expect(result.capitalActuals.dpi.value).toBe('0.160000000000');
    expect(result.capitalActuals.rvpi.value).toBe('1.100000000000');
    expect(result.capitalActuals.tvpi.value).toBe('1.260000000000');
  });

  it('TV-002 applies only bounded reference-backed reversals and replacements', () => {
    const result = success(
      input({
        calledCapitalIssued: {
          amount: '60.000000',
          sources: [{ sourceExternalRef: 'call-1', amount: '60.000000' }],
        },
        referenceBackedReversals: [
          {
            reversalExternalRef: 'reversal-1',
            referencedSourceExternalRef: 'call-1',
            amount: '10.000000',
            replacementAmount: '8.000000',
          },
        ],
      })
    );
    expect(result.capitalActuals.netCalledCapital.value).toBe('58.000000');

    const unreferenced = calculateActualsV1(
      input({
        calledCapitalIssued: {
          amount: '60.000000',
          sources: [{ sourceExternalRef: 'call-1', amount: '60.000000' }],
        },
        referenceBackedReversals: [
          {
            reversalExternalRef: 'reversal-1',
            referencedSourceExternalRef: 'missing-call',
            amount: '10.000000',
          },
        ],
      })
    );
    expect(unreferenced).toMatchObject({ ok: false, code: 'CORRECTION_LINEAGE_INVALID' });

    const oversized = calculateActualsV1(
      input({
        calledCapitalIssued: {
          amount: '60.000000',
          sources: [{ sourceExternalRef: 'call-1', amount: '60.000000' }],
        },
        referenceBackedReversals: [
          {
            reversalExternalRef: 'reversal-1',
            referencedSourceExternalRef: 'call-1',
            amount: '60.000001',
          },
        ],
      })
    );
    expect(oversized).toMatchObject({ ok: false, code: 'CORRECTION_LINEAGE_INVALID' });
  });

  it('TV-003 keeps proceeds separate from partner distributions in ratios', () => {
    const base = {
      ledgerRows: [
        cashRow('settled_contribution', '50.000000'),
        cashRow('realized_proceeds', '20.000000', {
          sourceExternalRef: 'proceeds-1',
          resolvedCompanyId: 10,
          resolvedVehicleId: 1,
        }),
      ],
      roster: [{ vehicleId: 1, companyId: 10 }],
      valuationPayloadSha256: valuationHash,
      valuationMarks: [
        {
          contractVersion: 'actuals-pilot-valuation-mark/1.0.0' as const,
          sourceExternalRef: 'mark-1',
          rowContentHash: rowHash,
          templateVersion: 'actuals-valuation/1.0.0' as const,
          markId: 1,
          markDate: '2026-01-31',
          positionFairValue: '30.000000',
          markSource: 'gp_estimate',
          confidenceLevel: 'medium' as const,
          resolvedCompanyId: 10,
          resolvedVehicleId: 1,
          externalRefHash: rowHash,
        },
      ],
      nav: '30.000000',
    } satisfies Partial<ActualsCalculatorInputV1>;

    const withoutDistribution = success(input(base));
    expect(withoutDistribution.capitalActuals.dpi.value).toBe('0.000000000000');
    expect(withoutDistribution.capitalActuals.rvpi.value).toBe('0.600000000000');
    expect(withoutDistribution.capitalActuals.tvpi.value).toBe('0.600000000000');
    expect(withoutDistribution.capitalActuals.realizedFundProceeds.value).toBe('20.000000');

    const withDistribution = success(
      input({
        ...base,
        ledgerRows: [...base.ledgerRows, cashRow('lp_distribution', '10.000000')],
      })
    );
    expect(withDistribution.capitalActuals.dpi.value).toBe('0.200000000000');
    expect(withDistribution.capitalActuals.tvpi.value).toBe('0.800000000000');
    expect(withDistribution.capitalActuals.realizedFundProceeds.value).toBe('20.000000');
  });

  it('TV-004 makes ratios unavailable when paid-in is absent or zero', () => {
    const absent = success(input({ ledgerCoverage: 'partial' }));
    expect(absent.capitalActuals.dpi).toMatchObject({
      value: null,
      availability: 'unavailable',
      reasonCodes: ['SETTLED_PAID_IN_UNAVAILABLE'],
    });
    expect(absent.capitalActuals.dpi.value).toBeNull();

    const zero = success(input({ ledgerRows: [cashRow('settled_contribution', '0.000000')] }));
    expect(zero.capitalActuals.dpi).toMatchObject({
      value: null,
      availability: 'unavailable',
      reasonCodes: ['PAID_IN_ZERO'],
    });
    expect(zero.capitalActuals.rvpi.reasonCodes).toEqual(['PAID_IN_ZERO']);
    expect(zero.capitalActuals.tvpi.reasonCodes).toEqual(['PAID_IN_ZERO']);

    const unavailable = success(input());
    expect(unavailable.capitalActuals.paidInCapital.reasonCodes).toEqual([]);
    expect(unavailable.capitalActuals.dpi).toMatchObject({
      value: null,
      reasonCodes: ['PAID_IN_ZERO'],
    });
  });

  it('TV-005 refuses investment rows without resolved company lineage', () => {
    const result = calculateActualsV1(
      input({ ledgerRows: [cashRow('portfolio_investment', '10.000000')] })
    );
    expect(result).toMatchObject({ ok: false, code: 'COMPANY_NOT_FOUND' });
  });

  it('TV-006 refuses disagreement between source components and asserted aggregates', () => {
    const result = calculateActualsV1(
      input({
        ledgerRows: [cashRow('settled_contribution', '50.000000')],
        assertedAggregates: { settledPaidInCapital: '51.000000' },
      })
    );
    expect(result).toMatchObject({ ok: false, code: 'SOURCE_FACT_CONTRADICTION' });
  });

  it('TV-007 rejects negative facts and invalid bounds while accepting exact boundaries', () => {
    const negative = calculateActualsV1(
      input({ ledgerRows: [cashRow('settled_contribution', '-1.000000')] })
    );
    expect(negative).toMatchObject({ ok: false, code: 'SOURCE_FACT_CONTRADICTION' });

    const recallableTooLarge = calculateActualsV1(
      input({
        ledgerRows: [cashRow('lp_distribution', '5.000000', { recallable: true })],
        assertedAggregates: { distributionsToPartners: '4.000000' },
      })
    );
    expect(recallableTooLarge).toMatchObject({ ok: false, code: 'SOURCE_FACT_CONTRADICTION' });

    const calledTooLarge = calculateActualsV1(
      input({
        ledgerRows: [cashRow('lp_distribution', '5.000000', { recallable: true })],
        calledCapitalIssued: '106.000000',
      })
    );
    expect(calledTooLarge).toMatchObject({ ok: false, code: 'NEGATIVE_UNCALLED_CAPITAL' });

    for (const recallable of ['0.000000', '5.000000']) {
      const boundary = success(
        input({
          ledgerRows: [
            cashRow('lp_distribution', '5.000000', {
              recallable: recallable === '5.000000',
            }),
          ],
          calledCapitalIssued: recallable === '5.000000' ? '105.000000' : '100.000000',
        })
      );
      expect(boundary.capitalActuals.uncalledCapital.value).toBe('0.000000');
    }
  });

  it('TV-008 uses direct policy-1.4 facts instead of legacy aggregate totals', () => {
    const result = success(
      input({
        ledgerRows: [
          cashRow('settled_contribution', '50.000000'),
          cashRow('lp_distribution', '8.000000'),
        ],
        calledCapitalIssued: '60.000000',
      })
    );
    expect(result.capitalActuals.paidInCapital.value).toBe('50.000000');
    expect(result.capitalActuals.distributionsToPartners.value).toBe('8.000000');
    expect(result.capitalActuals.calledCapitalIssued.value).toBe('60.000000');
  });

  it('FIN-V001 calculates template-shaped capital facts and leaves unsupported facts unavailable', () => {
    const result = success(
      input({
        ledgerRows: [
          cashRow('settled_contribution', '250000.000000'),
          cashRow('portfolio_investment', '100000.000000', {
            sourceExternalRef: 'investment-1',
            resolvedCompanyId: 10,
            resolvedVehicleId: 1,
            deploymentCategory: 'initial',
          }),
          cashRow('management_fee', '10000.000000'),
          cashRow('fund_expense', '5000.000000'),
          cashRow('lp_distribution', '50000.000000'),
        ],
        vehicleCommitment: { vehicleId: 1, amount: '1000000.000000', sourceHash: commitmentHash },
      })
    );
    expect(result.capitalActuals.paidInCapital.value).toBe('250000.000000');
    expect(result.capitalActuals.deployedCapital.value).toBe('100000.000000');
    expect(result.capitalActuals.dpi.value).toBe('0.200000000000');
    expect(result.capitalActuals.managementFeesPaid.value).toBe('10000.000000');
    expect(result.capitalActuals.otherExpensesPaid.value).toBe('5000.000000');
    expect(result.capitalActuals.calledCapitalIssued.availability).toBe('unavailable');
    expect(result.capitalActuals.netCalledCapital.availability).toBe('unavailable');
    expect(result.capitalActuals.uncalledCapital.availability).toBe('unavailable');
    expect(result.capitalActuals.nav.availability).toBe('unavailable');
    expect(result.capitalActuals.rvpi.availability).toBe('unavailable');
    expect(result.capitalActuals.tvpi.availability).toBe('unavailable');
  });

  it('FIN-V002 keeps realized proceeds and partner distributions distinct', () => {
    const result = success(
      input({
        ledgerRows: [
          cashRow('settled_contribution', '100.000000'),
          cashRow('realized_proceeds', '80000.000000', {
            sourceExternalRef: 'proceeds-1',
            resolvedCompanyId: 10,
            resolvedVehicleId: 1,
          }),
          cashRow('lp_distribution', '30000.000000'),
        ],
      })
    );
    expect(result.capitalActuals.realizedFundProceeds.value).toBe('80000.000000');
    expect(result.capitalActuals.distributionsToPartners.value).toBe('30000.000000');
  });

  it('FIN-V003 does not reduce paid-in for recallable distributions', () => {
    const result = success(
      input({
        ledgerRows: [
          cashRow('settled_contribution', '100.000000'),
          cashRow('lp_distribution', '25.000000', { recallable: true }),
        ],
      })
    );
    expect(result.capitalActuals.paidInCapital.value).toBe('100.000000');
    expect(result.capitalActuals.recallableDistributions.value).toBe('25.000000');
    expect(result.capitalActuals.availableRecallCapacity).toMatchObject({
      value: null,
      reasonCodes: ['RECALL_LIFECYCLE_UNAVAILABLE'],
    });
  });

  it('FIN-V004 exposes portfolio FMV only when valuation covers the roster', () => {
    const result = success(
      input({
        roster: [
          { vehicleId: 1, companyId: 10 },
          { vehicleId: 1, companyId: 11 },
        ],
        valuationPayloadSha256: valuationHash,
        valuationMarks: [
          {
            contractVersion: 'actuals-pilot-valuation-mark/1.0.0',
            sourceExternalRef: 'mark-1',
            rowContentHash: rowHash,
            templateVersion: 'actuals-valuation/1.0.0',
            markId: 1,
            markDate: '2026-01-31',
            positionFairValue: '60000.000000',
            markSource: 'gp_estimate',
            confidenceLevel: 'medium',
            resolvedCompanyId: 10,
            resolvedVehicleId: 1,
            externalRefHash: rowHash,
          },
          {
            contractVersion: 'actuals-pilot-valuation-mark/1.0.0',
            sourceExternalRef: 'mark-2',
            rowContentHash: '6'.repeat(64),
            templateVersion: 'actuals-valuation/1.0.0',
            markId: 2,
            markDate: '2026-01-31',
            positionFairValue: '25000.000000',
            markSource: 'gp_estimate',
            confidenceLevel: 'medium',
            resolvedCompanyId: 11,
            resolvedVehicleId: 1,
            externalRefHash: '6'.repeat(64),
          },
        ],
      })
    );
    expect(result.capitalActuals.portfolioFmv.value).toBe('85000.000000');
    expect(result.capitalActuals.portfolioFmv.sourceRefs).toEqual([
      `actuals-pilot:ledger:${ledgerHash}`,
      `actuals-pilot:valuation:${valuationHash}`,
    ]);
    expect(result.valuationActuals.coverage).toBe('complete');
    expect(result.valuationActuals.missingCompanyIds).toEqual([]);

    const partial = success(
      input({
        roster: [
          { vehicleId: 1, companyId: 10 },
          { vehicleId: 1, companyId: 11 },
        ],
        valuationPayloadSha256: valuationHash,
        valuationMarks: [
          {
            contractVersion: 'actuals-pilot-valuation-mark/1.0.0',
            sourceExternalRef: 'mark-1',
            rowContentHash: rowHash,
            templateVersion: 'actuals-valuation/1.0.0',
            markId: 1,
            markDate: '2026-01-31',
            positionFairValue: '60000.000000',
            markSource: 'gp_estimate',
            confidenceLevel: 'medium',
            resolvedCompanyId: 10,
            resolvedVehicleId: 1,
            externalRefHash: rowHash,
          },
        ],
      })
    );
    expect(partial.capitalActuals.portfolioFmv).toMatchObject({
      value: null,
      reasonCodes: ['VALUATION_COVERAGE_PARTIAL'],
    });
    expect(partial.valuationActuals.missingCompanyIds).toEqual([11]);
  });

  it('keeps portfolio FMV unavailable when marks are supplied over an empty roster', () => {
    const mark = {
      contractVersion: 'actuals-pilot-valuation-mark/1.0.0' as const,
      sourceExternalRef: 'mark-orphan',
      rowContentHash: rowHash,
      templateVersion: 'actuals-valuation/1.0.0' as const,
      markId: 1,
      markDate: '2026-01-31',
      positionFairValue: '55.000000',
      markSource: 'gp_estimate' as const,
      confidenceLevel: 'medium' as const,
      resolvedCompanyId: 10,
      resolvedVehicleId: 1,
      externalRefHash: rowHash,
    };
    const orphaned = success(
      input({ roster: [], valuationPayloadSha256: valuationHash, valuationMarks: [mark] })
    );
    expect(orphaned.valuationActuals.coverage).toBe('partial');
    expect(orphaned.capitalActuals.portfolioFmv).toMatchObject({
      value: null,
      availability: 'unavailable',
      reasonCodes: ['VALUATION_COVERAGE_PARTIAL'],
    });

    const empty = success(
      input({ roster: [], valuationPayloadSha256: valuationHash, valuationMarks: [] })
    );
    expect(empty.valuationActuals.coverage).toBe('complete');
    expect(empty.capitalActuals.portfolioFmv).toMatchObject({
      value: '0.000000',
      availability: 'available',
    });
  });
});
