import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import { computeGpCatchUpAllocationV2 } from '../../../../shared/lib/internal-economics/v2/catch-up-allocation-v2';

// Locked F_2.0.0 methodology (F_2.0.0_v2-core-financial-model.plan.md:365-372):
//   grossCatchUpDue = max(0, (c*(G+L) - G) / (g - c))
//   allocated       = min(available, grossCatchUpDue)
// G = cumulative GP profit distributions, L = cumulative LP profit
// distributions, c = terminal carry GP share, g = catch-up tier GP allocation
// rate. Profit = preferred return + catch-up + carry (ROC excluded).
//
// Whole-fund accumulator initialization (resume rule): G = opening GP profit
// distributions; L = opening cumulative preferred paid + opening LP profit
// distributions. This is resume-correct only where GP preferred participation
// is `excluded`: under `pari_passu` the aggregate opening preferred-paid
// scalar cannot be split GP/LP (no per-side provenance exists in the opening
// schema), so nonzero-opening resume under `pari_passu` is deferred until
// GP/LP preferred provenance lands. All opening values are zero on any
// admitted input today.

function leaf(input: {
  available: Decimal;
  cumulativeGpProfit: Decimal;
  cumulativeLpProfit: Decimal;
  terminalGpShare: Decimal;
  catchUpGpAllocationRate: Decimal;
}) {
  return computeGpCatchUpAllocationV2(input);
}

function d(value: string): Decimal {
  return new Decimal(value);
}

