import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  computeGpCatchUpAllocationV2,
  splitQuantizedGpLp,
} from '../../../../shared/lib/internal-economics/v2/catch-up-allocation-v2';

// Whole-fund resume limit: pari_passu opening preferred paid is an aggregate
// scalar and cannot be split between GP and LP without per-side provenance;
// nonzero pari_passu resume remains deferred until that provenance exists.

function d(value: string): Decimal {
  return new Decimal(value);
}

function leaf(input: {
  available: Decimal;
  cumulativeGpProfit: Decimal;
  cumulativeLpProfit: Decimal;
  terminalGpShare: Decimal;
  catchUpGpAllocationRate: Decimal;
}) {
  return computeGpCatchUpAllocationV2(input);
}

describe('computeGpCatchUpAllocationV2', () => {
  it('matches locked-methodology oracle: G=0, L=100, c=.2, g=.5', () => {
    const result = leaf({
      available: d('1000'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    });

    expect(result.allocatedTotal).toBe('66.666667');
    expect(result.gpAmount).toBe('33.333334');
    expect(result.lpAmount).toBe('33.333333');
  });

  it('conserves six-decimal units in every case', () => {
    const cases = [
      { available: '1000', G: '0', L: '100', c: '0.2', g: '0.5' },
      { available: '1000', G: '10', L: '100', c: '0.2', g: '0.5' },
      { available: '1000', G: '0', L: '200', c: '0.2', g: '0.5' },
      { available: '1000', G: '5', L: '37', c: '0.25', g: '0.8' },
      { available: '7.654321', G: '1', L: '3', c: '0.2', g: '0.9' },
      { available: '1000', G: '0', L: '100', c: '0.2', g: '1' },
      { available: '0.000001', G: '0', L: '100', c: '0.2', g: '0.5' },
      { available: '1000', G: '33.333334', L: '133.333333', c: '0.2', g: '0.5' },
    ];

    for (const testCase of cases) {
      const result = leaf({
        available: d(testCase.available),
        cumulativeGpProfit: d(testCase.G),
        cumulativeLpProfit: d(testCase.L),
        terminalGpShare: d(testCase.c),
        catchUpGpAllocationRate: d(testCase.g),
      });

      expect(d(result.gpAmount).plus(result.lpAmount).toFixed(6)).toBe(result.allocatedTotal);
    }
  });

  it('returns zero when catch-up is already satisfied', () => {
    const result = leaf({
      available: d('1000'),
      cumulativeGpProfit: d('80'),
      cumulativeLpProfit: d('20'),
      terminalGpShare: d('0.5'),
      catchUpGpAllocationRate: d('0.9'),
    });

    expect(result).toEqual({
      allocatedTotal: '0.000000',
      gpAmount: '0.000000',
      lpAmount: '0.000000',
    });
  });

  it('reduces remaining catch-up after prior profit distributions', () => {
    const base = {
      available: d('10000'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    };

    const withoutPriorGpProfit = leaf({ ...base, cumulativeGpProfit: d('0') });
    const withPriorGpProfit = leaf({ ...base, cumulativeGpProfit: d('10') });

    expect(withoutPriorGpProfit.allocatedTotal).toBe('66.666667');
    expect(withPriorGpProfit.allocatedTotal).toBe('40.000000');
    expect(d(withPriorGpProfit.allocatedTotal).lt(withoutPriorGpProfit.allocatedTotal)).toBe(true);
  });

  it('allocates only available proceeds when they are insufficient', () => {
    const result = leaf({
      available: d('50'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    });

    expect(result).toEqual({
      allocatedTotal: '50.000000',
      gpAmount: '25.000000',
      lpAmount: '25.000000',
    });
  });

  it('includes opening preferred paid in resume-oriented L', () => {
    // L = opening preferred paid 100 + opening LP profit 100.
    const result = leaf({
      available: d('1000'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('200'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    });

    expect(result.allocatedTotal).toBe('133.333333');
    expect(result.gpAmount).toBe('66.666667');
    expect(result.lpAmount).toBe('66.666666');
  });

  it('matches locked equation rather than current-engine equation', () => {
    const G = d('0');
    const L = d('100');
    const c = d('0.2');
    const g = d('0.5');
    const available = d('1000');
    const openingPreferredPaid = d('100');
    const remaining = available;

    const currentEngineAllocated = Decimal.min(
      available,
      c.mul(openingPreferredPaid.plus(remaining)).minus(G).div(g)
    );
    const lockedAllocated = Decimal.min(
      available,
      Decimal.max(d('0'), c.mul(G.plus(L)).minus(G).div(g.minus(c)))
    );

    expect(currentEngineAllocated.toFixed(6)).not.toBe(lockedAllocated.toFixed(6));
    expect(currentEngineAllocated.toFixed(6)).toBe('440.000000');
    expect(lockedAllocated.toFixed(6)).toBe('66.666667');

    const result = leaf({
      available,
      cumulativeGpProfit: G,
      cumulativeLpProfit: L,
      terminalGpShare: c,
      catchUpGpAllocationRate: g,
    });

    expect(result.allocatedTotal).toBe(lockedAllocated.toFixed(6));
    expect(result.allocatedTotal).not.toBe(currentEngineAllocated.toFixed(6));
  });

  it('never rounds a binding available cap upward past physical proceeds', () => {
    // HALF_UP quantization of 100.0000025 alone would yield 100.000003 —
    // half a unit more than is available. The floored cap must win.
    const result = leaf({
      available: d('100.0000025'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('1000000'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    });

    expect(result.allocatedTotal).toBe('100.000002');
    expect(result.gpAmount).toBe('50.000001');
    expect(result.lpAmount).toBe('50.000001');
  });

  it('splitQuantizedGpLp clamps to the floored cap for carry-style full splits', () => {
    const capped = splitQuantizedGpLp(d('100.0000025'), d('0.2'), d('100.0000025'));
    expect(capped.allocatedTotal).toBe('100.000002');
    expect(d(capped.gpAmount).plus(capped.lpAmount).toFixed(6)).toBe('100.000002');

    const uncapped = splitQuantizedGpLp(d('100.0000025'), d('0.2'));
    expect(uncapped.allocatedTotal).toBe('100.000003');
  });

  it('enforces 0 <= c < g <= 1', () => {
    const valid = {
      available: d('1000'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    };

    expect(() => leaf({ ...valid, terminalGpShare: d('-0.1') })).toThrow(/catch-up/i);
    expect(() => leaf({ ...valid, terminalGpShare: d('0.5') })).toThrow(/catch-up/i);
    expect(() => leaf({ ...valid, catchUpGpAllocationRate: d('1.1') })).toThrow(/catch-up/i);
  });
});
