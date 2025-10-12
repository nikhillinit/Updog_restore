/**
 * Excel Parity Gate
 * -----------------
 * This test asserts that core financial outputs match Microsoft Excel (XIRR/TVPI/DPI).
 * It reads "golden" CSVs with inputs and Excel-calculated expected results.
 *
 * The test uses your production XIRR calculator (`client/src/lib/xirr.ts`)
 * which implements Excel's XIRR algorithm (Newton-Raphson with bisection fallback).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';
import { calculateXIRR, type Cashflow } from '../../client/src/lib/xirr.js';

function loadCSV(pathRel: string) {
  const file = readFileSync(join(__dirname, pathRel), 'utf-8');
  return parse(file, { columns: true, skip_empty_lines: true });
}

/**
 * Calculate fund-level metrics from cashflows
 *
 * TVPI = (Distributions + NAV) / Called Capital
 * DPI = Distributions / Called Capital
 * XIRR = calculateXIRR(cashflows)
 */
function calculateMetrics(cashflows: Cashflow[]) {
  // Sum negative cashflows (capital calls)
  const calledCapital = cashflows
    .filter(cf => cf.amount < 0)
    .reduce((sum, cf) => sum + Math.abs(cf.amount), 0);

  // Sum positive cashflows (distributions + final NAV)
  const distributions = cashflows
    .filter(cf => cf.amount > 0)
    .reduce((sum, cf) => sum + cf.amount, 0);

  // NAV is assumed to be the last positive cashflow (terminal value)
  const nav = cashflows.length > 0 ?
    Math.max(0, cashflows[cashflows.length - 1].amount) : 0;

  // Calculate metrics
  const tvpi = calledCapital > 0 ? distributions / calledCapital : 0;
  const dpi = calledCapital > 0 ? (distributions - nav) / calledCapital : 0;
  const xirr = calculateXIRR(cashflows);

  return { xirr, tvpi, dpi };
}

describe('Excel Parity: seed-fund-basic', () => {
  it('matches Excel within 1e-6 for XIRR/TVPI/DPI', () => {
    // Load golden dataset
    const cashflows = loadCSV('golden/seed-fund-basic.csv')
      .map((r: any) => ({ date: new Date(r.date), amount: Number(r.amount) }));

    const expected = Object.fromEntries(
      loadCSV('golden/seed-fund-basic.results.csv').map((r: any) => [r.metric, Number(r.expected)])
    ) as Record<string, number>;

    // Calculate metrics using production code
    const computed = calculateMetrics(cashflows);

    // Assertions with 1e-6 tolerance (6 decimal places)
    expect(computed.xirr).toBeCloseTo(expected.xirr, 6);
    expect(computed.tvpi).toBeCloseTo(expected.tvpi, 6);
    expect(computed.dpi).toBeCloseTo(expected.dpi, 6);
  });
});