describe('computeGpCatchUpAllocationV2', () => {
  it('matches the locked-methodology oracle: G=0, L=100, c=0.2, g=0.5', () => {
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

  it('conserves six-decimal units: gpAmount + lpAmount == allocatedTotal', () => {
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
    for (const kase of cases) {
      const result = leaf({
        available: d(kase.available),
        cumulativeGpProfit: d(kase.G),
        cumulativeLpProfit: d(kase.L),
        terminalGpShare: d(kase.c),
        catchUpGpAllocationRate: d(kase.g),
      });
      const sum = d(result.gpAmount).plus(result.lpAmount);
      expect(sum.toFixed(6)).toBe(result.allocatedTotal);
    }
  });

  it('returns zero when the catch-up target is already satisfied', () => {
    const result = leaf({
      available: d('1000'),
      cumulativeGpProfit: d('80'),
      cumulativeLpProfit: d('20'),
      terminalGpShare: d('0.5'),
      catchUpGpAllocationRate: d('0.9'),
    });
    expect(result.allocatedTotal).toBe('0.000000');
    expect(result.gpAmount).toBe('0.000000');
    expect(result.lpAmount).toBe('0.000000');
  });

  it('prior profit distributions reduce the remaining catch-up', () => {
    const base = {
      available: d('10000'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    };
    const noPrior = leaf({ ...base, cumulativeGpProfit: d('0') });
    // (0.2*(10+100) - 10) / (0.5-0.2) = 12/0.3 = 40
    const withPrior = leaf({ ...base, cumulativeGpProfit: d('10') });
    expect(noPrior.allocatedTotal).toBe('66.666667');
    expect(withPrior.allocatedTotal).toBe('40.000000');
    expect(d(withPrior.allocatedTotal).lt(d(noPrior.allocatedTotal))).toBe(true);
  });

  it('allocates only available value when proceeds are insufficient', () => {
    const result = leaf({
      available: d('50'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    });
    expect(result.allocatedTotal).toBe('50.000000');
    expect(result.gpAmount).toBe('25.000000');
    expect(result.lpAmount).toBe('25.000000');
  });

  it('resume case: L includes opening preferred paid', () => {
    // Opening preferred paid 100 + opening LP profit 100 -> L = 200.
    // (0.2*200 - 0) / (0.5-0.2) = 40/0.3 = 133.333333...
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

  it('does not round a binding availability cap above available proceeds', () => {
    // available carries sub-micro precision and is the binding cap. The leaf
    // must floor that cap to payable units rather than round it upward.
    const result = leaf({
      available: d('10.1234567'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    });
    expect(result.allocatedTotal).toBe('10.123456');
    expect(result.gpAmount).toBe('5.061728');
    expect(result.lpAmount).toBe('5.061728');
    expect(d(result.allocatedTotal).lte(d('10.1234567'))).toBe(true);
    expect(d(result.gpAmount).plus(result.lpAmount).toFixed(6)).toBe(result.allocatedTotal);
  });

  it('supports g=1 edge: entire bucket to GP, LP bucket zero', () => {
    // (0.2*100 - 0) / (1-0.2) = 25
    const result = leaf({
      available: d('1000'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('1'),
    });
    expect(result.allocatedTotal).toBe('25.000000');
    expect(result.gpAmount).toBe('25.000000');
    expect(result.lpAmount).toBe('0.000000');
  });

  it('distinguishing fixture: leaf implements the locked equation, not the current-engine equation', () => {
    const G = d('0');
    const L = d('100');
    const c = d('0.2');
    const g = d('0.5');
    const available = d('1000');

    // Current-engine equation (both waterfall engines today):
    //   targetGpProfit = (openingPrefPaid + remaining) * c
    //   gross = (targetGpProfit - G) / g
    const openingPrefPaid = d('100');
    const remaining = available;
    const currentEngineGross = openingPrefPaid.plus(remaining).mul(c).minus(G).div(g);
    const currentEngineAllocated = Decimal.min(available, currentEngineGross);

    // Locked F_2.0.0 equation.
    const lockedGross = Decimal.max(d('0'), c.mul(G.plus(L)).minus(G).div(g.minus(c)));
    const lockedAllocated = Decimal.min(available, lockedGross);

    // The two equations diverge on this nonzero input.
    expect(currentEngineAllocated.toFixed(6)).not.toBe(lockedAllocated.toFixed(6));
    expect(currentEngineAllocated.toFixed(6)).toBe('440.000000');
    expect(lockedAllocated.toFixed(6)).toBe('66.666667');

    // The leaf matches the locked value.
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

  it('equal remainders deterministically favor GP (bucket index zero)', () => {
    // 1 unit total at g=0.5: both exact entitlements are 0.5 units; the
    // single rounding unit must go to GP.
    const result = leaf({
      available: d('0.000001'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    });
    expect(result.allocatedTotal).toBe('0.000001');
    expect(result.gpAmount).toBe('0.000001');
    expect(result.lpAmount).toBe('0.000000');
  });

  it('returns zero when nothing is available', () => {
    const result = leaf({
      available: d('0'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    });
    expect(result.allocatedTotal).toBe('0.000000');
    expect(result.gpAmount).toBe('0.000000');
    expect(result.lpAmount).toBe('0.000000');
  });

  describe('defensive preconditions (already refused upstream with INVALID_TIER_POLICY)', () => {
    const valid = {
      available: d('1000'),
      cumulativeGpProfit: d('0'),
      cumulativeLpProfit: d('100'),
      terminalGpShare: d('0.2'),
      catchUpGpAllocationRate: d('0.5'),
    };

    it('rejects terminalGpShare >= catchUpGpAllocationRate', () => {
      expect(() => leaf({ ...valid, terminalGpShare: d('0.5') })).toThrow(/catch-up/i);
      expect(() => leaf({ ...valid, terminalGpShare: d('0.7') })).toThrow(/catch-up/i);
    });

    it('rejects terminalGpShare below zero', () => {
      expect(() => leaf({ ...valid, terminalGpShare: d('-0.1') })).toThrow(/catch-up/i);
    });

    it('rejects catchUpGpAllocationRate above one', () => {
      expect(() => leaf({ ...valid, catchUpGpAllocationRate: d('1.5') })).toThrow(/catch-up/i);
    });

    it('accepts terminalGpShare of zero (c=0 boundary)', () => {
      // c = 0: (0*(G+L) - G) / (g - 0) <= 0 always, so zero allocation.
      const result = leaf({ ...valid, terminalGpShare: d('0') });
      expect(result.allocatedTotal).toBe('0.000000');
    });
  });
});
