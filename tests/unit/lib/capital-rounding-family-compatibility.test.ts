import { describe, expect, it } from 'vitest';
import {
  calculateActualsV1,
  type ActualsCalculatorLedgerRowV1,
} from '../../../shared/lib/financial-facts/actuals-calculator';
import { decimalStringToCents } from '../../../shared/lib/internal-economics/v2/decimal-cents-v2';
import { Decimal } from '../../../shared/lib/decimal-config';

function row(
  eventType: 'settled_contribution' | 'lp_distribution',
  canonicalAmount: string
): ActualsCalculatorLedgerRowV1 {
  return {
    contractVersion: 'actuals-pilot-cash-flow/1.0.0',
    sourceExternalRef: eventType,
    rowContentHash: '5'.repeat(64),
    templateVersion: 'actuals-ledger/1.0.0',
    settlementStatus: null,
    deploymentCategory: null,
    expenseCategory: null,
    distributionType: eventType === 'lp_distribution' ? 'ordinary' : null,
    recallable: eventType === 'lp_distribution' ? false : null,
    canonicalAmount,
    eventType,
    effectiveDate: '2026-01-31',
    resolvedCompanyId: null,
    resolvedVehicleId: null,
  };
}

describe('capital rounding family compatibility', () => {
  it('keeps actuals half-even and internal economics signed half-up after corrected engine import', async () => {
    const before = { precision: Decimal.precision, rounding: Decimal.rounding };
    await import('../../../shared/lib/capital-planning/capital-planning-v2');
    expect({ precision: Decimal.precision, rounding: Decimal.rounding }).toEqual(before);
    for (const [amount, expected] of [
      ['0.000001', '0.000000000000'],
      ['0.000003', '0.000000000002'],
    ] as const) {
      const result = calculateActualsV1({
        ledgerRows: [row('settled_contribution', '2000000.000000'), row('lp_distribution', amount)],
        vehicleCommitment: { vehicleId: 1, amount: '2000000.000000', sourceHash: '3'.repeat(64) },
        roster: [],
        valuationMarks: [],
        ledgerCoverage: 'complete',
        ledgerPayloadSha256: '1'.repeat(64),
        valuationPayloadSha256: null,
        predecessorSnapshotInputHash: null,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Actuals fixture refused');
      expect(result.capitalActuals.dpi.value).toBe(expected);
    }
    expect(decimalStringToCents('0.0000005')).toBe(1n);
    expect(decimalStringToCents('-0.0000005')).toBe(-1n);
  });
});
